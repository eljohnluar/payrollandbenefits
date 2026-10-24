import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { api } from '../../api/client.js';
import { Badge, Card, DataTable, ErrorBox, Field, Loading, Modal, PageHeader, StatsGrid, Stat } from '../../components/ui.jsx';

const LEAVE_TYPES = ['Vacation Leave', 'Sick Leave', 'Emergency Leave', 'Service Incentive Leave'];

const EMPTY_FORM = { leave_type: 'Vacation Leave', start_date: '', end_date: '', is_paid: true };

export default function MyLeave() {
  const { data, loading, error, reload } = useResource('/api/me/leave');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const balances = data?.balances || [];
  const requests = data?.requests || [];

  function patch(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    try {
      await api.post('/api/me/leave/requests', { ...form, is_paid: form.is_paid ? '1' : '' });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
      reload();
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="My Leave"
        subtitle="Check your leave balances and file leave requests for HR approval."
        right={<button className="btn small" onClick={() => setOpen(true)}>File Leave Request</button>}
      />

      {loading && <Loading />}
      {error && <ErrorBox error={error} />}

      {balances.length > 0 && (
        <StatsGrid>
          {balances.map((b) => (
            <Stat
              key={b.id}
              label={b.leave_type}
              value={`${Number(b.balance)} d left`}
              sub={`${Number(b.accrued)} accrued · ${Number(b.used)} used`}
              kind={Number(b.balance) > 0 ? 'positive' : 'neutral'}
            />
          ))}
        </StatsGrid>
      )}

      {balances.length === 0 && !loading && (
        <Card body style={{ marginTop: loading ? 0 : 16 }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No leave balances recorded for this year yet — contact HR if you expect one.</p>
        </Card>
      )}

      <Card body title="My Leave Requests" style={{ marginTop: 16 }}>
        <DataTable
          columns={[
            { key: 'leave_type', label: 'Type' },
            { key: 'dates', label: 'Period', render: (r) => `${r.start_date} → ${r.end_date}` },
            { key: 'days', label: 'Days', render: (r) => Number(r.days) },
            { key: 'is_paid', label: 'Paid', render: (r) => (r.is_paid ? 'Paid' : 'Unpaid') },
            { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
            { key: 'filed_at', label: 'Filed', render: (r) => new Date(r.filed_at).toLocaleDateString() },
          ]}
          rows={requests}
          empty="No leave requests filed yet."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="File Leave Request">
        {feedback && <div className="alert error">{feedback}</div>}
        <form onSubmit={submit} className="form-grid">
          <Field label="Leave type">
            <select className="form-control" value={form.leave_type} onChange={(e) => patch('leave_type', e.target.value)}>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Start date">
              <input type="date" className="form-control" value={form.start_date} onChange={(e) => patch('start_date', e.target.value)} required />
            </Field>
            <Field label="End date">
              <input type="date" className="form-control" value={form.end_date} onChange={(e) => patch('end_date', e.target.value)} required />
            </Field>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input type="checkbox" checked={form.is_paid} onChange={(e) => patch('is_paid', e.target.checked)} />
              Paid leave
            </label>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Service Incentive Leave can only be filed for April dates. Requests are checked against your
            remaining balance and go to HR for approval.
          </p>
          <button type="submit" className="btn-block" disabled={busy}>{busy ? 'Submitting…' : 'Submit for HR approval'}</button>
        </form>
      </Modal>
    </>
  );
}
