import { useState, useEffect, useCallback } from 'react';
import API from '../api/axios';
import { Plus, PencilLine, Trash2, UsersRound, CircleCheck, CircleX } from 'lucide-react';
import { subscribeDataRefresh } from '../realtime/socket';

export default function Interns() {
    const [interns, setInterns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingIntern, setEditingIntern] = useState(null);
    const [form, setForm] = useState({ name: '', email: '', department: '', joiningDate: '', monthlyStipend: '' });
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);

    const fetchInterns = useCallback(async () => {
        try {
            const { data } = await API.get('/interns');
            setInterns(data);
        } catch (err) {
            console.error('Failed to load interns', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInterns();

        const unsubscribe = subscribeDataRefresh((event) => {
            if (event?.source === 'intern') {
                fetchInterns();
            }
        });

        return () => unsubscribe();
    }, [fetchInterns]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const openAddModal = () => {
        setEditingIntern(null);
        setForm({ name: '', email: '', department: '', joiningDate: '', monthlyStipend: '' });
        setError('');
        setShowModal(true);
    };

    const openEditModal = (intern) => {
        setEditingIntern(intern);
        setForm({
            name: intern.name,
            email: intern.email,
            department: intern.department,
            joiningDate: intern.joiningDate?.split('T')[0] || '',
            monthlyStipend: intern.monthlyStipend,
        });
        setError('');
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (editingIntern) {
                await API.put(`/interns/${editingIntern._id}`, form);
                showToast('Intern updated successfully');
            } else {
                await API.post('/interns', form);
                showToast('Intern added successfully');
            }
            setShowModal(false);
            fetchInterns();
        } catch (err) {
            setError(err.response?.data?.message || 'Something went wrong');
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete intern "${name}" and all their attendance records?`)) return;
        try {
            await API.delete(`/interns/${id}`);
            showToast('Intern deleted successfully');
            fetchInterns();
        } catch (err) {
            showToast('Failed to delete intern', 'error');
        }
    };

    const handleDiscontinue = async (intern) => {
        const defaultDate = new Date().toISOString().split('T')[0];
        const dateInput = window.prompt(`Discontinue ${intern.name} from date (YYYY-MM-DD):`, defaultDate);
        if (!dateInput) return;

        try {
            await API.patch(`/interns/${intern._id}/discontinue`, { discontinuedFrom: dateInput });
            showToast(`${intern.name} discontinued from ${dateInput}`);
            fetchInterns();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to discontinue intern', 'error');
        }
    };

    const handleReactivate = async (intern) => {
        if (!window.confirm(`Reactivate intern "${intern.name}"?`)) return;
        try {
            await API.patch(`/interns/${intern._id}/reactivate`);
            showToast(`${intern.name} reactivated`);
            fetchInterns();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to reactivate intern', 'error');
        }
    };

    if (loading) {
        return <div className="page-container"><div className="loading"><div className="spinner"></div> Loading interns...</div></div>;
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>Interns</h1>
                    <p>Manage all interns in your organization</p>
                </div>
                <button className="btn btn-primary" onClick={openAddModal}><Plus size={16} /> Add Intern</button>
            </div>

            <div className="table-container">
                <div className="table-header">
                    <h3>All Interns ({interns.length})</h3>
                </div>
                {interns.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon"><UsersRound size={40} /></div>
                        <p>No interns added yet</p>
                        <button className="btn btn-primary" onClick={openAddModal}><Plus size={16} /> Add Your First Intern</button>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Department</th>
                                <th>Joining Date</th>
                                <th>Status</th>
                                <th>Stipend (₹)</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {interns.map((intern, i) => (
                                <tr key={intern._id}>
                                    <td>{i + 1}</td>
                                    <td style={{ fontWeight: 600 }}>{intern.name}</td>
                                    <td style={{ color: 'var(--text-secondary)' }}>{intern.email}</td>
                                    <td><span className="badge badge-present">{intern.department}</span></td>
                                    <td>{new Date(intern.joiningDate).toLocaleDateString('en-IN')}</td>
                                    <td>
                                        {intern.isDiscontinued ? (
                                            <span className="badge badge-warning">
                                                Discontinued from {intern.discontinuedFrom ? new Date(intern.discontinuedFrom).toLocaleDateString('en-IN') : '-'}
                                            </span>
                                        ) : (
                                            <span className="badge badge-present">Active</span>
                                        )}
                                    </td>
                                    <td style={{ fontWeight: 600 }}>₹{intern.monthlyStipend?.toLocaleString()}</td>
                                    <td>
                                        <div className="action-group">
                                            <button className="btn btn-outline btn-sm" onClick={() => openEditModal(intern)}><PencilLine size={14} /> Edit</button>
                                            {intern.isDiscontinued ? (
                                                <button className="btn btn-outline btn-sm" onClick={() => handleReactivate(intern)}>Reactivate</button>
                                            ) : (
                                                <button className="btn btn-warning btn-sm" onClick={() => handleDiscontinue(intern)}>Discontinue</button>
                                            )}
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(intern._id, intern.name)}><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingIntern ? 'Edit Intern' : 'Add New Intern'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>

                        {error && <div className="login-error">{error}</div>}

                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Full Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="John Doe"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        className="form-control"
                                        placeholder="john@example.com"
                                        value={form.email}
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Department</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Engineering"
                                        value={form.department}
                                        onChange={(e) => setForm({ ...form, department: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Joining Date</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={form.joiningDate}
                                        onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Monthly Stipend (₹)</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        placeholder="15000"
                                        value={form.monthlyStipend}
                                        onChange={(e) => setForm({ ...form, monthlyStipend: e.target.value })}
                                        required
                                        min="0"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingIntern ? 'Update Intern' : 'Add Intern'}</button>
                            </div>
                        </form>
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
