const Intern = require('../models/Intern');
const Attendance = require('../models/Attendance');
const { emitDataRefresh } = require('../utils/realtime');

// @desc    Create a new intern
// @route   POST /api/interns
const createIntern = async (req, res) => {
    try {
        const { name, email, department, joiningDate, monthlyStipend } = req.body;

        if (!name || !email || !department || !joiningDate || monthlyStipend === undefined) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existingIntern = await Intern.findOne({ email: email.toLowerCase() });
        if (existingIntern) {
            return res.status(400).json({ message: 'Intern with this email already exists' });
        }

        const intern = await Intern.create({
            name,
            email: email.toLowerCase(),
            department,
            joiningDate,
            monthlyStipend,
        });

        emitDataRefresh({ source: 'intern', action: 'created' });

        res.status(201).json(intern);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get all interns
// @route   GET /api/interns
const getInterns = async (req, res) => {
    try {
        const interns = await Intern.find().sort({ createdAt: -1 });
        res.json(interns);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get single intern
// @route   GET /api/interns/:id
const getInternById = async (req, res) => {
    try {
        const intern = await Intern.findById(req.params.id);
        if (!intern) {
            return res.status(404).json({ message: 'Intern not found' });
        }
        res.json(intern);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update intern
// @route   PUT /api/interns/:id
const updateIntern = async (req, res) => {
    try {
        const intern = await Intern.findById(req.params.id);
        if (!intern) {
            return res.status(404).json({ message: 'Intern not found' });
        }

        const { name, email, department, joiningDate, monthlyStipend, isDiscontinued, discontinuedFrom } = req.body;

        if (email && email.toLowerCase() !== intern.email) {
            const existing = await Intern.findOne({ email: email.toLowerCase() });
            if (existing) {
                return res.status(400).json({ message: 'Email already in use by another intern' });
            }
        }

        intern.name = name || intern.name;
        intern.email = email ? email.toLowerCase() : intern.email;
        intern.department = department || intern.department;
        intern.joiningDate = joiningDate || intern.joiningDate;
        intern.monthlyStipend = monthlyStipend !== undefined ? monthlyStipend : intern.monthlyStipend;

        if (isDiscontinued !== undefined) {
            const discontinueFlag = Boolean(isDiscontinued);
            intern.isDiscontinued = discontinueFlag;

            if (discontinueFlag) {
                if (!discontinuedFrom) {
                    return res.status(400).json({ message: 'Discontinued date is required when intern is discontinued' });
                }
                intern.discontinuedFrom = new Date(discontinuedFrom + 'T00:00:00.000Z');
            } else {
                intern.discontinuedFrom = null;
            }
        }

        const updated = await intern.save();
        emitDataRefresh({ source: 'intern', action: 'updated' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Discontinue intern from a specific date
// @route   PATCH /api/interns/:id/discontinue
const discontinueIntern = async (req, res) => {
    try {
        const { discontinuedFrom } = req.body;

        if (!discontinuedFrom) {
            return res.status(400).json({ message: 'Discontinued date is required' });
        }

        const intern = await Intern.findById(req.params.id);
        if (!intern) {
            return res.status(404).json({ message: 'Intern not found' });
        }

        intern.isDiscontinued = true;
        intern.discontinuedFrom = new Date(discontinuedFrom + 'T00:00:00.000Z');

        const updated = await intern.save();
        emitDataRefresh({ source: 'intern', action: 'discontinued' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Reactivate intern
// @route   PATCH /api/interns/:id/reactivate
const reactivateIntern = async (req, res) => {
    try {
        const intern = await Intern.findById(req.params.id);
        if (!intern) {
            return res.status(404).json({ message: 'Intern not found' });
        }

        intern.isDiscontinued = false;
        intern.discontinuedFrom = null;

        const updated = await intern.save();
        emitDataRefresh({ source: 'intern', action: 'reactivated' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Delete intern
// @route   DELETE /api/interns/:id
const deleteIntern = async (req, res) => {
    try {
        const intern = await Intern.findById(req.params.id);
        if (!intern) {
            return res.status(404).json({ message: 'Intern not found' });
        }

        // Also delete all attendance records for this intern
        await Attendance.deleteMany({ internId: intern._id });
        await Intern.findByIdAndDelete(req.params.id);

        emitDataRefresh({ source: 'intern', action: 'deleted' });

        res.json({ message: 'Intern and associated attendance records deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    createIntern,
    getInterns,
    getInternById,
    updateIntern,
    discontinueIntern,
    reactivateIntern,
    deleteIntern,
};
