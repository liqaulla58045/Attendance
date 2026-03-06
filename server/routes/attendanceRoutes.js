const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    markAttendance,
    enrollInternFace,
    facePunchIn,
    getAttendanceByDate,
    getAttendanceByIntern,
    getAttendanceHistory,
} = require('../controllers/attendanceController');

router.post('/', protect, markAttendance);
router.post('/face/enroll/:internId', protect, enrollInternFace);
router.post('/face/punchin', protect, facePunchIn);
router.get('/date/:date', protect, getAttendanceByDate);
router.get('/intern/:internId', protect, getAttendanceByIntern);
router.get('/history/:internId', protect, getAttendanceHistory);

module.exports = router;
