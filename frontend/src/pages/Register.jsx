import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { supabase } from '../lib/supabase.js';
import { PASSWORD_RULES, passwordProblem } from '../lib/password.js';
import { GoogleG } from '../components/GoogleIcon.jsx';
import AuthShell from '../components/AuthShell.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

const ICONS = {
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  key: <><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></>,
};

const Icon = ({ name }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name]}
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

export default function Register() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [accountType, setAccountType] = useState('Employee');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [company, setCompany] = useState('');
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    api.get('/api/branding').then((b) => setCompany(b?.company_name || '')).catch(() => {});
  }, []);

  if (user) return <Navigate to="/" replace />;

  async function registerWithGoogle() {
    if (!agreed) {
      setError('Please read and accept the Terms and Conditions before registering.');
      return;
    }
    setGoogleBusy(true);
    setError('');
    setSuccess('');
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
          ? 'Google registration is not enabled on the server yet — ask the administrator to enable the Google provider in Supabase.'
          : sbError.message
      );
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Enter a valid email address (e.g. name@company.com).');
      return;
    }
    if (username.trim().length < 2) {
      setError('Display name must be at least 2 characters.');
      return;
    }
    const pwIssue = passwordProblem(password);
    if (pwIssue) {
      setError(pwIssue);
      return;
    }
    if (!registrationCode.trim()) {
      setError('The registration code from HR is required.');
      return;
    }
    if (!agreed) {
      setError('Please read and accept the Terms and Conditions before registering.');
      return;
    }
    setBusy(true);
    try {
      if (supabase) {
        const { data, error: sbError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
            data: { name: username, registration_code: registrationCode, account_type: accountType, employee_code: employeeCode },
          },
        });
        if (sbError) throw new Error(sbError.message);
        if (data.session) {
          navigate('/auth/confirm', { replace: true });
          return;
        }
        setSuccess('We sent a confirmation link to your email. Click it, then finish activating your account.');
        setPassword('');
        return;
      }
      await api.register({ email, username, password, registration_code: registrationCode, account_type: accountType, employee_code: employeeCode });
      setSuccess('Registration successful. You can now login with your email.');
      setPassword('');
      setRegistrationCode('');
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      company={company}
      info={{
        title: 'Create your account',
        subtitle: 'Employees and HR Admins register here — the same code applies to both.',
        bullets: [
          'Employee portal: attendance per cut-off, adjustments, claims, benefits, payroll summary',
          'HR Admin: full payroll, compensation, attendance and reporting workspace',
          'A registration code from the company is required',
          'Employee sign-ups are always accepted — the account links to your records automatically when your email or employee code matches, and HR can attach it later either way',
        ],
        foot: 'Password resets are handled by the system administrator — there is no self-service reset.',
      }}
    >
      <div className="form-head">
        <h1>Register</h1>
        <p>Join with your company registration code</p>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        <div className="login-field">
          <label>Account type</label>
          <div className="acct-seg">
            <button type="button" className={accountType === 'Employee' ? 'active' : ''} onClick={() => setAccountType('Employee')}>
              👤 Employee
            </button>
            <button type="button" className={accountType === 'HR' ? 'active' : ''} onClick={() => setAccountType('HR')}>
              🛠 HR Admin
            </button>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {accountType === 'Employee'
              ? 'Self-service portal. Use the same email HR has on file for you.'
              : 'Requires the registration code issued by the system administrator.'}
          </span>
        </div>

        <div className="login-field">
          <label htmlFor="email">Email address</label>
          <div className="input-wrap">
            <span className="lead-icon"><Icon name="mail" /></span>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" required />
          </div>
        </div>

        <div className="login-field">
          <label htmlFor="username">Display name</label>
          <div className="input-wrap">
            <span className="lead-icon"><Icon name="user" /></span>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Juan Dela Cruz" autoComplete="name" required />
          </div>
        </div>

        <div className="login-field">
          <label htmlFor="password">Password</label>
          <div className="input-wrap">
            <span className="lead-icon"><Icon name="lock" /></span>
            <input id="password" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="Strong password required" required />
            <button type="button" className="eye-btn" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)}>
              <EyeIcon off={showPw} />
            </button>
          </div>
          <ul className="pw-checks" aria-label="Password requirements">
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(password);
              return (
                <li key={rule.id} className={ok ? 'ok' : ''}>
                  <span className="dot">{ok ? '✓' : '○'}</span> {rule.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="login-field">
          <label htmlFor="registration_code">Registration code</label>
          <div className="input-wrap">
            <span className="lead-icon"><Icon name="key" /></span>
            <input id="registration_code" type="text" value={registrationCode} onChange={(e) => setRegistrationCode(e.target.value)} placeholder="Provided by the company" required />
          </div>
        </div>

        {accountType === 'Employee' && (
          <div className="login-field">
            <label htmlFor="employee_code">Employee code <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — links your account instantly)</span></label>
            <div className="input-wrap">
              <span className="lead-icon"><Icon name="user" /></span>
              <input id="employee_code" type="text" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())} placeholder="e.g. EMP-2026-001" />
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              Printed on your company ID or payslip. It links this login to your attendance, claims and pay records.
            </span>
          </div>
        )}

        <div className="login-field terms-actions">
          <input
            id="terms-agree"
            type="checkbox"
            checked={agreed}
            onChange={(e) => { setAgreed(e.target.checked); setError(''); }}
          />
          <label htmlFor="terms-agree">
            I have read and agree to the{' '}
            <Link to="/terms" target="_blank" rel="noreferrer">Terms and Conditions</Link>
            {' '}of the Payroll Management System.
          </label>
        </div>

        <button type="submit" className="btn-block" disabled={busy}>
          {busy ? 'Creating account…' : `Register as ${accountType === 'HR' ? 'HR Admin' : 'Employee'}`}
        </button>

        {supabase && (
          <div className="otp-block">
            <div className="otp-divider"><span>or</span></div>
            <button type="button" className="btn-block secondary google-btn" onClick={registerWithGoogle} disabled={busy || googleBusy}>
              <GoogleG /> {googleBusy ? 'Opening Google…' : 'Register with Gmail'}
            </button>
            <p className="google-note">Gmail sign-up is verified by Google; you will still enter your registration code on the next step.</p>
          </div>
        )}

        <div className="login-note">
          Already registered?{' '}
          <Link to="/login">Sign in</Link>
        </div>
      </form>
    </AuthShell>
  );
}
