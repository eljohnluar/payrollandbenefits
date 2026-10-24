import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResource } from '../hooks/useResource.js';
import { api } from '../api/client.js';
import { PageHeader, Card, DataTable, Badge, Notice, Modal, Field, money, statusBadge, IntegrationSourceTag, IntegrationSourceBanner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

const ALLOWANCE_TYPES = ['Rice', 'Transport', 'Meal', 'Communication', 'Housing', 'Clothing', 'Position Allowance', 'Internet Allowance', 'Medical Allowance'];
const ALLOWANCE_FREQS = ['Monthly', 'Quarterly', 'Annual', 'One-Time'];
const INC_TYPES = ['Performance', 'Sales', 'Attendance', 'Productivity', 'Referral', 'Retention', 'Spot', 'Team'];
const INC_MANUAL_TYPES = ['Sales', 'Productivity', 'Referral', 'Spot', 'Team'];
const INC_FREQS = ['Monthly', 'Quarterly', 'Annual', 'One-Time'];
const LOAN_TYPES = ['SSS Loan', 'Pag-IBIG Loan', 'Company Loan', 'Salary Advance', 'Car Loan', 'Housing Loan', 'Emergency Loan', 'Equipment Deduction', 'Other Deduction'];
const LOAN_STATUSES = ['Active', 'Paid Off', 'Cancelled'];

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  return { start: `${m}-01`, end: `${m}-${String(last).padStart(2, '0')}` };
};
const num = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));

const EMPTY_ALLOWANCE = { type: 'Rice', amount: '', frequency: 'Monthly', description: '', start_date: '', end_date: '', is_active: true };
const EMPTY_LOAN = { loan_type: 'SSS Loan', principal: '', monthly_deduction: '', balance: '', approved_at: '', status: 'Active' };
const EMPTY_INCENTIVE = { name: '', type: 'Performance', rate_type: 'Fixed', rate: '', frequency: 'Monthly', target: '', eligibility: '', effective_date: '', end_date: '', is_active: true };

const COMP_SECTIONS = [
  { id: 'structure', label: 'Salary Structure' },
  { id: 'allowances', label: 'Allowances' },
  { id: 'history', label: 'Salary History' },
  { id: 'loans', label: 'Loans & Deductions' },
  { id: 'incentives', label: 'Incentives' },
  { id: 'earnings', label: 'Earned Incentives' },
];

