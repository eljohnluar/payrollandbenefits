import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { passwordProblem } from '../lib/password.js';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Landing page for Supabase email-confirmation links and OTP/redirect flows.
 * Waits for the Supabase session, then exchanges it for an app JWT. First-time
 * users are asked for their registration code (and an app password used for
 * password-confirmed actions) before their account is provisioned.
 */
export default function AuthConfirm() {
  const { user, adoptSession } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('working'); // working | needs_activation | pending | error
  const [needsCode, setNeedsCode] = useState(false);
  const [message, setMessage] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState('HR');
  const [employeeCode, setEmployeeCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setStatus('error');
      setMessage('Supabase is not configured for this deployment.');
      return undefined;
    }
    let cancelled = false;
    let sessionFound = false;

    async function resolve(sessionOrNull) {
      if (cancelled || !sessionOrNull?.access_token || handled.current) return;
      handled.current = true;
      sessionFound = true;
      setSession(sessionOrNull);
      try {
        const b64 = sessionOrNull.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const claims = JSON.parse(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)));
        const at = claims.user_metadata?.account_type;
        if (at === 'Employee' || at === 'HR') setAccountType(at);
      } catch { /* token claims are best-effort prefill only */ }
      const { status: s, payload } = await api.supabaseLogin(sessionOrNull.access_token);
      if (s === 200) {
        const sessionUser = adoptSession(payload);
        navigate(sessionUser?.role === 'Employee' ? '/employee' : '/', { replace: true });
        return;
      }
      handled.current = false; // allow the activation form to retry
      if (payload?.needs_registration_code || payload?.needs_password) {
        setNeedsCode(Boolean(payload.needs_registration_code));
        setStatus('needs_activation');
        setMessage(payload.error || '');
      } else if (payload?.email_confirmation_pending) {
        setStatus('pending');
        setMessage(payload.error);
      } else {
        setStatus('error');
        setMessage(payload?.error || 'Sign-in could not be completed.');
      }
    }

    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.access_token) resolve(s);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => resolve(s));
    const giveUp = setTimeout(() => {
      if (sessionFound) return;
      setStatus('error');
      setMessage('No sign-in session found. Request a new link or code.');
    }, 8000);
    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (user) return <Navigate to={user.role === 'Employee' ? '/employee' : '/'} replace />;

  async function activate(event) {
    event.preventDefault();
    if (!session) return;
    const issue = passwordProblem(password);
    if (issue) {
      setStatus('error');
      setMessage(issue);
      return;
    }
    setBusy(true);
    const { status: s, payload } = await api.supabaseLogin(session.access_token, {
      registration_code: code,
      password,
      account_type: accountType,
      employee_code: accountType === 'Employee' ? employeeCode : '',
    });
    setBusy(false);
    if (s === 200) {
      const sessionUser = adoptSession(payload);
      navigate(sessionUser?.role === 'Employee' ? '/employee' : '/', { replace: true });
      return;
    }
    setStatus('error');
    setMessage(payload?.error || 'Activation failed.');
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={activate}>
        <div className="login-hero">
          <div className="brand-line">Payroll Management System</div>
          <h1>{status === 'needs_activation' ? 'Activate your account' : 'Confirming your email…'}</h1>
          <p>
            {status === 'working' && 'One moment while we verify your Supabase session.'}
            {status === 'pending' && 'Open the link we emailed you, then return here.'}
            {status === 'needs_activation' && 'Enter the registration code from HR to finish setting up.'}
            {status === 'error' && 'We could not complete the sign-in.'}
          </p>
        </div>
        <div className="login-body">
          {message && (
            <div className={`alert ${status === 'error' ? 'error' : status === 'pending' ? '' : 'success'}`}>{message}</div>
          )}
          {status === 'needs_activation' && (
            <>
              <div className="field">
                <label>Account type</label>
                <div className="acct-seg">
                  <button type="button" className={accountType === 'Employee' ? 'active' : ''} onClick={() => setAccountType('Employee')}>
                    👤 Employee
                  </button>
                  <button type="button" className={accountType === 'HR' ? 'active' : ''} onClick={() => setAccountType('HR')}>
                    🛠 HR Admin
                  </button>
                </div>
                {accountType === 'Employee' && (
                  <>
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                      Use the same email HR has on file for you — or enter your employee code below.
                    </p>
                    <div style={{ marginTop: 10 }}>
                      <label htmlFor="confirm-emp-code">Employee code (if your email isn’t on file)</label>
                      <input
                        id="confirm-emp-code"
                        type="text"
                        value={employeeCode}
                        onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                        placeholder="e.g. EMP-2026-001"
                      />
                    </div>
                  </>
                )}
              </div>
              {needsCode && (
                <div className="field">
                  <label htmlFor="confirm-code">Registration code</label>
                  <input
                    id="confirm-code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Provided by HR"
                    required
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="confirm-password">Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Used for password-confirmed actions"
                  required
                />
              </div>
              <button className="btn primary" style={{ justifyContent: 'center' }} disabled={busy}>
                {busy ? 'Activating…' : 'Activate account'}
              </button>
            </>
          )}
          {(status === 'error' || status === 'pending') && (
            <div className="login-note">
              <Link to="/login" style={{ fontWeight: 600, color: 'var(--primary)' }}>Back to sign in</Link>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
