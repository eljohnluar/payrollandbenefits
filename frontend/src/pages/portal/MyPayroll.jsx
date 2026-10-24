import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { Badge, Card, PageHeader } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

function Basis({ basis }) {
  let parsed = null;
  try { parsed = basis ? JSON.parse(basis) : null; } catch { /* pre-revision rows have no basis snapshot */ }
  if (!parsed) return null;
  return (
    <div className="basis-grid">
      {['sss', 'philhealth', 'pagibig'].map((k) => (
        <div key={k} className="basis-item">
          <strong>{parsed[k].agency}</strong>
          <div>{parsed[k].bracket}</div>
          <div>{parsed[k].ee_basis}</div>
          <div>Employee share: <strong>{money(parsed[k].ee_share)}</strong></div>
        </div>
      ))}
    </div>
  );
}

export default function MyPayroll() {
  const { data, loading, error } = useResource('/api/me/payroll-summary');
  const [openPeriod, setOpenPeriod] = useState('');
  const rows = data || [];

  return (
    <>
      <PageHeader
        title="My Payroll Summary"
        subtitle="Computed salary per payroll period. Payslips are issued to you by Finance through the Finance system."
      />

      <div className="info-banner">
        <span>ℹ</span>
        <span>
          This screen shows your computed pay and the SSS, PhilHealth and Pag-IBIG deductions with the
          salary bracket and rate each amount was based on. The payslip document itself is generated and
          released by the Finance module — not by this system.
        </span>
      </div>

      <Card body>
        {loading && <p>Loading…</p>}
        {!loading && error && <p className="alert error">{error}</p>}
        {!loading && rows.length === 0 && <p>No payroll computed for you yet.</p>}
        {rows.map((r) => {
          const key = `${r.period} ${r.period_start}`;
          const open = openPeriod === key;
          return (
            <div key={key} className="payroll-period">
              <button className="payroll-period-head" type="button" onClick={() => setOpenPeriod(open ? '' : key)}>
                <span><strong>{r.period}</strong> <Badge>{r.run_status}</Badge></span>
                <span>Net: <strong>{money(r.net_pay)}</strong></span>
              </button>
              {open && (
                <div className="payroll-period-body">
                  <div className="pay-cols">
                    <div>
                      <div className="pay-col-title">Earnings</div>
                      {[
                        ['Basic Pay', r.basic_pay],
                        ['Overtime Pay', r.overtime_pay],
                        ['Night Differential', r.night_differential],
                        ['Holiday Pay', r.holiday_pay],
                        ['Allowances', r.allowances],
                        ['Approved Claims', r.claims_amount],
                        ['Incentives', r.incentives],
                      ].map(([label, v]) => Number(v) > 0 && (
                        <div key={label} className="pay-row"><span>{label}</span><span>{money(v)}</span></div>
                      ))}
                      <div className="pay-row total"><span>Gross Pay</span><span>{money(r.gross_pay)}</span></div>
                    </div>
                    <div>
                      <div className="pay-col-title">Deductions</div>
                      {[
                        ['SSS', r.sss_ee],
                        ['PhilHealth', r.philhealth_ee],
                        ['Pag-IBIG', r.pagibig_ee],
                        ['Withholding Tax', r.withholding_tax],
                        ['Loans', r.loans_deduction],
                        ['Unpaid Leave', r.unpaid_leave_deduction],
                        ['HMO', r.hmo_deduction],
                        ['Late Deduction', r.attendance_deduction],
                      ].map(([label, v]) => Number(v) > 0 && (
                        <div key={label} className="pay-row"><span>{label}</span><span>{money(v)}</span></div>
                      ))}
                      <div className="pay-row total"><span>Total Deductions</span><span>{money(r.total_deductions)}</span></div>
                      <div className="pay-row total"><span>Net Pay</span><span>{money(r.net_pay)}</span></div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                    Days worked: {r.days_worked} · OT hours: {r.ot_hours}{r.pay_date ? ` · Pay date: ${r.pay_date}` : ''}
                  </div>
                  <Basis basis={r.statutory_basis} />
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </>
  );
}
