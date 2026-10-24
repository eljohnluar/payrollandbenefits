import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../api/client.js';
import { PageHeader, Card, DataTable, Badge, Notice, Modal } from '../components/ui.jsx';

const parseTs = (iso) => new Date(String(iso).replace(' ', 'T').replace(/\+00$/, '+00:00'));
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = parseTs(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString();
};
const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = parseTs(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(11, 19) : d.toLocaleTimeString();
};

const shortenDetails = (details) => {
  if (!details) return '—';
  const text = typeof details === 'string' ? details : JSON.stringify(details);
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
};

export default function AuditLog() {
  const [filters, setFilters] = useState({ search: '', module: '', date_from: '', date_to: '' });
  const [rows, setRows] = useState([]);
  const [modules, setModules] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPw, setResetPw] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/audit' + qs({ ...filters, limit: 300 }));
      setRows(res?.data ?? []);
      setModules(res?.modules ?? []);
      setTotal(res?.total ?? 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  async function resetNow(event) {
    event.preventDefault();
    setResetBusy(true);
    setResetError('');
    try {
      const res = await api.post('/api/audit/reset', { password: resetPw });
      setResetOpen(false);
      setResetPw('');
      setNotice(`Audit log cleared — ${res.deleted} entr${res.deleted === 1 ? 'y' : 'ies'} removed.`);
      load();
    } catch (e) {
      setResetError(e.message);
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Every user action with date, time and IP address"
        right={
          <>
            <span className="badge badge-muted">{total} entries</span>
            <button className="btn btn-danger" style={{ marginLeft: 10 }} onClick={() => { setResetOpen(true); setResetError(''); }}>
              Reset Log
            </button>
          </>
        }
      />
      <Notice kind="error">{error}</Notice>
      {notice && <Notice kind="success">{notice}</Notice>}

      <div className="filters-bar">
        <input className="form-control" placeholder="Search action or details…" value={filters.search} onChange={set('search')} style={{ maxWidth: 260 }} />
        <select className="form-control" value={filters.module} onChange={set('module')} style={{ maxWidth: 180 }}>
          <option value="">All modules</option>
          {modules.map((m) => <option key={m}>{m}</option>)}
        </select>
        <input className="form-control" type="date" value={filters.date_from} onChange={set('date_from')} style={{ maxWidth: 170 }} title="Date from" />
        <input className="form-control" type="date" value={filters.date_to} onChange={set('date_to')} style={{ maxWidth: 170 }} title="Date to" />
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      <Card title="User Actions">
        <DataTable
          loading={loading}
          columns={[
            { key: 'date', label: 'Date', render: (r) => fmtDate(r.created_at) },
            { key: 'time', label: 'Time', render: (r) => fmtTime(r.created_at) },
            { key: 'user_name', label: 'User', render: (r) => <span style={{ fontWeight: 600 }}>{r.user_name || 'System'}</span> },
            { key: 'action', label: 'Action', render: (r) => <Badge>{r.action}</Badge> },
            { key: 'module', label: 'Module' },
            { key: 'ip_address', label: 'IP Address', render: (r) => <code style={{ fontSize: 12 }}>{r.ip_address || '—'}</code> },
            { key: 'details', label: 'Details', render: (r) => <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{shortenDetails(r.details)}</span> },
          ]}
          rows={rows}
          empty="No matching audit entries."
        />
      </Card>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset audit log">
        <form onSubmit={resetNow}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
            This permanently deletes every audit entry. Your login password is required to confirm.
          </p>
          {resetError && <div className="alert error">{resetError}</div>}
          <div className="field">
            <label htmlFor="audit-reset-pw">Password</label>
            <input
              id="audit-reset-pw"
              type="password"
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setResetOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={resetBusy || !resetPw}>
              {resetBusy ? 'Clearing…' : 'Clear audit log'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
