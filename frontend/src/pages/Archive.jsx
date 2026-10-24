import { useResource } from '../hooks/useResource.js';
import { api } from '../api/client.js';
import { useState } from 'react';
import { PageHeader, Card, DataTable, Badge, Notice } from '../components/ui.jsx';

const TYPE_LABELS = {
  employee: 'Employee',
  claim: 'Claim',
  benefit_enrollment: 'Benefit Enrollment',
  payslip: 'Payslip Line',
};

const fmtTs = (v) => {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T').replace(/\+00$/, '+00:00'));
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 19) : d.toLocaleString();
};

export default function Archive() {
  const { data, loading, error, reload } = useResource('/api/archive');
  const [notice, setNotice] = useState({ kind: 'info', msg: '' });
  const [busy, setBusy] = useState(null);

  async function restore(row) {
    if (!window.confirm(`Restore ${TYPE_LABELS[row.entity_type] || row.entity_type} "${row.label}" from the archive?`)) return;
    setBusy(row.id);
    try {
      await api.post(`/api/archive/${row.id}/restore`);
      setNotice({ kind: 'success', msg: `"${row.label}" was restored.` });
      reload();
    } catch (e) {
      setNotice({ kind: 'error', msg: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Archive"
        subtitle="Deleted records are preserved here — restore anything that was removed by mistake."
      />
      <Notice kind={notice.kind}>{notice.msg}</Notice>
      <Card title="Archived Records">
        <DataTable
          loading={loading}
          error={error}
          columns={[
            { key: 'entity_type', label: 'Type', render: (r) => <Badge>{TYPE_LABELS[r.entity_type] || r.entity_type}</Badge> },
            { key: 'label', label: 'Record', render: (r) => <span style={{ fontWeight: 600 }}>{r.label}</span> },
            { key: 'archived_by_name', label: 'Deleted by', render: (r) => r.archived_by_name || 'System' },
            { key: 'archived_at', label: 'Date', render: (r) => fmtTs(r.archived_at) },
            {
              key: 'status',
              label: 'Status',
              render: (r) => (r.restored_at ? <span className="badge badge-success">Restored</span> : <span className="badge badge-muted">Archived</span>),
            },
            {
              key: 'actions',
              label: '',
              align: 'right',
              render: (r) => !r.restored_at && (
                <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => restore(r)}>
                  {busy === r.id ? 'Restoring…' : 'Restore'}
                </button>
              ),
            },
          ]}
          rows={data || []}
          empty="Nothing archived yet. Deleted employees, claims, enrollments and payslips land here."
        />
      </Card>
    </>
  );
}
