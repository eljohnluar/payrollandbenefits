import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { money } from '../lib/format.js';
import { useRealtime } from '../hooks/useRealtime.js';
import { useResource } from '../hooks/useResource.js';
import { PageHeader, StatsGrid, Stat, Card, DataTable, Badge, statusBadge, ErrorBox, Loading, TablePagination } from '../components/ui.jsx';

const shortDate = (v) => (v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

function PayrollTrendChart({ trend }) {
  const chartW = 560; const chartH = 230; const padL = 8; const padR = 8; const padT = 26; const padB = 36;
  const plotW = chartW - padL - padR; const plotH = chartH - padT - padB;
  let maxVal = 1;
  trend.forEach((t) => { maxVal = Math.max(maxVal, Number(t.total_gross), Number(t.total_net)); });
  maxVal = Math.ceil(maxVal / 1000) * 1000;
  const n = trend.length;
  const grossPts = []; const netPts = []; const xLabels = [];
  trend.forEach((t, i) => {
    const x = padL + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
    grossPts.push(`${x.toFixed(1)},${(padT + plotH - (Number(t.total_gross) / maxVal) * plotH).toFixed(1)}`);
    netPts.push(`${x.toFixed(1)},${(padT + plotH - (Number(t.total_net) / maxVal) * plotH).toFixed(1)}`);
    xLabels.push({ x: x.toFixed(1), period: t.period, net: Number(t.total_net) });
  });
  if (!n) return <div className="empty-state">No payroll history recorded yet.</div>;
  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Payroll trends line chart">
      {[0, 1, 2, 3, 4].map((g) => {
        const y = (padT + (plotH * g) / 4).toFixed(1);
        const val = maxVal * (1 - g / 4);
        return (
          <g key={g}>
            <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />
            <text x={padL} y={Number(y) - 4} fontSize="10" fill="var(--text-muted)">₱{Math.round(val / 1000)}k</text>
          </g>
        );
      })}
      <polyline points={grossPts.join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={netPts.join(' ')} fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {grossPts.map((gp, i) => {
        const [cx, cy] = gp.split(',');
        const [nx, ny] = netPts[i].split(',');
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="4" fill="var(--primary)" stroke="var(--surface)" strokeWidth="1.5" />
            <circle cx={nx} cy={ny} r="4" fill="var(--success)" stroke="var(--surface)" strokeWidth="1.5" />
            <text x={cx} y={chartH - 20} fontSize="10" fill="var(--text-muted)" textAnchor="middle">{xLabels[i].period}</text>
            <text x={cx} y={chartH - 7} fontSize="10" fontWeight="600" fill="var(--success)" textAnchor="middle">₱{xLabels[i].net.toLocaleString('en-PH', { maximumFractionDigits: 0 })}</text>
          </g>
        );
      })}
      <g fontSize="11" fill="var(--text-muted)">
        <rect x={chartW - 176} y="4" width="10" height="10" rx="2" fill="var(--primary)" />
        <text x={chartW - 162} y="13">Gross</text>
        <rect x={chartW - 106} y="4" width="10" height="10" rx="2" fill="var(--success)" />
        <text x={chartW - 92} y="13">Net</text>
      </g>
    </svg>
  );
}

function Calendar() {
  const now = new Date();
  const firstDow = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  const cells = [];
  for (let b = 0; b < firstDow; b++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, textAlign: 'center' }}>
      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((wd) => (
        <div key={wd} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '4px 0' }}>{wd}</div>
      ))}
      {cells.map((d, i) => (
        <div
          key={i}
          style={{
            padding: '6px 0', fontSize: 12, borderRadius: 'var(--radius)',
            ...(d === today ? { background: 'var(--primary)', color: '#fff', fontWeight: 700 } : { color: 'var(--text-main)' }),
          }}
        >
          {d ?? ''}
        </div>
      ))}
    </div>
  );
}

function activityText(details) {
  if (!details) return '';
  try {
    const obj = typeof details === 'string' ? JSON.parse(details) : details;
    return obj.message || Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(' · ');
  } catch {
    return String(details);
  }
}

