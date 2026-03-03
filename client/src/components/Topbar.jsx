import { CalendarDays, ShieldCheck } from 'lucide-react';

export default function Topbar() {
    const today = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <header className="topbar">
            <div className="topbar-left">
                <span className="topbar-date">
                    <CalendarDays size={16} />
                    {today}
                </span>
            </div>
            <div className="topbar-right">
                <div className="admin-badge">
                    <ShieldCheck size={16} />
                    Administrator
                </div>
            </div>
        </header>
    );
}
