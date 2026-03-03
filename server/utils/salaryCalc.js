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

function isHolidayDate(date, holidays = []) {
    const dateStr = date.toISOString().split('T')[0];
    const holidayStrings = holidays.map(h => h.toISOString().split('T')[0]);
    return isSunday(date) || isThirdSaturday(date) || holidayStrings.includes(dateStr);
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
 * Present = 1, HalfDay = 0.5, Leave = 0, Absent = 0
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
 * Calculate final payable salary with dynamic daily rate.
 * @param {number} effectiveDays
 * @param {number} monthlyStipend
 * @param {number} cycleDays
 * @returns {{ dailyRate: number, payableAmount: number }}
 */
function calculateSalary(effectiveDays, monthlyStipend, cycleDays) {
    const dailyRate = getDailyRate(monthlyStipend, cycleDays);
    const payableAmount = Math.round(effectiveDays * dailyRate * 100) / 100;
    return { dailyRate, payableAmount };
}

module.exports = {
    isSunday,
    isThirdSaturday,
    isHolidayDate,
    getCycleDays,
    getDailyRate,
    getSalaryCycleDates,
    getWorkingDays,
    calculateAttendanceSummary,
    calculateSalary,
};
