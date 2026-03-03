const Intern = require('../models/Intern');
const Attendance = require('../models/Attendance');
const {
    getCycleDays,
    getCycleLabel,
    getSalaryCycleDates,
    getWorkingDays,
    isHolidayDate,
    calculateAttendanceSummary,
    calculateSalary,
} = require('../utils/salaryCalc');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

/**
 * Build salary report data for a given month/year.
 */
async function buildReportData(month, year) {
    const { startDate, endDate } = getSalaryCycleDates(month, year);
    const cycleWorkingDays = getWorkingDays(startDate, endDate);
    const cycleDays = getCycleDays(startDate, endDate);
    const cycleLabel = getCycleLabel(startDate, endDate);
    const interns = await Intern.find().sort({ name: 1 });

    const report = [];

    for (const intern of interns) {
        const joiningDate = new Date(intern.joiningDate);
        const internStartDate = joiningDate > startDate ? joiningDate : startDate;
        const totalWorkingDays = getWorkingDays(internStartDate, endDate);

        const records = await Attendance.find({
            internId: intern._id,
            date: { $gte: internStartDate, $lte: endDate },
        });

        const payableRecords = records.filter(record => !isHolidayDate(record.date));
        const baseSummary = calculateAttendanceSummary(payableRecords);
        const markedDays = baseSummary.present + baseSummary.halfDay + baseSummary.leave + baseSummary.absent;
        const inferredAbsent = Math.max(0, totalWorkingDays - markedDays);
        const summary = {
            ...baseSummary,
            absent: baseSummary.absent + inferredAbsent,
            unmarked: inferredAbsent,
        };

        const attendancePercentage =
            totalWorkingDays > 0
                ? Math.round((summary.effectiveDays / totalWorkingDays) * 10000) / 100
                : 0;
        const salary = calculateSalary(
            summary,
            intern.monthlyStipend,
            cycleDays
        );

        report.push({
            internId: intern._id,
            name: intern.name,
            email: intern.email,
            department: intern.department,
            monthlyStipend: intern.monthlyStipend,
            totalWorkingDays,
            present: summary.present,
            halfDay: summary.halfDay,
            leave: summary.leave,
            absent: summary.absent,
            unmarked: summary.unmarked,
            effectiveDays: summary.effectiveDays,
            attendancePercentage,
            dailyRate: salary.dailyRate,
            deductionUnits: salary.deductionUnits,
            deductionAmount: salary.deductionAmount,
            payableAmount: salary.payableAmount,
            lowAttendance: attendancePercentage < 75,
        });
    }

    return {
        month,
        year,
        cycleLabel,
        cycleStart: startDate.toISOString().split('T')[0],
        cycleEnd: endDate.toISOString().split('T')[0],
        cycleDays,
        totalWorkingDays: cycleWorkingDays,
        interns: report,
    };
}

