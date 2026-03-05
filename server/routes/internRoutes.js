const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    createIntern,
    getInterns,
    getInternById,
    updateIntern,
    discontinueIntern,
    reactivateIntern,
    deleteIntern,
} = require('../controllers/internController');

router.route('/').get(protect, getInterns).post(protect, createIntern);
router.patch('/:id/discontinue', protect, discontinueIntern);
router.patch('/:id/reactivate', protect, reactivateIntern);
router.route('/:id').get(protect, getInternById).put(protect, updateIntern).delete(protect, deleteIntern);

module.exports = router;
