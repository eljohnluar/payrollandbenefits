import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Card, PageHeader } from '../components/ui.jsx';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export default function Profile() {
  const { user } = useAuth();

  return (
    <>
      <PageHeader title="Profile" subtitle="Your administrator account for the Payroll Management System." />

      <div className="profile-hero">
        <div className="profile-photo-wrap">
          <div className="profile-photo profile-photo-initials" aria-hidden="true">{initials(user?.name)}</div>
        </div>
        <div className="profile-hero-info">
          <h1 className="profile-hero-name">{user?.name || 'HR Administrator'}</h1>
          <div className="profile-hero-role">{user?.email}</div>
          <div className="profile-hero-badges">
            <span className="dash-badge positive">HR Admin</span>
            <span className="dash-badge neutral">Full workspace access</span>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Account" body>
          <div className="profile-rows">
            <div className="profile-row"><span>Name</span><strong>{user?.name}</strong></div>
            <div className="profile-row"><span>Email</span><strong>{user?.email}</strong></div>
            <div className="profile-row"><span>Role</span><strong>HR Admin</strong></div>
            <div className="profile-row"><span>Account ID</span><strong>#{user?.id}</strong></div>
          </div>
          <p className="settings-note">
            To change your name or email, ask the system administrator — or open{' '}
            <Link to="/settings" style={{ fontWeight: 600, color: 'var(--primary)' }}>Settings</Link>{' '}
            for company-wide options.
          </p>
        </Card>
        <Card title="Security" body>
          <div className="settings-block">
            <h3>Two-factor sign-in</h3>
            <p>Password sign-in always requires a 6-digit code sent to your registered email.</p>
          </div>
          <div className="settings-block">
            <h3>Password resets</h3>
            <p>There is no self-service reset. Your own password is reset by the system administrator; employee passwords are reset by you from the Employees page.</p>
          </div>
          <div className="settings-block">
            <h3>Audit trail</h3>
            <p>Every action you take in the workspace is logged with date, time and IP address in the{' '}
              <Link to="/audit-log" style={{ fontWeight: 600, color: 'var(--primary)' }}>Audit Log</Link>.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
