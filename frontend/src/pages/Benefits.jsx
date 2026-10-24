import { useMemo, useState } from 'react';
import { useResource } from '../hooks/useResource.js';
import { api, qs } from '../api/client.js';
import { PageHeader, StatsGrid, Stat, DataTable, Field, Badge, Modal, Notice, money } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

const mutedSmall = { fontSize: 11, color: 'var(--text-muted)' };
const today = () => new Date().toISOString().slice(0, 10);
const LEAVE_TYPES = ['Vacation Leave', 'Sick Leave', 'Service Incentive Leave'];

// Share splits: enrollment rows store employee_share / employer_share percentages;
// fall back to 100 - employer_share like my_benefits.php does.
const eePct = (r) => (r.employee_share != null ? Number(r.employee_share) : 100 - Number(r.employer_share || 0));
const erPct = (r) => Number(r.employer_share || 0);

const BENEFIT_SECTIONS = [
  { id: 'enrollments', label: 'Enrollment Records' },
  { id: 'sil', label: 'Mandatory Service Incentive Leave (SIL)' },
  { id: 'requests', label: 'Leave Requests' },
];

const benefitAbbr = (label) => label.replace(/[^A-Za-z ]/g, '').split(' ').filter((w) => /[A-Za-z]/.test(w[0] || '')).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export default function Benefits() {
  // Only HR Admin reaches this page now.
  const canDecideLeave = true;
  const year = String(new Date().getFullYear());
  const { data: employees } = useResource('/api/employees');
  const { data: balances, loading: silLoading } = useResource(`/api/leave/balances${qs({ year })}`);
  const { data: leaveRequests, reload: reloadRequests } = useResource(`/api/leave/requests${qs({ year })}`);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    employee_id: '', leave_type: 'Service Incentive Leave', start_date: today(), end_date: today(), is_paid: true,
  });
  const [empFilter, setEmpFilter] = useState('');
  const { data: enrollments, loading, error, reload } = useResource(
    '/api/benefits/enrollments',
    empFilter ? { employee_id: empFilter } : undefined
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ kind: 'info', msg: '' });
  const [section, setSection] = useState('enrollments');
  const [collapsed, setCollapsed] = useState(false);

  // employee_id -> department, so the table can show the muted second line like the PHP page.
  const deptById = useMemo(() => {
    const map = {};
    (employees || []).forEach((e) => { map[String(e.id)] = e.department; });
    return map;
  }, [employees]);

  const stats = useMemo(() => {
    const list = enrollments || [];
    const active = list.filter((r) => r.status === 'Active' || r.status === 'Enrolled');
    return {
      total: list.length,
      activePlans: new Set(active.map((r) => r.plan_id)).size,
      dependents: active.reduce((sum, r) => sum + Number(r.dependents || 0), 0),
      premium: active.reduce((sum, r) => sum + Number(r.monthly_premium || 0), 0),
    };
  }, [enrollments]);

  async function cancel(id) {
    if (!window.confirm('Cancel this enrollment?')) return;
    try { await api.post(`/api/benefits/enrollments/${id}/cancel`); reload(); }
    catch (err) { setNotice({ kind: 'error', msg: err.message }); }
  }

  async function activate(id) {
    try { await api.post(`/api/benefits/enrollments/${id}/activate`); setNotice({ kind: 'success', msg: 'Application activated.' }); reload(); }
    catch (err) { setNotice({ kind: 'error', msg: err.message }); }
  }

  async function remove(id) {
    if (!window.confirm('Delete this enrollment? It will be moved to the Archive.')) return;
    try { await api.del(`/api/benefits/enrollments/${id}`); setNotice({ kind: 'success', msg: 'Enrollment moved to the Archive.' }); reload(); }
    catch (err) { setNotice({ kind: 'error', msg: err.message }); }
  }

  async function fileLeave(e) {
    e.preventDefault();
    setBusy(true);
    setNotice({ kind: 'info', msg: '' });
    try {
      await api.post('/api/leave/requests', leaveForm);
      setNotice({ kind: 'success', msg: 'Leave request filed for HR approval.' });
      setLeaveOpen(false);
      reloadRequests();
    } catch (err) {
      setNotice({ kind: 'error', msg: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function decideLeave(id, status) {
    try {
      await api.post(`/api/leave/requests/${id}/decision`, { status });
      setNotice({ kind: 'success', msg: `Leave request ${status.toLowerCase()}.` });
      reloadRequests();
    } catch (err) {
      setNotice({ kind: 'error', msg: err.message });
    }
  }

  const columns = [
    { key: 'employee_name', label: 'Employee', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.employee_name}</div>
        <div style={mutedSmall}>{deptById[String(r.employee_id)] || ''}</div>
      </div>
    ) },
    { key: 'plan_name', label: 'Plan & Provider', render: (r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.plan_name}</div>
        <div style={mutedSmall}>{r.provider}</div>
      </div>
    ) },
    { key: 'monthly_premium', label: 'Monthly Premium', align: 'right', render: (r) => (
      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{money(r.monthly_premium)}</span>
    ) },
    { key: 'employee_share', label: 'EE Share', align: 'right', render: (r) => (
      <div>
        <div style={{ color: 'var(--danger)', fontWeight: 600 }}>{money(Number(r.monthly_premium || 0) * eePct(r) / 100)}</div>
        <div style={mutedSmall}>{eePct(r)}%</div>
      </div>
    ) },
    { key: 'employer_share', label: 'ER Share', align: 'right', render: (r) => (
      <div>
        <div style={{ color: 'var(--success)', fontWeight: 600 }}>{money(Number(r.monthly_premium || 0) * erPct(r) / 100)}</div>
        <div style={mutedSmall}>{erPct(r)}%</div>
      </div>
    ) },
    { key: 'dependents', label: 'Dependents', render: (r) => <span style={{ display: 'block', textAlign: 'center', fontWeight: 600 }}>{r.dependents}</span> },
    { key: 'effective_date', label: 'Effective Date', render: (r) => shortDate(r.effective_date) },
    { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'actions', label: '', align: 'right', render: (r) => (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        {r.status === 'Pending' && (
          <button className="btn btn-sm" onClick={() => activate(r.id)}>Activate</button>
        )}
        {(r.status === 'Active' || r.status === 'Enrolled') && (
          <button className="btn ghost btn-sm" onClick={() => cancel(r.id)}>Cancel</button>
        )}
        <button className="btn ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => remove(r.id)}>Delete</button>
      </span>
    ) },
  ];

  return (
    <>
      <PageHeader
        title="Benefits Enrollment"
        subtitle="Manage employee health, insurance, and retirement plans"
      />

      <div className="info-banner">
        <span>ℹ</span>
        <span>
          Benefits are limited to <strong>Regular employees</strong>.
          Every employee is granted a mandatory <strong>Service Incentive Leave (15 days)</strong> that may only be used during <strong>April</strong>.
        </span>
      </div>

      <Notice kind={notice.kind}>{notice.msg}</Notice>

      <StatsGrid>
        <Stat label="Total Enrollments" value={stats.total} />
        <Stat label="Active Plans" value={<span style={{ color: 'var(--success)' }}>{stats.activePlans}</span>} />
        <Stat label="Total Dependents" value={stats.dependents} />
        <Stat label="Total Monthly Premium" value={<span style={{ color: 'var(--primary)' }}>{money(stats.premium)}</span>} />
      </StatsGrid>

      <div className={`settings-split ep-split${collapsed ? ' ep-collapsed' : ''}`}>
        <div className="settings-modal-small">
          <div className="settings-modal-head ep-head">
            <span className="ep-head-title">Sections</span>
            <button
              type="button"
              className="ep-collapse-btn"
              title={collapsed ? 'Expand navigation' : 'Shrink to sidebar'}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? '»' : '«'}
            </button>
          </div>
          {BENEFIT_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.label}
              className={`settings-nav-item${s.id === section ? ' active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <span className="ep-nav-abbr">{benefitAbbr(s.label)}</span>
              <span className="ep-nav-label">{s.label}</span>
            </button>
          ))}
        </div>

        <div className="settings-modal-large">
          <div className="settings-modal-head ep-head">
            <span className="ep-head-title">{BENEFIT_SECTIONS.find((s) => s.id === section).label}</span>
            <span className="ep-modal-right">
              {section === 'sil' && <button className="btn btn-secondary btn-sm" onClick={() => setLeaveOpen(true)}>File Leave Request</button>}
            </span>
          </div>
          <div className="settings-modal-body">
            {section === 'enrollments' && (
              <>
                <div style={{ marginBottom: 12, maxWidth: 320 }}>
                  <select className="form-control" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
                    <option value="">All Employees</option>
                    {(employees || []).map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.code})</option>
                    ))}
                  </select>
                </div>
                <DataTable
                  loading={loading} error={error}
                  columns={columns}
                  rows={enrollments}
                  empty="No enrollments yet."
                />
              </>
            )}

            {section === 'sil' && (
              <DataTable
                loading={silLoading}
                columns={[
                  { key: 'employee', label: 'Employee', render: (r) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</div>
                      <div style={mutedSmall}>{r.department}</div>
                    </div>
                  ) },
                  { key: 'accrued', label: 'Accrued (days)', align: 'right' },
                  { key: 'used', label: 'Used', align: 'right' },
                  { key: 'balance', label: 'Balance', align: 'right', render: (r) => <span style={{ fontWeight: 700 }}>{r.balance} d</span> },
                  { key: 'window', label: 'Use window', render: () => <span className="badge badge-info">April only</span> },
                ]}
                rows={(balances || []).filter((b) => b.leave_type === 'Service Incentive Leave')}
                empty="No SIL balances for this year yet."
              />
            )}

            {section === 'requests' && (
              <DataTable
                columns={[
                  { key: 'employee', label: 'Employee', render: (r) => <span style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</span> },
                  { key: 'leave_type', label: 'Type' },
                  { key: 'range', label: 'Start → End', render: (r) => `${r.start_date} → ${r.end_date}` },
                  { key: 'days', label: 'Days', align: 'right' },
                  { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
                  { key: 'actions', label: '', align: 'right', render: (r) => r.status === 'Pending' && canDecideLeave && (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-success btn-sm" onClick={() => decideLeave(r.id, 'Approved')}>Approve</button>
                      <button className="btn btn-danger btn-sm" onClick={() => decideLeave(r.id, 'Rejected')}>Reject</button>
                    </span>
                  ) },
                ]}
                rows={leaveRequests || []}
                empty="No leave requests filed this year."
              />
            )}
          </div>
        </div>
      </div>

      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="File Leave Request">
        <form onSubmit={fileLeave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Notice kind="info">Service Incentive Leave may only be scheduled within April (mandatory company policy).</Notice>
          <Field label="Employee">
            <select className="form-control" value={leaveForm.employee_id} onChange={(e) => setLeaveForm((f) => ({ ...f, employee_id: e.target.value }))} required>
              <option value="">Select Employee</option>
              {(employees || []).map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.code})</option>
              ))}
            </select>
          </Field>
          <Field label="Leave type">
            <select className="form-control" value={leaveForm.leave_type} onChange={(e) => setLeaveForm((f) => ({ ...f, leave_type: e.target.value }))} required>
              {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div className="form-grid-2">
            <Field label="Start date">
              <input className="form-control" type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm((f) => ({ ...f, start_date: e.target.value }))} required />
            </Field>
            <Field label="End date">
              <input className="form-control" type="date" value={leaveForm.end_date} onChange={(e) => setLeaveForm((f) => ({ ...f, end_date: e.target.value }))} required />
            </Field>
          </div>
          <Field label="Pay status">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!leaveForm.is_paid} onChange={(e) => setLeaveForm((f) => ({ ...f, is_paid: e.target.checked }))} />
              Paid leave
            </label>
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setLeaveOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Filing…' : 'File Request'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
