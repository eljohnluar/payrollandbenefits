import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

function getCompanyAcronym(name) {
  if (!name) return 'PMS';
  const words = name.split(/\s+/).filter((w) => w.length > 1);
  const ac = words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
  return ac || 'PMS';
}

export default function About() {
  const [company, setCompany] = useState('');

  useEffect(() => {
    api.get('/api/branding').then((b) => setCompany(b?.company_name || '')).catch(() => {});
  }, []);

  return (
    <div className="landing-page">
      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <Link to="/" className="lp-brand">
            <img src="/logo.jpg" alt="Logo" className="lp-brand-logo" />
            <span className="lp-brand-title">{getCompanyAcronym(company)}</span>
          </Link>
          <div className="lp-about-nav">
            <Link to="/" className="lp-btn lp-btn-outline">
              Back to Home
            </Link>
            <Link to="/login" className="lp-btn lp-btn-primary">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-container lp-hero-inner">
          <h1 className="lp-hero-title">
            About Us
            <span className="lp-hero-title-sub">{company || 'Payroll Management System'}</span>
          </h1>
          <p className="lp-hero-text">
            The Payroll Management System is {company || 'our company'}&apos;s internal platform for
            running fast, compliant payroll cycles and managing employee benefits — built to replace
            spreadsheets with one trusted, auditable workspace for HR and employees alike.
          </p>
        </div>
      </section>

      <section className="lp-features-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <h2 className="lp-section-title">One workspace for payroll and benefits</h2>
            <p className="lp-section-subtitle">
              Built for {company || 'our company'} to keep every pay run accurate, every deduction
              transparent, and every employee informed.
            </p>
          </div>
          <div className="lp-about-grid">
            <div className="lp-about-card">
              <h2 className="lp-about-card-title">Our mission</h2>
              <p>
                Make every payroll run accurate, on time, and fully compliant with Philippine labor
                requirements — while giving every employee clear visibility into their own
                attendance, claims, benefits, and pay.
              </p>
            </div>
            <div className="lp-about-card">
              <h2 className="lp-about-card-title">What the system does</h2>
              <ul>
                <li>Monthly payroll computation with SSS, PhilHealth, Pag-IBIG and BIR withholding</li>
                <li>Cut-off based attendance tracking, including adjustments for off-site work</li>
                <li>HMO and benefit plan enrollment management for all regular employees</li>
                <li>Medical and emergency claim logging with receipt verification</li>
                <li>Automatic enforcement of the DOLE regional minimum wage</li>
              </ul>
            </div>
            <div className="lp-about-card">
              <h2 className="lp-about-card-title">Two portals, one login</h2>
              <p>
                HR Administrators manage records, run payroll cycles, review attendance adjustments
                and approve claims. Employees sign in to the same page and land on their personal
                portal — with a searchable task bar covering their attendance, claims, benefits and
                pay summaries.
              </p>
            </div>
            <div className="lp-about-card">
              <h2 className="lp-about-card-title">Compliance and privacy</h2>
              <p>
                All computations follow current DOLE and BIR guidelines, and every sensitive action
                in the system is recorded in an audit trail. Payroll and personal data stay strictly
                confidential and are accessible only through role-based access. Payslips are issued
                through the Finance system.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-cta-banner">
        <div className="lp-container lp-cta-inner">
          <div className="lp-cta-content">
            <h2 className="lp-cta-title">Questions about the system?</h2>
            <p className="lp-cta-desc">
              Account access, password resets and registration codes are handled by your HR
              administrator.
            </p>
          </div>
          <div className="lp-cta-buttons">
            <Link to="/register" className="lp-btn lp-btn-white lp-btn-xl">
              <span>Create Account</span>
            </Link>
            <Link to="/login" className="lp-btn lp-btn-transparent lp-btn-xl">
              <span>Sign In</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
