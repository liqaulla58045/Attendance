import { useState, useEffect, useCallback } from 'react';
import API from '../api/axios';
import { Save, TriangleAlert, ClipboardMinus, CircleCheck, CircleX } from 'lucide-react';
import { subscribeDataRefresh } from '../realtime/socket';

export default function Attendance() {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const fetchAttendance = useCallback(async (date) => {
        setLoading(true);
        try {
            const { data } = await API.get(`/attendance/date/${date}`);
            setAttendance(data);
        } catch (err) {
            console.error('Failed to fetch attendance', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedDate) fetchAttendance(selectedDate);
    }, [selectedDate, fetchAttendance]);

    useEffect(() => {
        const unsubscribe = subscribeDataRefresh((event) => {
            if ((event?.source === 'attendance' || event?.source === 'intern') && selectedDate) {
                fetchAttendance(selectedDate);
            }
        });

        return () => unsubscribe();
    }, [selectedDate, fetchAttendance]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const updateStatus = (internId, status) => {
        setAttendance(prev =>
            prev.map(a =>
                a.internId === internId ? { ...a, status } : a
            )
        );
    };

    const handleSave = async () => {
        const records = attendance
            .filter(a => a.status)
            .map(a => ({ internId: a.internId, status: a.status }));

        if (records.length === 0) {
            showToast('No attendance to save', 'error');
            return;
        }

        setSaving(true);
        try {
            const { data } = await API.post('/attendance', {
                date: selectedDate,
                records,
            });
            showToast(`Attendance saved for ${data.saved} intern(s)`);
            fetchAttendance(selectedDate);
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to save attendance', 'error');
        } finally {
            setSaving(false);
        }
    };

    const markAllAs = (status) => {
        setAttendance(prev => prev.map(a => ({ ...a, status })));
    };

    const isHoliday = () => {
        const selected = new Date(selectedDate + 'T00:00:00');
        const day = selected.getDay();
        const dateOfMonth = selected.getDate();
        const isThirdSaturday = day === 6 && dateOfMonth >= 15 && dateOfMonth <= 21;
        return day === 0 || isThirdSaturday;
    };

    const statuses = ['Present', 'Late', 'Absent', 'Leave', 'HalfDay'];
    const statusClasses = { Present: 'present', Late: 'warning', Absent: 'absent', Leave: 'leave', HalfDay: 'halfday' };
    const statusLabels = { Present: 'P', Late: 'LT', Absent: 'A', Leave: 'L', HalfDay: '½' };

    const presentCount = attendance.filter(a => a.status === 'Present').length;
    const lateCount = attendance.filter(a => a.status === 'Late').length;
    const absentCount = attendance.filter(a => a.status === 'Absent').length;
    const leaveCount = attendance.filter(a => a.status === 'Leave').length;
    const halfDayCount = attendance.filter(a => a.status === 'HalfDay').length;
    const unmarkedCount = attendance.filter(a => !a.status).length;

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>Attendance</h1>
                    <p>Mark and manage daily attendance</p>
                </div>
                <div className="header-actions">
                    <input
                        type="date"
                        className="form-control"
                        style={{ width: 'auto' }}
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />
                    <button className="btn btn-success" onClick={handleSave} disabled={saving || isHoliday()}>
                        <Save size={16} /> {saving ? 'Saving...' : 'Save Attendance'}
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                <div className="stat-card green">
                    <div className="stat-value" style={{ fontSize: '1.4rem' }}>{presentCount}</div>
                    <div className="stat-label">Present</div>
                </div>
                <div className="stat-card amber">
                    <div className="stat-value" style={{ fontSize: '1.4rem' }}>{lateCount}</div>
                    <div className="stat-label">Late</div>
                </div>
                <div className="stat-card red">
                    <div className="stat-value" style={{ fontSize: '1.4rem' }}>{absentCount}</div>
                    <div className="stat-label">Absent</div>
                </div>
                <div className="stat-card amber">
                    <div className="stat-value" style={{ fontSize: '1.4rem' }}>{leaveCount}</div>
                    <div className="stat-label">Leave</div>
                </div>
                <div className="stat-card cyan">
                    <div className="stat-value" style={{ fontSize: '1.4rem' }}>{halfDayCount}</div>
                    <div className="stat-label">Half Day</div>
                </div>
                <div className="stat-card blue">
                    <div className="stat-value" style={{ fontSize: '1.4rem' }}>{unmarkedCount}</div>
                    <div className="stat-label">Unmarked</div>
                </div>
            </div>

            {isHoliday() && (
                <div className="notice notice-warning">
                    <TriangleAlert size={18} /> Selected date is a holiday (<strong>Sunday</strong> or <strong>3rd Saturday</strong>). Attendance is auto-marked as <strong>Present</strong> for all interns.
                </div>
            )}

            <div className="table-container">
                <div className="table-header">
                    <h3>Mark Attendance — {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                    <div className="table-actions">
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginRight: '8px' }}>Quick:</span>
                        {statuses.map(s => (
                            <button key={s} className={`btn btn-sm btn-outline`} onClick={() => markAllAs(s)} disabled={isHoliday()}>
                                All {s}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="loading"><div className="spinner"></div> Loading...</div>
                ) : attendance.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon"><ClipboardMinus size={40} /></div>
                        <p>No interns found. Add interns first.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Department</th>
                                <th>Status</th>
                                <th>Current</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendance.map((record, i) => (
                                <tr key={record.internId}>
                                    <td>{i + 1}</td>
                                    <td style={{ fontWeight: 600 }}>{record.internName}</td>
                                    <td style={{ color: 'var(--text-secondary)' }}>{record.internDepartment}</td>
                                    <td>
                                        <div className="status-group">
                                            {statuses.map(s => (
                                                <button
                                                    key={s}
                                                    className={`attendance-status-btn ${statusClasses[s]} ${record.status === s ? 'selected' : ''}`}
                                                    onClick={() => updateStatus(record.internId, s)}
                                                    disabled={isHoliday()}
                                                    title={s}
                                                >
                                                    {statusLabels[s]}
                                                </button>
                                            ))}
                                        </div>
                                    </td>
                                    <td>
                                        {record.status ? (
                                            <span className={`badge badge-${statusClasses[record.status]}`}>{record.status}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Not Marked</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Toast */}
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
