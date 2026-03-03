import { useState, useEffect, useCallback } from 'react';
import API from '../api/axios';
import { Users, CircleCheckBig, Clock3, CircleX, FileCheck2, CalendarClock, Activity, TriangleAlert } from 'lucide-react';
import { subscribeDataRefresh } from '../realtime/socket';

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            const { data } = await API.get('/dashboard');
            setStats(data);
        } catch (err) {
            console.error('Failed to load dashboard', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();

        const unsubscribe = subscribeDataRefresh(() => {
            fetchStats();
        });

        return () => unsubscribe();
    }, [fetchStats]);

    if (loading) {
        return <div className="page-container"><div className="loading"><div className="spinner"></div> Loading dashboard...</div></div>;
    }

    if (!stats) {
        return <div className="page-container"><div className="empty-state"><p>Failed to load dashboard data.</p></div></div>;
    }

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>Dashboard</h1>
                    <p>Overview of your intern management system</p>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="stats-grid">
                <div className="stat-card blue">
                    <div className="stat-icon"><Users size={24} /></div>
                    <div className="stat-value">{stats.totalInterns}</div>
                    <div className="stat-label">Total Interns</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-icon"><CircleCheckBig size={24} /></div>
                    <div className="stat-value">{stats.today.present}</div>
                    <div className="stat-label">Present Today</div>
                </div>

                <div className="stat-card amber">
                    <div className="stat-icon"><Clock3 size={24} /></div>
                    <div className="stat-value">{stats.today.halfDay}</div>
                    <div className="stat-label">Half Day Today</div>
                </div>

                <div className="stat-card red">
                    <div className="stat-icon"><CircleX size={24} /></div>
                    <div className="stat-value">{stats.today.absent}</div>
                    <div className="stat-label">Absent Today</div>
                </div>

                <div className="stat-card cyan">
                    <div className="stat-icon"><FileCheck2 size={24} /></div>
                    <div className="stat-value">{stats.today.unmarked}</div>
                    <div className="stat-label">Unmarked Today</div>
                </div>
            </div>

            {/* Current Salary Cycle */}
            <div className="insight-grid">
                <div className="card">
                    <h3 className="card-heading"><CalendarClock size={18} /> Current Salary Cycle</h3>
                    <div className="detail-list">
                        <div className="detail-row">
                            <span className="detail-label">Month</span>
                            <span className="detail-value">{monthNames[stats.currentCycle.month]} {stats.currentCycle.year}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Cycle Period</span>
                            <span className="detail-value">{stats.currentCycle.startDate} → {stats.currentCycle.endDate}</span>
                        </div>
                        <div className="detail-row no-border">
                            <span className="detail-label">Total Working Days</span>
                            <span className="detail-value highlight">{stats.currentCycle.totalWorkingDays}</span>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h3 className="card-heading"><Activity size={18} /> Today's Summary</h3>
                    <div className="detail-list">
                        <div className="detail-row">
                            <span className="detail-label">Date</span>
                            <span className="detail-value">{stats.today.date}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Attendance Marked</span>
                            <span className="detail-value">{stats.today.marked} / {stats.totalInterns}</span>
                        </div>
                        <div className="detail-row no-border">
                            <span className="detail-label">On Leave</span>
                            <span className="detail-value amber">{stats.today.leave}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Low Attendance Warnings */}
            <div className="card">
                <h3 className="card-heading"><TriangleAlert size={18} /> Low Attendance Warnings (&lt;75%)</h3>
                {stats.lowAttendanceInterns.length === 0 ? (
                    <div className="empty-state compact">
                        <p className="text-success">All interns have attendance above 75%</p>
                    </div>
                ) : (
                    <div className="warning-list">
                        {stats.lowAttendanceInterns.map((intern) => (
                            <div className="warning-item" key={intern._id}>
                                <div className="intern-info">
                                    <span className="intern-name">{intern.name}</span>
                                    <span className="intern-dept">{intern.department}</span>
                                </div>
                                <span className="att-percent">{intern.attendancePercentage}%</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
