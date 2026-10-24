import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../hooks/useResource.js';
import { api } from '../api/client.js';
import { PageHeader, StatsGrid, Stat, DataTable, Card, Badge, Modal, Field, money, IntegrationSourceTag, IntegrationSourceBanner } from '../components/ui.jsx';

const DEPARTMENTS = ['IT Department', 'HR Department', 'Finance Department', 'Operations', 'Marketing'];
const STATUSES = ['Active', 'On Leave', 'Resigned', 'Terminated'];

const muted = { fontSize: 11, color: 'var(--text-muted)' };

/** HR-side login management: create the employee account or reset its password. */
function AccountModal({ employee, account, onClose, onDone }) {
  const isCreate = !account;
  const [email, setEmail] = useState(account?.email || employee?.email || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isCreate) {
        await api.post(`/api/employees/${employee.id}/account`, { email, password });
      } else {
        await api.put(`/api/employees/${employee.id}/account`, { password });
      }
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!employee) return null;
  return (
    <Modal open onClose={onClose} title={isCreate ? `Create login for ${employee.first_name} ${employee.last_name}` : `Reset password — ${employee.first_name} ${employee.last_name}`}>
      {error && <div className="alert error">{error}</div>}
      <form onSubmit={submit} className="form-grid">
        {isCreate && (
          <Field label="Company email (login)">
            <input type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
        )}
        <Field label={isCreate ? 'Initial password' : 'New password'}>
          <input type="text" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            placeholder="Min 8 chars with upper, lower, number and symbol" />
        </Field>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          The employee signs in with this email and password (plus the email verification code) on the same
          login page and lands on the Employee portal. Passwords are only ever reset here — there is no
          self-service forgot password.
        </p>
        <button type="submit" className="btn-block" disabled={busy}>
          {busy ? 'Saving…' : (isCreate ? 'Create Account' : 'Set New Password')}
        </button>
      </form>
    </Modal>
  );
}

export default function Employees() {
  const { data, loading, error } = useResource('/api/employees');
  const { data: accountRows, reload: reloadAccounts } = useResource('/api/employee-accounts');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [accountTarget, setAccountTarget] = useState(null); // { employee, account }

  const accountByEmployee = useMemo(() => {
    const map = {};
    for (const a of accountRows || []) if (a.employee_id) map[a.employee_id] = a;
    return map;
  }, [accountRows]);

  // Departments present in the roster (union with the canonical list) for the filter.
  const filterDepartments = useMemo(() => {
    const depts = new Set(DEPARTMENTS);
    (data || []).forEach((e) => e.department && depts.add(e.department));
    return [...depts].sort();
  }, [data]);

  // Client-side filtering, mirroring employees.php's search / dept_filter / status_filter.
  const rows = useMemo(() => {
    let list = data || [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        [`${e.first_name} ${e.last_name}`, e.code, e.email, e.position, e.department]
          .some((v) => String(v || '').toLowerCase().includes(q))
      );
    }
    if (deptFilter) list = list.filter((e) => e.department === deptFilter);
    if (statusFilter) list = list.filter((e) => e.status === statusFilter);
    return list;
  }, [data, search, deptFilter, statusFilter]);

  const stats = useMemo(() => {
    const list = data || [];
    const count = (s) => list.filter((e) => e.status === s).length;
    return { total: list.length, active: count('Active'), leave: count('On Leave'), resigned: count('Resigned') };
  }, [data]);

  const columns = [
    { key: 'code', label: 'Code', render: (r) => <Link to={`/employees/${r.id}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>{r.code}</Link> },
    { key: 'name', label: 'Name', render: (r) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{r.first_name} {r.last_name}</div>
        <div style={muted}>{r.email}</div>
      </div>
    ) },
    { key: 'department', label: 'Department' },
    { key: 'position', label: 'Position' },
    { key: 'employment_type', label: 'Type' },
    { key: 'basic_salary', label: 'Basic Salary', align: 'right', render: (r) => money(r.basic_salary) },
    { key: 'ewallet_provider', label: 'E-Wallet', render: (r) => r.ewallet_provider
      ? <span className="badge badge-primary">{r.ewallet_provider}</span>
      : <span style={{ color: 'var(--text-muted)' }}>—</span> },
    { key: 'hire_date', label: 'Hired', render: (r) => r.hire_date },
    { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'account', label: 'Login', render: (r) => {
      const a = accountByEmployee[r.id];
      return a?.is_active === false ? <span className="badge badge-muted" title={a.email}>Disabled</span>
        : a ? <span className="badge badge-success" title={a.email}>Portal</span>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>;
    } },
    { key: 'actions', label: '', align: 'right', render: (r) => (
      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Link className="btn ghost btn-sm" to={`/employees/${r.id}`}>View</Link>
        <button className="btn ghost btn-sm" onClick={() => setAccountTarget({ employee: r, account: accountByEmployee[r.id] || null })}>
          {accountByEmployee[r.id] ? 'Reset Password' : 'Create Login'}
        </button>
      </span>
    ) },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Employee records are pushed from the Core HR system — this view is read-only."
        right={<IntegrationSourceTag systems={['HR1']} label="Synced from HR1 (Core HR)" />}
      />

      <IntegrationSourceBanner>
        <IntegrationSourceTag systems={['HR1']} /> Employee profiles, departments, positions, employment types, and salary data are pushed by <strong>HR1 (Core HR)</strong> into this system. Changes to employee records must be made in HR1.
      </IntegrationSourceBanner>

      <StatsGrid>
        <Stat label="Total Employees" value={stats.total} />
        <Stat label="Active" value={<span style={{ color: 'var(--text-main)' }}>{stats.active}</span>} />
        <Stat label="On Leave" value={<span style={{ color: 'var(--warning)' }}>{stats.leave}</span>} kind="warning" />
        <Stat label="Resigned" value={<span style={{ color: 'var(--danger)' }}>{stats.resigned}</span>} kind="negative" />
      </StatsGrid>

      <div className="filters-bar">
        <input
          className="form-control"
          type="text"
          placeholder="Search employees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 250 }}
        />
        <select className="form-control" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">All Departments</option>
          {filterDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <Card>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} empty="No employees found." />
      </Card>

      {accountTarget && (
        <AccountModal
          employee={accountTarget.employee}
          account={accountTarget.account}
          onClose={() => setAccountTarget(null)}
          onDone={() => { setAccountTarget(null); reloadAccounts(); }}
        />
      )}
    </>
  );
}
