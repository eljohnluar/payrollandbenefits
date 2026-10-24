import { useEffect, useState } from 'react';
import { useResource } from '../hooks/useResource.js';
import { api } from '../api/client.js';
import { PageHeader, Field, Modal } from '../components/ui.jsx';
import { NotificationsSection, SecuritySection, AppearanceSection } from '../components/SettingsSections.jsx';
import pkg from '../../package.json';

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'statutory', label: 'Statutory Contributions' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
];

export default function Settings() {
  const { data, loading, error, reload } = useResource('/api/settings');
  const [form, setForm] = useState({});
  const [section, setSection] = useState('general');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    if (data && typeof data === 'object') setForm({ ...data });
  }, [data]);

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openSave() {
    setPw('');
    setPwError('');
    setNotice('');
    setPwOpen(true);
  }

  async function confirmSave(e) {
    e.preventDefault();
    setSaving(true);
    setPwError('');
    try {
      const res = await api.put('/api/settings', { ...form, password: pw });
      setForm({ ...res });
      setPwOpen(false);
      setNotice('Settings saved.');
    } catch (err) {
      setPwError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setNotice('');
    reload();
  }

  const hint = { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 };
  const input = (key, type, props = {}) => (
    <input
      className="form-control"
      type={type}
      value={form[key] ?? ''}
      onChange={(e) => set(key, e.target.value)}
      {...props}
    />
  );

  const saveBar = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 18 }}>
      <button className="btn btn-primary" onClick={openSave} disabled={saving || loading}>
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
      <button className="btn btn-secondary" onClick={reset} disabled={saving || loading}>Reset</button>
      {notice && <span style={{ fontSize: 12.5, color: 'var(--success)', fontWeight: 600 }}>{notice}</span>}
    </div>
  );

  if (error) return <div className="alert error">{error}</div>;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Company configuration, notifications and preferences"
      />

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
          <div className="settings-modal-head">{SECTIONS.find((s) => s.id === section).label}</div>
          <div className="settings-modal-body">
            {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

            {section === 'general' && !loading && (
              <>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <Field label="Company Name">{input('company_name', 'text', { maxLength: 120, required: true })}</Field>
                  <div style={hint}>Shown on payslips, reports and the portal header.</div>
                </div>
                <div className="form-grid-2" style={{ marginBottom: 14 }}>
                  <Field label="Currency Symbol">{input('currency_symbol', 'text', { maxLength: 5, required: true })}</Field>
                  <Field label="Currency Decimals">{input('currency_decimals', 'number', { min: 0, max: 2, step: 1, required: true })}</Field>
                </div>
                <div className="form-grid-2">
                  <div>
                    <Field label="Work Days per Month">{input('work_days_per_month', 'number', { min: 1, max: 31, step: 1, required: true })}</Field>
                    <div style={hint}>Used to prorate basic pay and unpaid leave deductions.</div>
                  </div>
                  <div>
                    <Field label="Work Hours per Day">{input('work_hours_per_day', 'number', { min: 1, max: 24, step: 1, required: true })}</Field>
                    <div style={hint}>Used to compute the hourly rate for overtime, night differential, and holiday pay.</div>
                  </div>
                </div>
                {saveBar}
              </>
            )}

            {section === 'statutory' && !loading && (
              <>
                <div className="form-grid-2">
                  <div>
                    <Field label="PhilHealth Rate (%)">{input('philhealth_rate', 'number', { min: 0, max: 10, step: 0.1, required: true })}</Field>
                    <div style={hint}>Employee and employer each pay this percentage of the monthly salary (capped at ₱100,000 salary).</div>
                  </div>
                  <div>
                    <Field label="SSS Employee Share (top bracket)">{input('sss_ee_fixed', 'number', { min: 0, step: 1, required: true })}</Field>
                    <div style={hint}>Lower salary brackets pay 25%, 50%, and 75% of this amount.</div>
                  </div>
                  <Field label="SSS Employer Rate (%)">{input('sss_er_rate', 'number', { min: 0, max: 20, step: 0.1, required: true })}</Field>
                  <div>
                    <Field label="SSS Employer Cap">{input('sss_er_cap', 'number', { min: 0, step: 1, required: true })}</Field>
                    <div style={hint}>Maximum employer share for salaries of ₱20,000 and above. Lower brackets pay 25%, 50%, and 75% of this cap.</div>
                  </div>
                  <Field label="Pag-IBIG Employee (salary < 5,000)">{input('pagibig_ee_min', 'number', { min: 0, step: 1, required: true })}</Field>
                  <Field label="Pag-IBIG Employee (salary ≥ 5,000)">{input('pagibig_ee_max', 'number', { min: 0, step: 1, required: true })}</Field>
                  <Field label="Pag-IBIG Employer Share">{input('pagibig_er', 'number', { min: 0, step: 1, required: true })}</Field>
                  <div>
                    <Field label="Minimum Monthly Basic Wage (DOLE)">{input('minimum_wage_monthly', 'number', { min: 0, step: 1, required: true })}</Field>
                    <div style={hint}>Compensation records below this amount are blocked from saving. Set it to the DOLE minimum wage for the applicable region.</div>
                  </div>
                </div>
                {saveBar}
              </>
            )}

            {section === 'notifications' && <NotificationsSection />}
            {section === 'security' && <SecuritySection variant="hr" />}
            {section === 'appearance' && <AppearanceSection />}

            {section === 'about' && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                Changes take effect immediately and apply to the next payroll recompute — statutory shares,
                proration factors, currency display, and the company name in the header.
                <div style={{ height: 14 }} />
                {[
                  ['Application:', 'Payroll Management System'],
                  ['Version:', pkg.version],
                  ['Interface:', 'Web · desktop & mobile responsive'],
                  ['Language:', navigator.language || 'English'],
                  ['Time zone:', Intl.DateTimeFormat().resolvedOptions().timeZone],
                ].map(([label, val]) => (
                  <div key={label}>
                    <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{label}</span> {val}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Confirm changes">
        <form onSubmit={confirmSave}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
            Settings apply to every payslip immediately. Your login password is required to confirm.
          </p>
          {pwError && <div className="alert error">{pwError}</div>}
          <div className="field">
            <label htmlFor="settings-pw">Password</label>
            <input
              id="settings-pw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setPwOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !pw}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
