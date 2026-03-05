const Attendance = require('../models/Attendance');
const Intern = require('../models/Intern');
const { emitDataRefresh } = require('../utils/realtime');
const { isHolidayDate, isThirdSaturday, getSalaryCycleDates, getCycleDays } = require('../utils/salaryCalc');

function isInternActiveOnDate(intern, targetDate) {
    const dateOnly = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
    const joiningDate = new Date(intern.joiningDate);
    const joiningDateOnly = new Date(Date.UTC(joiningDate.getUTCFullYear(), joiningDate.getUTCMonth(), joiningDate.getUTCDate()));

    if (dateOnly < joiningDateOnly) return false;

    if (intern.isDiscontinued && intern.discontinuedFrom) {
        const discontinued = new Date(intern.discontinuedFrom);
        const discontinuedFromOnly = new Date(Date.UTC(discontinued.getUTCFullYear(), discontinued.getUTCMonth(), discontinued.getUTCDate()));
        if (dateOnly >= discontinuedFromOnly) return false;
    }

    return true;
}

// @desc    Mark attendance (bulk for a date)
// @route   POST /api/attendance
// @body    { date: "2026-03-03", records: [{ internId: "...", status: "Present" }] }
const markAttendance = async (req, res) => {
    try {
        const { date, records } = req.body;

        if (!date || !records || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ message: 'Date and attendance records are required' });
        }

        const attendanceDate = new Date(date + 'T00:00:00.000Z');
        const allInterns = await Intern.find({}, '_id joiningDate isDiscontinued discontinuedFrom');
        const activeInternIds = new Set(
            allInterns
                .filter(intern => isInternActiveOnDate(intern, attendanceDate))
                .map(intern => intern._id.toString())
        );

        if (isHolidayDate(attendanceDate)) {
            const results = [];

            for (const intern of allInterns) {
                if (!activeInternIds.has(intern._id.toString())) continue;
                const result = await Attendance.findOneAndUpdate(
                    { internId: intern._id, date: attendanceDate },
                    { internId: intern._id, date: attendanceDate, status: 'Present' },
                    { upsert: true, new: true, runValidators: true }
                );
                results.push(result);
            }

            const message = isThirdSaturday(attendanceDate)
                ? '3rd Saturday marked as Present for all interns'
                : 'Sunday marked as Present for all interns';

            res.json({
                message,
                saved: results.length,
            });

            emitDataRefresh({
                source: 'attendance',
                action: 'auto-saved',
                date,
            });
            return;
        }

        const results = [];
        const errors = [];

        for (const record of records) {
            try {
                if (!activeInternIds.has(record.internId.toString())) {
                    continue;
                }
                const result = await Attendance.findOneAndUpdate(
                    { internId: record.internId, date: attendanceDate },
                    { internId: record.internId, date: attendanceDate, status: record.status },
                    { upsert: true, new: true, runValidators: true }
                );
                results.push(result);
            } catch (err) {
                errors.push({ internId: record.internId, error: err.message });
            }
        }

        res.json({
            message: `Attendance marked for ${results.length} intern(s)`,
            saved: results.length,
            errors: errors.length > 0 ? errors : undefined,
        });

        emitDataRefresh({
            source: 'attendance',
            action: 'saved',
            date,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get attendance by date
// @route   GET /api/attendance/date/:date
const getAttendanceByDate = async (req, res) => {
    try {
        const dateStr = req.params.date;
        const targetDate = new Date(dateStr + 'T00:00:00.000Z');
        const allInterns = await Intern.find().sort({ name: 1 });
        const activeInterns = allInterns.filter(intern => isInternActiveOnDate(intern, targetDate));

        if (isHolidayDate(targetDate)) {
            for (const intern of activeInterns) {
                await Attendance.findOneAndUpdate(
                    { internId: intern._id, date: targetDate },
                    { internId: intern._id, date: targetDate, status: 'Present' },
                    { upsert: true, new: true, runValidators: true }
                );
            }
        }

        const attendance = await Attendance.find({ date: targetDate })
            .populate('internId', 'name email department')
            .sort({ 'internId.name': 1 });

        const attendanceMap = {};
        attendance.forEach(a => {
            if (!a.internId) return;
            attendanceMap[a.internId._id.toString()] = {
                _id: a._id,
                internId: a.internId._id,
                internName: a.internId.name,
                internEmail: a.internId.email,
                internDepartment: a.internId.department,
                date: a.date,
                status: a.status,
            };
        });

        const fullAttendance = activeInterns.map(intern => {
            const existing = attendanceMap[intern._id.toString()];
            if (existing) return existing;
            return {
                _id: null,
                internId: intern._id,
                internName: intern.name,
                internEmail: intern.email,
                internDepartment: intern.department,
                date: targetDate,
                status: null, // Not marked yet
            };
        });

        res.json(fullAttendance);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get attendance for an intern in a date range
// @route   GET /api/attendance/intern/:internId?startDate=...&endDate=...
const getAttendanceByIntern = async (req, res) => {
    try {
        const { internId } = req.params;
        const { startDate, endDate } = req.query;

        const query = { internId };
        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate + 'T00:00:00.000Z'),
                $lte: new Date(endDate + 'T00:00:00.000Z'),
            };
        }

        const attendance = await Attendance.find(query)
            .populate('internId', 'name email department')
            .sort({ date: 1 });

        res.json(attendance);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get attendance history for an intern in salary cycle month/year
// @route   GET /api/attendance/history/:internId?month=2&year=2026
const getAttendanceHistory = async (req, res) => {
    try {
        const { internId } = req.params;
        const month = parseInt(req.query.month, 10);
        const year = parseInt(req.query.year, 10);

        if (!month || !year || month < 1 || month > 12) {
            return res.status(400).json({ message: 'Valid month (1-12) and year are required' });
        }

        const intern = await Intern.findById(internId);
        if (!intern) {
            return res.status(404).json({ message: 'Intern not found' });
        }

        const { startDate, endDate } = getSalaryCycleDates(month, year);
        const cycleTotalDays = getCycleDays(startDate, endDate);

        const joiningDate = new Date(intern.joiningDate);
        const applicableStart = joiningDate > startDate ? joiningDate : startDate;

        let applicableEnd = endDate;
        if (intern.isDiscontinued && intern.discontinuedFrom) {
            const discontinuedFrom = new Date(intern.discontinuedFrom);
            const cutoff = new Date(Date.UTC(
                discontinuedFrom.getUTCFullYear(),
                discontinuedFrom.getUTCMonth(),
                discontinuedFrom.getUTCDate()
            ));
            cutoff.setUTCDate(cutoff.getUTCDate() - 1);
            if (cutoff < applicableEnd) {
                applicableEnd = cutoff;
            }
        }

        const hasApplicableDays = applicableStart <= applicableEnd;

        const records = hasApplicableDays
            ? await Attendance.find({
                internId: intern._id,
                date: { $gte: applicableStart, $lte: applicableEnd },
            }).sort({ date: 1 })
            : [];

        const recordByDate = new Map();
        records.forEach(record => {
            const dateKey = new Date(record.date).toISOString().split('T')[0];
            recordByDate.set(dateKey, record.status);
        });

        let present = 0;
        let absent = 0;
        let halfDay = 0;
        let leave = 0;
        let unmarked = 0;

        const unmarkedDates = [];
        const dateStatus = [];

        const current = new Date(startDate);
        while (current <= endDate) {
            const dateKey = current.toISOString().split('T')[0];
            const recordedStatus = recordByDate.get(dateKey);
            const activeOnDate = isInternActiveOnDate(intern, current);

            let status = 'Inactive';
            let source = 'not-applicable';

            if (activeOnDate) {
                if (isHolidayDate(current)) {
                    status = 'Present';
                    source = 'auto-holiday';
                    present++;
                } else if (recordedStatus) {
                    status = recordedStatus;
                    source = 'marked';
                    if (recordedStatus === 'Present') present++;
                    if (recordedStatus === 'Absent') absent++;
                    if (recordedStatus === 'HalfDay') halfDay++;
                    if (recordedStatus === 'Leave') leave++;
                } else {
                    status = 'Unmarked';
                    source = 'missing';
                    unmarked++;
                    unmarkedDates.push(dateKey);
                }
            }

            dateStatus.push({
                date: dateKey,
                dayName: current.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
                status,
                source,
            });

            current.setUTCDate(current.getUTCDate() + 1);
        }

        const applicableDays = hasApplicableDays ? getCycleDays(applicableStart, applicableEnd) : 0;
        const markedDays = present + absent + halfDay + leave;

        res.json({
            intern: {
                _id: intern._id,
                name: intern.name,
                email: intern.email,
                department: intern.department,
                joiningDate: intern.joiningDate,
                isDiscontinued: !!intern.isDiscontinued,
                discontinuedFrom: intern.discontinuedFrom || null,
            },
            cycle: {
                month,
                year,
                cycleStart: startDate.toISOString().split('T')[0],
                cycleEnd: endDate.toISOString().split('T')[0],
                totalDays: cycleTotalDays,
                applicableStart: hasApplicableDays ? applicableStart.toISOString().split('T')[0] : null,
                applicableEnd: hasApplicableDays ? applicableEnd.toISOString().split('T')[0] : null,
                applicableDays,
            },
            summary: {
                present,
                absent,
                halfDay,
                leave,
                markedDays,
                unmarked,
            },
            unmarkedDates,
            dateStatus,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { markAttendance, getAttendanceByDate, getAttendanceByIntern, getAttendanceHistory };
