import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { supabase } from '../lib/supabase.js';
import { GoogleG } from '../components/GoogleIcon.jsx';
import AuthShell, { HomeButton } from '../components/AuthShell.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const EyeIcon = ({ off }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {off ? (
      <>
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </>
    ) : (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

const PORTAL_INFO = {
  employee: {
    title: 'Employee Portal',
    subtitle: 'Self-service access for team members.',
    bullets: [
      'View your attendance per cut-off period',
      'File adjustments when you were off-site or on the road',
      'Submit reimbursement claims with receipts',
      'Apply for HMO and benefit plans',
      'Check your payroll summary — payslips are released by Finance',
    ],
    foot: 'No account yet? Register and choose Employee — you will need the company registration code. Forgot your password? Ask the system administrator to reset it.',
  },
  hr: {
    title: 'HR Admin Portal',
    subtitle: 'The full payroll & benefits workspace.',
    bullets: [
      'Compute payroll and submit it for external Finance approval',
      'Compensation with DOLE minimum wage enforcement',
      'Cut-off attendance records and adjustment reviews',
      'Claims, benefits and 13th month management',
      'Reports, records, audit log and settings',
    ],
    foot: 'New HR Admin? Register with the code issued by the system administrator.',
  },
  both: {
    title: 'Payroll Management System',
    subtitle: 'One login, two dashboards — the system routes you by role.',
    bullets: [
      'HR Admin: payroll runs, compensation, attendance, claims and reports',
      'Employee: attendance, adjustments, claims, benefits and payroll summary',
      'Attendance is recorded per cut-off period, not per day',
      'Payslips are generated and released by the Finance module',
    ],
    foot: 'Employees and HR Admins can register with the company registration code. Password resets are handled by the system administrator.',
  },
};

export default function Login() {
  const { user, login, logoutMessage, adoptSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const portal = params.get('as');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [otpStage, setOtpStage] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [pending, setPending] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpNote, setOtpNote] = useState('');
  const [company, setCompany] = useState('');

  useEffect(() => {
    api.get('/api/branding').then((b) => setCompany(b?.company_name || '')).catch(() => {});
  }, []);

  if (user) return <Navigate to={user.role === 'Employee' ? '/employee' : '/'} replace />;

  async function loginWithGoogle() {
    setGoogleBusy(true);
    setError('');
    const { error: sbError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/confirm`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (sbError) {
      setGoogleBusy(false);
      setError(
        sbError.message.toLowerCase().includes('not configured')
          ? 'Google sign-in is not enabled on the server yet — ask the administrator to configure the Google provider in Supabase.'
          : sbError.message
      );
    }
  }

  async function sendLoginCode(loginEmail) {
    const { error: sbError } = await supabase.auth.signInWithOtp({
      email: loginEmail,
      options: { shouldCreateUser: false },
    });
    if (sbError) {
      throw new Error(
        sbError.message.toLowerCase().includes('signups not allowed')
          ? 'This account is not enrolled for email codes yet — ask the administrator to sync it into Supabase.'
          : sbError.message
      );
    }
    setOtpNote(`We emailed a 6-digit code to ${loginEmail}. It expires in a few minutes.`);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await login(email, password);
      if (result?.otp_required) {
        if (!supabase) {
          setError('Email-code service is not configured on this deployment.');
          return;
        }
        setOtpEmail(result.email);
        setPending(result.pending);
        setOtpStage(true);
        await sendLoginCode(result.email);
      }
      // No otp_required and no supabase client: legacy direct session.
      else navigate(result?.role === 'Employee' ? '/employee' : '/', { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyLoginCode(event) {
    event.preventDefault();
    setOtpBusy(true);
    setError('');
    try {
      const { data, error: sbError } = await supabase.auth.verifyOtp({ email: otpEmail, token: otpCode, type: 'email' });
      if (sbError) throw new Error(sbError.message);
      const { status, payload } = await api.supabaseLogin(data.session.access_token, { pending });
      if (status === 200) {
        const sessionUser = adoptSession(payload);
        navigate(sessionUser?.role === 'Employee' ? '/employee' : '/', { replace: true });
        return;
      }
      setError(payload?.error || 'Verification failed.');
      if (status === 401) exitOtpStage();
    } catch (e) {
      setError(e.message);
    } finally {
      setOtpBusy(false);
    }
  }

  function exitOtpStage() {
    setOtpStage(false);
    setPending('');
    setOtpCode('');
    setOtpNote('');
  }

  async function resendCode() {
    setError('');
    try {
      await sendLoginCode(otpEmail);
    } catch (e) {
      setError(e.message);
    }
  }

  if (otpStage) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ position: 'relative' }}>
          <HomeButton />
          <div className="login-hero">
            <div className="login-logo"><img src="/logo.jpg" alt="Company logo" /></div>
            <h1>Check your email</h1>
            <p>Enter the 6-digit code sent to {otpEmail}</p>
          </div>
          <form className="login-body" onSubmit={verifyLoginCode}>
            {error && <div className="alert error">{error}</div>}
            {otpNote && <div className="alert success">{otpNote}</div>}
            <div className="login-field">
              <label htmlFor="login-otp">Verification code</label>
              <input
                id="login-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                required
              />
            </div>
            <button type="submit" className="btn-block" disabled={otpBusy || otpCode.length !== 6}>
              {otpBusy ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <div className="otp-actions">
              <button type="button" className="forgot-link" onClick={resendCode}>Resend code</button>
              <button type="button" className="forgot-link" onClick={exitOtpStage}>Use a different account</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AuthShell company={company} info={PORTAL_INFO[portal] || PORTAL_INFO.both}>
      <div className="form-head">
        <h1>Sign in</h1>
        <p>{portal === 'employee' ? 'Employee portal — use your company account' : portal === 'hr' ? 'HR Admin workspace' : 'Welcome back — sign in to your workspace account'}</p>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {logoutMessage && <div className="alert">{logoutMessage}</div>}
        {error && <div className="alert error">{error}</div>}

        <div className="login-field">
          <label htmlFor="login-email">Email address</label>
          <div className="input-wrap">
            <span className="lead-icon"><MailIcon /></span>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div className="login-field">
          <label htmlFor="login-password">Password</label>
          <div className="input-wrap">
            <span className="lead-icon"><LockIcon /></span>
            <input
              id="login-password"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button type="button" className="eye-btn" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)}>
              <EyeIcon off={showPw} />
            </button>
          </div>
        </div>

        <button id="login-submit" type="submit" className="btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>

        {supabase && (
          <div className="otp-block">
            <div className="otp-divider"><span>or</span></div>
            <button type="button" className="btn-block secondary google-btn" onClick={loginWithGoogle} disabled={busy || googleBusy}>
              <GoogleG /> {googleBusy ? 'Opening Google…' : 'Sign in with Gmail'}
            </button>
            <p className="google-note">Gmail sign-in skips the email code.</p>
          </div>
        )}

        <div className="login-note">
          Employees and HR Admins can register with the company registration code. Forgot your password? Ask
          the system administrator to reset it.{' '}
          <Link to="/register">Create an account</Link>
        </div>
      </form>
    </AuthShell>
  );
}
