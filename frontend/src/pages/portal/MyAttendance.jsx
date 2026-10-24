import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { api } from '../../api/client.js';
import { Badge, Card, Field, Modal, PageHeader, DataTable } from '../../components/ui.jsx';

const pad = (n) => String(n).padStart(2, '0');

function cutoffWindow(month, half) {
  const [y, m] = String(month).split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return half === 'first'
    ? { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-15` }
    : { start: `${y}-${pad(m)}-16`, end: `${y}-${pad(m)}-${pad(lastDay)}` };
}

const EMPTY_FORM = {
  cutoff_start: '', cutoff_end: '', details: '', location: '',
  add_present_days: 0, add_half_days: 0, remove_absent_days: 0, add_ot_hours: 0,
};

export default function MyAttendance() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [half, setHalf] = useState(now.getDate() <= 15 ? 'first' : 'second');
  const { start, end } = useMemo(() => cutoffWindow(month, half), [month, half]);
  const { data, loading, error, reload } = useResource(`/api/me/attendance?cutoff_start=${start}&cutoff_end=${end}`);
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState({ ...EMPTY_FORM, cutoff_start: start, cutoff_end: end });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => setForm((f) => ({ ...f, cutoff_start: start, cutoff_end: end })), [start, end]);

  const row = (data?.cutoffs || [])[0];
  const adjustments = data?.adjustments || [];
  const open = searchParams.get('adjust') === '1';

  function patch(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    try {
      await api.post('/api/me/attendance/adjustments', form);
      setSearchParams({}, { replace: true });
      setForm({ ...EMPTY_FORM, cutoff_start: start, cutoff_end: end });
      reload();
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setBusy(false);
    }
  }

  const num = (v) => Number(v ?? 0);

  return (
    <>
      <PageHeader title="My Attendance" subtitle="Attendance is recorded per cut-off period, not per day." />

      <div className="filters-bar">
        <input type="month" className="form-control" value={month} onChange={(e) => setMonth(e.target.value)} />
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <button className={`btn small${half === 'first' ? '' : ' ghost'}`} onClick={() => setHalf('first')}>1st – 15th</button>
          <button className={`btn small${half === 'second' ? '' : ' ghost'}`} onClick={() => setHalf('second')}>16th – month end</button>
        </span>
        <button className="btn small" onClick={() => setSearchParams({ adjust: '1' })}>Request Adjustment</button>
      </div>

      <Card body title={`Cut-off ${start} → ${end}`}>
        {loading && <p>Loading…</p>}
        {error && <p className="alert error">{error}</p>}
        {!loading && !error && (row?.recorded ? (
          <div className="cutoff-summary-grid">
            <div><span>Present (P)</span><strong>{num(row.present_days)} days</strong></div>
            <div><span>Half-day (H)</span><strong>{num(row.half_days)} days</strong></div>
            <div><span>Absent (A)</span><strong>{num(row.absent_days)} days</strong></div>
            <div><span>Overtime (OT)</span><strong>{num(row.ot_days)} days / {Number(row.ot_hours || 0).toFixed(1)} h</strong></div>
            <div><span>Total Days Worked</span><strong>{num(row.days_worked)} days</strong></div>
            <div><span>Total Absences</span><strong>{num(row.total_absences)} days</strong></div>
            {row.remarks && <div className="cutoff-remarks"><span>Remarks</span><em>{row.remarks}</em></div>}
          </div>
        ) : (
          <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
            No cut-off record yet for this period — HR usually records it right after the cut-off ends.
            If you were off-site (driving, field work) and cannot be captured, file an adjustment request.
          </p>
        ))}
      </Card>

      <Card body title="My Adjustment Requests" style={{ marginTop: 16 }}>
        <DataTable
          columns={[
            { key: 'cutoff', label: 'Cut-off', render: (r) => `${r.cutoff_start} → ${r.cutoff_end}` },
            { key: 'details', label: 'Details', render: (r) => (
              <div style={{ maxWidth: 320 }}>
                <div>{r.details}</div>
                {r.location && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Where: {r.location}</div>}
              </div>
            ) },
            { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
            { key: 'filed', label: 'Filed', render: (r) => new Date(r.created_at).toLocaleDateString() },
          ]}
          rows={adjustments}
          empty="No adjustment requests yet."
        />
      </Card>

      <Modal open={open} onClose={() => setSearchParams({}, { replace: true })} title="Attendance Adjustment Request">
        {feedback && <div className="alert error">{feedback}</div>}
        <form onSubmit={submit} className="form-grid">
          <Field label="Cut-off period">
            <input className="form-control" value={`${start} → ${end}`} readOnly />
          </Field>
          <Field label="Where were you and what did you do? (required)">
            <textarea className="form-control" rows={3} value={form.details} onChange={(e) => patch('details', e.target.value)} placeholder="e.g. On the road delivering packages across Cavite the whole day; could not log attendance." required />
          </Field>
          <Field label="Location / route (optional)">
            <input className="form-control" value={form.location} onChange={(e) => patch('location', e.target.value)} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Add present days">
              <input type="number" min="0" className="form-control" value={form.add_present_days} onChange={(e) => patch('add_present_days', e.target.value)} />
            </Field>
            <Field label="Remove absent days">
              <input type="number" min="0" className="form-control" value={form.remove_absent_days} onChange={(e) => patch('remove_absent_days', e.target.value)} />
            </Field>
            <Field label="Add half-days">
              <input type="number" min="0" className="form-control" value={form.add_half_days} onChange={(e) => patch('add_half_days', e.target.value)} />
            </Field>
            <Field label="Add OT hours">
              <input type="number" min="0" step="0.5" className="form-control" value={form.add_ot_hours} onChange={(e) => patch('add_ot_hours', e.target.value)} />
            </Field>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            HR reviews the request. Once approved, the cut-off attendance record is updated automatically.
          </p>
          <button type="submit" className="btn-block" disabled={busy}>{busy ? 'Submitting…' : 'Submit for HR review'}</button>
        </form>
      </Modal>
    </>
  );
}
