import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { Loading, PageHeader } from '../../components/ui.jsx';
import { NotificationsSection, SecuritySection, AppearanceSection } from '../../components/SettingsSections.jsx';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'appearance', label: 'Appearance' },
];

function Row({ label, value }) {
  return (
    <div className="settings-row">
      <span className="settings-row-label">{label}</span>
      <span className="settings-row-value">{value || '—'}</span>
    </div>
  );
}

function ProfileSection() {
  const { data: profile, loading, error } = useResource('/api/me/profile');
  if (loading) return <Loading text="Loading profile…" />;
  if (error) return <p className="settings-note">{error}</p>;
  const name = profile ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ') : '';
  return (
    <>
      <Row label="Full name" value={name} />
      <Row label="Position" value={profile?.position} />
      <Row label="Department" value={profile?.department} />
      <Row label="Employment type" value={profile?.employment_type} />
      <Row label="Hire date" value={profile?.hire_date} />
      <Row label="Work email" value={profile?.email} />
      <Row label="Mobile" value={profile?.mobile} />
      <p className="settings-note">
        Your employee record is maintained by HR. To correct your name, contact details or bank /
        eWallet info, please ask your HR Admin — changes are reflected here after they update it.
      </p>
    </>
  );
}

export default function EmployeeSettings() {
  const [section, setSection] = useState('profile');
  const active = SECTIONS.find((s) => s.id === section);

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account preferences for this portal." />
      <div className="settings-split">
        <div className="settings-modal-small">
          <div className="settings-modal-head">Settings</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`settings-nav-item${s.id === section ? ' active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="settings-modal-large">
          <div className="settings-modal-head">{active.label}</div>
          <div className="settings-modal-body">
            {section === 'profile' && <ProfileSection />}
            {section === 'notifications' && <NotificationsSection />}
            {section === 'security' && <SecuritySection />}
            {section === 'appearance' && <AppearanceSection />}
          </div>
        </div>
      </div>
    </>
  );
}
