import { useEffect, useMemo, useState } from 'react';
import { useResource } from '../hooks/useResource.js';
import { api } from '../api/client.js';
import { PageHeader, Card, Badge, Notice, ErrorBox, Loading, money, TablePagination } from '../components/ui.jsx';

const STATUSES = ['Pending', 'Approved', 'Rejected', 'Paid'];

const OCR_KIND = { Passed: 'success', Flagged: 'error', Error: 'error', 'No receipt': 'info', Skipped: 'info' };


function ReceiptOcrPanel({ detail }) {
  let flags = [];
  try {
    flags = detail.ocr_flags ? (typeof detail.ocr_flags === 'string' ? JSON.parse(detail.ocr_flags) : detail.ocr_flags) : [];
  } catch { flags = [String(detail.ocr_flags)]; }
  const fields = [
    ['Merchant', detail.ocr_merchant],
    ['Receipt date', detail.ocr_receipt_date],
    ['Amount', detail.ocr_amount !== null && detail.ocr_amount !== undefined ? money(detail.ocr_amount) : null],
    ['OR / Invoice', detail.ocr_or_number],
    ['TIN', detail.ocr_tin],
    ['Confidence', detail.ocr_confidence !== null && detail.ocr_confidence !== undefined ? `${detail.ocr_confidence}%` : null],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          Receipt OCR{detail.ocr_provider === 'tabscanner' ? ' (Tabscanner)' : detail.ocr_provider === 'google-vision' ? ' (Google Vision)' : ''}
        </span>
        <span className={`badge badge-${OCR_KIND[detail.ocr_status] || 'muted'}`}>{detail.ocr_status}</span>
      </div>
      {fields.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          {fields.map(([label, value]) => (
            <div key={label}><span style={{ fontWeight: 600 }}>{label}:</span> {String(value)}</div>
          ))}
        </div>
      )}
      {flags.length > 0 && (
        <div className="alert error" style={{ marginTop: 8, marginBottom: 0 }}>
          {flags.map((f) => <div key={f}>{f}</div>)}
        </div>
      )}
    </div>
  );
}

export default function Claims() {
  // Only HR Admin reaches this page now; payment itself is executed in the Finance module.
  const canReview = true;
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useResource('/api/claims');
  const [notice, setNotice] = useState({ kind: 'info', msg: '' });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  const claims = data || [];
  const counts = useMemo(() => {
    const map = {};
    for (const c of claims) map[c.status] = (map[c.status] || 0) + 1;
    return map;
  }, [claims]);
  const rows = status ? claims.filter((c) => c.status === status) : claims;

  useEffect(() => {
    if (!selectedId) { setDetail(null); return undefined; }
    let alive = true;
    api.get(`/api/claims/${selectedId}`)
      .then((payload) => { if (alive) setDetail(payload?.data ?? payload); })
      .catch((e) => { if (alive) setNotice({ kind: 'error', msg: e.message }); });
    return () => { alive = false; };
  }, [selectedId]);

  async function decide(id, next) {
    try {
      const updated = await api.post(`/api/claims/${id}/decision`, { status: next });
      setNotice({ kind: 'success', msg: `Claim marked ${next}.${next === 'Approved' ? ' Payment is handled by the external Finance module.' : ''}` });
      setDetail(updated?.data ?? updated);
      reload();
    } catch (e) {
      setNotice({ kind: 'error', msg: e.message });
    }
  }

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalClaims = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalClaims / pageSize));
  const validPage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    setPage(1);
  }, [status, totalClaims]);

  const pagedRows = totalClaims > pageSize
    ? rows.slice((validPage - 1) * pageSize, validPage * pageSize)
    : rows;

  return (
    <>
      <PageHeader title="Claims Management" subtitle="Employees file reimbursement claims from their portal; review and process them here." />
      <Notice kind={notice.kind}>{notice.msg}</Notice>
      <div className="filters-bar">
        <select className="form-control" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Claims ({claims.length})</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s} ({counts[s] || 0})</option>)}
        </select>
      </div>
      <div className="claims-grid">
        <Card title="Claims">
          {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Employee</th><th>Category</th><th>Amount</th><th>Receipt Date</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {pagedRows.length ? pagedRows.map((c) => (
                      <tr key={c.id} style={selectedId === c.id ? { background: 'var(--primary-light)' } : undefined}>
                        <td style={{ fontWeight: 600 }}>{c.employee_name}</td>
                        <td>{c.category}</td>
                        <td>{money(c.amount)}</td>
                        <td>{c.claim_date}</td>
                        <td><Badge>{c.status}</Badge></td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedId(c.id)}>View</button>
                        </td>
                      </tr>
                    )) : <tr><td colSpan={6} className="empty-state">No claims found.</td></tr>}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={validPage}
                totalItems={totalClaims}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </>
          )}
        </Card>
        <Card title="Claim Detail" body>
          {detail ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{money(detail.amount)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{detail.claim_number}</div>
                </div>
                <Badge>{detail.status}</Badge>
              </div>
              <div style={{ fontSize: 13 }}>
                <div style={{ marginBottom: 8 }}><span style={{ color: 'var(--text-muted)' }}>Employee:</span> {detail.employee_name}</div>
                <div style={{ marginBottom: 8 }}><span style={{ color: 'var(--text-muted)' }}>Category:</span> {detail.category}</div>
                <div style={{ marginBottom: 8 }}><span style={{ color: 'var(--text-muted)' }}>Receipt date:</span> {detail.claim_date}</div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Business purpose</div>
                  <div style={{ background: 'var(--surface-alt)', padding: 10, borderRadius: 'var(--radius)', whiteSpace: 'pre-wrap' }}>
                    {detail.description || '—'}
                  </div>
                </div>
                {detail.ocr_status && <ReceiptOcrPanel detail={detail} />}
              </div>
              {detail.status === 'Pending' && canReview && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-success" style={{ flex: 1 }} onClick={() => decide(detail.id, 'Approved')}>Approve</button>
                  <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => decide(detail.id, 'Rejected')}>Reject</button>
                </div>
              )}
              {detail.status === 'Approved' && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Approved — reimbursement payment is processed by the external Finance module.
                  </div>
                </div>
              )}
              {detail.status === 'Paid' && detail.disbursed_at && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
                  Disbursed by Finance on {String(detail.disbursed_at).slice(0, 10)}.
                </div>
              )}
            </>
          ) : (
            <div className="empty-state"><p>Select a claim to review its receipt and business purpose.</p></div>
          )}
        </Card>
      </div>
    </>
  );
}
