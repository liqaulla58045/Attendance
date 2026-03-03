const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    createIntern,
    getInterns,
    getInternById,
    updateIntern,
    deleteIntern,
} = require('../controllers/internController');

router.route('/').get(protect, getInterns).post(protect, createIntern);
router.route('/:id').get(protect, getInternById).put(protect, updateIntern).delete(protect, deleteIntern);

module.exports = router;
