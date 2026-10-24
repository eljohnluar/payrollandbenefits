import { useState } from 'react';
import { useResource } from '../hooks/useResource.js';
import { api } from '../api/client.js';
import { PageHeader, Field, Badge, Modal, Notice, Loading, ErrorBox, money } from '../components/ui.jsx';

const EMPTY = { plan_code: '', plan_name: '', plan_type: 'HMO', provider: '', monthly_premium: '', employer_share: 80, employee_share: 20, description: '', is_active: true };

function planIcon(name = '') {
  const n = name.toLowerCase();
  if (/(health|medical|hmo)/.test(n)) return '❤️';
  if (/(life|insurance|protect)/.test(n)) return '🛡️';
  if (/(retirement|savings|financial)/.test(n)) return '💰';
  return '📋';
}

export default function BenefitPlans() {
  const { data, loading, error, reload } = useResource('/api/benefit-plans/all');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ kind: 'info', msg: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function openCreate() { setForm(EMPTY); setEditing({}); }
  function openEdit(p) { setForm({ ...EMPTY, ...p }); setEditing({ id: p.id }); }

  const premium = Number(form.monthly_premium || 0);
  const companyPct = Number(form.employer_share || 0);
  const eePct = Math.max(0, 100 - companyPct);
  const eeImpact = premium * (eePct / 100);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setNotice({ kind: 'info', msg: '' });
    const payload = { ...form, monthly_premium: Number(form.monthly_premium || 0), employer_share: Number(form.employer_share || 0), employee_share: Number(100 - (form.employer_share || 0)), is_active: !!form.is_active };
    try {
      if (editing?.id) await api.patch(`/api/benefit-plans/${editing.id}`, payload);
      else await api.post('/api/benefit-plans', payload);
      setEditing(null); reload();
    } catch (err) { setNotice({ kind: 'error', msg: err.message }); }
    finally { setBusy(false); }
  }

  async function deactivate(p) {
    if (!window.confirm(`Deactivate ${p.plan_name}?`)) return;
    try { await api.del(`/api/benefit-plans/${p.id}`); reload(); }
    catch (err) { setNotice({ kind: 'error', msg: err.message }); }
  }

  const plans = data || [];

  return (
    <>
      <PageHeader title="Manage Benefit Plans" subtitle="Company-provided healthcare, insurance, and retirement plans catalog" right={<button className="btn btn-primary" onClick={openCreate}>Add Plan</button>} />
      <Notice kind={notice.kind}>{notice.msg}</Notice>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : plans.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state"><p>No benefit plans.</p></div></div></div>
      ) : (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {plans.map((p) => {
            const prem = Number(p.monthly_premium || 0);
            const erPct = Number(p.employer_share || 0);
            const eePctPlan = p.employee_share != null && p.employee_share !== '' ? Number(p.employee_share) : Math.max(0, 100 - erPct);
            return (
              <div className="card" key={p.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 24, background: 'var(--primary-light)', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius)', flexShrink: 0 }}>
                    {planIcon(p.plan_name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 16, color: 'var(--text-main)', margin: 0 }}>{p.plan_name} {!p.is_active && <Badge>Inactive</Badge>}</h3>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.provider}</div>
                  </div>
                </div>
                <div className="card-body" style={{ flex: 1 }}>
                  <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>{p.description || 'No description provided.'}</p>
                  <div style={{ background: 'var(--surface-alt)', padding: 12, borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                      <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11 }}>Total Premium</span>
                      <strong style={{ color: 'var(--text-main)' }}>{money(prem)}<span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 'normal' }}>/mo</span></strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Company Share ({erPct}%)</span>
                      <strong style={{ color: 'var(--success)' }}>{money(prem * (erPct / 100))}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Employee Share ({eePctPlan}%)</span>
                      <strong style={{ color: 'var(--danger)' }}>{money(prem * (eePctPlan / 100))}</strong>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '0 20px 20px', display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-block" style={{ flex: 1 }} onClick={() => openEdit(p)}>Manage Plan Setup</button>
                  {!!p.is_active && <button className="btn btn-sm btn-danger" onClick={() => deactivate(p)}>Deactivate</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing?.id ? `Manage: ${form.plan_name || 'Plan'}` : 'New Plan'}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Notice kind="error">{busy ? '' : notice.msg}</Notice>
          <div className="form-row">
            <Field label="Code"><input className="form-control" value={form.plan_code} onChange={set('plan_code')} required disabled={!!editing?.id} /></Field>
            <Field label="Plan name"><input className="form-control" value={form.plan_name} onChange={set('plan_name')} required /></Field>
          </div>
          <div className="form-row">
            <Field label="Type"><input className="form-control" value={form.plan_type} onChange={set('plan_type')} /></Field>
            <Field label="Provider"><input className="form-control" value={form.provider} onChange={set('provider')} /></Field>
          </div>
          <div className="form-row">
            <Field label="Monthly Premium (Total)"><input className="form-control" type="number" step="0.01" min="0" value={form.monthly_premium} onChange={set('monthly_premium')} required /></Field>
            <Field label="Company Share %"><input className="form-control" type="number" min="0" max="100" value={form.employer_share} onChange={set('employer_share')} required /></Field>
          </div>
          <div style={{ borderLeft: '3px solid var(--primary)', background: 'var(--primary-light)', padding: '10px 12px', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>Payroll Deduction Impact</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Employees enrolled in this plan will have <strong style={{ color: 'var(--danger)' }}>{money(eeImpact)}</strong> per month automatically deducted from their monthly gross pay.
            </div>
          </div>
          <Field label="Description"><textarea className="form-control" rows={2} value={form.description} onChange={set('description')} /></Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} /> Active
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
