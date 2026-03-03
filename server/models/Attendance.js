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
        enum: ['Present', 'Absent', 'Leave', 'HalfDay'],
        required: [true, 'Status is required'],
    },
}, { timestamps: true });

// Compound unique index to prevent duplicate attendance for same intern on same date
attendanceSchema.index({ internId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
