/**
 * Salary Cycle Calculation Utilities
 * 
 * Salary cycle: 21st of previous month → 20th of current month
 * Example: March salary = Feb 21 → Mar 20
 */

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
 * Count working days between two dates (excluding Sundays).
 * Future-ready: accepts optional holidays array.
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {Date[]} holidays - optional array of holiday dates to exclude
 * @returns {number}
 */
function getWorkingDays(startDate, endDate, holidays = []) {
    let count = 0;
    const current = new Date(startDate);
    const holidayStrings = holidays.map(h => h.toISOString().split('T')[0]);

    while (current <= endDate) {
        const dayOfWeek = current.getUTCDay(); // 0=Sunday, use UTC
        const dateStr = current.toISOString().split('T')[0];

        if (dayOfWeek !== 0 && !holidayStrings.includes(dateStr)) {
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
 * Calculate final payable salary.
 * @param {number} effectiveDays
 * @param {number} totalWorkingDays
 * @param {number} monthlyStipend
 * @returns {number}
 */
function calculateSalary(effectiveDays, totalWorkingDays, monthlyStipend) {
    if (totalWorkingDays === 0) return 0;
    return Math.round((effectiveDays / totalWorkingDays) * monthlyStipend * 100) / 100;
}

module.exports = {
    getSalaryCycleDates,
    getWorkingDays,
    calculateAttendanceSummary,
    calculateSalary,
};
