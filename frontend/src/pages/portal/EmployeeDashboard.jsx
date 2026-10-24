import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { Card, Stat, StatsGrid } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

const TODAY = new Date();
const CURRENT_MONTH = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}`;

const TASKS = [
  { label: 'Submit Claim', keywords: 'claim reimbursement receipt file new medical', to: '/employee/claims?new=1', icon: '＋' },
  { label: 'View Attendance', keywords: 'attendance cutoff present absent overtime daily log', to: '/employee/attendance', icon: '📅' },
  { label: 'File Attendance Adjustment', keywords: 'adjustment offsite driver field missed log', to: '/employee/attendance?adjust=1', icon: '✎' },
  { label: 'Apply for Benefits', keywords: 'benefit hmo insurance enroll plan apply', to: '/employee/benefits', icon: '♥' },
  { label: 'File Leave Request', keywords: 'leave vacation sick emergency sil time off apply', to: '/employee/leave', icon: '🌴' },
  { label: 'View Leave Balances', keywords: 'leave balance remaining accrued used', to: '/employee/leave', icon: '📊' },
  { label: 'View Payroll Summary', keywords: 'pay salary net pay gross payslip period', to: '/employee/payroll', icon: '₱' },
  { label: 'Track Claim Status', keywords: 'claim status pending approved rejected tracker', to: '/employee/claims', icon: '🔍' },
  { label: 'Update Profile', keywords: 'profile name email department contact account photo', to: '/employee/profile', icon: '👤' },
  { label: 'Open Settings', keywords: 'settings notifications security appearance theme password', to: '/employee/settings', icon: '⚙' },
];

const LEAVE_COLORS = {
  'Vacation Leave': '#2563eb',
  'Sick Leave': '#dc2626',
  'Emergency Leave': '#f59e0b',
  'Service Incentive Leave': '#7c3aed',
};

const ATTENDANCE_BADGES = {
  P: { label: 'Present', kind: 'positive' },
  H: { label: 'Half-day', kind: 'neutral' },
  A: { label: 'Absent', kind: 'negative' },
  OT: { label: 'Overtime', kind: 'info' },
};

function LeaveBalanceCard() {
  const { data, loading } = useResource('/api/me/leave');
  const balances = data?.balances || [];
  return (
    <Card
      body
      title="Leave Balance"
      right={<Link to="/employee/leave" className="card-link">Apply leave</Link>}
    >
      {loading && <p className="settings-note">Loading…</p>}
      {!loading && balances.length === 0 && (
        <p className="settings-note">No leave balances recorded for this year yet.</p>
      )}
      {balances.map((b) => {
        const color = LEAVE_COLORS[b.leave_type] || '#16a34a';
        const accrued = Number(b.accrued) || 0;
        const balance = Number(b.balance) || 0;
        const pct = accrued > 0 ? Math.max(0, Math.min(100, (balance / accrued) * 100)) : 0;
        return (
          <div className="dash-list-row" key={b.id}>
            <span className="dash-dot" style={{ background: color }} />
            <span className="dash-list-name">{b.leave_type}</span>
            <span className="dash-list-value">{balance} / {accrued}</span>
            <span className="dash-meter"><i style={{ width: `${pct}%`, background: color }} /></span>
          </div>
        );
      })}
    </Card>
  );
}

function RecentAttendanceCard() {
  const { data, loading } = useResource('/api/me/attendance/recent');
  const rows = data || [];
  return (
    <Card
      body
      title="Recent Attendance"
      right={<Link to="/employee/attendance" className="card-link">View all</Link>}
    >
      {loading && <p className="settings-note">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="settings-note">No daily attendance records yet — HR records attendance per cut-off period.</p>
      )}
      {rows.map((r) => {
        const badge = ATTENDANCE_BADGES[r.status] || { label: r.status, kind: 'neutral' };
        return (
          <div className="dash-list-row" key={r.log_date}>
            <span className="dash-list-name">{new Date(r.log_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}</span>
            <span className={`dash-badge ${badge.kind}`}>{badge.label}</span>
          </div>
        );
      })}
    </Card>
  );
}

function AnnouncementCard() {
  const { data, loading } = useResource('/api/me/announcements');
  const post = (data || [])[0];
  return (
    <Card body title="Latest Announcement">
      {loading && <p className="settings-note">Loading…</p>}
      {!loading && !post && <p className="settings-note">No announcements yet. HR posts company news here.</p>}
      {post && (
        <>
          <div className="announcement-title">{post.title}</div>
          {post.body && <p className="announcement-body">{post.body}</p>}
          <div className="announcement-meta">Posted by {post.created_by} · {new Date(post.created_at).toLocaleDateString()}</div>
        </>
      )}
    </Card>
  );
}

export default function EmployeeDashboard() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { data: payroll } = useResource('/api/me/payroll-summary');
  const { data: claims } = useResource('/api/me/claims');
  const { data: benefits } = useResource('/api/me/benefits');
  const { data: attendance } = useResource(`/api/me/attendance?cutoff_start=${CURRENT_MONTH}-01&cutoff_end=${CURRENT_MONTH}-15`);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return TASKS.filter((t) => `${t.label} ${t.keywords}`.toLowerCase().includes(q));
  }, [query]);

  const claimsList = claims || [];
  const payrollList = payroll || [];
  const latestPay = payrollList[0];
  const pendingClaims = claimsList.filter((c) => c.status === 'Pending').length;
  const activeBenefits = (benefits?.enrollments || []).filter((e) => e.status === 'Active').length;
  const cutoffRow = (attendance?.cutoffs || [])[0];
  const pendingAdjustments = (attendance?.adjustments || []).filter((a) => a.status === 'Pending').length;

  return (
    <>
      <div className="taskbar-wrap">
        <input
          className="form-control taskbar"
          type="search"
          placeholder="Search tasks — try “Submit Claim”, “View Attendance”, “Apply for Benefits”, “Update Profile”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) navigate(results[0].to); }}
          aria-label="Search tasks"
        />
        {query.trim() && (
          <div className="taskbar-results">
            {results.map((t) => (
              <button key={t.label} type="button" className="taskbar-result" onClick={() => { setQuery(''); navigate(t.to); }}>
                <span className="taskbar-icon">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
            {results.length === 0 && <div className="taskbar-empty">No tasks match “{query.trim()}”.</div>}
          </div>
        )}
      </div>

      <StatsGrid>
        <Stat label="Latest Net Pay" value={<span style={{ color: 'var(--primary)' }}>{latestPay ? money(latestPay.net_pay) : '—'}</span>} sub={latestPay ? latestPay.period : 'No released payslip period yet'} kind="primary" />
        <Stat label="Claims Pending" value={pendingClaims} sub="Awaiting HR review" kind={pendingClaims ? 'neutral' : 'positive'} />
        <Stat label="Active Benefits" value={activeBenefits} sub="Enrolled plans" kind="positive" />
        <Stat label="This Cut-off" value={cutoffRow ? `${Number(cutoffRow.days_worked ?? 0)} d worked` : 'Not recorded'} sub={pendingAdjustments ? `${pendingAdjustments} adjustment(s) pending` : 'Attendance per cut-off period'} kind="neutral" />
      </StatsGrid>

      <div className="grid-2" style={{ alignItems: 'start', marginTop: 16 }}>
        <LeaveBalanceCard />
        <RecentAttendanceCard />
      </div>

      <AnnouncementCard />

      <div className="grid-2" style={{ alignItems: 'start', marginTop: 16 }}>
        <Card title="Quick Links" body>
          <ul className="portal-links">
            <li><Link to="/employee/attendance">My attendance by cut-off period</Link></li>
            <li><Link to="/employee/leave">File a leave request and check balances</Link></li>
            <li><Link to="/employee/claims?new=1">Submit a reimbursement claim with receipt</Link></li>
            <li><Link to="/employee/benefits">Apply for HMO / insurance plans</Link></li>
            <li><Link to="/employee/payroll">Payroll summary (payslips are issued by Finance)</Link></li>
            <li><Link to="/employee/profile">My profile and account</Link></li>
          </ul>
        </Card>
        <Card title="How this portal works" body>
          <p style={{ marginTop: 0 }}>
            You can view your attendance per cut-off period, file adjustments when you were off-site,
            submit claims, apply for benefits and check your computed salary. Payslips themselves are
            generated and released by the Finance system. Forgotten passwords are reset by the HR Admin
            or IT personnel — there is no self-service reset.
          </p>
        </Card>
      </div>
    </>
  );
}
