import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

/** Public Terms and Conditions page, linked from the registration form. */
export default function Terms() {
  const [company, setCompany] = useState('');
  useEffect(() => {
    api.get('/api/branding').then((b) => setCompany(b?.company_name || '')).catch(() => {});
  }, []);

  return (
    <div className="login-wrap">
      <div className="login-card terms-card">
        <div className="login-hero">
          <div className="login-logo"><img src="/logo.jpg" alt="Company logo" /></div>
          {company && <div className="brand-company">{company}</div>}
          <h1>Terms and Conditions</h1>
          <p>Payroll Management System — last updated September 26, 2026</p>
        </div>
        <div className="terms-body">
          <h2>1. Acceptance of these terms</h2>
          <p>
            By creating an account (“account”) and using the Payroll Management System
            (“System”), you confirm that you have read, understood, and agree to be bound by
            these Terms and Conditions. If you do not agree, do not register or use the System.
          </p>

          <h2>2. Authorized use</h2>
          <ul>
            <li>Accounts are issued to authorized personnel of the company only and are personal and non-transferable.</li>
            <li>You must not share your login credentials or verification codes with anyone.</li>
            <li>New HR Admin accounts are provisioned with a registration code issued by the company; employee logins are created by HR Admin. Misuse of a code may lead to account suspension. There is no self-service password reset — forgotten passwords are reset by the system administrator.</li>
          </ul>

          <h2>3. Confidentiality of payroll and personal data</h2>
          <ul>
            <li>All employee records, compensation, attendance, claims, benefits, tax, and payslip data are strictly confidential company information.</li>
            <li>You may access, print, download, or send such data only when required by your role and only through features provided in the System.</li>
            <li>Reproducing, storing, or disclosing payroll information outside the System without authorization is prohibited.</li>
          </ul>

          <h2>4. Security and session rules</h2>
          <ul>
            <li>Password login requires a one-time code sent to your registered email; treat that email as part of your credentials.</li>
            <li>The System automatically signs you out after a period of inactivity to protect open sessions.</li>
            <li>Payslips are issued through the Finance system; sensitive actions inside the System (such as Settings changes) require re-entering your password. You are responsible for every action taken under your credentials.</li>
            <li>You must report suspected account compromise to your system administrator immediately.</li>
          </ul>

          <h2>5. Monitoring and audit trail</h2>
          <p>
            The System records an audit log of user actions, including date, time, and IP
            address, for compliance and investigation purposes. By using the System you
            consent to this monitoring. Records that are deleted through the interface are
            archived (soft-deleted) and remain recoverable by administrators.
          </p>

          <h2>6. Accuracy of information</h2>
        <p>
            Payroll computations, statutory contributions (SSS, PhilHealth, Pag-IBIG), tax
            withholding, benefit eligibility, and service incentive leave balances shown by
            the System are computed from the data entered by authorized users. Report
            discrepancies to HR or Finance promptly; final authority on payroll amounts
            rests with the company.
          </p>

          <h2>7. Availability and changes</h2>
          <p>
            The System is provided on a best-effort basis; free hosting may cause brief
            interruptions. The company may update the System, these Terms, and the
            processing rules at any time. Continued use after changes constitutes
            acceptance of the revised Terms.
          </p>

          <h2>8. Accountability and sanctions</h2>
          <p>
            Violations of these Terms — including unauthorized access, data leaks, falsified
            claims or attendance entries, and sharing of credentials — may result in
            disciplinary action up to termination of employment and, where warranted, legal
            action under applicable data-privacy and labor laws.
          </p>

          <div className="terms-footer">
            Questions about these Terms? Contact your HR administrator.{' '}
            <Link to="/register">Back to registration</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
