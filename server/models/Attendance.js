const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    internId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Intern',
        required: [true, 'Intern ID is required'],
    },
    date: {
        type: Date,
        required: [true, 'Date is required'],
    },
    status: {
        type: String,
        enum: ['Present', 'Late', 'Absent', 'Leave', 'HalfDay'],
        required: [true, 'Status is required'],
    },
    punchInAt: {
        type: Date,
        default: null,
    },
    punctualityStatus: {
        type: String,
        enum: ['OnTime', 'Late'],
        default: null,
    },
    lateMinutes: {
        type: Number,
        min: 0,
        default: 0,
    },
    workedMinutes: {
        type: Number,
        min: 0,
        default: 0,
    },
    shortfallMinutes: {
        type: Number,
        min: 0,
        default: 0,
    },
    faceVerified: {
        type: Boolean,
        default: false,
    },
    faceConfidence: {
        type: Number,
        min: 0,
        max: 1,
        default: null,
    },
}, { timestamps: true });

// Compound unique index to prevent duplicate attendance for same intern on same date
attendanceSchema.index({ internId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
