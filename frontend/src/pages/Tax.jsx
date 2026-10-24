import { useEffect, useState } from 'react';
import { useResource } from '../hooks/useResource.js';
import { api } from '../api/client.js';
import { PageHeader, StatsGrid, Stat, Card, DataTable, Field, Loading, money } from '../components/ui.jsx';

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

export default function Tax() {
  const { data: runs } = useResource('/api/payroll/runs');
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [runId, setRunId] = useState('');
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);

  // Prefer the run whose period falls in the picked month; fall back to the newest run.
  useEffect(() => {
    if (!runs || !runs.length) return;
    const match = runs.find((r) => String(r.period_start || '').slice(0, 7) === month);
    setRunId(String((match || runs[0]).id));
  }, [runs, month]);

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    api.get(`/api/payroll/runs/${runId}`).then(setRun).finally(() => setLoading(false));
  }, [runId]);

  const items = run?.items ?? [];
  const sum = (k) => items.reduce((a, i) => a + Number(i[k] || 0), 0);
  const taxableOf = (i) =>
    Number(i.gross_pay || 0) - (Number(i.sss_ee || 0) + Number(i.philhealth_ee || 0) + Number(i.pagibig_ee || 0));
  const taxableLabel = (i) => money(taxableOf(i));

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'basic_pay', label: 'Basic', align: 'right', render: (r) => money(r.basic_pay) },
    { key: 'sss_ee', label: 'SSS EE', align: 'right', render: (r) => money(r.sss_ee) },
    { key: 'sss_er', label: 'SSS ER', align: 'right', render: (r) => money(r.sss_er) },
    { key: 'philhealth_ee', label: 'PhilHealth EE', align: 'right', render: (r) => money(r.philhealth_ee) },
    { key: 'philhealth_er', label: 'PhilHealth ER', align: 'right', render: (r) => money(r.philhealth_er) },
    { key: 'pagibig_ee', label: 'Pag-IBIG EE', align: 'right', render: (r) => money(r.pagibig_ee) },
    { key: 'pagibig_er', label: 'Pag-IBIG ER', align: 'right', render: (r) => money(r.pagibig_er) },
    { key: 'taxable', label: 'Taxable Income', align: 'right', render: taxableLabel },
    { key: 'withholding_tax', label: 'W/Tax', align: 'right', render: (r) => money(r.withholding_tax) },
  ];

  const foot = [
    'TOTALS:',
    '',
    money(sum('sss_ee')),
    money(sum('sss_er')),
    money(sum('philhealth_ee')),
    money(sum('philhealth_er')),
    money(sum('pagibig_ee')),
    money(sum('pagibig_er')),
    '—',
    money(sum('withholding_tax')),
  ];

  const basisRows = [];
  items.forEach((i) => {
    if (!i.statutory_basis) return;
    try {
      const b = JSON.parse(i.statutory_basis);
      ['sss', 'philhealth', 'pagibig'].forEach((k) => basisRows.push({ employee_name: i.employee_name, ...b[k] }));
    } catch { /* row computed before the basis snapshot existed */ }
  });

  return (
    <>
      <PageHeader
        title="Tax & Contributions"
        subtitle="Statutory deductions breakdown based on 2026 rates"
        right={
          <Field label="Month">
            <input type="month" className="form-control" style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
        }
      />

      <div className="info-banner">
        <span>ℹ</span>
        <span>
          <strong>SSS and PhilHealth are mandatory</strong> for every employee and always deducted.
          <strong> Tax threshold:</strong> employees with monthly taxable income up to ₱22,000 owe zero withholding tax;
          above that, tax follows the salary bracket.
        </span>
      </div>

      <Card body>
        <div className="form-row">
          <Field label="Payroll run">
            <select className="form-control" value={runId} onChange={(e) => setRunId(e.target.value)} style={{ minWidth: 240 }}>
              {(runs || []).map((r) => <option key={r.id} value={r.id}>{r.period} — {r.status}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      {loading && <Loading />}

      {!loading && run && (
        <>
          <StatsGrid>
            <Stat label="Total SSS (EE Share)" value={money(sum('sss_ee'))} sub={`ER: ${money(sum('sss_er'))}`} />
            <Stat label="Total PhilHealth (EE Share)" value={money(sum('philhealth_ee'))} sub={`ER: ${money(sum('philhealth_er'))}`} />
            <Stat label="Total Pag-IBIG (EE Share)" value={money(sum('pagibig_ee'))} sub={`ER: ${money(sum('pagibig_er'))}`} />
            <Stat label="Total Withholding Tax" value={money(sum('withholding_tax'))} sub="BIR TRAIN 2026" kind="negative" />
          </StatsGrid>

          <Card title={`Contributions — ${run.period}`}>
            <DataTable columns={columns} rows={items} foot={foot} empty="No computed lines yet. Run payroll first." />
          </Card>

          <Card title="Deduction Basis — bracket & rate applied per employee" right={<span className="badge badge-muted">Recompute the run to refresh</span>}>
            <DataTable
              columns={[
                { key: 'employee_name', label: 'Employee' },
                { key: 'agency', label: 'Agency', render: (r) => <strong>{r.agency}</strong> },
                { key: 'bracket', label: 'Salary Bracket Used', render: (r) => <span style={{ fontSize: 12 }}>{r.bracket}</span> },
                { key: 'ee_basis', label: 'Employee Basis', render: (r) => <span style={{ fontSize: 12 }}>{r.ee_basis}</span> },
                { key: 'ee_share', label: 'Employee Share', align: 'right', render: (r) => money(r.ee_share) },
                { key: 'er_share', label: 'Employer Share', align: 'right', render: (r) => money(r.er_share) },
              ]}
              rows={basisRows}
              empty="No basis captured yet — recompute this payroll run to store the bracket and rate evidence."
            />
          </Card>

          <Card title="Rate Reference (2026 Policy)" right={<span className="badge badge-muted">2026</span>}>
            <div className="grid-3" style={{ padding: 20 }}>
              <Card body>
                <h4 style={{ marginBottom: 8 }}>SSS Contribution</h4>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Based on updated bracket (5% - 9.5%). Capped at ₱20,000 max salary credit.</p>
              </Card>
              <Card body>
                <h4 style={{ marginBottom: 8 }}>PhilHealth Contribution</h4>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>4% of monthly basic salary, split equally between EE and ER. Capped at ₱100,000 base.</p>
              </Card>
              <Card body>
                <h4 style={{ marginBottom: 8 }}>Pag-IBIG Fund</h4>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fixed ₱100 EE and ₱100 ER for salary ₱5,000 and above.</p>
              </Card>
            </div>
          </Card>

          <Card title="BIR TRAIN Law (2026 Brackets)" body>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-muted)', lineHeight: 2 }}>
              <li><strong>₱0 – ₱250,000:</strong> 0%</li>
              <li><strong>₱250,001 – ₱400,000:</strong> 15% of excess over ₱250,000</li>
              <li><strong>₱400,001 – ₱800,000:</strong> ₱22,500 + 20% of excess over ₱400,000</li>
              <li><strong>₱800,001 – ₱2,000,000:</strong> ₱102,500 + 25% of excess over ₱800,000</li>
              <li><strong>₱2,000,001 – ₱8,000,000:</strong> ₱402,500 + 30% of excess over ₱2,000,000</li>
              <li><strong>Over ₱8,000,000:</strong> ₱2,202,500 + 35% of excess over ₱8,000,000</li>
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
