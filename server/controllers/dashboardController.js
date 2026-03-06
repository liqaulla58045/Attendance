const Intern = require('../models/Intern');
const Attendance = require('../models/Attendance');
const { getSalaryCycleDates, getWorkingDays, calculateAttendanceSummary, isHolidayDate } = require('../utils/salaryCalc');

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

// @desc    Get dashboard statistics
// @route   GET /api/dashboard
const getDashboardStats = async (req, res) => {
    try {
        // Total interns
        const totalInterns = await Intern.countDocuments();
        const allInterns = await Intern.find();

        // Today's date (UTC midnight)
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const todayDate = new Date(todayStr + 'T00:00:00.000Z');

        const activeInternsToday = allInterns.filter(intern => isInternActiveOnDate(intern, todayDate));

        // Today's attendance
        let todayPresent = 0;
        let todayLate = 0;
        let todayHalfDay = 0;
        let todayAbsent = 0;
        let todayLeave = 0;
        let todayMarked = 0;

        if (isHolidayDate(todayDate)) {
            todayPresent = activeInternsToday.length;
            todayMarked = activeInternsToday.length;
        } else {
            const activeInternIdsToday = activeInternsToday.map(intern => intern._id);
            const todayAttendance = await Attendance.find({
                date: todayDate,
                internId: { $in: activeInternIdsToday },
            });
            todayPresent = todayAttendance.filter(a => a.status === 'Present').length;
            todayLate = todayAttendance.filter(a => a.status === 'Late').length;
            todayPresent += todayLate;
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
        const lowAttendanceInterns = [];

        for (const intern of allInterns) {
            const joiningDate = new Date(intern.joiningDate);
            const internStartDate = joiningDate > startDate ? joiningDate : startDate;
            let effectiveCycleEnd = todayDate > endDate ? endDate : todayDate;

            if (intern.isDiscontinued && intern.discontinuedFrom) {
                const discontinuedFrom = new Date(intern.discontinuedFrom);
                const cutoff = new Date(Date.UTC(
                    discontinuedFrom.getUTCFullYear(),
                    discontinuedFrom.getUTCMonth(),
                    discontinuedFrom.getUTCDate()
                ));
                cutoff.setUTCDate(cutoff.getUTCDate() - 1);
                if (cutoff < effectiveCycleEnd) {
                    effectiveCycleEnd = cutoff;
                }
            }

            if (internStartDate > effectiveCycleEnd) {
                continue;
            }

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
                late: todayLate,
                halfDay: todayHalfDay,
                absent: todayAbsent,
                leave: todayLeave,
                marked: todayMarked,
                unmarked: Math.max(0, activeInternsToday.length - todayMarked),
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
