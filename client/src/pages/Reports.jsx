import { useState, useEffect, useCallback } from 'react';
import API from '../api/axios';
import { BarChart3, Download, FileText, TriangleAlert, CircleCheck, CircleX, Files } from 'lucide-react';
import { subscribeDataRefresh } from '../realtime/socket';

export default function Reports() {
    const currentDate = new Date();
    const [month, setMonth] = useState(currentDate.getMonth() + 1);
    const [year, setYear] = useState(currentDate.getFullYear());
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const shortMonthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const getCycleLabel = (selectedMonth) => {
        const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
        return `${shortMonthNames[prevMonth]}-${shortMonthNames[selectedMonth]}`;
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await API.get(`/salary/report?month=${month}&year=${year}`);
            setReport(data);
        } catch (err) {
            showToast('Failed to load report', 'error');
        } finally {
            setLoading(false);
        }
    }, [month, year]);

    useEffect(() => {
        const unsubscribe = subscribeDataRefresh((event) => {
            if (!report) return;
            if (event?.source === 'attendance' || event?.source === 'intern') {
                fetchReport();
            }
        });

        return () => unsubscribe();
    }, [report, fetchReport]);

    const downloadExcel = async () => {
        try {
            const response = await API.get(`/salary/export/excel?month=${month}&year=${year}`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Salary_Report_${monthNames[month]}_${year}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            showToast('Excel report downloaded');
        } catch (err) {
            showToast('Failed to download Excel', 'error');
        }
    };

    const downloadPDF = async () => {
        try {
            const response = await API.get(`/salary/export/pdf?month=${month}&year=${year}`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Salary_Report_${monthNames[month]}_${year}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            showToast('PDF report downloaded');
        } catch (err) {
            showToast('Failed to download PDF', 'error');
        }
    };

    // Generate year options
    const years = [];
    for (let y = 2024; y <= currentDate.getFullYear() + 1; y++) years.push(y);

    // Totals
    const totalPayable = report?.interns?.reduce((sum, i) => sum + i.payableAmount, 0) || 0;
    const totalStipend = report?.interns?.reduce((sum, i) => sum + i.monthlyStipend, 0) || 0;

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>Salary Reports</h1>
                    <p>Generate monthly salary reports based on attendance</p>
                </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Salary Month</label>
                        <select className="form-control" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                            {monthNames.slice(1).map((name, i) => (
                                <option key={i + 1} value={i + 1}>{getCycleLabel(i + 1)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Year</label>
                        <select className="form-control" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                            {years.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <button className="btn btn-primary" onClick={fetchReport} disabled={loading}>
                        <BarChart3 size={16} /> {loading ? 'Loading...' : 'Generate Report'}
                    </button>
                    {report && (
                        <>
                            <button className="btn btn-success" onClick={downloadExcel}><Download size={16} /> Export Excel</button>
                            <button className="btn btn-warning" onClick={downloadPDF}><FileText size={16} /> Export PDF</button>
                        </>
                    )}
                </div>
            </div>

            {/* Report Results */}
            {report && (
                <>
                    {/* Summary Cards */}
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        <div className="stat-card blue">
                            <div className="stat-value" style={{ fontSize: '1.3rem' }}>{report.cycleLabel} {report.year}</div>
                            <div className="stat-label">Report Period</div>
                        </div>
                        <div className="stat-card cyan">
                            <div className="stat-value" style={{ fontSize: '1.3rem' }}>{report.cycleStart} → {report.cycleEnd}</div>
                            <div className="stat-label">Salary Cycle</div>
                        </div>
                        <div className="stat-card green">
                            <div className="stat-value">{report.totalDays ?? report.totalWorkingDays}</div>
                            <div className="stat-label">Total Days</div>
                        </div>
                        <div className="stat-card amber">
                            <div className="stat-value">₹{totalPayable.toLocaleString()}</div>
                            <div className="stat-label">Total Payable</div>
                        </div>
                    </div>

                    {/* Detailed Report Table */}
                    <div className="table-container">
                        <div className="table-header">
                            <h3>Detailed Salary Report ({report.interns.length} Interns)</h3>
                        </div>
                        {report.interns.length === 0 ? (
                            <div className="empty-state">
                                <p>No interns found for this period.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Name</th>
                                            <th>Dept</th>
                                            <th>Stipend</th>
                                            <th>Total Days</th>
                                            <th>Marked</th>
                                            <th>Unmarked</th>
                                            <th>Present</th>
                                            <th>Half Day</th>
                                            <th>Leave</th>
                                            <th>Absent</th>
                                            <th>Effective</th>
                                            <th>Att. %</th>
                                            <th>Payable</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.interns.map((intern, i) => (
                                            <tr key={intern.internId} className={intern.lowAttendance ? 'low-attendance' : ''}>
                                                <td>{i + 1}</td>
                                                <td style={{ fontWeight: 600 }}>
                                                    {intern.name}
                                                    {intern.lowAttendance && <span className="badge badge-warning" style={{ marginLeft: '8px' }}><TriangleAlert size={12} /> Low</span>}
                                                </td>
                                                <td>{intern.department}</td>
                                                <td>₹{intern.monthlyStipend?.toLocaleString()}</td>
                                                <td style={{ textAlign: 'center' }}>{intern.totalDays ?? intern.totalWorkingDays}</td>
                                                <td style={{ textAlign: 'center', fontWeight: 600 }}>{intern.markedDays ?? (intern.present + intern.halfDay + intern.leave + intern.absent)}</td>
                                                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{intern.unmarkedDays ?? 0}</td>
                                                <td style={{ textAlign: 'center', color: 'var(--success-light)', fontWeight: 600 }}>{intern.present}</td>
                                                <td style={{ textAlign: 'center', color: 'var(--accent-light)' }}>{intern.halfDay}</td>
                                                <td style={{ textAlign: 'center', color: 'var(--warning-light)' }}>{intern.leave}</td>
                                                <td style={{ textAlign: 'center', color: 'var(--danger-light)' }}>{intern.absent}</td>
                                                <td style={{ textAlign: 'center', fontWeight: 600 }}>{intern.effectiveDays}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span style={{
                                                        fontWeight: 700,
                                                        color: intern.attendancePercentage >= 75 ? 'var(--success-light)' : 'var(--danger-light)'
                                                    }}>
                                                        {intern.attendancePercentage}%
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: 700, color: 'var(--primary-light)' }}>₹{intern.payableAmount?.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ background: 'var(--bg-table-header)', fontWeight: 700 }}>
                                            <td colSpan="3">TOTAL</td>
                                            <td>₹{totalStipend.toLocaleString()}</td>
                                            <td colSpan="9"></td>
                                            <td style={{ color: 'var(--primary-light)' }}>₹{totalPayable.toLocaleString()}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {!report && !loading && (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-icon"><Files size={40} /></div>
                        <p>Select a month and year, then click "Generate Report" to view salary details</p>
                    </div>
                </div>
            )}

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
