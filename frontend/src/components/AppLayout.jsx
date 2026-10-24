import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';

const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  dollar: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  play: <><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></>,
  percent: <><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
  clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></>,
  plus: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></>,
  search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  gift: <><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
};

const Icon = ({ name }) => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name]}
  </svg>
);

const HR_SECTIONS = [
  {
    label: 'Payroll Management',
    links: [
      { to: '/', text: 'Dashboard', end: true, icon: 'dashboard' },
      { to: '/employees', text: 'Employees', icon: 'users' },
      { to: '/compensation', text: 'Compensation', icon: 'dollar' },
      { to: '/attendance', text: 'Attendance', icon: 'calendar' },
      { to: '/payroll-run', text: 'Payroll Run', icon: 'play' },
      { to: '/tax', text: 'Tax & Contributions', icon: 'percent' },
    ],
  },
  {
    label: 'Claims & Benefits',
    links: [
      { to: '/claims', text: 'Claims', end: true, icon: 'clipboard' },
      { to: '/benefits', text: 'Benefits', icon: 'heart' },
      { to: '/benefit-plans', text: 'Benefit Plans', icon: 'shield' },
      { to: '/thirteenth-month', text: '13th Month Pay', icon: 'gift' },
    ],
  },
  {
    label: 'System',
    links: [
      { to: '/settings', text: 'Settings', icon: 'settings' },
      { to: '/records', text: 'Records', icon: 'folder' },
      { to: '/audit-log', text: 'Audit Log', icon: 'eye' },
      { to: '/archive', text: 'Archive', icon: 'file' },
    ],
  },
];

const EMPLOYEE_SECTIONS = [
  {
    label: 'My Workplace',
    links: [
      { to: '/employee', text: 'Dashboard', end: true, icon: 'dashboard' },
      { to: '/employee/attendance', text: 'My Attendance', icon: 'calendar' },
      { to: '/employee/leave', text: 'My Leave', icon: 'gift' },
      { to: '/employee/claims', text: 'My Claims', icon: 'clipboard' },
      { to: '/employee/benefits', text: 'My Benefits', icon: 'heart' },
      { to: '/employee/payroll', text: 'Payroll Summary', icon: 'dollar' },
      { to: '/employee/profile', text: 'My Profile', icon: 'users' },
      { to: '/employee/settings', text: 'Settings', icon: 'settings' },
    ],
  },
];

const CHEVRON = { left: '15 18 9 12 15 6', right: '9 18 15 12 9 6' };

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved !== null) return saved === '1';
    return window.innerWidth <= 900; // phones start with the drawer closed
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [company, setCompany] = useState('Payroll & Benefits');
  const clock = useClock();

  async function toggleSidebar() {
    setCollapsed((c) => {
      localStorage.setItem('sidebarCollapsed', c ? '0' : '1');
      return !c;
    });
  }

  function closeSidebarOnPhone() {
    if (window.innerWidth <= 900) {
      localStorage.setItem('sidebarCollapsed', '1');
      setCollapsed(true);
    }
  }

  async function loadNotifications() {
    try {
      const res = await api.get('/api/notifications');
      setNotifications(res.data);
      setUnread(res.unread);
    } catch { /* silent */ }
  }

  useEffect(() => { loadNotifications(); }, []);

  useEffect(() => {
    // Public branding endpoint: works for both HR Admin and Employee sessions.
    api.get('/api/branding')
      .then((b) => b?.company_name && setCompany(b.company_name))
      .catch(() => {});
  }, []);

  async function markAllRead() {
    try {
      await api.post('/api/notifications/read-all');
      loadNotifications();
    } catch { /* silent */ }
  }

  return (
    <div className={`app-shell${collapsed ? ' sb-collapsed' : ''}`}>
      <button className="sidebar-toggle" type="button" title={collapsed ? 'Show menu' : 'Hide menu'} onClick={toggleSidebar}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points={collapsed ? CHEVRON.right : CHEVRON.left} />
        </svg>
      </button>
      <div className="sidebar-backdrop" onClick={toggleSidebar} />
      <aside className="app-side">
        <div className="brand">
          <img src="/logo.jpg" alt="Company logo" />
          <span className="brand-text">{user?.role === 'Employee' ? 'Employee Portal' : 'HR Admin Portal'}</span>
        </div>
        <nav className="side-nav">
          {(user?.role === 'Employee' ? EMPLOYEE_SECTIONS : HR_SECTIONS).map((section) => {
            const links = section.links.filter((l) => !l.roles || l.roles.includes(user?.role));
            if (!links.length) return null;
            return (
            <div key={section.label} className="nav-section">
              <div className="nav-section-label">{section.label}</div>
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  onClick={closeSidebarOnPhone}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <Icon name={link.icon} />
                  <span className="nav-text">{link.text}</span>
                </NavLink>
              ))}
            </div>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="user-text">
            <div className="name">{user?.name}</div>
            <div>{user?.role === 'Employee' ? 'Employee' : 'HR Admin'}</div>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-meta">{company}</div>
          </div>
          <div className="topbar-actions">
            <span className="topbar-clock">{clock}</span>
            <div style={{ position: 'relative' }}>
              <button className="btn ghost notif-btn" onClick={() => setNotifOpen((o) => !o)} style={{ position: 'relative', padding: '6px 8px' }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unread > 0 && <span className="notif-dot" />}
              </button>
              {notifOpen && (
                <div className="notif-dropdown">
                  <div className="notif-head">
                    Notifications
                    <button className="btn ghost small" onClick={markAllRead}>Mark all read</button>
                  </div>
                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div className="notif-empty">No notifications</div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className={`notif-item${n.is_read ? '' : ' unread'}`}>
                          <div className="notif-msg">{n.title ? `${n.title}: ` : ''}{n.message}</div>
                          <div className="notif-time">{new Date(n.created_at).toLocaleString()}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="topbar-user" style={{ position: 'relative' }}>
              <button type="button" className="topbar-id" aria-label="Account menu" onClick={() => setProfileOpen((o) => !o)}>
                <span className="topbar-avatar">
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <span className="topbar-id-name">{user?.name}</span>
                <svg className={`topbar-id-caret${profileOpen ? ' open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {profileOpen && (
                <div className="profile-menu">
                  <Link to={user?.role === 'Employee' ? '/employee/profile' : '/profile'} className="profile-menu-item" onClick={() => setProfileOpen(false)}>
                    See Profile
                  </Link>
                  <button type="button" className="profile-menu-item danger" onClick={() => { setProfileOpen(false); logout(); }}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
