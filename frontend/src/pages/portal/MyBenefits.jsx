import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { api } from '../../api/client.js';
import { Badge, Card, PageHeader, DataTable, Field, Modal } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

export default function MyBenefits() {
  const { data, loading, error, reload } = useResource('/api/me/benefits');
  const [applying, setApplying] = useState(null); // plan being applied for
  const [dependents, setDependents] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const plans = data?.plans || [];
  const enrollments = data?.enrollments || [];

  function openApply(plan) {
    setFeedback('');
    setDependents(0);
    setApplying(plan);
  }

  async function submitApply(event) {
    event.preventDefault();
    if (!applying) return;
    setBusy(true);
    setFeedback('');
    try {
      await api.post('/api/me/benefits/enroll', { plan_id: String(applying.id), dependents });
      setApplying(null);
      reload();
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setBusy(false);
    }
  }

  const alreadyIn = (planId) => enrollments.some((e) => Number(e.plan_id) === Number(planId) && e.status !== 'Cancelled');

  return (
    <>
      <PageHeader
        title="My Benefits"
        subtitle="Enroll in HMO, insurance and other benefit plans. HR reviews each application."
        right={plans.length > 0 && (
          <select
            className="form-control"
            style={{ width: 'auto' }}
            value=""
            onChange={(e) => { const p = plans.find((x) => String(x.id) === e.target.value); if (p) openApply(p); }}
            aria-label="Apply for a benefit plan"
          >
            <option value="" disabled>Apply for a plan…</option>
            {plans.filter((p) => !alreadyIn(p.id)).map((p) => <option key={p.id} value={String(p.id)}>{p.plan_name}</option>)}
          </select>
        )}
      />

      {feedback && !applying && <div className="alert error">{feedback}</div>}

      <div className="plan-cards">
        {loading && <p>Loading plans…</p>}
        {!loading && error && <p className="alert error">{error}</p>}
        {plans.map((p) => (
          <Card key={p.id} body title={p.plan_name}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{p.plan_type} · {p.provider}</div>
            <p style={{ marginTop: 0 }}>{p.description}</p>
            <div className="plan-meta">
              <span>Premium: <strong>{money(p.monthly_premium)}</strong>/mo</span>
              <span>Employee share: <strong>{p.employee_share}%</strong></span>
              <span>Employer share: <strong>{p.employer_share}%</strong></span>
            </div>
            {alreadyIn(p.id) ? (
              <Badge>Already applied</Badge>
            ) : (
              <button className="btn small" onClick={() => openApply(p)}>
                Apply for this plan
              </button>
            )}
          </Card>
        ))}
        {!loading && plans.length === 0 && <p>No benefit plans are available yet.</p>}
      </div>

      <Card body title="My Enrollments">
        <DataTable
          columns={[
            { key: 'plan_name', label: 'Plan' },
            { key: 'provider', label: 'Provider' },
            { key: 'monthly_premium', label: 'Premium', align: 'right', render: (r) => money(r.monthly_premium) },
            { key: 'employee_cost', label: 'My Share', align: 'right', render: (r) => money((Number(r.monthly_premium) || 0) * (Number(r.employee_share) || 0) / 100) },
            { key: 'dependents', label: 'Dependents', align: 'right' },
            { key: 'effective_date', label: 'Effective' },
            { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          ]}
          rows={enrollments}
          empty="No benefit enrollments yet."
        />
      </Card>

      <Modal open={Boolean(applying)} onClose={() => setApplying(null)} title={`Apply — ${applying?.plan_name || ''}`}>
        {applying && (
          <form onSubmit={submitApply}>
            {feedback && <div className="alert error">{feedback}</div>}
            <p style={{ marginTop: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              {applying.plan_type} · {applying.provider} — premium {money(applying.monthly_premium)}/mo,
              you cover {applying.employee_share}% ({money((Number(applying.monthly_premium) || 0) * (Number(applying.employee_share) || 0) / 100)}/mo).
            </p>
            <Field label="Dependents to cover (optional)">
              <input
                className="form-control"
                type="number"
                min="0"
                max="10"
                value={dependents}
                onChange={(e) => setDependents(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            <p className="settings-note">
              Your application goes to HR for review. Until HR approves it, the enrollment shows as Pending
              and nothing is deducted from your pay.
            </p>
            <button type="submit" className="btn-block" disabled={busy} style={{ marginTop: 10 }}>
              {busy ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
