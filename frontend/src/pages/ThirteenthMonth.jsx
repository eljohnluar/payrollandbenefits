import { useState } from 'react';
import { useResource } from '../hooks/useResource.js';
import { api } from '../api/client.js';
import { money, shortDate } from '../lib/format.js';
import { PageHeader, StatsGrid, Stat, Card, DataTable, Badge, Notice } from '../components/ui.jsx';

const YEARS = [2024, 2025, 2026, 2027];

export default function ThirteenthMonth() {
  const [year, setYear] = useState('2026');
  const { data, loading, error, reload } = useResource('/api/thirteenth-month' + (year ? `?year=${year}` : ''));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ kind: 'info', msg: '' });

  async function generate() {
    setBusy(true); setNotice({ kind: 'info', msg: '' });
    try {
      const res = await api.post('/api/thirteenth-month/generate', { year: Number(year) });
      setNotice({ kind: 'success', msg: `Generated ${res.generated} records for ${year}.` });
      reload();
    } catch (e) { setNotice({ kind: 'error', msg: e.message }); }
    finally { setBusy(false); }
  }

  async function setStatus(id, status) {
    try { await api.post(`/api/thirteenth-month/${id}/status`, { status }); reload(); }
    catch (e) { setNotice({ kind: 'error', msg: e.message }); }
  }

  const rows = data || [];
  const totalComputed = rows.reduce((a, r) => a + Number(r.computed_amount || 0), 0);
  const totalApproved = rows.filter((r) => r.status === 'Approved' || r.status === 'Paid').reduce((a, r) => a + Number(r.computed_amount || 0), 0);
  const totalPaid = rows.filter((r) => r.status === 'Paid').reduce((a, r) => a + Number(r.computed_amount || 0), 0);
  const pendingRows = rows.filter((r) => r.status === 'Pending');
  const totalPending = pendingRows.reduce((a, r) => a + Number(r.computed_amount || 0), 0);

  const columns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'department', label: 'Department' },
    { key: 'monthly_basic', label: 'Monthly Basic', align: 'right', render: (r) => money(r.monthly_basic) },
    { key: 'months_worked', label: 'Months', align: 'right', render: (r) => `${Number(r.months_worked)} / 12` },
    {
      key: 'computed_amount',
      label: '13th Month Amt',
      align: 'right',
      render: (r) => (
        <div>
          <div style={{ color: 'var(--success)', fontWeight: 700 }}>{money(r.computed_amount)}</div>
          {Number(r.months_worked) < 12 && <div style={{ fontSize: 11, color: 'var(--warning)' }}>Pro-rated</div>}
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <span style={{ display: 'flex', gap: 6 }}>
          {r.status === 'Pending' && <button className="btn btn-success btn-sm" onClick={() => setStatus(r.id, 'Approved')}>Approve</button>}
          {r.status === 'Approved' && <button className="btn btn-primary btn-sm" onClick={() => setStatus(r.id, 'Paid')}>Mark Paid</button>}
          {r.status === 'Paid' && (
            <span className="badge badge-success">Paid{r.payment_date ? ` ${shortDate(r.payment_date)}` : ''}</span>
          )}
        </span>
      ),
    },
  ];

  const foot = ['Total:', '', '', '', money(totalComputed), '', ''];

  return (
    <>
      <PageHeader
        title={`13th Month Pay — ${year}`}
        subtitle="Annual mandatory pro-rated 13th month computation"
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="form-control" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)}>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
            <button className="btn btn-primary" onClick={generate} disabled={busy}>{busy ? 'Working…' : 'Generate'}</button>
          </div>
        }
      />

      <Notice kind={notice.kind}>{notice.msg}</Notice>

      <StatsGrid>
        <Stat label="Total 13th Month Liability" value={money(totalComputed)} />
        <Stat label="Approved Total" value={money(totalApproved)} kind="primary" />
        <Stat label="Paid Total" value={money(totalPaid)} kind="positive" />
        <Stat label="Pending Approval" value={money(totalPending)} sub={`${pendingRows.length} employees`} kind="warning" />
      </StatsGrid>

      <div className="info-banner">
        <span style={{ fontSize: 20 }}>ℹ️</span>
        <div><strong>Formula:</strong> 13th Month Pay = (Monthly Basic Salary × Months Worked) ÷ 12</div>
      </div>

      <Card title="Computation Report">
        <DataTable
          loading={loading} error={error}
          columns={columns}
          rows={rows}
          foot={foot}
          empty={`No 13th-month records for ${year}. Click Generate.`}
        />
      </Card>
    </>
  );
}
