const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    markAttendance,
    getAttendanceByDate,
    getAttendanceByIntern,
    getAttendanceHistory,
} = require('../controllers/attendanceController');

router.post('/', protect, markAttendance);
router.get('/date/:date', protect, getAttendanceByDate);
router.get('/intern/:internId', protect, getAttendanceByIntern);
router.get('/history/:internId', protect, getAttendanceHistory);

module.exports = router;
