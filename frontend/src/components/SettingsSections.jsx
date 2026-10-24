import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../hooks/useResource.js';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { currentTheme, setTheme } from '../lib/theme.js';
import { Loading } from './ui.jsx';

export function NotificationsSection() {
  const { data, loading, reload } = useResource('/api/notifications');
  const [busy, setBusy] = useState(false);
  const items = data || [];

  async function markAllRead() {
    setBusy(true);
    try {
      await api.post('/api/notifications/read-all');
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading text="Loading notifications…" />;
  return (
    <>
      <div className="settings-row" style={{ justifyContent: 'flex-end', borderBottom: 'none' }}>
        <button className="btn small ghost" onClick={markAllRead} disabled={busy}>Mark all read</button>
      </div>
      {items.length === 0 && <p className="settings-note">No notifications yet.</p>}
      <div className="settings-notif-list">
        {items.map((n) => (
          <div key={n.id} className={`settings-notif${n.is_read ? '' : ' unread'}`}>
            <div>{n.title ? `${n.title}: ` : ''}{n.message}</div>
            <div className="settings-notif-time">{new Date(n.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </>
  );
}

export function SecuritySection({ variant = 'employee' }) {
  const { user } = useAuth();
  const isHr = variant === 'hr';
  return (
    <>
      <div className="settings-row">
        <span className="settings-row-label">Signed in as</span>
        <span className="settings-row-value">{user?.email}</span>
      </div>
      <div className="settings-block">
        <h3>Two-factor sign-in</h3>
        <p>Password sign-in always requires a 6-digit code sent to your registered email. Treat that inbox as part of your credentials.</p>
      </div>
      <div className="settings-block">
        <h3>Password resets</h3>
        <p>
          {isHr
            ? 'There is no self-service reset. Your own password is reset by the system administrator; employee passwords are reset by you from the Employees page.'
            : 'There is no self-service password reset. If you forget your password, the HR Admin or system administrator will reset it for you.'}
        </p>
      </div>
      <div className="settings-block">
        <h3>Sessions and audit</h3>
        <p>
          Sessions expire automatically after inactivity, and every sensitive action is recorded in the audit trail
          with date, time and IP address
          {isHr ? ' — review it in the Audit Log page.' : '.'}
        </p>
      </div>
      {isHr && (
        <p className="settings-note">
          <Link to="/audit-log" style={{ fontWeight: 600, color: 'var(--primary)' }}>Open Audit Log</Link>
        </p>
      )}
    </>
  );
}

export function AppearanceSection() {
  const [theme, setLocalTheme] = useState(currentTheme());
  return (
    <div className="settings-block">
      <h3>Theme</h3>
      <p>Choose how the system looks on this device. Your choice is saved in this browser only.</p>
      <div className="acct-seg" style={{ maxWidth: 260 }}>
        <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => { setTheme('light'); setLocalTheme('light'); }}>
          ☀ Light
        </button>
        <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => { setTheme('dark'); setLocalTheme('dark'); }}>
          🌙 Dark
        </button>
      </div>
    </div>
  );
}
