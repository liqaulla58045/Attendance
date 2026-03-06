const Attendance = require('../models/Attendance');
const Intern = require('../models/Intern');
const { emitDataRefresh } = require('../utils/realtime');
const { isHolidayDate, isThirdSaturday, getSalaryCycleDates, getCycleDays } = require('../utils/salaryCalc');

const IST_OFFSET_MINUTES = 330;
const SHIFT_START_MINUTES = 10 * 60;
const LATE_CUTOFF_MINUTES = 10 * 60 + 30;
const SHIFT_END_MINUTES = 18 * 60;
const DAILY_REQUIRED_MINUTES = SHIFT_END_MINUTES - SHIFT_START_MINUTES;
const DEFAULT_FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 0.78);

class BadRequestError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BadRequestError';
    }
}

function getISTShiftedDate(date = new Date()) {
    return new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}

function getISTDateKey(date = new Date()) {
    const ist = getISTShiftedDate(date);
    const year = ist.getUTCFullYear();
    const month = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const day = String(ist.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getISTMinutesOfDay(date = new Date()) {
    const ist = getISTShiftedDate(date);
    return (ist.getUTCHours() * 60) + ist.getUTCMinutes();
}

function normalizeEmbedding(input) {
    if (!Array.isArray(input) || input.length < 32) {
        throw new BadRequestError('Face embedding must be a numeric array with at least 32 values');
    }

    const vector = input.map((value) => {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
            throw new BadRequestError('Face embedding contains invalid numeric values');
        }
        return numberValue;
    });

    const magnitude = Math.sqrt(vector.reduce((acc, value) => acc + (value * value), 0));
    if (!Number.isFinite(magnitude) || magnitude === 0) {
        throw new BadRequestError('Face embedding magnitude must be greater than zero');
    }

    return vector.map((value) => value / magnitude);
}

function cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) return -1;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
    }
    return dot;
}

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
                    {
                        internId: record.internId,
                        date: attendanceDate,
                        status: record.status,
                        punchInAt: null,
                        punctualityStatus: null,
                        lateMinutes: 0,
                        workedMinutes: 0,
                        shortfallMinutes: 0,
                        faceVerified: false,
                        faceConfidence: null,
                    },
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
        if (error instanceof BadRequestError) {
            return res.status(400).json({ message: error.message });
        }
        console.error('Face enrollment error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Enroll face embedding(s) for an intern
// @route   POST /api/attendance/face/enroll/:internId
// @body    { embedding?: number[], embeddings?: number[][], replace?: boolean, modelVersion?: string }
const enrollInternFace = async (req, res) => {
    try {
        const { internId } = req.params;
        const { embedding, embeddings, replace = false, modelVersion } = req.body;

        const intern = await Intern.findById(internId).select('+faceEmbeddings');
        if (!intern) {
            return res.status(404).json({ message: 'Intern not found' });
        }

        let inputEmbeddings = [];
        if (Array.isArray(embeddings) && embeddings.length > 0) {
            inputEmbeddings = embeddings;
        } else if (Array.isArray(embedding) && embedding.length > 0) {
            inputEmbeddings = [embedding];
        } else {
            return res.status(400).json({ message: 'Provide embedding or embeddings array' });
        }

        const normalizedEmbeddings = inputEmbeddings.map(item => normalizeEmbedding(item));
        const embeddingDimension = normalizedEmbeddings[0].length;

        if (normalizedEmbeddings.some(item => item.length !== embeddingDimension)) {
            return res.status(400).json({ message: 'All face embeddings must have the same dimension' });
        }

        const existingEmbeddings = Array.isArray(intern.faceEmbeddings) ? intern.faceEmbeddings : [];
        const nextEmbeddings = replace
            ? normalizedEmbeddings
            : [...existingEmbeddings, ...normalizedEmbeddings];

        if (nextEmbeddings.length > 10) {
            return res.status(400).json({ message: 'Maximum 10 face embeddings are allowed per intern' });
        }

        intern.faceEmbeddings = nextEmbeddings;
        intern.faceEmbeddingDimension = embeddingDimension;
        intern.faceModelVersion = modelVersion || intern.faceModelVersion || null;
        intern.faceEnrolledAt = new Date();
        await intern.save();

        res.json({
            message: 'Face enrollment saved successfully',
            internId: intern._id,
            embeddingCount: intern.faceEmbeddings.length,
            embeddingDimension: intern.faceEmbeddingDimension,
            faceEnrolledAt: intern.faceEnrolledAt,
        });
    } catch (error) {
        if (error instanceof BadRequestError) {
            return res.status(400).json({ message: error.message });
        }
        console.error('Face punch-in error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Face-based attendance punch-in (single punch-in/day)
// @route   POST /api/attendance/face/punchin
// @body    { embedding: number[] }
const facePunchIn = async (req, res) => {
    try {
        const { embedding } = req.body;

        if (!Array.isArray(embedding) || embedding.length === 0) {
            return res.status(400).json({ message: 'Face embedding is required' });
        }

        const normalizedProbe = normalizeEmbedding(embedding);
        const dateKey = getISTDateKey();
        const attendanceDate = new Date(`${dateKey}T00:00:00.000Z`);
        const now = new Date();
        const nowMinutes = getISTMinutesOfDay(now);

        const allInterns = await Intern.find(
            { faceEmbeddingDimension: normalizedProbe.length },
            '_id name email department joiningDate isDiscontinued discontinuedFrom faceEmbeddingDimension'
        ).select('+faceEmbeddings');

        const activeInterns = allInterns.filter(intern => {
            if (!Array.isArray(intern.faceEmbeddings) || intern.faceEmbeddings.length === 0) return false;
            return isInternActiveOnDate(intern, attendanceDate);
        });

        if (activeInterns.length === 0) {
            return res.status(404).json({ message: 'No enrolled active interns found for face matching' });
        }

        let bestMatch = null;
        let bestScore = -1;

        for (const intern of activeInterns) {
            for (const template of intern.faceEmbeddings) {
                const score = cosineSimilarity(normalizedProbe, template);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = intern;
                }
            }
        }

        if (!bestMatch || bestScore < DEFAULT_FACE_MATCH_THRESHOLD) {
            return res.status(401).json({
                message: 'Face not recognized. Please retry with clear framing.',
                threshold: DEFAULT_FACE_MATCH_THRESHOLD,
                confidence: bestScore > 0 ? Number(bestScore.toFixed(4)) : 0,
            });
        }

        const existingAttendance = await Attendance.findOne({ internId: bestMatch._id, date: attendanceDate });
        if (existingAttendance?.punchInAt) {
            return res.status(409).json({
                message: 'Attendance already punched in for today',
                internId: bestMatch._id,
                internName: bestMatch.name,
            });
        }

        if (existingAttendance && existingAttendance.status && existingAttendance.status !== 'Present' && existingAttendance.status !== 'Late') {
            return res.status(409).json({
                message: `Attendance already marked as ${existingAttendance.status} for today`,
                internId: bestMatch._id,
                internName: bestMatch.name,
            });
        }

        const lateMinutes = Math.max(0, nowMinutes - LATE_CUTOFF_MINUTES);
        const effectiveStart = Math.max(nowMinutes, SHIFT_START_MINUTES);
        const workedMinutes = Math.max(0, Math.min(DAILY_REQUIRED_MINUTES, SHIFT_END_MINUTES - effectiveStart));
        const shortfallMinutes = Math.max(0, DAILY_REQUIRED_MINUTES - workedMinutes);
        const isLate = lateMinutes > 0;

        const savedAttendance = await Attendance.findOneAndUpdate(
            { internId: bestMatch._id, date: attendanceDate },
            {
                internId: bestMatch._id,
                date: attendanceDate,
                status: isLate ? 'Late' : 'Present',
                punchInAt: now,
                punctualityStatus: isLate ? 'Late' : 'OnTime',
                lateMinutes,
                workedMinutes,
                shortfallMinutes,
                faceVerified: true,
                faceConfidence: Number(bestScore.toFixed(4)),
            },
            { upsert: true, new: true, runValidators: true }
        );

        emitDataRefresh({ source: 'attendance', action: 'face-punched-in', date: dateKey });

        res.json({
            message: isLate ? 'Attendance marked as Late' : 'Attendance marked as Present',
            intern: {
                _id: bestMatch._id,
                name: bestMatch.name,
                email: bestMatch.email,
                department: bestMatch.department,
            },
            attendance: {
                _id: savedAttendance._id,
                date: dateKey,
                status: savedAttendance.status,
                punchInAt: savedAttendance.punchInAt,
                punctualityStatus: savedAttendance.punctualityStatus,
                lateMinutes: savedAttendance.lateMinutes,
                workedMinutes: savedAttendance.workedMinutes,
                shortfallMinutes: savedAttendance.shortfallMinutes,
                faceConfidence: savedAttendance.faceConfidence,
            },
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
                punchInAt: a.punchInAt || null,
                punctualityStatus: a.punctualityStatus || null,
                lateMinutes: a.lateMinutes || 0,
                workedMinutes: a.workedMinutes || 0,
                shortfallMinutes: a.shortfallMinutes || 0,
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
                punchInAt: null,
                punctualityStatus: null,
                lateMinutes: 0,
                workedMinutes: 0,
                shortfallMinutes: 0,
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
        let late = 0;
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
                    if (recordedStatus === 'Late') {
                        late++;
                        present++;
                    }
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
                late,
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

module.exports = {
    markAttendance,
    enrollInternFace,
    facePunchIn,
    getAttendanceByDate,
    getAttendanceByIntern,
    getAttendanceHistory,
};