const compAbbr = (label) => label.split(' ').filter((w) => /[A-Za-z]/.test(w[0] || '')).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export default function Compensation() {
  const [params, setParams] = useSearchParams();
  const id = params.get('employee') || '';

  const { data: employees, reload: reloadEmployees } = useResource('/api/employees');
  const { data: settings } = useResource('/api/settings');

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [notice, setNotice] = useState({ kind: 'info', msg: '' });
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('structure');
  const [collapsed, setCollapsed] = useState(false);

  // Salary modal (existing POST /api/employees/{id}/salary flow, now modal-driven).
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [salaryForm, setSalaryForm] = useState({ basic_salary: '', effective_date: '', reason: '' });

  // Allowance modal — null | { id? } for add / edit.
  const [allowanceModal, setAllowanceModal] = useState(null);
  const [allowanceForm, setAllowanceForm] = useState(EMPTY_ALLOWANCE);

  // Loan modal — null | { id? } for add / edit.
  const [loanModal, setLoanModal] = useState(null);
  const [loanForm, setLoanForm] = useState(EMPTY_LOAN);

  // Incentives: structures + earnings for the selected employee.
  const [inc, setInc] = useState({ structures: [], earnings: [] });
  const [incModal, setIncModal] = useState(null);
  const [incForm, setIncForm] = useState(EMPTY_INCENTIVE);
  const [metricOpen, setMetricOpen] = useState(false);
  const [metricForm, setMetricForm] = useState({ incentive_structure_id: '', period: thisMonth(), value: '', note: '' });
  const [computeMonth, setComputeMonth] = useState(thisMonth());

  const loadIncentives = useCallback(async () => {
    if (!id) { setInc({ structures: [], earnings: [] }); return; }
    try {
      const res = await api.get(`/api/incentives?employee_id=${encodeURIComponent(id)}`);
      setInc({ structures: res.structures || [], earnings: res.earnings || [] });
    } catch { /* silent — section shows empty state */ }
  }, [id]);

  useEffect(() => { loadIncentives(); }, [loadIncentives]);

  const load = useCallback(async () => {
    if (!id) { setProfile(null); return; }
    setProfileLoading(true);
    try {
      setProfile(await api.get(`/api/employees/${id}/profile`));
    } catch (e) {
      setNotice({ kind: 'error', msg: e.message });
    } finally {
      setProfileLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function selectEmployee(nextId) {
    setSearch('');
    if (nextId) setParams({ employee: nextId });
    else setParams({});
  }

  const setSalary = (k) => (e) => setSalaryForm((f) => ({ ...f, [k]: e.target.value }));
  const minWage = Number(settings?.minimum_wage_monthly ?? 0) || 13420;
  const belowMinWage = salaryForm.basic_salary !== '' && Number(salaryForm.basic_salary) < minWage;
  const setAllowance = (k) => (e) => setAllowanceForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setLoan = (k) => (e) => setLoanForm((f) => ({ ...f, [k]: e.target.value }));

  function openSalaryModal() {
    if (!profile) return;
    setSalaryForm({ basic_salary: profile.basic_salary ?? '', effective_date: today(), reason: '' });
    setSalaryOpen(true);
  }

  async function saveSalary(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/employees/${id}/salary`, {
        basic_salary: num(salaryForm.basic_salary),
        effective_date: salaryForm.effective_date,
        reason: salaryForm.reason,
      });
      setNotice({ kind: 'success', msg: 'Basic salary updated.' });
      setSalaryOpen(false);
      load();
      reloadEmployees();
    } catch (err) {
      setNotice({ kind: 'error', msg: err.message });
    } finally {
      setBusy(false);
    }
  }

  function openAddAllowance() {
    setAllowanceForm({ ...EMPTY_ALLOWANCE, start_date: today() });
    setAllowanceModal({});
  }
  function openEditAllowance(a) {
    setAllowanceForm({
      type: a.type || '', amount: a.amount ?? '', frequency: a.frequency || 'Monthly',
      description: a.description || '', start_date: a.start_date || '', end_date: a.end_date || '',
      is_active: !!a.is_active,
    });
    setAllowanceModal({ id: a.id });
  }
  async function saveAllowance(e) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      type: allowanceForm.type, amount: num(allowanceForm.amount), frequency: allowanceForm.frequency,
      description: allowanceForm.description, start_date: allowanceForm.start_date, end_date: allowanceForm.end_date,
    };
    try {
      if (allowanceModal?.id) await api.patch(`/api/allowances/${allowanceModal.id}`, { ...payload, is_active: allowanceForm.is_active });
      else await api.post(`/api/employees/${id}/allowances`, payload);
      setNotice({ kind: 'success', msg: allowanceModal?.id ? 'Allowance updated.' : 'Allowance added.' });
      setAllowanceModal(null);
      load();
    } catch (err) {
      setNotice({ kind: 'error', msg: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function toggleAllowance(a) {
    try {
      await api.patch(`/api/allowances/${a.id}`, { is_active: !a.is_active });
      setNotice({ kind: 'success', msg: `"${a.type}" marked ${a.is_active ? 'inactive' : 'active'}.` });
      load();
    } catch (err) {
      setNotice({ kind: 'error', msg: err.message });
    }
  }

  function openAddLoan() {
    setLoanForm({ ...EMPTY_LOAN, approved_at: today() });
    setLoanModal({});
  }
  function openEditLoan(l) {
    setLoanForm({
      loan_type: l.loan_type || '', principal: l.principal ?? '', monthly_deduction: l.monthly_deduction ?? '',
      balance: l.balance ?? '', approved_at: (l.approved_at || '').slice(0, 10), status: l.status || 'Active',
    });
    setLoanModal({ id: l.id });
  }
  async function saveLoan(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (loanModal?.id) {
        await api.put(`/api/loans/${loanModal.id}`, {
          loan_type: loanForm.loan_type, principal: num(loanForm.principal), monthly_deduction: num(loanForm.monthly_deduction),
          balance: num(loanForm.balance), status: loanForm.status, approved_at: loanForm.approved_at,
        });
        setNotice({ kind: 'success', msg: 'Loan updated.' });
      } else {
        await api.post(`/api/employees/${id}/loans`, {
          loan_type: loanForm.loan_type, principal: num(loanForm.principal), monthly_deduction: num(loanForm.monthly_deduction),
          balance: num(loanForm.balance), approved_at: loanForm.approved_at,
        });
        setNotice({ kind: 'success', msg: 'Loan added.' });
      }
      setLoanModal(null);
      load();
    } catch (err) {
      setNotice({ kind: 'error', msg: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function del(path, ok) {
    if (!window.confirm('Remove this item?')) return;
    try { await api.del(path); setNotice({ kind: 'success', msg: ok }); load(); }
    catch (err) { setNotice({ kind: 'error', msg: err.message }); }
  }

  const setIncField = (k) => (e) => setIncForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setMetric = (k) => (e) => setMetricForm((f) => ({ ...f, [k]: e.target.value }));

  function openAddIncentive() {
    setIncForm({ ...EMPTY_INCENTIVE, effective_date: today() });
    setIncModal({});
  }
  function openEditIncentive(s) {
    setIncForm({
      name: s.name || '', type: s.type || 'Performance', rate_type: s.rate_type || 'Fixed', rate: s.rate ?? '',
      frequency: s.frequency || 'Monthly', target: s.target ?? '', eligibility: s.eligibility || '',
      effective_date: (s.effective_date || '').slice(0, 10), end_date: (s.end_date || '').slice(0, 10),
      is_active: !!s.is_active,
    });
    setIncModal({ id: s.id });
  }
  async function saveIncentive(e) {
    e.preventDefault();
    setBusy(true);
    const payload = { ...incForm, rate: num(incForm.rate), target: incForm.target === '' ? null : num(incForm.target) };
    try {
      if (incModal?.id) await api.put(`/api/incentives/${incModal.id}`, payload);
      else await api.post('/api/incentives', { ...payload, employee_id: id });
      setNotice({ kind: 'success', msg: incModal?.id ? 'Incentive updated.' : 'Incentive created.' });
      setIncModal(null);
      loadIncentives();
    } catch (err) {
      setNotice({ kind: 'error', msg: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function toggleIncentive(s) {
    try {
      await api.put(`/api/incentives/${s.id}`, { is_active: !s.is_active });
      loadIncentives();
    } catch (err) {
      setNotice({ kind: 'error', msg: err.message });
    }
  }
  async function computeIncentives() {
    setBusy(true);
    const { start, end } = monthRange(computeMonth);
    try {
      const res = await api.post('/api/incentives/compute', { period_start: start, period_end: end });
      const n = res.created?.length || 0;
      setNotice({ kind: 'success', msg: n ? `Computed ${n} incentive${n > 1 ? 's' : ''} for ${computeMonth}.` : `No new incentives earned for ${computeMonth}.` });
      loadIncentives();
    } catch (err) {
      setNotice({ kind: 'error', msg: err.message });
    } finally {
      setBusy(false);
    }
  }
  function openMetricModal() {
    const manual = inc.structures.filter((s) => INC_MANUAL_TYPES.includes(s.type) && s.is_active);
    if (!manual.length) {
      setNotice({ kind: 'error', msg: 'Add a Sales, Productivity, Referral, Spot or Team incentive first.' });
      return;
    }
    setMetricForm({ incentive_structure_id: String(manual[0].id), period: thisMonth(), value: '', note: '' });
    setMetricOpen(true);
  }
  async function saveMetric(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/api/incentives/metric', {
        incentive_structure_id: Number(metricForm.incentive_structure_id),
        period: metricForm.period, value: Number(metricForm.value), note: metricForm.note,
      });
      setNotice({ kind: 'success', msg: res.shared_with ? `Team pot split ${money(res.each)} × ${res.shared_with} members.` : `Incentive recorded: ${money(res.amount)}.` });
      setMetricOpen(false);
      loadIncentives();
    } catch (err) {
      setNotice({ kind: 'error', msg: err.message });
    } finally {
      setBusy(false);
    }
  }

  // Rate math mirrors compensation.php but honours system settings (defaults 22 / 8).
  const workDays = Number(settings?.work_days_per_month) || 15;
  const workHours = Number(settings?.work_hours_per_day) || 8;
  const basic = Number(profile?.basic_salary) || 0;
  const dailyRate = basic / workDays;
  const hourlyRate = dailyRate / workHours;
  const allAllowances = profile?.all_allowances || profile?.allowances || [];
  const activeMonthlyAllowances = allAllowances
    .filter((a) => (a.is_active === true || a.is_active === 1 || a.is_active === 't') && a.frequency === 'Monthly')
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const loans = profile?.loans || [];
  const totalLoansMonthly = loans.reduce((s, l) => s + (Number(l.monthly_deduction) || 0), 0);

  // Directory (no employee selected) — mirrors compensation.php search filter.
  const directoryRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = employees || [];
    if (!q) return list;
    return list.filter((e) =>
      [`${e.first_name} ${e.last_name}`, e.code, e.department, e.position, e.status]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [employees, search]);

  const directoryColumns = [
    { key: 'code', label: 'Code', render: (r) => <span style={{ fontWeight: 600 }}>{r.code}</span> },
    { key: 'name', label: 'Employee Name', render: (r) => <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.first_name} {r.last_name}</span> },
    { key: 'department', label: 'Department' },
    { key: 'position', label: 'Position' },
    { key: 'basic_salary', label: 'Basic Salary', align: 'right', render: (r) => <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{money(r.basic_salary)}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'actions', label: '', align: 'right', render: (r) => (
      <button className="btn btn-primary btn-sm" onClick={() => selectEmployee(r.id)}>Manage Compensation</button>
    ) },
  ];

  const salaryHistoryColumns = [
    { key: 'effective_date', label: 'Effective Date', render: (r) => shortDate(r.effective_date) },
    { key: 'basic_salary', label: 'Basic Salary', render: (r) => <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{money(r.basic_salary)}</span> },
    { key: 'reason', label: 'Reason', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{r.reason || '—'}</span> },
  ];

  const allowanceColumns = [
    { key: 'type', label: 'Type', render: (r) => <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.type}</span> },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'frequency', label: 'Frequency', render: (r) => <span className="badge badge-muted">{r.frequency}</span> },
    { key: 'status', label: 'Status', render: (r) => (
      <button
        type="button"
        className={`badge ${r.is_active ? 'badge-success' : 'badge-muted'}`}
        style={{ border: 'none', cursor: 'pointer' }}
        title="Click to toggle active status"
        onClick={() => toggleAllowance(r)}
      >
        {r.is_active ? 'Active' : 'Inactive'}
      </button>
    ) },
    { key: 'actions', label: 'Actions', align: 'right', render: (r) => (
      <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn ghost btn-sm" onClick={() => openEditAllowance(r)}>Edit</button>
        <button className="btn ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => del(`/api/allowances/${r.id}`, 'Allowance removed.')}>Delete</button>
      </span>
    ) },
  ];

  const loanColumns = [
    { key: 'loan_type', label: 'Type', render: (r) => <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.loan_type}</span> },
    { key: 'principal', label: 'Total Amt', render: (r) => money(r.principal) },
    { key: 'monthly_deduction', label: 'Monthly', render: (r) => <span style={{ color: 'var(--danger)', fontWeight: 600 }}>-{money(r.monthly_deduction)}</span> },
    { key: 'balance', label: 'Balance', render: (r) => <span style={{ fontWeight: 600 }}>{money(r.balance)}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'actions', label: 'Actions', align: 'right', render: (r) => (
      <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn ghost btn-sm" onClick={() => openEditLoan(r)}>Edit</button>
        <button className="btn ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => del(`/api/loans/${r.id}`, 'Loan removed.')}>Delete</button>
      </span>
    ) },
  ];

  const incentiveColumns = [
    { key: 'name', label: 'Incentive', render: (r) => <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.name}</span> },
    { key: 'type', label: 'Type', render: (r) => <span className="badge badge-muted">{r.type}</span> },
    { key: 'rate', label: 'Rate', render: (r) => (r.rate_type === 'Percentage' ? `${num(r.rate)}%` : money(r.rate)) },
    { key: 'frequency', label: 'Frequency' },
    { key: 'target', label: 'Target', render: (r) => (r.target === null || r.target === '' || r.target === undefined ? '—' : num(r.target)) },
    { key: 'effective_date', label: 'Effective', render: (r) => shortDate(r.effective_date) },
    { key: 'status', label: 'Status', render: (r) => (
      <button
        type="button"
        className={`badge ${r.is_active ? 'badge-success' : 'badge-muted'}`}
        style={{ border: 'none', cursor: 'pointer' }}
        title="Click to toggle active status"
        onClick={() => toggleIncentive(r)}
      >
        {r.is_active ? 'Active' : 'Inactive'}
      </button>
    ) },
    { key: 'actions', label: 'Actions', align: 'right', render: (r) => (
      <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn ghost btn-sm" onClick={() => openEditIncentive(r)}>Edit</button>
        <button className="btn ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => del(`/api/incentives/${r.id}`, 'Incentive deactivated.')}>Remove</button>
      </span>
    ) },
  ];

  const earningsColumns = [
    { key: 'period', label: 'Period' },
    { key: 'type', label: 'Type', render: (r) => <span className="badge badge-muted">{r.type}</span> },
    { key: 'structure_name', label: 'Incentive', render: (r) => r.structure_name || '—' },
    { key: 'basis', label: 'Basis', render: (r) => <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.basis || '—'}</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span style={{ fontWeight: 600, color: 'var(--success)' }}>{money(r.amount)}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge>{r.status === 'Paid' ? 'Paid via payroll' : 'Awaiting payroll'}</Badge> },
  ];

  const rateRow = (label, value, style) => (
    <div>
      <div className="stat-label">{label}</div>
      <div style={{ fontWeight: 600, color: 'var(--text-main)', ...style }}>{value}</div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Compensation"
        subtitle="Salary, allowances and loans per employee."
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select className="form-control" style={{ width: 260 }} value={id} onChange={(e) => selectEmployee(e.target.value)}>
              <option value="">-- Select Employee --</option>
              {(employees || []).map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.code})</option>
              ))}
            </select>
            {id && <button className="btn btn-secondary btn-sm" onClick={() => selectEmployee('')}>All Employees</button>}
          </div>
        }
      />
      <IntegrationSourceBanner>
        <IntegrationSourceTag systems={['HR1']} /> Basic salary and employee master are synced from <strong>HR1 (Core HR)</strong>.{' '}
        <IntegrationSourceTag systems={['HR3']} style={{ marginLeft: 4 }} /> Performance ratings and recognition awards from <strong>HR3 (Performance & Development)</strong> inform incentive and bonus decisions here.
      </IntegrationSourceBanner>
      <Notice kind={notice.kind}>{notice.msg}</Notice>

      {!id && (
        <Card
          title={
            <div>
              Employee Compensation Directory
              <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                Select an employee to manage their salary, allowances, and loan deductions
              </div>
            </div>
          }
          right={<input className="form-control" placeholder="Search employees..." style={{ width: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} />}
        >
          <DataTable columns={directoryColumns} rows={directoryRows} loading={!employees} empty="No employees found." />
        </Card>
      )}

      {id && profileLoading && !profile && <div className="page-loading">Loading compensation…</div>}

      {id && profile && (
        <>
          {/* Selected employee banner — mirrors compensation.php */}
          <div className="card" style={{ background: 'var(--primary-light)', borderColor: 'var(--primary)' }}>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="topbar-avatar" style={{ width: 56, height: 56, fontSize: 22, background: 'var(--primary)', color: '#fff' }}>
                  {(profile.first_name || '').charAt(0)}{(profile.last_name || '').charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                    {profile.first_name} {profile.last_name}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {profile.position} • {profile.department} • <span style={{ fontWeight: 600 }}>{profile.code}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={`badge ${statusBadge(profile.status)}`} style={{ padding: '6px 12px', fontSize: 12 }}>{profile.status}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={openSalaryModal}>Edit Salary</button>
              </div>
            </div>
          </div>

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
              {COMP_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.label}
                  className={`settings-nav-item${s.id === section ? ' active' : ''}`}
                  onClick={() => setSection(s.id)}
                >
                  <span className="ep-nav-abbr">{compAbbr(s.label)}</span>
                  <span className="ep-nav-label">{s.label}</span>
                </button>
              ))}
            </div>

            <div className="settings-modal-large">
              <div className="settings-modal-head ep-head">
                <span className="ep-head-title">{COMP_SECTIONS.find((s) => s.id === section).label}</span>
                <span className="ep-modal-right">
                  {section === 'structure' && <button type="button" className="btn btn-secondary btn-sm" onClick={openSalaryModal}>Edit Basic Salary</button>}
                  {section === 'allowances' && <button type="button" className="btn btn-primary btn-sm" onClick={openAddAllowance}>+ Add Allowance</button>}
                  {section === 'loans' && <button type="button" className="btn btn-primary btn-sm" onClick={openAddLoan}>+ Add Loan</button>}
                  {section === 'incentives' && (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={openMetricModal}>Record Metric</button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={openAddIncentive}>+ Add Incentive</button>
                    </>
                  )}
                </span>
              </div>
              <div className="settings-modal-body">
                {section === 'structure' && (
                  <div className="grid-2" style={{ gap: 14 }}>
                    <div>
                      <div className="stat-label">Monthly Basic Salary</div>
                      <div className="stat-value" style={{ fontSize: 22 }}>{money(basic)}</div>
                    </div>
                    <div>
                      <div className="stat-label">Active Monthly Allowances</div>
                      <div className="stat-value" style={{ fontSize: 20, color: 'var(--success)' }}>{money(activeMonthlyAllowances)}</div>
                    </div>
                    {rateRow(`Daily Rate (Est. /${workDays}d)`, money(dailyRate))}
                    {rateRow(`Hourly Rate (Est. /${workHours}h)`, money(hourlyRate))}
                  </div>
                )}

                {section === 'allowances' && (
                  <DataTable columns={allowanceColumns} rows={allAllowances} loading={profileLoading} empty="No allowances assigned." />
                )}

                {section === 'history' && (
                  <DataTable columns={salaryHistoryColumns} rows={profile.salary_history} loading={profileLoading} empty="No historical changes recorded." />
                )}

                {section === 'loans' && (
                  <>
                    {totalLoansMonthly > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                        Monthly deduction total: <strong style={{ color: 'var(--danger)' }}>{money(totalLoansMonthly)}</strong>
                      </div>
                    )}
                    <DataTable columns={loanColumns} rows={loans} loading={profileLoading} empty="No loans or recurring deductions active." />
                  </>
                )}

                {section === 'incentives' && (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                      <input className="form-control" type="month" style={{ width: 170 }} value={computeMonth} onChange={(e) => setComputeMonth(e.target.value)} />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={computeIncentives} disabled={busy}>Compute Period</button>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Auto-evaluates Performance, Attendance and Retention structures; record a metric for the rest.
                      </span>
                    </div>
                    <DataTable columns={incentiveColumns} rows={inc.structures} empty="No incentive structures for this employee." />
                  </>
                )}

                {section === 'earnings' && (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0 }}>
                      Earned incentives are added to gross pay automatically in the next payroll run.
                    </p>
                    <DataTable columns={earningsColumns} rows={inc.earnings} empty="No incentives earned yet." />
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal: Update Basic Salary (existing POST flow) */}
      <Modal open={salaryOpen} onClose={() => setSalaryOpen(false)} title="Update Monthly Basic Salary">
        <form onSubmit={saveSalary}>
          <div className="form-grid-2">
            <Field label="New Basic Salary (PHP)">
              <input className="form-control" type="number" step="0.01" min="0" value={salaryForm.basic_salary} onChange={setSalary('basic_salary')} required placeholder="0.00"
                style={belowMinWage ? { borderColor: 'var(--danger)' } : undefined} />
            </Field>
            <Field label="Effective Date">
              <input className="form-control" type="date" value={salaryForm.effective_date} onChange={setSalary('effective_date')} required />
            </Field>
          </div>
          {belowMinWage && (
            <div className="alert error" style={{ marginBottom: 10 }}>
              ⚠ Below DOLE minimum wage. The monthly basic salary must be at least{' '}
              <strong>{money(minWage)}</strong> for the applicable region. Correct the amount before saving —
              the system will block this record. (Adjust the enforced minimum in Settings.)
            </div>
          )}
          <div className="form-group">
            <Field label="Reason for Adjustment">
              <input className="form-control" value={salaryForm.reason} onChange={setSalary('reason')} required placeholder="e.g. Annual merit increase, Promotion, Market adjustment" />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setSalaryOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || belowMinWage}>Save Salary</button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add / Edit Allowance */}
      <Modal open={!!allowanceModal} onClose={() => setAllowanceModal(null)} title={allowanceModal?.id ? 'Edit Allowance' : 'Add Allowance'}>
        <form onSubmit={saveAllowance}>
          <div className="form-group">
            <Field label="Allowance Type">
              {allowanceModal?.id ? (
                <input className="form-control" value={allowanceForm.type} onChange={setAllowance('type')} required />
              ) : (
                <select className="form-control" value={allowanceForm.type} onChange={setAllowance('type')} required>
                  {ALLOWANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </Field>
          </div>
          <div className="form-group">
            <Field label="Amount (PHP)">
              <input className="form-control" type="number" step="0.01" min="0" value={allowanceForm.amount} onChange={setAllowance('amount')} required placeholder="0.00" />
            </Field>
          </div>
          <div className="form-grid-2">
            <Field label="Frequency">
              <select className="form-control" value={allowanceForm.frequency} onChange={setAllowance('frequency')} required>
                {ALLOWANCE_FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <input className="form-control" value={allowanceForm.description} onChange={setAllowance('description')} placeholder="Optional note" />
            </Field>
          </div>
          <div className="form-grid-2">
            <Field label="Start Date">
              <input className="form-control" type="date" value={allowanceForm.start_date} onChange={setAllowance('start_date')} />
            </Field>
            <Field label="End Date">
              <input className="form-control" type="date" value={allowanceForm.end_date} onChange={setAllowance('end_date')} />
            </Field>
          </div>
          {allowanceModal?.id && (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-main)', cursor: 'pointer' }}>
                <input type="checkbox" checked={allowanceForm.is_active} onChange={setAllowance('is_active')} /> Active
              </label>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAllowanceModal(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{allowanceModal?.id ? 'Update Allowance' : 'Save Allowance'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add / Edit Loan */}
      <Modal open={!!loanModal} onClose={() => setLoanModal(null)} title={loanModal?.id ? 'Edit Loan / Deduction' : 'Add Loan / Recurring Deduction'}>
        <form onSubmit={saveLoan}>
          <div className="form-group">
            <Field label="Deduction / Loan Type">
              <select className="form-control" value={loanForm.loan_type} onChange={setLoan('loan_type')} required>
                {LOAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div className="form-grid-2">
            <Field label="Principal Amount (PHP)">
              <input className="form-control" type="number" step="0.01" min="0" value={loanForm.principal} onChange={setLoan('principal')} required placeholder="0.00" />
            </Field>
            <Field label="Monthly Deduction (PHP)">
              <input className="form-control" type="number" step="0.01" min="0" value={loanForm.monthly_deduction} onChange={setLoan('monthly_deduction')} required placeholder="0.00" />
            </Field>
          </div>
          <div className="form-grid-2">
            <Field label="Remaining Balance (PHP)">
              <input className="form-control" type="number" step="0.01" min="0" value={loanForm.balance} onChange={setLoan('balance')} placeholder="Same as principal if new" />
            </Field>
            <Field label="Approved / Start Date">
              <input className="form-control" type="date" value={loanForm.approved_at} onChange={setLoan('approved_at')} />
            </Field>
          </div>
          {loanModal?.id && (
            <div className="form-group">
              <Field label="Status">
                <select className="form-control" value={loanForm.status} onChange={setLoan('status')}>
                  {LOAN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setLoanModal(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{loanModal?.id ? 'Update Loan' : 'Save Loan'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add / Edit Incentive structure */}
      <Modal open={!!incModal} onClose={() => setIncModal(null)} title={incModal?.id ? 'Edit Incentive Structure' : 'Add Incentive Structure'}>
        <form onSubmit={saveIncentive}>
          <div className="form-group">
            <Field label="Incentive Name">
              <input className="form-control" value={incForm.name} onChange={setIncField('name')} required placeholder="e.g. Sales Commission Q3" />
            </Field>
          </div>
          <div className="form-grid-2">
            <Field label="Type">
              <select className="form-control" value={incForm.type} onChange={setIncField('type')} required>
                {INC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Frequency">
              <select className="form-control" value={incForm.frequency} onChange={setIncField('frequency')} required>
                {INC_FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Rate Basis">
              <select className="form-control" value={incForm.rate_type} onChange={setIncField('rate_type')} required>
                <option value="Fixed">Fixed amount (PHP)</option>
                <option value="Percentage">Percentage (%)</option>
              </select>
            </Field>
            <Field label={incForm.rate_type === 'Percentage' ? 'Rate (%)' : 'Rate (PHP)'}>
              <input className="form-control" type="number" step="0.01" min="0" value={incForm.rate} onChange={setIncField('rate')} required placeholder="0.00" />
            </Field>
            <Field label="Target (optional)">
              <input className="form-control" type="number" step="0.01" value={incForm.target} onChange={setIncField('target')} placeholder="e.g. productivity output target or years of service" />
            </Field>
            <Field label="Eligibility (optional)">
              <input className="form-control" value={incForm.eligibility} onChange={setIncField('eligibility')} placeholder="e.g. sales staff only" />
            </Field>
            <Field label="Effective Date">
              <input className="form-control" type="date" value={incForm.effective_date} onChange={setIncField('effective_date')} required />
            </Field>
            <Field label="End Date (optional)">
              <input className="form-control" type="date" value={incForm.end_date} onChange={setIncField('end_date')} />
            </Field>
          </div>
          {incModal?.id && (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-main)', cursor: 'pointer' }}>
                <input type="checkbox" checked={incForm.is_active} onChange={setIncField('is_active')} /> Active
              </label>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIncModal(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{incModal?.id ? 'Update Incentive' : 'Save Incentive'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal: Record metric for Sales / Productivity / Referral / Spot / Team */}
      <Modal open={metricOpen} onClose={() => setMetricOpen(false)} title="Record Incentive Metric">
        <form onSubmit={saveMetric}>
          <div className="form-group">
            <Field label="Incentive">
              <select className="form-control" value={metricForm.incentive_structure_id} onChange={setMetric('incentive_structure_id')} required>
                {inc.structures
                  .filter((s) => INC_MANUAL_TYPES.includes(s.type) && s.is_active)
                  .map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
              </select>
            </Field>
          </div>
          <div className="form-grid-2">
            <Field label="Period">
              <input className="form-control" type="month" value={metricForm.period} onChange={setMetric('period')} required />
            </Field>
            <Field label="Actual value">
              <input className="form-control" type="number" step="0.01" min="0" value={metricForm.value} onChange={setMetric('value')} required placeholder="Sales revenue, output, or PHP amount" />
            </Field>
          </div>
          <div className="form-group">
            <Field label="Note (optional)">
              <input className="form-control" value={metricForm.note} onChange={setMetric('note')} placeholder="e.g. January revenue, excess deliveries, referral hire" />
            </Field>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Sales: value × rate%. Productivity: (value − target) × rate. Referral/Spot: value is the amount. Team: value is the pot, split equally across the department.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setMetricOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>Record</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