function AnnouncementsCard() {
  const { data, loading, reload } = useResource('/api/announcements');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = data || [];

  async function post(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/announcements', { title, body });
      setTitle('');
      setBody('');
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Announcements" body>
      <p style={{ marginTop: 0, fontSize: 12, color: 'var(--text-muted)' }}>
        Posts appear on every employee&apos;s dashboard under &quot;Latest Announcement&quot;.
      </p>
      {error && <div className="alert error">{error}</div>}
      <form onSubmit={post} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <input className="form-control" placeholder="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
        <textarea className="form-control" rows={2} placeholder="Message for all employees (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
        <div><button type="submit" className="btn btn-secondary btn-sm" disabled={busy}>{busy ? 'Posting…' : 'Post announcement'}</button></div>
      </form>
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && items.length === 0 && <div className="empty-state">No announcements yet.</div>}
      {items.slice(0, 5).map((a) => (
        <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{shortDate(a.created_at)}</span>
          </div>
          {a.body && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.55 }}>{a.body}</p>}
          <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>Posted by {a.created_by}</div>
        </div>
      ))}
    </Card>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const { data: inc } = useResource('/api/incentives/summary');
  const [error, setError] = useState('');
  const [paPage, setPaPage] = useState(1);
  const [topPage, setTopPage] = useState(1);

  const load = useCallback(() => {
    api.get('/api/dashboard/summary').then(setSummary).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);
  useRealtime('payroll_runs', load);

  const runColumns = [
    { key: 'period', label: 'Period' },
    { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'total_gross', label: 'Gross', align: 'right', render: (r) => money(r.total_gross) },
    { key: 'total_deductions', label: 'Deductions', align: 'right', render: (r) => money(r.total_deductions) },
    { key: 'total_net', label: 'Net', align: 'right', render: (r) => money(r.total_net) },
  ];

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const maxSal = summary?.department_breakdown?.length
    ? Math.max(...summary.department_breakdown.map((d) => Number(d.total_sal)), 1)
    : 1;

  return (
    <>
      <PageHeader
        title="Payroll Dashboard"
        subtitle={today}
        right={<button className="btn btn-secondary" onClick={load}>Refresh</button>}
      />

      <ErrorBox error={error} />
      {!summary && !error && <Loading text="Loading summary…" />}

      {summary && (
        <>
          <StatsGrid>
            <Stat label="Tax & Contributions" value={money(summary.latest_contributions)} sub="Latest payroll statutory deductions" />
            <Stat
              label={`Total Payroll (${summary.latest_run?.period ?? 'N/A'})`}
              value={money(summary.latest_run?.total_gross)}
              sub={`Net: ${money(summary.latest_run?.total_net)} (${summary.latest_run?.status ?? 'N/A'})`}
              kind={summary.latest_run?.status === 'Paid' ? 'positive' : 'warning'}
            />
            <Stat
              label="Awaiting Finance Approval"
              value={summary.pending_approvals?.length ?? 0}
              sub={`${money(summary.pending_finance_amount)} pending disbursement`}
              kind={summary.pending_approvals?.length > 0 ? 'warning' : 'neutral'}
            />
            <Stat label="Benefits & Coverage" value={summary.active_benefits} sub={`${summary.claims.pending_count} claims awaiting review`} />
            <Stat label="Employees" value={summary.employees.total} sub={`${summary.employees.active} active`} />
          </StatsGrid>

          <AnnouncementsCard />

          {summary.pending_approvals?.length > 0 && (
            <Card>
              <div className="card-header" style={{ borderLeft: '4px solid var(--warning)' }}>
                <div>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>📤 Payroll Runs Submitted for Finance Approval</h2>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                    Approval and disbursement are handled by the external Finance module — this system prepares and submits the payroll.
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Period</th><th>Submitted By</th><th>Gross Pay</th><th>Total Deductions</th><th>Net Disbursement</th><th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.pending_approvals.length > 10
                      ? summary.pending_approvals.slice((Math.min(Math.max(1, paPage), Math.max(1, Math.ceil(summary.pending_approvals.length / 10))) - 1) * 10, Math.min(Math.max(1, paPage), Math.max(1, Math.ceil(summary.pending_approvals.length / 10))) * 10)
                      : summary.pending_approvals
                    ).map((pa) => (
                      <tr key={pa.payroll_run_id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{pa.period}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{shortDate(pa.period_start)} – {shortDate(pa.period_end)}</div>
                        </td>
                        <td>
                          <div>{pa.submitter_name || 'HR'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{shortDate(pa.submitted_at)}</div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{money(pa.total_gross)}</td>
                        <td style={{ color: 'var(--danger)' }}>-{money(pa.total_deductions)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--success)' }}>{money(pa.total_net)}</td>
                        <td><span className="badge badge-warning">Pending Finance</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <Link className="btn btn-secondary btn-sm" to="/payroll-run">Review</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={Math.min(Math.max(1, paPage), Math.max(1, Math.ceil(summary.pending_approvals.length / 10)))}
                totalItems={summary.pending_approvals.length}
                pageSize={10}
                onPageChange={setPaPage}
              />
            </Card>
          )}

          <div className="grid-2">
            <Card
              title="Payroll Trends"
              right={<span className="badge badge-primary">{summary.payroll_trend?.length ?? 0} Cycles</span>}
              body
            >
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Financial Reporting Subsystem</div>
              <PayrollTrendChart trend={summary.payroll_trend ?? []} />
            </Card>

            <Card
              title="Calendar"
              right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>}
              body
            >
              <Calendar />
            </Card>
          </div>

          <div className="grid-2">
            <Card title="Department Payroll Breakdown" body>
              {summary.department_breakdown?.length ? summary.department_breakdown.map((d) => (
                <div key={d.department} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{d.department} ({d.emp_count})</span>
                    <span style={{ color: 'var(--text-muted)' }}>{money(d.total_sal)}</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${(Number(d.total_sal) / maxSal) * 100}%` }} />
                  </div>
                </div>
              )) : <div className="empty-state">No department data found.</div>}
            </Card>

            <Card title="Claims & Reimbursements" body>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div style={{ padding: 16, background: 'var(--surface-alt)', borderRadius: 'var(--radius)' }}>
                  <div className="stat-label">Pending Claims</div>
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>{summary.claims.pending_count}</div>
                </div>
                <div style={{ padding: 16, background: 'var(--surface-alt)', borderRadius: 'var(--radius)' }}>
                  <div className="stat-label">Approved & Paid</div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>{summary.approved_claims}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total Claims Logged: <strong>{summary.total_claims}</strong></span>
                <Link to="/claims" className="badge badge-primary">View Claims →</Link>
              </div>
            </Card>
          </div>

          {inc && (inc.by_type?.length > 0 || Number(inc.totals?.total) > 0) && (
            <div className="grid-2">
              <Card title="Incentives Overview" right={<Link to="/compensation" className="btn btn-secondary btn-sm">Manage</Link>} body>
                <div className="grid-2" style={{ marginBottom: 16 }}>
                  <div style={{ padding: 16, background: 'var(--surface-alt)', borderRadius: 'var(--radius)' }}>
                    <div className="stat-label">Total Incentives</div>
                    <div className="stat-value" style={{ color: 'var(--success)' }}>{money(inc.totals?.total)}</div>
                  </div>
                  <div style={{ padding: 16, background: 'var(--surface-alt)', borderRadius: 'var(--radius)' }}>
                    <div className="stat-label">Awaiting Payroll</div>
                    <div className="stat-value" style={{ color: 'var(--warning)' }}>{money(inc.totals?.pending)}</div>
                  </div>
                </div>
                {inc.by_type?.slice(0, 4).map((t) => (
                  <div key={t.type} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{t.type}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{money(t.total)}</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${(Number(t.total) / Math.max(...inc.by_type.map((x) => Number(x.total)), 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </Card>
              <Card title="Top Incentive Earners" body>
                <table style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr><th>Employee</th><th style={{ textAlign: 'right' }}>YTD Incentives</th></tr>
                  </thead>
                  <tbody>
                    {((inc.top_earners || []).length > 10
                      ? (inc.top_earners || []).slice((Math.min(Math.max(1, topPage), Math.max(1, Math.ceil((inc.top_earners || []).length / 10))) - 1) * 10, Math.min(Math.max(1, topPage), Math.max(1, Math.ceil((inc.top_earners || []).length / 10))) * 10)
                      : (inc.top_earners || [])
                    ).map((t) => (
                      <tr key={t.employee_id}>
                        <td style={{ fontWeight: 600 }}>{t.name}</td>
                        <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{money(t.total)}</td>
                      </tr>
                    ))}
                    {!inc.top_earners?.length && <tr><td colSpan={2} style={{ color: 'var(--text-muted)' }}>No incentives recorded yet.</td></tr>}
                  </tbody>
                </table>
                <TablePagination
                  page={Math.min(Math.max(1, topPage), Math.max(1, Math.ceil((inc.top_earners || []).length / 10)))}
                  totalItems={(inc.top_earners || []).length}
                  pageSize={10}
                  onPageChange={setTopPage}
                />
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  Monthly trend: {(inc.monthly_trend || []).slice(0, 3).map((m) => `${m.period} ${money(m.total)}`).join('  ·  ') || '—'}
                </div>
              </Card>
            </div>
          )}

          <div className="grid-2">
            <Card title="Recent Payroll Items" right={<Link to="/payroll-run" className="btn btn-secondary btn-sm">Payroll Run</Link>}>
              <DataTable
                columns={[
                  { key: 'employee_name', label: 'Employee', render: (r) => <span style={{ fontWeight: 600 }}>{r.employee_name}</span> },
                  { key: 'net_pay', label: 'Net Pay', align: 'right', render: (r) => money(r.net_pay) },
                  { key: 'pay_date', label: 'Pay Date', render: (r) => shortDate(r.pay_date) },
                  { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span> },
                ]}
                rows={summary.recent_payroll_items}
                empty="No recent payroll items found."
              />
            </Card>

            <Card title="Recent Activity Feed" body>
              {summary.activity?.length ? (
                <div style={{ margin: -20 }}>
                  {summary.activity.map((log, i) => (
                    <div key={i} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 13 }}>{log.action}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{shortDate(log.created_at)}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{activityText(log.details)}</p>
                      <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>By: {log.user_name || 'System'}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="empty-state">No recent activity.</div>}
            </Card>
          </div>

          <Card title="Recent payroll runs">
            <DataTable
              columns={runColumns}
              rows={summary.payroll_trend}
              empty="No payroll runs yet. Open one from the Payroll Run page."
            />
          </Card>
        </>
      )}
    </>
  );
}