// @desc    Get salary report
// @route   GET /api/salary/report?month=3&year=2026
const getSalaryReport = async (req, res) => {
    try {
        const month = parseInt(req.query.month);
        const year = parseInt(req.query.year);

        if (!month || !year || month < 1 || month > 12) {
            return res.status(400).json({ message: 'Valid month (1-12) and year are required' });
        }

        const data = await buildReportData(month, year);
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Export salary report as Excel
// @route   GET /api/salary/export/excel?month=3&year=2026
const exportExcel = async (req, res) => {
    try {
        const month = parseInt(req.query.month);
        const year = parseInt(req.query.year);

        if (!month || !year) {
            return res.status(400).json({ message: 'Month and year are required' });
        }

        const data = await buildReportData(month, year);
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Salary Report');

        // Title
        sheet.mergeCells('A1:L1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = `Salary Report — ${monthNames[month]} ${year}`;
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { horizontal: 'center' };

        // Cycle info
        sheet.mergeCells('A2:L2');
        const cycleCell = sheet.getCell('A2');
        cycleCell.value = `Cycle: ${data.cycleStart} to ${data.cycleEnd} | Working Days: ${data.totalWorkingDays}`;
        cycleCell.font = { size: 11, italic: true };
        cycleCell.alignment = { horizontal: 'center' };

        // Headers
        const headers = [
            'S.No', 'Name', 'Email', 'Department', 'Stipend',
            'Present', 'Half Day', 'Leave', 'Absent',
            'Effective Days', 'Attendance %', 'Payable Amount'
        ];
        const headerRow = sheet.addRow(headers);
        headerRow.font = { bold: true };
        headerRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } };
            cell.font = { bold: true, color: { argb: 'FFFFFF' } };
            cell.alignment = { horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' }, bottom: { style: 'thin' },
                left: { style: 'thin' }, right: { style: 'thin' },
            };
        });

        // Data rows
        data.interns.forEach((intern, i) => {
            const row = sheet.addRow([
                i + 1,
                intern.name,
                intern.email,
                intern.department,
                intern.monthlyStipend,
                intern.present,
                intern.halfDay,
                intern.leave,
                intern.absent,
                intern.effectiveDays,
                `${intern.attendancePercentage}%`,
                intern.payableAmount,
            ]);
            if (intern.lowAttendance) {
                row.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
                });
            }
            row.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' }, bottom: { style: 'thin' },
                    left: { style: 'thin' }, right: { style: 'thin' },
                };
            });
        });

        // Auto-fit columns
        sheet.columns.forEach(col => { col.width = 16; });
        sheet.getColumn(2).width = 22;
        sheet.getColumn(3).width = 28;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Salary_Report_${monthNames[month]}_${year}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Export salary report as PDF
// @route   GET /api/salary/export/pdf?month=3&year=2026
const exportPDF = async (req, res) => {
    try {
        const month = parseInt(req.query.month);
        const year = parseInt(req.query.year);

        if (!month || !year) {
            return res.status(400).json({ message: 'Month and year are required' });
        }

        const data = await buildReportData(month, year);
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Salary_Report_${monthNames[month]}_${year}.pdf`);

        doc.pipe(res);

        // Title
        doc.fontSize(20).font('Helvetica-Bold')
            .text(`Salary Report — ${monthNames[month]} ${year}`, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica')
            .text(`Cycle: ${data.cycleStart} to ${data.cycleEnd} | Working Days: ${data.totalWorkingDays}`, { align: 'center' });
        doc.moveDown(1);

        // Table
        const tableHeaders = ['#', 'Name', 'Department', 'Stipend', 'Present', 'Half', 'Leave', 'Absent', 'Eff. Days', 'Att. %', 'Payable'];
        const colWidths = [25, 120, 90, 65, 50, 40, 45, 50, 60, 55, 75];
        const startX = 30;
        let y = doc.y;

        // Header row
        doc.font('Helvetica-Bold').fontSize(8);
        let x = startX;
        tableHeaders.forEach((header, i) => {
            doc.rect(x, y, colWidths[i], 20).fill('#2563EB').stroke();
            doc.fillColor('#FFFFFF').text(header, x + 3, y + 5, { width: colWidths[i] - 6, align: 'center' });
            x += colWidths[i];
        });
        y += 20;

        // Data rows
        doc.font('Helvetica').fontSize(7);
        data.interns.forEach((intern, i) => {
            const rowData = [
                `${i + 1}`,
                intern.name,
                intern.department,
                `₹${intern.monthlyStipend}`,
                `${intern.present}`,
                `${intern.halfDay}`,
                `${intern.leave}`,
                `${intern.absent}`,
                `${intern.effectiveDays}`,
                `${intern.attendancePercentage}%`,
                `₹${intern.payableAmount}`,
            ];

            x = startX;
            const bgColor = intern.lowAttendance ? '#FEE2E2' : (i % 2 === 0 ? '#F9FAFB' : '#FFFFFF');
            rowData.forEach((cell, j) => {
                doc.rect(x, y, colWidths[j], 18).fill(bgColor).stroke('#E5E7EB');
                doc.fillColor('#111827').text(cell, x + 3, y + 4, { width: colWidths[j] - 6, align: 'center' });
                x += colWidths[j];
            });
            y += 18;

            if (y > 520) {
                doc.addPage();
                y = 30;
            }
        });

        doc.end();
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { getSalaryReport, exportExcel, exportPDF };
