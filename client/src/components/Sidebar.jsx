import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, ClipboardCheck, FileBarChart2, LogOut, CalendarDays } from 'lucide-react';

export default function Sidebar() {
    const { logout } = useAuth();

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="logo-icon">A</div>
                <div>
                    <h2>AttendPro</h2>
                    <span>Intern Management</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                    <LayoutDashboard className="nav-icon" size={18} />
                    Dashboard
                </NavLink>
                <NavLink to="/interns" className={({ isActive }) => isActive ? 'active' : ''}>
                    <Users className="nav-icon" size={18} />
                    Interns
                </NavLink>
                <NavLink to="/attendance" className={({ isActive }) => isActive ? 'active' : ''}>
                    <ClipboardCheck className="nav-icon" size={18} />
                    Attendance
                </NavLink>
                <NavLink to="/reports" className={({ isActive }) => isActive ? 'active' : ''}>
                    <FileBarChart2 className="nav-icon" size={18} />
                    Salary Reports
                </NavLink>
                <NavLink to="/attendance-history" className={({ isActive }) => isActive ? 'active' : ''}>
                    <CalendarDays className="nav-icon" size={18} />
                    Attendance History
                </NavLink>
            </nav>

            <div className="sidebar-footer">
                <button onClick={logout} className="btn btn-outline" style={{ width: '100%' }}>
                    <LogOut size={16} /> Logout
                </button>
            </div>
        </aside>
    );
}
