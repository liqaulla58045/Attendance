import { useEffect, useState } from 'react';
import API from '../api/axios';
import { CalendarDays, CircleCheck, CircleX, Search, UserRound } from 'lucide-react';

export default function AttendanceHistory() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const [interns, setInterns] = useState([]);
    const [selectedInternId, setSelectedInternId] = useState('');
    const [month, setMonth] = useState(currentMonth);
    const [year, setYear] = useState(currentYear);
    const [history, setHistory] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingInterns, setLoadingInterns] = useState(true);
    const [toast, setToast] = useState(null);

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const shortMonthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const years = [];
    for (let y = 2024; y <= currentYear + 1; y++) years.push(y);

    const getCycleLabel = (selectedMonth) => {
        const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
        return `${shortMonthNames[prevMonth]}-${shortMonthNames[selectedMonth]}`;
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        const fetchInterns = async () => {
            setLoadingInterns(true);
            try {
                const { data } = await API.get('/interns');
                setInterns(data || []);
                if (data?.length > 0) {
                    setSelectedInternId((prev) => prev || data[0]._id);
                }
            } catch {
                showToast('Failed to load interns', 'error');
            } finally {
                setLoadingInterns(false);
            }
        };

        fetchInterns();
    }, []);

    const fetchHistory = async () => {
        if (!selectedInternId) {
            showToast('Please select an intern', 'error');
            return;
        }

        setLoading(true);
        try {
            const { data } = await API.get(`/attendance/history/${selectedInternId}?month=${month}&year=${year}`);
            setHistory(data);
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to load attendance history', 'error');
        } finally {
            setLoading(false);
        }
    };

    const statusClassMap = {
        Present: 'badge-present',
        Absent: 'badge-absent',
        Leave: 'badge-leave',
        HalfDay: 'badge-halfday',
        Unmarked: 'badge-warning',
        Inactive: 'badge',
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>Attendance History</h1>
                    <p>Check full cycle attendance, totals, and unmarked dates for one intern</p>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: '260px' }}>
                        <label>Intern</label>
                        <select
                            className="form-control"
                            value={selectedInternId}
                            onChange={(e) => setSelectedInternId(e.target.value)}
                            disabled={loadingInterns || interns.length === 0}
                        >
                            {interns.length === 0 ? (
                                <option value="">No interns found</option>
                            ) : (
                                interns.map((intern) => (
                                    <option key={intern._id} value={intern._id}>{intern.name}</option>
                                ))
                            )}
                        </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Salary Month</label>
                        <select className="form-control" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                            {monthNames.slice(1).map((_, i) => (
                                <option key={i + 1} value={i + 1}>{getCycleLabel(i + 1)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Year</label>
                        <select className="form-control" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                            {years.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    <button className="btn btn-primary" onClick={fetchHistory} disabled={loading || interns.length === 0}>
                        <Search size={16} /> {loading ? 'Loading...' : 'Show History'}
                    </button>
                </div>
            </div>

            {history && (
                <>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                        <div className="stat-card cyan">
                            <div className="stat-value" style={{ fontSize: '1.2rem' }}>{history.cycle.totalDays}</div>
                            <div className="stat-label">Cycle Total Days</div>
                        </div>
                        <div className="stat-card blue">
                            <div className="stat-value" style={{ fontSize: '1.2rem' }}>{history.cycle.applicableDays}</div>
                            <div className="stat-label">Applicable Days</div>
                        </div>
                        <div className="stat-card green">
                            <div className="stat-value" style={{ fontSize: '1.2rem' }}>{history.summary.present}</div>
                            <div className="stat-label">Present Days</div>
                        </div>
                        <div className="stat-card red">
                            <div className="stat-value" style={{ fontSize: '1.2rem' }}>{history.summary.absent}</div>
                            <div className="stat-label">Absent Days</div>
                        </div>
                        <div className="stat-card amber">
                            <div className="stat-value" style={{ fontSize: '1.2rem' }}>{history.summary.unmarked}</div>
                            <div className="stat-label">Unmarked Days</div>
                        </div>
                    </div>

                    <div className="table-container" style={{ marginBottom: '22px' }}>
                        <div className="table-header">
                            <h3>
                                <UserRound size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                                {history.intern.name} — {history.cycle.cycleStart} to {history.cycle.cycleEnd}
                            </h3>
                        </div>
                        <div style={{ padding: '14px 0', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            <span className="badge badge-present">Present</span>
                            <span className="badge badge-absent">Absent</span>
                            <span className="badge badge-halfday">Half Day</span>
                            <span className="badge badge-leave">Leave</span>
                            <span className="badge badge-warning">Unmarked</span>
                        </div>
                    </div>

                    <div className="history-calendar">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                            <div key={day} className="history-calendar-header">{day}</div>
                        ))}
                        {history.dateStatus.map((entry) => {
                            const statusClass = statusClassMap[entry.status] || 'badge';
                            return (
                                <div key={entry.date} className="history-day-card">
                                    <div className="history-day-date">
                                        {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                    </div>
                                    <div className="history-day-name">{entry.dayName}</div>
                                    <span className={`badge ${statusClass}`}>{entry.status}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="card" style={{ marginTop: '24px' }}>
                        <h3 className="card-heading"><CalendarDays size={16} /> Unmarked Dates</h3>
                        {history.unmarkedDates.length === 0 ? (
                            <p style={{ color: 'var(--success-light)', fontWeight: 600 }}>No unmarked days in this cycle.</p>
                        ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {history.unmarkedDates.map((date) => (
                                    <span key={date} className="badge badge-warning">{date}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {!history && !loading && (
                <div className="card">
                    <p style={{ color: 'var(--text-secondary)' }}>Select intern and cycle, then click “Show History”.</p>
                </div>
            )}

            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>
                        <span>{toast.type === 'success' ? <CircleCheck size={16} /> : <CircleX size={16} />}</span>
                        {toast.message}
                    </div>
                </div>
            )}
        </div>
    );
}
