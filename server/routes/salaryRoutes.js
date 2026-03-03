const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getSalaryReport, exportExcel, exportPDF } = require('../controllers/salaryController');

router.get('/report', protect, getSalaryReport);
router.get('/export/excel', protect, exportExcel);
router.get('/export/pdf', protect, exportPDF);

module.exports = router;
