import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader, Card, DataTable, Badge, StatsGrid, Stat, Notice, IntegrationSourceTag, IntegrationSourceBanner } from '../components/ui.jsx';
import { money, shortDate } from '../lib/format.js';

const TABS = [
  { key: 'payroll', label: 'Payroll Records' },
  { key: 'compensation', label: 'Compensation Planning' },
  { key: 'claims', label: 'Reimbursement Claims' },
  { key: 'hmo', label: 'HMO / Benefits' },
  { key: 'analytics', label: 'HR Analytics' },
];

const LOADERS = {
  payroll: () => Promise.all([api.get('/api/payroll/runs')]),
  compensation: () => Promise.all([api.get('/api/employees'), api.get('/api/salary-history')]),
  claims: () => Promise.all([api.get('/api/claims')]),
  hmo: () => Promise.all([api.get('/api/benefit-plans'), api.get('/api/benefits/enrollments')]),
  analytics: () => Promise.all([api.get('/api/dashboard/summary')]),
};

const yes = (v) => (v ? 'Yes' : '—');
const nameOf = (e) => [e.first_name, e.last_name].filter(Boolean).join(' ');

export default function Records() {
  const [tab, setTab] = useState('payroll');
  const [cache, setCache] = useState({});
  const loadedRef = useRef(new Set());
  const inflightRef = useRef(new Set());

  const load = useCallback(async (key, force = false) => {
    if (inflightRef.current.has(key)) return;
    if (!force && loadedRef.current.has(key)) return;
    inflightRef.current.add(key);
    setCache((c) => ({ ...c, [key]: { ...c[key], loading: true } }));
    try {
      const results = await LOADERS[key]();
      loadedRef.current.add(key);
      setCache((c) => ({ ...c, [key]: { data: results, loading: false, error: '' } }));
    } catch (e) {
      setCache((c) => ({ ...c, [key]: { ...c[key], loading: false, error: e.message } }));
    } finally {
      inflightRef.current.delete(key);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const state = cache[tab] || {};
  const [first, second] = state.data ?? [];

  return (
    <>
      <PageHeader
        title="Records"
        subtitle="Payroll, compensation, claims, HMO and analytics records in one place"
        right={<button className="btn btn-secondary" onClick={() => load(tab, true)}>Refresh</button>}
      />
      <Notice kind="error">{state.error}</Notice>

      <div className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'payroll' && (
        <>
          <Card title="Payroll Registers" body>
            <DataTable
              loading={state.loading}
              columns={[
                { key: 'period', label: 'Period' },
                { key: 'range', label: 'Cover Date', render: (r) => `${shortDate(r.period_start)} – ${shortDate(r.period_end)}` },
                { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
                { key: 'total_gross', label: 'Gross', align: 'right', render: (r) => money(r.total_gross) },
                { key: 'total_deductions', label: 'Deductions', align: 'right', render: (r) => money(r.total_deductions) },
                { key: 'total_net', label: 'Net', align: 'right', render: (r) => money(r.total_net) },
                { key: 'pay_date', label: 'Pay Date', render: (r) => shortDate(r.pay_date) },
              ]}
              rows={first?.data}
              empty="No payroll runs yet."
            />
          </Card>
          <div className="info-banner">
            <span>ℹ</span>
            <span>Payslip records are generated, stored and released by the external <strong>Finance module</strong> — they are no longer kept or viewed in the Payroll &amp; Benefits System.</span>
          </div>
        </>
      )}

      {tab === 'compensation' && (
        <>
          <Card title="Salary Records" body>
            <DataTable
              loading={state.loading}
              columns={[
                { key: 'code', label: 'Code' },
                { key: 'name', label: 'Employee', render: (r) => <span style={{ fontWeight: 600 }}>{nameOf(r)}</span> },
                { key: 'department', label: 'Department' },
                { key: 'position', label: 'Position' },
                { key: 'employment_type', label: 'Employment Type' },
                { key: 'basic_salary', label: 'Basic Salary', align: 'right', render: (r) => money(r.basic_salary) },
                { key: 'hire_date', label: 'Hire Date', render: (r) => shortDate(r.hire_date) },
                { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              ]}
              rows={first?.data}
              empty="No employees yet."
            />
          </Card>
          <Card title="Salary Adjustment Records" body>
            <DataTable
              loading={state.loading}
              columns={[
                { key: 'effective_date', label: 'Effective Date', render: (r) => shortDate(r.effective_date) },
                { key: 'employee_name', label: 'Employee', render: (r) => <span style={{ fontWeight: 600 }}>{r.employee_name}</span> },
                { key: 'code', label: 'Code' },
                { key: 'department', label: 'Department' },
                { key: 'position', label: 'Position' },
                { key: 'basic_salary', label: 'New Basic Salary', align: 'right', render: (r) => money(r.basic_salary) },
                { key: 'reason', label: 'Reason' },
              ]}
              rows={second?.data}
              empty="No salary adjustments recorded yet."
            />
          </Card>
        </>
      )}

      {tab === 'claims' && (
        <Card title="Reimbursement Claims" body>
          <DataTable
            loading={state.loading}
            columns={[
              { key: 'claim_number', label: 'Claim #', render: (r) => <code style={{ fontSize: 12 }}>{r.claim_number}</code> },
              { key: 'employee_name', label: 'Employee', render: (r) => <span style={{ fontWeight: 600 }}>{r.employee_name}</span> },
              { key: 'category', label: 'Category' },
              { key: 'description', label: 'Description' },
              { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
              { key: 'claim_date', label: 'Claim Date', render: (r) => shortDate(r.claim_date) },
              { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              { key: 'receipt_file', label: 'Receipt', render: (r) => yes(r.receipt_file) },
              { key: 'disbursed_at', label: 'Disbursed', render: (r) => shortDate(r.disbursed_at) },
            ]}
            rows={first?.data}
            empty="No claims filed yet."
          />
        </Card>
      )}

      {tab === 'hmo' && (
        <>
          <Card title="Benefit Enrollment Forms" body>
            <DataTable
              loading={state.loading}
              columns={[
                { key: 'employee_name', label: 'Employee', render: (r) => <span style={{ fontWeight: 600 }}>{r.employee_name}</span> },
                { key: 'plan_name', label: 'Plan' },
                { key: 'provider', label: 'Provider' },
                { key: 'monthly_premium', label: 'Monthly Premium', align: 'right', render: (r) => money(r.monthly_premium) },
                { key: 'employer_share', label: 'Employer Share', align: 'right', render: (r) => money(r.employer_share) },
                { key: 'employee_share', label: 'Employee Share', align: 'right', render: (r) => money(r.employee_share) },
                { key: 'dependents', label: 'Dependents', align: 'right' },
                { key: 'effective_date', label: 'Effective', render: (r) => shortDate(r.effective_date) },
                { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              ]}
              rows={second?.data}
              empty="No benefit enrollments yet."
            />
          </Card>
          <Card title="Benefit Plans (HMO Documents)" body>
            <DataTable
              loading={state.loading}
              columns={[
                { key: 'plan_code', label: 'Code' },
                { key: 'plan_name', label: 'Plan', render: (r) => <span style={{ fontWeight: 600 }}>{r.plan_name}</span> },
                { key: 'plan_type', label: 'Type' },
                { key: 'provider', label: 'Provider' },
                { key: 'monthly_premium', label: 'Monthly Premium', align: 'right', render: (r) => money(r.monthly_premium) },
                { key: 'description', label: 'Coverage' },
              ]}
              rows={first?.data}
              empty="No benefit plans configured."
            />
          </Card>
        </>
      )}

      {tab === 'analytics' && first && (
        <>
          <IntegrationSourceBanner>
            <IntegrationSourceTag systems={['HR3']} /> Headcount, performance scores, rating distributions, and promotion-readiness data are provided by <strong>HR3 (Performance & Development)</strong>.
          </IntegrationSourceBanner>
          <StatsGrid>
            <Stat label="Employees" value={first.employees?.total ?? 0} sub={`${first.employees?.active ?? 0} active`} />
            <Stat label="Latest Run" value={money(first.latest_run?.total_net)} sub={`${first.latest_run?.period ?? '—'} · ${first.latest_run?.status ?? '—'}`} />
            <Stat label="Tax & Contributions" value={money(first.latest_contributions)} sub="Latest run statutory deductions" />
            <Stat label="Pending Claims" value={first.claims?.pending_count ?? 0} sub={money(first.claims?.pending_amount)} />
            <Stat label="Active HMO / Benefits" value={first.active_benefits ?? 0} sub={`${first.approved_claims ?? 0} of ${first.total_claims ?? 0} claims approved`} />
          </StatsGrid>

          <Card title="Employee Compensation by Department" body>
            <DataTable
              columns={[
                { key: 'department', label: 'Department', render: (r) => <span style={{ fontWeight: 600 }}>{r.department}</span> },
                { key: 'emp_count', label: 'Headcount', align: 'right' },
                { key: 'total_sal', label: 'Total Gross Pay', align: 'right', render: (r) => money(r.total_sal) },
              ]}
              rows={first.department_breakdown}
              empty="No payroll data to analyze yet."
            />
          </Card>

          <Card title="Payroll Analytics" body>
            <DataTable
              columns={[
                { key: 'period', label: 'Period' },
                { key: 'total_gross', label: 'Gross', align: 'right', render: (r) => money(r.total_gross) },
                { key: 'total_deductions', label: 'Deductions', align: 'right', render: (r) => money(r.total_deductions) },
                { key: 'total_net', label: 'Net', align: 'right', render: (r) => money(r.total_net) },
                { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              ]}
              rows={first.payroll_trend}
              empty="No payroll history yet."
            />
          </Card>
        </>
      )}
      {tab === 'analytics' && !first && !state.loading && (
        <Notice kind="error">{state.error || 'Analytics unavailable.'}</Notice>
      )}
    </>
  );
}
