import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader, Card, Notice, TablePagination } from '../components/ui.jsx';

const SYSTEM_COLOR = { HR1: '#2563eb', HR2: '#0891b2', HR3: '#7c3aed' };

const parseTs = (v) => {
  if (!v) return null;
  let s = String(v).trim().replace(' ', 'T');
  s = s.replace(/([+-]\d{2})$/, '$1:00').replace(/([+-]\d{2}:\d{2})\d+$/, '$1');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtDateTime = (v) => {
  const d = parseTs(v);
  return d ? d.toLocaleString('en-PH') : '—';
};
const fmtCount = (v) => (typeof v === 'number' ? v.toLocaleString('en-PH') : v);

function StatusPill({ keys }) {
  const active = keys.filter((k) => k.is_active);
  let label = 'Not connected';
  let cls = 'badge-danger';
  if (active.length) {
    label = active.some((k) => k.last_used_at) ? 'Live' : 'Key issued';
    cls = active.some((k) => k.last_used_at) ? 'badge-success' : 'badge-info';
  }
  return <span className={`badge ${cls}`}>{label}</span>;
}

function PartnerCard({ partner }) {
  const accent = SYSTEM_COLOR[partner.system] || '#334155';
  const [keysPage, setKeysPage] = useState(1);
  const [epPage, setEpPage] = useState(1);
  const keys = partner.keys || [];
  const endpoints = partner.endpoints || [];
  const pagedKeys = keys.length > 10 ? keys.slice((Math.min(Math.max(1, keysPage), Math.max(1, Math.ceil(keys.length / 10))) - 1) * 10, Math.min(Math.max(1, keysPage), Math.max(1, Math.ceil(keys.length / 10))) * 10) : keys;
  const pagedEndpoints = endpoints.length > 10 ? endpoints.slice((Math.min(Math.max(1, epPage), Math.max(1, Math.ceil(endpoints.length / 10))) - 1) * 10, Math.min(Math.max(1, epPage), Math.max(1, Math.ceil(endpoints.length / 10))) * 10) : endpoints;

  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="card-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 800, color: accent, fontSize: 13, letterSpacing: 0.5 }}>{partner.system}</span>
            <StatusPill keys={partner.keys || []} />
          </div>
          <h2 style={{ margin: 0 }}>{partner.name}</h2>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>Direction: {partner.direction}</div>
        </div>
      </div>

      <div className="card-body">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          {(partner.metrics || []).map((m) => (
            <div
              key={m.label}
              style={{ flex: '1 1 130px', minWidth: 120, background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' }}
            >
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)' }}>{m.label}</div>
              <div style={{ fontSize: m.label === 'Last push' ? 13 : 20, fontWeight: 700, marginTop: 3 }}>
                {m.label === 'Last push' ? fmtDateTime(m.value) : fmtCount(m.value)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>API keys</div>
        {keys.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>No keys issued yet.</div>
        ) : (
          <>
            <table style={{ width: '100%', fontSize: 13, marginBottom: 14 }}>
              <tbody>
                {pagedKeys.map((k) => (
                  <tr key={k.name}>
                    <td style={{ fontWeight: 600 }}>{k.name}</td>
                    <td style={{ color: 'var(--muted)' }}>{k.scopes}</td>
                    <td>
                      <span className={`badge ${k.is_active ? 'badge-success' : 'badge-muted'}`}>{k.is_active ? 'Active' : 'Revoked'}</span>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{k.last_used_at ? `Used ${fmtDateTime(k.last_used_at)}` : 'Never used'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              page={Math.min(Math.max(1, keysPage), Math.max(1, Math.ceil(keys.length / 10)))}
              totalItems={keys.length}
              pageSize={10}
              onPageChange={setKeysPage}
            />
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Endpoints</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13 }}>
            <tbody>
              {pagedEndpoints.map((e) => (
                <tr key={e.path}>
                  <td style={{ width: 56 }}>
                    <span className={`badge ${e.method === 'GET' ? 'badge-info' : 'badge-muted'}`}>{e.method}</span>
                  </td>
                  <td><code style={{ fontSize: 12 }}>{e.path}</code></td>
                  <td style={{ color: 'var(--muted)' }}>{e.purpose}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{e.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination
            page={Math.min(Math.max(1, epPage), Math.max(1, Math.ceil(endpoints.length / 10)))}
            totalItems={endpoints.length}
            pageSize={10}
            onPageChange={setEpPage}
          />
        </div>
      </div>
    </div>
  );
}

export default function Integrations() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/integration/status');
      setPartners(res?.partners ?? []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Live REST connections with the partner HRMS modules (HR1, HR2, HR3)"
        right={<button className="btn btn-secondary" onClick={load} disabled={loading}>Refresh</button>}
      />
      <Notice kind="error">{error}</Notice>

      {loading && partners.length === 0 ? (
        <Notice>Loading integrations…</Notice>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
          {partners.map((p) => <PartnerCard key={p.key} partner={p} />)}
        </div>
      )}

      <div className="info-banner" style={{ marginTop: 16 }}>
        <span>ℹ</span>
        <span>
          Each partner authenticates with a scoped <strong>X-Api-Key</strong>. HR1 (Core HR) pushes the employee master and
          pulls payslips; HR2 (Workforce) pushes attendance and leave; HR3 (Performance) pushes evaluations, recognition and
          promotions. Data lands in the modules you already see across this portal.
        </span>
      </div>
    </>
  );
}
