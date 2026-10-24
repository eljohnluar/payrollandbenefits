import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, qs } from '../api/client.js';
import { money, shortDate } from '../lib/format.js';
import { useRealtime } from '../hooks/useRealtime.js';
import { PageHeader, StatsGrid, Stat, Card, Badge, ErrorBox, Notice, Modal, Field, IntegrationSourceTag, IntegrationSourceBanner, TablePagination } from '../components/ui.jsx';

const RANGES = { '30d': '30 Days', '3m': '3 Months', '1y': '1 Year' };
const RANGE_MODIFY = { '30d': -30, '3m': -3, '1y': -12 };

const DONUT_COLORS = [
  { label: 'SSS', key: 'sss_ee', color: '#3b82f6' },
  { label: 'PhilHealth', key: 'philhealth_ee', color: '#10b981' },
  { label: 'Pag-IBIG', key: 'pagibig_ee', color: '#f59e0b' },
  { label: 'Withholding Tax', key: 'withholding_tax', color: '#dc2626' },
  { label: 'Loans', key: 'loans_deduction', color: '#6EE7B7' },
  { label: 'HMO', key: 'hmo_deduction', color: '#ec4899' },
  { label: 'Unpaid Leave', key: 'unpaid_leave_deduction', color: '#64748b' },
  { label: 'Late Deduction', key: 'attendance_deduction', color: '#f97316' },
];

const fmtCompact = (v) => {
  if (v >= 1000000) return `₱${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `₱${Math.round(v / 1000)}K`;
  return `₱${Math.round(v)}`;
};

const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Semi-monthly payday: the 15th or month-end, never a Sunday — moved to the day before.
const offSunday = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  while (d.getDay() === 0) d.setDate(d.getDate() - 1);
  return toIso(d);
};

const cutoffRange = (month, half) => {
  const [y, m] = month.split('-').map(Number);
  const pad = (day) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return half === 'first' ? { start: pad(1), end: pad(15) } : { start: pad(16), end: pad(new Date(y, m, 0).getDate()) };
};

const monthOfEnd = (iso) => {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
};

const num = (v) => Number(v || 0);
const muted = { color: 'var(--text-muted)' };
const semibold = { fontWeight: 600 };
const blockLabel = { fontWeight: 600, marginBottom: 8 };
const blockAmount = { fontWeight: 600, marginTop: 8 };

function downloadCsv(filename, header, rows) {
  const esc = (c) => `"${String(c ?? '').replace(/"/g, '""')}"`;
  const csv = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Payroll cost trend (Gross / Net / Deductions), ported from payroll_run.php ── */
