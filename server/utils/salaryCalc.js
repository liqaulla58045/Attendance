/**
 * Salary Cycle Calculation Utilities
 * 
 * Salary cycle: 21st of previous month → 20th of current month
 * Example: March salary = Feb 21 → Mar 20
 */

function isSunday(date) {
    return date.getUTCDay() === 0;
}

function isThirdSaturday(date) {
    const isSaturday = date.getUTCDay() === 6;
    const dayOfMonth = date.getUTCDate();
    return isSaturday && dayOfMonth >= 15 && dayOfMonth <= 21;
}

function getConfiguredHolidayStrings() {
    const raw = process.env.NATIONAL_HOLIDAYS || '';
    return raw
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function isHolidayDate(date, holidays = []) {
    const dateStr = date.toISOString().split('T')[0];
    const explicitHolidayStrings = holidays.map(h => h.toISOString().split('T')[0]);
    const configuredHolidayStrings = getConfiguredHolidayStrings();

    return (
        isSunday(date)
        || isThirdSaturday(date)
        || explicitHolidayStrings.includes(dateStr)
        || configuredHolidayStrings.includes(dateStr)
    );
}

/**
 * Get salary cycle start and end dates for a given month/year.
 * @param {number} month - 1-12 (Jan=1, Dec=12)
 * @param {number} year
 * @returns {{ startDate: Date, endDate: Date }}
 */
function getSalaryCycleDates(month, year) {
    // Start date: 21st of previous month
    let startMonth = month - 1;
    let startYear = year;
    if (startMonth === 0) {
        startMonth = 12;
        startYear = year - 1;
    }
    // Use UTC to avoid timezone offset issues
    const startDate = new Date(Date.UTC(startYear, startMonth - 1, 21));

    // End date: 20th of given month
    const endDate = new Date(Date.UTC(year, month - 1, 20));

    return { startDate, endDate };
}

/**
 * Count working days between two dates (excluding Sundays and 3rd Saturdays).
 * Future-ready: accepts optional holidays array.
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {Date[]} holidays - optional array of holiday dates to exclude
 * @returns {number}
 */
function getWorkingDays(startDate, endDate, holidays = []) {
    let count = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
        if (!isHolidayDate(current, holidays)) {
            count++;
        }
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return count;
}

/**
 * Calculate effective present days from attendance records.
 * Present/Late = 1, HalfDay = 0.5, Leave = 0, Absent = 0
 * @param {Array} records - array of { status: string }
 * @returns {{ present: number, halfDay: number, leave: number, absent: number, effectiveDays: number }}
 */
function calculateAttendanceSummary(records) {
    let present = 0;
    let halfDay = 0;
    let leave = 0;
    let absent = 0;

    records.forEach(record => {
        switch (record.status) {
            case 'Present':
            case 'Late':
                present++;
                break;
            case 'HalfDay':
                halfDay++;
                break;
            case 'Leave':
                leave++;
                break;
            case 'Absent':
                absent++;
                break;
        }
    });

    const effectiveDays = present + (halfDay * 0.5);

    return { present, halfDay, leave, absent, effectiveDays };
}

/**
 * Count total cycle days (inclusive start and end date).
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {number}
 */
function getCycleDays(startDate, endDate) {
    const startUtc = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
    const endUtc = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
    const diffMs = endUtc - startUtc;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

function getCycleLabel(startDate, endDate) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const startLabel = monthNames[startDate.getUTCMonth()];
    const endLabel = monthNames[endDate.getUTCMonth()];
    return `${startLabel}-${endLabel}`;
}

/**
 * Calculate per-day rate from monthly stipend and cycle days.
 * Ex: 10000/30 => 333, 10000/31 => 323, 15000/31 => 484
 * @param {number} monthlyStipend
 * @param {number} cycleDays
 * @returns {number}
 */
function getDailyRate(monthlyStipend, cycleDays) {
    if (!cycleDays || cycleDays <= 0) return 0;
    return Math.round(monthlyStipend / cycleDays);
}

/**
 * Calculate final payable salary using full total days in cycle.
 * Pay is based on effective attendance days; all non-effective days are deducted.
 * @param {{ effectiveDays:number }} attendanceSummary
 * @param {number} monthlyStipend
 * @param {number} totalDays
 * @returns {{ dailyRate: number, deductionUnits: number, deductionAmount: number, payableAmount: number }}
 */
function calculateSalary(attendanceSummary, monthlyStipend, totalDays) {
    if (!totalDays || totalDays <= 0) {
        return { dailyRate: 0, deductionUnits: 0, deductionAmount: 0, payableAmount: 0 };
    }

    const dailyRate = getDailyRate(monthlyStipend, totalDays);
    const effectiveDays = Math.max(0, Math.min(totalDays, attendanceSummary.effectiveDays || 0));
    const deductionUnits = Math.max(0, totalDays - effectiveDays);
    const deductionAmount = Math.round(deductionUnits * dailyRate * 100) / 100;
    const payableAmount = Math.max(0, Math.round((monthlyStipend - deductionAmount) * 100) / 100);
    return { dailyRate, deductionUnits, deductionAmount, payableAmount };
}

module.exports = {
    isSunday,
    isThirdSaturday,
    isHolidayDate,
    getCycleDays,
    getCycleLabel,
    getDailyRate,
    getSalaryCycleDates,
    getWorkingDays,
    calculateAttendanceSummary,
    calculateSalary,
};
