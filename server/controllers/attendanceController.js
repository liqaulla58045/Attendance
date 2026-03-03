const Attendance = require('../models/Attendance');
const Intern = require('../models/Intern');
const { emitDataRefresh } = require('../utils/realtime');

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

        // Check if it's a Sunday
        if (attendanceDate.getUTCDay() === 0) {
            return res.status(400).json({ message: 'Cannot mark attendance on Sundays' });
        }

        const results = [];
        const errors = [];

        for (const record of records) {
            try {
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

        const attendance = await Attendance.find({ date: targetDate })
            .populate('internId', 'name email department')
            .sort({ 'internId.name': 1 });

        // Also get all interns to show who doesn't have attendance yet
        const allInterns = await Intern.find().sort({ name: 1 });

        const attendanceMap = {};
        attendance.forEach(a => {
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

        const fullAttendance = allInterns.map(intern => {
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

module.exports = { markAttendance, getAttendanceByDate, getAttendanceByIntern };