function TrendChart({ trend }) {
  const W = 640;
  const H = 230;
  const padL = 50;
  const padR = 14;
  const padT = 18;
  const padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const series = [
    { label: 'Gross Pay', color: 'var(--primary)', dash: null, vals: trend.map((t) => num(t.total_gross)) },
    { label: 'Net Pay', color: 'var(--success)', dash: null, vals: trend.map((t) => num(t.total_net)) },
    { label: 'Deductions', color: 'var(--danger)', dash: '5 4', vals: trend.map((t) => num(t.total_deductions)) },
  ];
  let maxV = 0;
  trend.forEach((t) => {
    maxV = Math.max(maxV, num(t.total_gross), num(t.total_net), num(t.total_deductions));
  });
  if (maxV <= 0) maxV = 1;
  const n = trend.length;
  const ptX = (i) => padL + (n > 1 ? i * (plotW / (n - 1)) : plotW / 2);
  const ptY = (v) => padT + plotH - (num(v) / maxV) * plotH;

  if (!trend.length) return <div className="empty-state"><p>No payroll runs in this period.</p></div>;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Payroll cost trend">
        {[0, 1, 2, 3, 4].map((g) => {
          const gy = padT + plotH - (g / 4) * plotH;
          return (
            <g key={g}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="var(--border)" strokeWidth="1" strokeDasharray={g === 0 ? undefined : '3 4'} />
              <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="var(--text-muted)">{fmtCompact((g / 4) * maxV)}</text>
            </g>
          );
        })}
        {series.map((s) => (
          <g key={s.label}>
            <polyline
              points={s.vals.map((v, i) => `${ptX(i).toFixed(1)},${ptY(v).toFixed(1)}`).join(' ')}
              fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash}
              strokeLinejoin="round" strokeLinecap="round"
            />
            {s.vals.map((v, i) => (
              <circle key={i} cx={ptX(i).toFixed(1)} cy={ptY(v).toFixed(1)} r="3" fill={s.color}>
                <title>{`${s.label} · ${trend[i].period}: ${money(v)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {trend.map((t, i) => (
          <text key={t.period + i} x={ptX(i).toFixed(1)} y={H - 12} textAnchor="middle" fontSize="9" fill="var(--text-muted)">
            {monthOfEnd(t.period_end)}
          </text>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        {series.map((s) => (
          <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: `2px ${s.dash ? 'dashed' : 'solid'} ${s.color}`, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
    </>
  );
}

/* ── Deduction breakdown donut (conic-gradient), for included lines of one run ── */
function DeductionDonut({ items, period }) {
  const included = items.filter((i) => i.is_included);
  const parts = DONUT_COLORS
    .map((p) => ({ ...p, val: included.reduce((a, i) => a + num(i[p.key]), 0) }))
    .filter((p) => p.val > 0);
  const total = parts.reduce((a, p) => a + p.val, 0);

  let acc = 0;
  const stops = total > 0
    ? parts
        .map((p) => {
          const start = (acc / total) * 360;
          acc += p.val;
          return `${p.color} ${start.toFixed(2)}deg ${((acc / total) * 360).toFixed(2)}deg`;
        })
        .join(', ')
    : null;

  return (
    <Card title="Deductions" right={<span style={{ ...muted, fontSize: 12 }}>Breakdown for {period}</span>} body>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 150, height: 150, borderRadius: '50%', background: stops ? `conic-gradient(${stops})` : 'var(--surface-alt)', position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: '24%', background: 'var(--surface)', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, ...muted }}>Total</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-main)' }}>{money(total)}</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          {parts.map((p) => (
            <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, display: 'inline-block' }} />
                {p.label}
              </span>
              <span style={muted}>{money(p.val)} · {((p.val / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
          {!parts.length && <div className="empty-state"><p>No deductions recorded for this run.</p></div>}
        </div>
      </div>
    </Card>
  );
}

/* ── Status panels below the run card — approval happens in the external Finance module ── */
function StatusPanels({ run, snapshot }) {
  const fa = run.finance_approval;
  if (run.status === 'Pending Finance Approval') {
    return (
      <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--warning)', background: 'rgba(245, 158, 11, 0.05)' }}>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>📤</span>
              <div>
                <h4 style={{ margin: 0, color: 'var(--text-main)' }}>Submitted for external Finance approval</h4>
                <div style={{ ...muted, fontSize: 12 }}>
                  Submitted by {fa?.submitter_name || 'HR Admin'} on {shortDate(fa?.submitted_at || run.created_at)} ·
                  Approval, payslip generation and disbursement are handled by the Finance module, not here.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className={`badge ${snapshot.budget_sufficient ? 'badge-success' : 'badge-danger'}`}>
                Budget {snapshot.budget_sufficient ? 'available' : 'insufficient'}
              </span>
              <span className={`badge ${snapshot.cash_sufficient ? 'badge-info' : 'badge-danger'}`}>
                Cash {snapshot.cash_sufficient ? 'available' : 'insufficient'}
              </span>
            </div>
          </div>
          <p style={{ fontSize: 13, ...muted, margin: 0 }}>
            Gross payroll: <strong>{money(snapshot.budget_required)}</strong> against {money(snapshot.budget_remaining)} budget remaining.
            Net requirement: <strong>{money(snapshot.cash_required)}</strong> against {money(snapshot.cash_available)} available cash.
          </p>
        </div>
      </div>
    );
  }
  if (['Approved', 'Paid', 'Closed'].includes(run.status)) {
    return (
      <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--success)', background: 'rgba(16, 185, 129, 0.05)' }}>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: 0, color: 'var(--text-main)' }}>✅ {run.status} (Finance module)</h4>
            <div style={{ ...muted, fontSize: 12 }}>
              This run was completed outside the Payroll &amp; Benefits System — payslips and fund release live in Finance.
            </div>
          </div>
          <span className="badge badge-success" style={{ padding: '6px 12px' }}>{run.status}</span>
        </div>
      </div>
    );
  }
  if (['On Hold', 'Rejected'].includes(run.status)) {
    return (
      <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--danger)', background: 'rgba(220, 38, 38, 0.05)' }}>
        <div className="card-body">
          <h4 style={{ margin: 0, color: 'var(--text-main)' }}>{run.status === 'On Hold' ? '⏸ On Hold' : '⛔ Rejected'}</h4>
          <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>
            Finance decision: {fa?.decision_notes || 'No notes recorded.'}
          </div>
        </div>
      </div>
    );
  }
  return null;
}

/* ── Statutory deduction basis: bracket + rate + employee share (revision #7) ── */
function StatutoryBasis({ item }) {
  let basis = null;
  try { basis = item.statutory_basis ? JSON.parse(item.statutory_basis) : null; } catch { /* pre-revision row */ }
  if (!basis) {
    return (
      <div>
        <div style={blockLabel}>Deduction Basis</div>
        <div style={{ ...muted, fontSize: 11 }}>Recompute this run to capture the SSS / PhilHealth / Pag-IBIG salary bracket and rate used.</div>
      </div>
    );
  }
  return (
    <div>
      <div style={blockLabel}>Deduction Basis — SSS, PhilHealth &amp; Pag-IBIG</div>
      <div style={{ ...muted, fontSize: 11, marginBottom: 6 }}>Salary basis: {money(basis.salary_basis)}</div>
      {['sss', 'philhealth', 'pagibig'].map((k) => (
        <div key={k} style={{ marginBottom: 8, fontSize: 11 }}>
          <div style={{ fontWeight: 700 }}>{basis[k].agency}</div>
          <div>{basis[k].bracket}</div>
          <div>{basis[k].ee_basis} → <strong>{money(basis[k].ee_share)}</strong> · {basis[k].er_basis} → {money(basis[k].er_share)}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Expandable per-employee breakdown row ── */
function DetailRow({ item, colSpan }) {
  const block = (title, sub, amount, style) => (
    <div>
      <div style={blockLabel}>{title}</div>
      {sub && <div style={{ ...muted, fontSize: 11 }}>{sub}</div>}
      <div style={{ ...(style || {}), ...blockAmount }}>{amount}</div>
    </div>
  );
  return (
    <tr style={{ background: 'var(--surface-alt)' }}>
      <td colSpan={colSpan} style={{ padding: 16 }}>
        <div className="grid-4" style={{ fontSize: 12 }}>
          {block('Basic Pay Formula', `Days Worked: ${num(item.days_worked)}`, money(item.basic_pay), semibold)}
          {block('Overtime Pay', `OT Hours: ${num(item.ot_hours)}`, money(item.overtime_pay), semibold)}
          {block('Shift Premiums', 'Night differential / holiday pay', money(num(item.night_differential) + num(item.holiday_pay)), semibold)}
          {block(
            'Allowances & Leave Conv.',
            num(item.leave_conversion) > 0 ? `Leave Conv: ${money(item.leave_conversion)}` : null,
            money(num(item.allowances) + num(item.leave_conversion)),
            semibold
          )}
          {block('Approved Claims', null, money(item.claims_amount), semibold)}
          {block(
            'Incentives',
            'Performance, competency, training, recognition & incentive plan',
            money(num(item.performance_bonus) + num(item.competency_allowance) + num(item.training_incentive) + num(item.recognition_bonus) + num(item.incentives)),
            semibold
          )}
          {block('Deductions', 'Unpaid leave, late deductions & HMO employee share', money(num(item.unpaid_leave_deduction) + num(item.hmo_deduction) + num(item.attendance_deduction)), { ...semibold, color: 'var(--danger)' })}
          <StatutoryBasis item={item} />
        </div>
      </td>
    </tr>
  );
}

export default function PayrollRun() {
  // Only HR Admin reaches this page; the external Finance module owns approval.
  const canOperate = true;

  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const [range, setRange] = useState('30d');
  const [trend, setTrend] = useState([]);
  const [payDate, setPayDate] = useState('');
  const [expanded, setExpanded] = useState({});
  const [showImport, setShowImport] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);
  const [glPage, setGlPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newMonth, setNewMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const [newHalf, setNewHalf] = useState(() => (new Date().getDate() <= 15 ? 'first' : 'second'));

  const loadTrend = useCallback(async (r) => {
    try {
      const res = await api.get('/api/payroll/trend' + qs({ range: r }));
      setTrend(res?.data ?? []);
    } catch (e) {
      /* trend is decorative; ignore */
    }
  }, []);

  const loadRuns = useCallback(async () => {
    const res = await api.get('/api/payroll/runs');
    const list = res?.data ?? [];
    setRuns(list);
    return list;
  }, []);

  const loadRun = useCallback(async (id) => {
    try {
      const r = await api.get(`/api/payroll/runs/${id}`);
      setRun(r);
      setRunId(r.id);
      setPayDate(r.pay_date || offSunday(r.period_end));
      setExpanded({});
      setItemsPage(1);
      setGlPage(1);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const refresh = useCallback(async () => {
    await loadRuns();
    loadTrend(range);
    if (runId) await loadRun(runId);
  }, [loadRuns, loadTrend, range, runId, loadRun]);

  useEffect(() => {
    (async () => {
      try {
        const list = await loadRuns();
        loadTrend(range);
        if (list.length) {
          const currentPeriod = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          const match = list.find((r) => r.period.startsWith(currentPeriod)) || list[0];
          await loadRun(match.id);
        }
      } catch (e) {
        setError(e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTrend(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useRealtime('payroll_items', () => {
    if (runId) loadRun(runId);
  });

  const items = run?.items ?? [];
  const isDraft = run?.status === 'Draft';
  const included = useMemo(() => items.filter((i) => i.is_included), [items]);
  const totals = useMemo(
    () =>
      included.reduce(
        (a, i) => ({ gross: a.gross + num(i.gross_pay), ded: a.ded + num(i.total_deductions), net: a.net + num(i.net_pay) }),
        { gross: 0, ded: 0, net: 0 }
      ),
    [included]
  );
  const snapshot = run?.funding_snapshot ?? {};

  const cutoffLabel = useMemo(() => {
    const d = new Date();
    if (range === '1y') d.setMonth(d.getMonth() - 12);
    else if (range === '3m') d.setMonth(d.getMonth() - 3);
    else d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, [range]);

  async function act(key, fn, okMsg) {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      const result = await fn();
      if (result) setRun(result);
      if (okMsg) setNotice(okMsg);
      await loadRuns();
      loadTrend(range);
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  const confirmAct = (key, message, path, body, okMsg) => {
    if (!window.confirm(message)) return;
    act(key, () => api.post(`/api/payroll/runs/${run.id}/${path}`, body ?? {}), okMsg);
  };

  function toggleInfo(item) {
    setExpanded((m) => ({ ...m, [item.employee_id]: !m[item.employee_id] }));
  }

  async function importCsv(e) {
    e.preventDefault();
    const file = e.target.elements.import_file.files?.[0];
    if (!file) return;
    const text = await file.text();
    let rows = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(',').map((c) => c.trim()));
    const headerCells = ['code', 'employee_code', 'employee code', 'employee_id', 'employee id', 'emp_code', 'id'];
    if (rows.length && headerCells.includes(rows[0][0]?.toLowerCase())) rows = rows.slice(1);
    const res = await act('import', () => api.post(`/api/payroll/runs/${run.id}/import`, { rows }), '');
    if (res) {
      const tail = res.not_found?.length ? ` Not found: ${res.not_found.slice(0, 5).join(', ')}${res.not_found.length > 5 ? '…' : ''}.` : '';
      setNotice(`Imported ${res.inserted} new employee(s), skipped ${res.skipped} existing.${tail} Click Recompute to calculate pay.`);
      setShowImport(false);
      e.target.reset();
    }
  }

  function exportRunCsv() {
    downloadCsv(
      `payroll-run-${run.id}.csv`,
      ['Employee ID', 'Name', 'Department', 'Days', 'OT Hours', 'Gross', 'Deductions', 'Net', 'E-Wallet', 'Status'],
      items.map((i) => [i.employee_id, i.employee_name, i.department, i.days_worked, i.ot_hours, i.gross_pay, i.total_deductions, i.net_pay, i.ewallet_provider, i.status])
    );
  }

  async function createCutoffRun() {
    const { start, end } = cutoffRange(newMonth, newHalf);
    setBusy('newrun');
    setError('');
    setNotice('');
    try {
      const res = await api.post('/api/payroll/process', { period_start: start, period_end: end, compute: false });
      const created = res?.data ?? res;
      setNewOpen(false);
      await loadRun(created.id);
      setNotice(`${created.period} created — payday ${shortDate(created.pay_date)}. Click Recompute to calculate pay.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  const disbursements = useMemo(() => {
    const groups = {};
    included.forEach((it) => {
      const p = it.ewallet_provider || 'Other';
      (groups[p] = groups[p] || []).push(it);
    });
    return Object.entries(groups);
  }, [included]);

  const glDebit = (run?.gl_entries ?? []).reduce((a, g) => a + num(g.debit), 0);
  const glCredit = (run?.gl_entries ?? []).reduce((a, g) => a + num(g.credit), 0);

  return (
    <>
      <PageHeader title="Payroll Run" subtitle="Compute a period and submit it for external Finance approval — payslips and disbursement belong to Finance." right={run ? <Badge>{run.status}</Badge> : undefined} />

      <IntegrationSourceBanner>
        <IntegrationSourceTag systems={['HR1']} /> Employee & salary data from <strong>HR1</strong> ·{' '}
        <IntegrationSourceTag systems={['HR2']} /> Attendance & leave from <strong>HR2</strong> ·{' '}
        <IntegrationSourceTag systems={['HR3']} /> Performance ratings from <strong>HR3</strong> all feed into payroll computations. Payslips are served back to HR1 for employee self-service.
      </IntegrationSourceBanner>

      {/* Range + run selector, mirroring the PHP page header */}
      <div className="page-header" style={{ alignItems: 'center', marginTop: -6, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.entries(RANGES).map(([key, label]) => (
            <button key={key} className={`btn ${range === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRange(key)}>
              {label}
            </button>
          ))}
        </div>
        <select
          className="form-control"
          style={{ maxWidth: 280 }}
          value={runId ?? ''}
          onChange={(e) => loadRun(Number(e.target.value))}
        >
          {!runs.length && <option value="">No runs yet</option>}
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.period} ({r.status})
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={() => setNewOpen(true)}>＋ New Cut-off Run</button>
      </div>

      <ErrorBox error={error} />
      <Notice>{notice}</Notice>

      {!run && !error && <div className="page-loading" style={{ marginTop: 16 }}>No payroll run selected or found.</div>}

      {run && (
        <>
          {/* Run header card with status-conditional actions */}
          <div className="card" style={{ marginTop: 16, marginBottom: 20 }}>
            <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--surface-alt)' }}>
              <div>
                <h3 style={{ color: 'var(--text-main)', margin: '0 0 4px' }}>{run.period}</h3>
                <div style={{ ...muted, fontSize: 12 }}>{shortDate(run.period_start)} – {shortDate(run.period_end)}</div>
                {run.pay_date && (
                  <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>
                    📅 Pay Date: <strong>{shortDate(run.pay_date)}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className={`badge ${isDraft ? 'badge-warning' : run.status === 'Paid' || run.status === 'Approved' || run.status === 'Closed' ? 'badge-success' : ['Rejected', 'On Hold'].includes(run.status) ? 'badge-danger' : 'badge-info'}`} style={{ fontSize: 13, padding: '6px 12px', marginRight: 4 }}>
                  {run.status}
                </span>
                {isDraft && (
                  <>
                    <button className="btn btn-secondary" disabled={!!busy || !canOperate} onClick={() => act('recompute', async () => { await api.post(`/api/payroll/runs/${run.id}/compute`); return loadRun(run.id); }, 'Payroll recomputed successfully.')}>
                      {busy === 'recompute' ? 'Recomputing…' : 'Recompute'}
                    </button>
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <input type="date" className="form-control" style={{ width: 150, padding: '6px 10px' }} value={payDate} disabled={!canOperate} onChange={(e) => setPayDate(e.target.value)} />
                      <button className="btn btn-secondary" disabled={!!busy || !canOperate} onClick={() => act('paydate', () => api.post(`/api/payroll/runs/${run.id}/pay-date`, { pay_date: payDate }), `Pay date set to ${payDate}.`)}>
                        Set Pay Date
                      </button>
                    </span>
                    <button className="btn btn-secondary" onClick={exportRunCsv}>Export</button>
                    <button className="btn btn-primary" disabled={!!busy || !canOperate} onClick={() => confirmAct('submit', 'Run this payroll? It will be submitted to Finance for approval.', 'submit-to-finance', {}, 'Payroll submitted to Finance for approval.')}>
                      {busy === 'submit' ? 'Submitting…' : 'Run Payroll'}
                    </button>
                  </>
                )}
                {run.status === 'Pending Finance Approval' && (
                  <span style={{ ...muted, fontSize: 12 }}>Awaiting Finance decision (external module)</span>
                )}
                {['On Hold', 'Rejected'].includes(run.status) && (
                  <button className="btn btn-secondary" disabled={!!busy || !canOperate} onClick={() => act('reopen', () => api.post(`/api/payroll/runs/${run.id}/return-to-draft`), 'Payroll returned to Draft for revision.')}>
                    Return to Draft
                  </button>
                )}
              </div>
            </div>
          </div>

          <StatusPanels run={run} snapshot={snapshot} />

          <StatsGrid>
            <Stat label="Payroll Expense" value={<span style={{ color: 'var(--text-main)' }}>{money(totals.gross)}</span>} />
            <Stat label="Tax & Deductions" value={<span style={{ color: 'var(--danger)' }}>-{money(totals.ded)}</span>} />
            <Stat label="Net Disbursed" value={<span style={{ color: 'var(--success)' }}>{money(totals.net)}</span>} />
            <Stat label="Headcount" value={<>{included.length} <span style={{ ...muted, fontSize: 14 }}>/ {items.length}</span></>} />
          </StatsGrid>

          <div className="charts-grid">
            <Card title="Payroll Cost Trend" right={<span style={{ ...muted, fontSize: 12 }}>Net pay vs deductions per payroll run · since {shortDate(cutoffLabel)}</span>} body>
              <TrendChart trend={trend} />
            </Card>
            <DeductionDonut items={items} period={run.period} />
          </div>

          {/* Payroll Master List */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h2>Payroll Master List</h2>
              {isDraft && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowImport((v) => !v)}>Import data</button>
              )}
            </div>
            {isDraft && showImport && (
              <form onSubmit={importCsv} style={{ display: 'flex', padding: '12px 20px', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <input type="file" name="import_file" accept=".csv,text/csv" required className="form-control" style={{ maxWidth: 300, padding: 6 }} />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!!busy}>{busy === 'import' ? 'Uploading…' : 'Upload CSV'}</button>
                <span style={{ ...muted, fontSize: 12 }}>CSV: employee code, days worked (optional), OT hours (optional). New employees are added to this run; existing rows are skipped. Click Recompute afterwards.</span>
              </form>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>Inc</th>
                    <th>Employee / Dept</th>
                    <th className="num">Gross Pay</th>
                    <th className="num">SSS</th>
                    <th className="num">PhilHealth</th>
                    <th className="num">Pag-IBIG</th>
                    <th className="num">W/Tax</th>
                    <th className="num">Loans</th>
                    <th className="num">Net Pay</th>
                    <th>E-Wallet</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(items.length > 10 ? items.slice((Math.min(Math.max(1, itemsPage), Math.max(1, Math.ceil(items.length / 10))) - 1) * 10, Math.min(Math.max(1, itemsPage), Math.max(1, Math.ceil(items.length / 10))) * 10) : items).map((item) => (
                    <FragmentRow
                      key={item.id}
                      item={item}
                      isDraft={isDraft}
                      canOperate={canOperate}
                      expanded={!!expanded[item.employee_id]}
                      busy={busy}
                      onToggleInclude={() =>
                        act(`inc-${item.id}`, () => api.post(`/api/payroll/items/${item.id}/include`, {
                          payroll_run_id: run.id,
                          is_included: !item.is_included,
                        }), 'Inclusion status updated. Recompute required.')
                      }
                      onInfo={() => toggleInfo(item)}
                    />
                  ))}
                  {!items.length && (
                    <tr><td colSpan={12} style={{ ...muted, textAlign: 'center', padding: 24 }}>No employees in this run yet.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL NET PAY:</td>
                    <td colSpan={4} style={{ color: 'var(--success)', fontSize: 16, fontWeight: 700 }}>{money(totals.net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <TablePagination
              page={Math.min(Math.max(1, itemsPage), Math.max(1, Math.ceil(items.length / 10)))}
              totalItems={items.length}
              pageSize={10}
              onPageChange={setItemsPage}
            />
          </div>

          {/* Automated outputs banner */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(5, 150, 105, 0.1)', borderLeft: '4px solid var(--primary)' }}>
              <div style={{ fontSize: 24 }}>📄</div>
              <div>
                <h4 style={{ color: 'var(--text-main)', margin: '0 0 4px' }}>Automated Outputs</h4>
                <p style={{ ...muted, margin: 0, fontSize: 13 }}>
                  Payslip generation and email delivery are handled by the Finance module after approval —
                  this system prepares and submits the payroll data only.
                </p>
              </div>
            </div>
          </div>

          {/* General Ledger entries */}
          {!!(run.gl_entries?.length) && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div>
                  <h2>General Ledger Entries (Financial Management System)</h2>
                  <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>Automated double-entry accounting records for payroll accrual &amp; cash settlement</div>
                </div>
                <span className="badge badge-success">GL Balanced</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Account Name &amp; Code</th>
                      <th>Description</th>
                      <th className="num">Debit</th>
                      <th className="num">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(run.gl_entries.length > 10 ? run.gl_entries.slice((Math.min(Math.max(1, glPage), Math.max(1, Math.ceil(run.gl_entries.length / 10))) - 1) * 10, Math.min(Math.max(1, glPage), Math.max(1, Math.ceil(run.gl_entries.length / 10))) * 10) : run.gl_entries).map((g) => (
                      <tr key={g.id}>
                        <td style={muted}>{shortDate(g.entry_date)}</td>
                        <td style={semibold}>{g.account_code} {g.account_name}</td>
                        <td style={muted}>{g.memo || ''}</td>
                        <td className="num" style={{ fontWeight: 600, color: num(g.debit) > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                          {num(g.debit) > 0 ? money(g.debit) : '—'}
                        </td>
                        <td className="num" style={{ fontWeight: 600, color: num(g.credit) > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                          {num(g.credit) > 0 ? money(g.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-alt)' }}>
                      <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL:</td>
                      <td className="num" style={{ fontWeight: 700, color: 'var(--primary)' }}>{money(glDebit)}</td>
                      <td className="num" style={{ fontWeight: 700, color: 'var(--primary)' }}>{money(glCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <TablePagination
                page={Math.min(Math.max(1, glPage), Math.max(1, Math.ceil(run.gl_entries.length / 10)))}
                totalItems={run.gl_entries.length}
                pageSize={10}
                onPageChange={setGlPage}
              />
            </div>
          )}

          {/* Net-pay grouping handed to the external Finance module for disbursement */}
          <h3 style={{ fontSize: 16, color: 'var(--text-main)', margin: '0 0 4px' }}>Finance Handoff Summary</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Net pay grouped by e-wallet provider — export it for the Finance module, which performs the actual disbursement.
            {' '}<strong>Reimbursements included in this run: {money(included.reduce((a, e) => a + num(e.claims_amount), 0))}</strong>
            {' '}across {included.filter((e) => num(e.claims_amount) > 0).length} employee(s) (HR-approved claims).
          </p>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            {disbursements.map(([prov, list]) => {
              const subtotal = list.reduce((a, e) => a + num(e.net_pay), 0);
              return (
                <Card
                  key={prov}
                  title={prov}
                  right={<span className="badge badge-primary">{list.length} Employees</span>}
                >
                  <div style={{ maxHeight: 200, overflowY: 'auto', padding: '10px 20px' }}>
                    {list.map((e) => (
                      <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-main)' }}>{e.employee_name}</span>
                        <span style={semibold}>{money(e.net_pay)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Subtotal: {money(subtotal)}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        downloadCsv(
                          `disbursement-${prov.toLowerCase().replace(/\W+/g, '-')}-${run.id}.csv`,
                          ['Employee ID', 'Name', 'Reimbursements', 'Net Pay', 'Reference Status'],
                          list.map((e) => [e.employee_id, e.employee_name, e.claims_amount, e.net_pay, e.status])
                        )
                      }
                    >
                      Export CSV
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New Semi-Monthly Payroll Run">
        <form onSubmit={(e) => { e.preventDefault(); createCutoffRun(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-grid-2">
            <Field label="Month">
              <input type="month" className="form-control" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} required />
            </Field>
            <Field label="Cut-off">
              <select className="form-control" value={newHalf} onChange={(e) => setNewHalf(e.target.value)}>
                <option value="first">1st – 15th (First Half)</option>
                <option value="second">16th – End of month (Second Half)</option>
              </select>
            </Field>
          </div>
          {newMonth.includes('-') && (() => {
            const { start, end } = cutoffRange(newMonth, newHalf);
            const payday = offSunday(end);
            return (
              <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 'var(--radius)', fontSize: 13 }}>
                <div>Cover period: <strong>{shortDate(start)} – {shortDate(end)}</strong></div>
                <div style={{ marginTop: 4 }}>
                  Payday: <strong>{shortDate(payday)}</strong>
                  {payday !== end && (
                    <span style={{ color: 'var(--text-muted)' }}> — falls on a Sunday, so pay moves to the preceding workday</span>
                  )}
                </div>
              </div>
            );
          })()}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn ghost" onClick={() => setNewOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={!!busy}>{busy === 'newrun' ? 'Creating…' : 'Create Run'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/* Master-list row + expandable detail */
function FragmentRow({ item, isDraft, canOperate, expanded, onToggleInclude, onInfo }) {
  return (
    <>
      <tr style={{ opacity: item.is_included ? 1 : 0.45 }}>
        <td>
          <input type="checkbox" checked={!!item.is_included} disabled={!isDraft || !canOperate} onChange={onToggleInclude} />
        </td>
        <td>
          <div style={semibold}>{item.employee_name}</div>
          <div style={{ ...muted, fontSize: 11 }}>{item.department}</div>
        </td>
        <td className="num" style={{ fontWeight: 600, color: 'var(--text-main)' }}>{money(item.gross_pay)}</td>
        <td className="num" style={muted}>{money(item.sss_ee)}</td>
        <td className="num" style={muted}>{money(item.philhealth_ee)}</td>
        <td className="num" style={muted}>{money(item.pagibig_ee)}</td>
        <td className="num" style={muted}>{money(item.withholding_tax)}</td>
        <td className="num" style={{ color: 'var(--danger)' }}>{money(item.loans_deduction)}</td>
        <td className="num" style={{ fontWeight: 700, color: 'var(--text-main)' }}>{money(item.net_pay)}</td>
        <td><span className="badge badge-info">{item.ewallet_provider || 'Other'}</span></td>
        <td><Badge>{item.status}</Badge></td>
        <td>
          <button className="btn btn-ghost btn-sm" onClick={onInfo}>Info</button>
        </td>
      </tr>
      {expanded && (
        <DetailRow item={item} colSpan={12} />
      )}
    </>
  );
}
