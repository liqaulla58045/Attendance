const mongoose = require('mongoose');

const internSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
    },
    department: {
        type: String,
        required: [true, 'Department is required'],
        trim: true,
    },
    joiningDate: {
        type: Date,
        required: [true, 'Joining date is required'],
    },
    monthlyStipend: {
        type: Number,
        required: [true, 'Monthly stipend is required'],
        min: 0,
    },
    isDiscontinued: {
        type: Boolean,
        default: false,
    },
    discontinuedFrom: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

module.exports = mongoose.model('Intern', internSchema);
