const Intern = require('../models/Intern');
const Attendance = require('../models/Attendance');
const { getSalaryCycleDates, getWorkingDays, calculateAttendanceSummary, isHolidayDate } = require('../utils/salaryCalc');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard
const getDashboardStats = async (req, res) => {
    try {
        // Total interns
        const totalInterns = await Intern.countDocuments();

        // Today's date (UTC midnight)
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const todayDate = new Date(todayStr + 'T00:00:00.000Z');

        // Today's attendance
        let todayPresent = 0;
        let todayHalfDay = 0;
        let todayAbsent = 0;
        let todayLeave = 0;
        let todayMarked = 0;

        if (isHolidayDate(todayDate)) {
            todayPresent = totalInterns;
            todayMarked = totalInterns;
        } else {
            const todayAttendance = await Attendance.find({ date: todayDate });
            todayPresent = todayAttendance.filter(a => a.status === 'Present').length;
            todayHalfDay = todayAttendance.filter(a => a.status === 'HalfDay').length;
            todayAbsent = todayAttendance.filter(a => a.status === 'Absent').length;
            todayLeave = todayAttendance.filter(a => a.status === 'Leave').length;
            todayMarked = todayAttendance.length;
        }

        // Current salary cycle (determine current month cycle)
        const currentMonth = today.getMonth() + 1; // 1-12
        const currentYear = today.getFullYear();
        // If we're past 20th, we're in next month's cycle
        let cycleMonth = currentMonth;
        let cycleYear = currentYear;
        if (today.getDate() > 20) {
            cycleMonth = currentMonth + 1;
            if (cycleMonth > 12) {
                cycleMonth = 1;
                cycleYear++;
            }
        }

        const { startDate, endDate } = getSalaryCycleDates(cycleMonth, cycleYear);
        const totalWorkingDays = getWorkingDays(startDate, endDate);

        // Low attendance warnings — check current cycle
        const interns = await Intern.find();
        const lowAttendanceInterns = [];

        for (const intern of interns) {
            const joiningDate = new Date(intern.joiningDate);
            const internStartDate = joiningDate > startDate ? joiningDate : startDate;
            const effectiveCycleEnd = todayDate > endDate ? endDate : todayDate;

            const records = await Attendance.find({
                internId: intern._id,
                date: { $gte: internStartDate, $lte: effectiveCycleEnd },
            });

            if (records.length > 0) {
                const payableRecords = records.filter(record => !isHolidayDate(record.date));
                const summary = calculateAttendanceSummary(payableRecords);
                // Working days up to today within cycle
                const workingDaysSoFar = getWorkingDays(internStartDate, effectiveCycleEnd);
                const percentage = workingDaysSoFar > 0
                    ? Math.round((summary.effectiveDays / workingDaysSoFar) * 10000) / 100
                    : 100;

                if (percentage < 75) {
                    lowAttendanceInterns.push({
                        _id: intern._id,
                        name: intern.name,
                        department: intern.department,
                        attendancePercentage: percentage,
                    });
                }
            }
        }

        res.json({
            totalInterns,
            today: {
                date: todayStr,
                present: todayPresent,
                halfDay: todayHalfDay,
                absent: todayAbsent,
                leave: todayLeave,
                marked: todayMarked,
                unmarked: totalInterns - todayMarked,
            },
            currentCycle: {
                month: cycleMonth,
                year: cycleYear,
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                totalWorkingDays,
            },
            lowAttendanceInterns,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { getDashboardStats };
