import { useEffect, useMemo, useState } from 'react';
import { useResource } from '../hooks/useResource.js';
import { api, qs } from '../api/client.js';
import { PageHeader, StatsGrid, Stat, Card, DataTable, Badge, IntegrationSourceTag, IntegrationSourceBanner } from '../components/ui.jsx';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

/** Cut-off periods are 1st–15th and 16th–end of month. */
function cutoffWindow(month, half) {
  const [y, m] = String(month).split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return half === 'first'
    ? { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-15` }
    : { start: `${y}-${pad(m)}-16`, end: `${y}-${pad(m)}-${pad(lastDay)}` };
}

const periodLabel = (month, half) => {
  const [y, m] = String(month).split('-').map(Number);
  const name = m ? MONTH_LABELS[m - 1] : month;
  return `${name} ${y} — cut-off ${half === 'first' ? '1st–15th' : '16th–month end'}`;
};

function Pill({ cls, children }) {
  return <span className={`badge ${cls}`}>{children}</span>;
}

const hrs = (v) => (v == null || v === '' ? '—' : `${Number(v).toFixed(1)} h`);

/* ── Tab 1: Cut-off Records (HR enters P/H/A/OT totals per period) ── */
function CutoffTab({ month, half }) {
  const { start, end } = useMemo(() => cutoffWindow(month, half), [month, half]);
  const { data, loading, error, reload } = useResource(`/api/attendance/cutoffs${qs({ cutoff_start: start, cutoff_end: end })}`);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState('');
  const [feedback, setFeedback] = useState('');

  const rows = data || [];
  useEffect(() => setDrafts({}), [start, end]);

  const draftFor = (r) => drafts[r.employee_id] || {
    present_days: r.present_days ?? 0,
    half_days: r.half_days ?? 0,
    absent_days: r.absent_days ?? 0,
    ot_days: r.ot_days ?? 0,
    ot_hours: r.ot_hours ?? 0,
    remarks: r.remarks ?? '',
  };

  const patch = (r, field, value) => setDrafts((d) => ({ ...d, [r.employee_id]: { ...draftFor(r), [field]: value } }));

  async function save(r) {
    setSaving(r.employee_id);
    setFeedback('');
    try {
      await api.post('/api/attendance/cutoffs', {
        employee_id: r.employee_id,
        cutoff_start: start,
        cutoff_end: end,
        ...draftFor(r),
      });
      reload();
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setSaving('');
    }
  }

  const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
  const totalWorked = rows.reduce((a, r) => { const d = draftFor(r); return a + num(d.present_days) + num(d.ot_days) + num(d.half_days) * 0.5; }, 0);
  const totalAbsent = rows.reduce((a, r) => a + num(draftFor(r).absent_days), 0);
  const totalOt = rows.reduce((a, r) => a + num(draftFor(r).ot_hours), 0);

  const cell = (r, field, { min = 0, step = 1 } = {}) => (
    <input
      type="number"
      className="form-control cutoff-input"
      min={min}
      step={step}
      value={draftFor(r)[field]}
      onChange={(e) => patch(r, field, e.target.value)}
    />
  );

  return (
    <>
      <StatsGrid>
        <Stat label="Employees" value={rows.length} />
        <Stat label="Total Days Worked" value={<span style={{ color: 'var(--success)' }}>{totalWorked}</span>} sub="Present + OT + ½ × Half-days" kind="positive" />
        <Stat label="Total Absences" value={<span style={{ color: 'var(--danger)' }}>{totalAbsent}</span>} kind="negative" />
        <Stat label="Total OT Hours" value={<span style={{ color: 'var(--primary)' }}>{totalOt.toFixed(1)} h</span>} kind="primary" />
      </StatsGrid>

      {feedback && <div className="alert error">{feedback}</div>}

      <Card body title={`Cut-off Attendance — ${periodLabel(month, half)}`}>
        <DataTable
          loading={loading} error={error}
          columns={[
            { key: 'employee', label: 'Employee', render: (r) => (
              <div>
                <div style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.department} · {r.position}</div>
              </div>
            ) },
            { key: 'status', label: 'Recorded', render: (r) => (r.recorded ? <Pill cls="badge-success">Recorded</Pill> : <Pill cls="badge-muted">Not recorded</Pill>) },
            { key: 'present_days', label: 'P (days)', render: (r) => cell(r, 'present_days') },
            { key: 'half_days', label: 'H (days)', render: (r) => cell(r, 'half_days') },
            { key: 'absent_days', label: 'A (days)', render: (r) => cell(r, 'absent_days') },
            { key: 'ot_days', label: 'OT (days)', render: (r) => cell(r, 'ot_days') },
            { key: 'ot_hours', label: 'OT Hours', render: (r) => cell(r, 'ot_hours', { step: 0.5 }) },
            { key: 'days_worked', label: 'Days Worked', align: 'right', render: (r) => { const d = draftFor(r); return <strong>{num(d.present_days) + num(d.ot_days) + num(d.half_days) * 0.5}</strong>; } },
            { key: 'save', label: '', render: (r) => (
              <button className="btn small" onClick={() => save(r)} disabled={saving === r.employee_id}>
                {saving === r.employee_id ? 'Saving…' : 'Save'}
              </button>
            ) },
          ]}
          rows={rows} empty="No active employees to record for this cut-off."
        />
      </Card>
    </>
  );
}

/* ── Tab 2: Adjustment requests from off-site / field workers ── */
function AdjustmentsTab() {
  const { data, loading, error, reload } = useResource('/api/attendance/adjustments');
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const rows = data || [];
  const pending = rows.filter((r) => r.status === 'Pending').length;

  async function decide(r, status) {
    setBusy(`${r.id}-${status}`);
    setFeedback('');
    try {
      await api.post(`/api/attendance/adjustments/${r.id}/decision`, { status, notes: '' });
      reload();
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <StatsGrid>
        <Stat label="Requests" value={rows.length} />
        <Stat label="Awaiting Review" value={<span style={{ color: 'var(--warning, #d97706)' }}>{pending}</span>} kind="neutral" />
        <Stat label="Approved" value={<span style={{ color: 'var(--success)' }}>{rows.filter((r) => r.status === 'Approved').length}</span>} kind="positive" />
        <Stat label="Rejected" value={<span style={{ color: 'var(--danger)' }}>{rows.filter((r) => r.status === 'Rejected').length}</span>} kind="negative" />
      </StatsGrid>

      {feedback && <div className="alert error">{feedback}</div>}

      <Card body title="Attendance Adjustments">
        <DataTable
          loading={loading} error={error}
          columns={[
            { key: 'employee', label: 'Employee', render: (r) => (
              <div>
                <div style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.department} · filed by {r.requested_by}</div>
              </div>
            ) },
            { key: 'cutoff', label: 'Cut-off', render: (r) => `${r.cutoff_start} → ${r.cutoff_end}` },
            { key: 'details', label: 'Details', render: (r) => (
              <div style={{ maxWidth: 320 }}>
                <div>{r.details}</div>
                {r.location && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Where: {r.location}</div>}
              </div>
            ) },
            { key: 'adjust', label: 'Requested', render: (r) => (
              <div style={{ fontSize: 12 }}>
                {Number(r.add_present_days) > 0 && <Pill cls="badge-success">+{r.add_present_days} P</Pill>}{' '}
                {Number(r.add_half_days) > 0 && <Pill cls="badge-info">+{r.add_half_days} H</Pill>}{' '}
                {Number(r.remove_absent_days) > 0 && <Pill cls="badge-danger">−{r.remove_absent_days} A</Pill>}{' '}
                {Number(r.add_ot_hours) > 0 && <Pill cls="badge-primary">+{hrs(r.add_ot_hours)}</Pill>}{' '}
                {!Number(r.add_present_days) && !Number(r.add_half_days) && !Number(r.remove_absent_days) && !Number(r.add_ot_hours) && <span style={{ color: 'var(--text-muted)' }}>Details only</span>}
              </div>
            ) },
            { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
            { key: 'actions', label: '', render: (r) => (r.status === 'Pending' ? (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="btn small" onClick={() => decide(r, 'Approved')} disabled={busy.startsWith(String(r.id))}>Approve</button>
                <button className="btn ghost small" onClick={() => decide(r, 'Rejected')} disabled={busy.startsWith(String(r.id))}>Reject</button>
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString() : ''}</span>
            )) },
          ]}
          rows={rows} empty="No adjustment requests yet. Off-site workers can file them from their portal."
        />
      </Card>
    </>
  );
}

/* ── Tab 3: Leave Balance ── */
function LeaveTab({ year }) {
  const { data: balances, loading: bLoading, error: bError } = useResource(`/api/leave/balances${qs({ year })}`);
  const { data: requests, loading: rLoading, error: rError } = useResource(`/api/leave/requests${qs({ year })}`);
  const [sub, setSub] = useState('balances');

  const balRows = balances || [];
  const reqRows = requests || [];
  const byType = {};
  for (const b of balRows) byType[b.leave_type] = (byType[b.leave_type] || 0) + (Number(b.balance) || 0);
  const types = Object.keys(byType).sort();

  return (
    <>
      <StatsGrid>
        {types.map((t) => (
          <Stat key={t} label={`${t} Available`} value={<span style={{ color: 'var(--primary)' }}>{byType[t]}</span>} sub={`${byType[t] > 0 ? 'days available' : 'fully used'}`} kind={byType[t] > 0 ? 'positive' : 'negative'} />
        ))}
        <Stat label="Leave Requests" value={reqRows.length} kind="neutral" />
      </StatsGrid>

      <div className="filters-bar">
        <span className="seg" style={{ display: 'inline-flex', gap: 6 }}>
          <button className={`btn small${sub === 'balances' ? '' : ' ghost'}`} onClick={() => setSub('balances')}>Leave Balances</button>
          <button className={`btn small${sub === 'requests' ? '' : ' ghost'}`} onClick={() => setSub('requests')}>Leave Requests</button>
        </span>
      </div>

      {sub === 'balances' ? (
        <Card title={`Leave Balances (${year})`} body>
          <DataTable
            loading={bLoading} error={bError}
            columns={[
              { key: 'employee', label: 'Employee', render: (r) => <span style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</span> },
              { key: 'department', label: 'Department' },
              { key: 'leave_type', label: 'Leave Type' },
              { key: 'accrued', label: 'Accrued', align: 'right' },
              { key: 'used', label: 'Used', align: 'right', render: (r) => <span style={{ color: 'var(--warning, #d97706)' }}>{r.used}</span> },
              { key: 'balance', label: 'Balance', align: 'right', render: (r) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700 }}>{r.balance} d</span>
                  <Pill cls={Number(r.balance) > 0 ? 'badge-success' : 'badge-danger'}>{Number(r.balance) > 0 ? 'Available' : 'Depleted'}</Pill>
                </span>
              ) },
            ]}
            rows={balRows} empty="No leave balance records found."
          />
        </Card>
      ) : (
        <Card title={`Leave Requests (${year})`} body>
          <DataTable
            loading={rLoading} error={rError}
            columns={[
              { key: 'employee', label: 'Employee', render: (r) => <span style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</span> },
              { key: 'leave_type', label: 'Type' },
              { key: 'range', label: 'Start → End', render: (r) => `${r.start_date} → ${r.end_date}` },
              { key: 'days', label: 'Days', align: 'right' },
              { key: 'is_paid', label: 'Paid', render: (r) => (Number(r.is_paid) || r.is_paid === true ? <Pill cls="badge-success">Yes</Pill> : <Pill cls="badge-muted">No</Pill>) },
              { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
            ]}
            rows={reqRows} empty="No leave requests for this year."
          />
        </Card>
      )}
    </>
  );
}

/* ── Page ── */
const TABS = [
  { key: 'cutoff', label: 'Cut-off Records' },
  { key: 'adjustments', label: 'Adjustments' },
  { key: 'leave', label: 'Leave Balance' },
];

export default function Attendance() {
  const [tab, setTab] = useState('cutoff');
  const [month, setMonth] = useState('2026-09'); // demo default: seeded attendance month
  const [half, setHalf] = useState('second');
  const [year, setYear] = useState(String(new Date().getFullYear()));

  return (
    <>
      <PageHeader title="Attendance" subtitle="Recorded per cut-off period (1st–15th / 16th–month end) — the basis for payroll computation." />

      <IntegrationSourceBanner>
        <IntegrationSourceTag systems={['HR2']} /> Daily attendance logs and approved leave requests are pushed by <strong>HR2 (Time & Attendance)</strong>. This data feeds directly into payroll computations — days worked, overtime pay, tardiness deductions, and unpaid leave.
      </IntegrationSourceBanner>

      <div className="info-banner">
        <span>ℹ</span>
        <span>
          Attendance is no longer logged day by day. HR enters the P / H / A / OT totals for each cut-off period;
          total days worked, absences and OT hours then feed payroll. Absences stay unpaid and lateness is
          deducted at the hourly rate. Off-site drivers and field staff can file <strong>adjustments</strong>, which
          update the cut-off record once HR approves them.
        </span>
      </div>

      <div className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'active' : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cutoff' && (
        <>
          <div className="filters-bar">
            <input type="month" className="form-control" value={month} onChange={(e) => setMonth(e.target.value)} />
            <span className="seg" style={{ display: 'inline-flex', gap: 6 }}>
              <button className={`btn small${half === 'first' ? '' : ' ghost'}`} onClick={() => setHalf('first')}>1st – 15th</button>
              <button className={`btn small${half === 'second' ? '' : ' ghost'}`} onClick={() => setHalf('second')}>16th – month end</button>
            </span>
          </div>
          <CutoffTab month={month} half={half} />
        </>
      )}

      {tab === 'adjustments' && <AdjustmentsTab />}

      {tab === 'leave' && (
        <>
          <div className="filters-bar">
            <select className="form-control" value={year} onChange={(e) => setYear(e.target.value)}>
              {['2026', '2025', '2024'].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <LeaveTab year={year} />
        </>
      )}
    </>
  );
}
