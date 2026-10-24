import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { api } from '../../api/client.js';
import { Badge, Card, DataTable, Field, Modal, PageHeader } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

const isoToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const EMPTY = { category: '', amount: '', claim_date: isoToday(), description: '' };

export default function MyClaims() {
  const { data, loading, error, reload } = useResource('/api/me/claims');
  const { data: categories } = useResource('/api/claims/categories');
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState(EMPTY);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const open = searchParams.get('new') === '1';

  useEffect(() => {
    if (open) { setForm(EMPTY); setReceipt(null); setFeedback(''); }
  }, [open]);

  function patch(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function onReceipt(file) {
    if (!file) { setReceipt(null); return; }
    if (file.size > 4 * 1024 * 1024) { setFeedback('Receipt image is too large (max ~4MB).'); return; }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the receipt file.'));
        reader.readAsDataURL(file);
      });
      setReceipt({ base64: dataUrl.split(',')[1], mime: file.type || 'image/jpeg', name: file.name });
    } catch (e) {
      setFeedback(e.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    try {
      await api.post('/api/me/claims', {
        ...form,
        amount: Number(form.amount || 0),
        receipt_base64: receipt?.base64,
        receipt_mime: receipt?.mime,
      });
      setSearchParams({}, { replace: true });
      reload();
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setBusy(false);
    }
  }

  const rows = data || [];

  return (
    <>
      <PageHeader title="My Claims" subtitle="Submit reimbursement claims with receipts and track their status." />

      <div className="filters-bar">
        <button className="btn small" onClick={() => setSearchParams({ new: '1' })}>＋ Submit New Claim</button>
      </div>

      <Card body>
        <DataTable
          loading={loading} error={error}
          columns={[
            { key: 'claim_number', label: 'Claim #' },
            { key: 'claim_date', label: 'Date' },
            { key: 'category', label: 'Category' },
            { key: 'description', label: 'Details', render: (r) => <span style={{ maxWidth: 280, display: 'inline-block' }}>{r.description || '—'}</span> },
            { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
            { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
            { key: 'receipt', label: 'Receipt', render: (r) => (r.receipt_file ? <span title={r.receipt_file}>Attached</span> : '—') },
          ]}
          rows={rows} empty="No claims yet — submit your first reimbursement."
        />
      </Card>

      <Modal open={open} onClose={() => setSearchParams({}, { replace: true })} title="Submit a Claim">
        {feedback && <div className="alert error">{feedback}</div>}
        <form onSubmit={submit} className="form-grid">
          <Field label="Category">
            <select className="form-control" value={form.category} onChange={(e) => patch('category', e.target.value)} required>
              <option value="">Select a category…</option>
              {(categories || []).map((c) => <option key={c.id} value={c.name}>{c.name}{c.max_amount ? ` — max ${money(c.max_amount)}` : ''}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Amount (₱)">
              <input type="number" min="0" step="0.01" className="form-control" value={form.amount} onChange={(e) => patch('amount', e.target.value)} required />
            </Field>
            <Field label="Claim date">
              <input type="date" className="form-control" value={form.claim_date} onChange={(e) => patch('claim_date', e.target.value)} required />
            </Field>
          </div>
          <Field label="Description">
            <textarea className="form-control" rows={3} value={form.description} onChange={(e) => patch('description', e.target.value)} placeholder="What was this expense for?" />
          </Field>
          <Field label="Receipt (photo or PDF)">
            <input type="file" className="form-control" accept=".jpg,.jpeg,.png,.application/pdf" onChange={(e) => onReceipt(e.target.files?.[0])} />
            {receipt && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Attached: {receipt.name} — read by OCR on submit</div>}
          </Field>
          <button type="submit" className="btn-block" disabled={busy}>{busy ? 'Submitting…' : 'Submit Claim'}</button>
        </form>
      </Modal>
    </>
  );
}
