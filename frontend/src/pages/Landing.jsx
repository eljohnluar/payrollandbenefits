import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

// Clean SVG Icons (No emojis)
const Icons = {
  ShieldCheck: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  Calculator: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="16" y1="14" x2="16" y2="18" />
      <path d="M16 10h.01" />
      <path d="M12 10h.01" />
      <path d="M8 10h.01" />
      <path d="M12 14h.01" />
      <path d="M8 14h.01" />
      <path d="M12 18h.01" />
      <path d="M8 18h.01" />
    </svg>
  ),
  Calendar: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  ),
  HeartPulse: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M12 9v6" />
      <path d="M9 12h6" />
    </svg>
  ),
  Receipt: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  ),
  Gift: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  ),
  Lock: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  ChevronDown: ({ open }) => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Menu: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  X: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

const FEATURES = [
  {
    icon: <Icons.Calculator />,
    title: 'Guided Semi-Monthly Runs',
    description: 'Process salaries, overtime, night differential, tardiness deductions and bonuses with an auditable step-by-step review before release.',
  },
  {
    icon: <Icons.ShieldCheck />,
    title: 'Philippine Statutory Matrix',
    description: 'Automated contribution calculations for SSS, PhilHealth, Pag-IBIG (HDMF), and BIR progressive withholding tax brackets.',
  },
  {
    icon: <Icons.Calendar />,
    title: 'Cut-off Attendance & Adjustments',
    description: 'Record attendance per 15-day cut-off period (Present, Half-day, Absent, OT) with adjustment requests for drivers and off-site field staff.',
  },
  {
    icon: <Icons.HeartPulse />,
    title: 'HMO & Benefits Coverage',
    description: 'Manage tiered medical plans, employee and dependent health card enrollments, hospitalization allowances and annual benefits pool.',
  },
  {
    icon: <Icons.Receipt />,
    title: 'Claims Tracking & Approvals',
    description: 'Employees file medical, optical and operational expense claims with receipts. HR and managers review and credit payouts seamlessly.',
  },
  {
    icon: <Icons.Gift />,
    title: '13th Month & Year-End Tax',
    description: 'Accurate pro-rated calculations for mandatory 13th month pay, tax-exempt threshold tracking (up to ₱90,000) and BIR annualization.',
  },
];

const WORKFLOW_STEPS = [
  {
    number: '01',
    title: 'Configure Profiles & Benefits',
    description: 'Set up employee master records, compensation rates, tax classifications, and assigned HMO tiers in one central repository.',
  },
  {
    number: '02',
    title: 'Record Cut-off Attendance & Review Run',
    description: 'HR records attendance per cut-off period (1st–15th / 16th–month end), with adjustment requests for off-site drivers and field staff, and the engine produces an itemized draft for verification.',
  },
  {
    number: '03',
    title: 'Submit for External Finance Processing',
    description: 'Sign off with immutable audit logs and submit the computed payroll to the Finance module, which handles approval, disbursement and payslip release to employees.',
  },
];

const STATUTORY_ITEMS = [
  { label: 'Social Security System (SSS)', detail: 'Latest employer and employee contribution brackets with mandatory EC fund auto-split.' },
  { label: 'PhilHealth Healthcare', detail: 'Mandatory 5% premium rate computed with prescribed income floor and ceiling limits.' },
  { label: 'Pag-IBIG Fund (HDMF)', detail: 'Regular savings ceiling calculations and support for voluntary MP2 monthly salary deductions.' },
  { label: 'BIR Withholding Tax', detail: 'Graduated tax schedule under the TRAIN Law with year-end tax annualization.' },
  { label: 'Mandatory 13th Month', detail: 'DOLE-compliant pro-rated calculations based on total basic salary earned during the calendar year.' },
];

const SECURITY_ITEMS = [
  { label: 'Two User Types Only', detail: 'HR Admin manages the full payroll process; employees get a limited self-service portal — a smaller attack surface with no Finance role inside the system.' },
  { label: 'Admin-Only Password Resets', detail: 'No self-service forgot password. Forgotten passwords are reset manually by the system administrator or designated IT personnel.' },
  { label: 'Immutable Audit Trails', detail: 'All compensation adjustments, claim decisions, and approval milestones are timestamped.' },
  { label: 'Enterprise Session Guard', detail: 'Secure cryptographic tokens with idle timeout protection and automated session revocation.' },
];

const FAQS = [
  {
    question: 'How are Philippine statutory deductions (SSS, PhilHealth, Pag-IBIG) calculated?',
    answer: 'The system has statutory contribution tables for SSS, PhilHealth, and Pag-IBIG built directly into the calculation engine. When payroll is processed, gross earnings are evaluated against the current brackets to deduct employee and employer shares with zero manual formulas.',
  },
  {
    question: 'How do employees access their payslips?',
    answer: 'Payslips are generated and released through the Finance system — the Payroll & Benefits System computes salaries and provides employees a payroll summary with the salary bracket and rate basis for every SSS, PhilHealth and Pag-IBIG deduction.',
  },
  {
    question: 'Can HR track and review employee benefit claims with receipts?',
    answer: 'Yes. Employees can submit reimbursement claims (such as optical, dental, medical, or out-of-pocket expenses) along with receipt image attachments. HR reviewers can inspect the receipts, approve or reject with comments, and automatically credit approved claims to the next payroll run.',
  },
  {
    question: 'Does the platform support semi-monthly and monthly payroll frequencies?',
    answer: 'Yes. You can run payroll semi-monthly (e.g., 1st–15th and 16th–end of month) or monthly, with flexible cutoff schedules and automated pro-rating for new hires or resignations.',
  },
  {
    question: 'Is system activity logged for compliance and accounting audits?',
    answer: 'Yes. Every payroll approval, compensation edit, employee record change, and claim decision is permanently recorded in the system audit log with actor ID, timestamp, and before/after states.',
  },
];

function getCompanyAcronym(name) {
  if (!name || /tri-?m global logistics/i.test(name)) return 'TGLTI';
  const words = name.replace(/[&.,]/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return name;
  return words.map((w) => w[0].toUpperCase()).join('');
}

export default function Landing() {
  const [company, setCompany] = useState('TRI-M GLOBAL LOGISTICS & TRADING INC.');
  const [openFaq, setOpenFaq] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    api.get('/api/branding')
      .then((b) => {
        if (b?.company_name) setCompany(b.company_name);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="landing-page">
      {/* Navigation */}
      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <Link to="/" className="lp-brand">
            <img src="/logo.jpg" alt="Logo" className="lp-brand-logo" />
            <span className="lp-brand-title">{getCompanyAcronym(company)}</span>
          </Link>

          <nav className="lp-nav-links">
            <a href="#features" className="lp-nav-link">Features</a>
            <a href="#workflow" className="lp-nav-link">Workflow</a>
            <a href="#compliance" className="lp-nav-link">Compliance</a>
            <a href="#faq" className="lp-nav-link">FAQ</a>
          </nav>

          <div className="lp-nav-actions">
            <Link to="/about" className="lp-btn lp-btn-outline">
              About Us
            </Link>
          </div>

          <button
            type="button"
            className="lp-mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <Icons.X /> : <Icons.Menu />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="lp-mobile-dropdown">
            <div className="lp-container">
              <nav className="lp-mobile-links">
                <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
                <a href="#workflow" onClick={() => setMobileMenuOpen(false)}>Workflow</a>
                <a href="#compliance" onClick={() => setMobileMenuOpen(false)}>Compliance</a>
                <a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
              </nav>
              <div className="lp-mobile-actions">
                <Link to="/about" className="lp-btn lp-btn-outline lp-btn-full" onClick={() => setMobileMenuOpen(false)}>
                  About Us
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="lp-hero">
        <div className="lp-container lp-hero-inner">
          <h1 className="lp-hero-title">
            Payroll Management System
            <span className="lp-hero-title-sub">{company}</span>
          </h1>

          <p className="lp-hero-text">
            Run compliant payroll cycles, automate SSS, PhilHealth, Pag-IBIG and BIR computations,
            track cut-off attendance, and manage HMO medical benefits — all inside one unified, auditable workspace.
          </p>

          <div className="lp-hero-cta">
            <Link to="/login?as=hr" className="lp-btn lp-btn-primary lp-btn-xl">
              <span>HR Admin Portal</span>
              <Icons.ArrowRight />
            </Link>
            <Link to="/login?as=employee" className="lp-btn lp-btn-outline lp-btn-xl">
              <span>Employee Portal</span>
              <Icons.ArrowRight />
            </Link>
          </div>
          <p className="lp-hero-cta-note">
            One login page, two dashboards — the system routes you by role. Employees and HR Admins can{' '}
            <Link to="/register">register</Link> with the company registration code.
          </p>

          <div className="lp-hero-trust">
            <div className="lp-trust-item">
              <span className="lp-trust-icon"><Icons.Check /></span>
              <span>Zero spreadsheet formulas</span>
            </div>
            <div className="lp-trust-item">
              <span className="lp-trust-icon"><Icons.Check /></span>
              <span>Updated statutory matrices</span>
            </div>
            <div className="lp-trust-item">
              <span className="lp-trust-icon"><Icons.Check /></span>
              <span>Employee self-service portal</span>
            </div>
            <div className="lp-trust-item">
              <span className="lp-trust-icon"><Icons.Check /></span>
              <span>Full audit trail logging</span>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section id="features" className="lp-features-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <h2 className="lp-section-title">Built for precision HR, Finance, and Employees</h2>
            <p className="lp-section-subtitle">
              Eliminate error-prone manual calculations and fragmented records. Everything needed to run payroll is here.
            </p>
          </div>

          <div className="lp-features-grid">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="lp-feature-card">
                <div className="lp-feature-icon-wrap">
                  {feature.icon}
                </div>
                <h3 className="lp-feature-title">{feature.title}</h3>
                <p className="lp-feature-desc">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3-Step Guided Workflow */}
      <section id="workflow" className="lp-workflow-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <h2 className="lp-section-title">From cut-off attendance to submitted payroll in three steps</h2>
            <p className="lp-section-subtitle">
              Designed for speed without compromising compliance or financial auditing controls.
            </p>
          </div>

          <div className="lp-workflow-grid">
            {WORKFLOW_STEPS.map((step) => (
              <div key={step.number} className="lp-step-card">
                <div className="lp-step-num">{step.number}</div>
                <h3 className="lp-step-title">{step.title}</h3>
                <p className="lp-step-desc">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Statutory Compliance & Security */}
      <section id="compliance" className="lp-compliance-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <h2 className="lp-section-title">Philippine statutory readiness with enterprise security</h2>
            <p className="lp-section-subtitle">
              Keep your organization fully aligned with DOLE, BIR, SSS, and data privacy regulations.
            </p>
          </div>

          <div className="lp-compliance-grid">
            <div className="lp-compliance-box">
              <div className="lp-box-header">
                <Icons.ShieldCheck />
                <h3>Philippine Statutory Compliance</h3>
              </div>
              <ul className="lp-check-list">
                {STATUTORY_ITEMS.map((item) => (
                  <li key={item.label} className="lp-check-item">
                    <span className="lp-item-check"><Icons.Check /></span>
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lp-compliance-box">
              <div className="lp-box-header">
                <Icons.Lock />
                <h3>Security &amp; Data Governance</h3>
              </div>
              <ul className="lp-check-list">
                {SECURITY_ITEMS.map((item) => (
                  <li key={item.label} className="lp-check-item">
                    <span className="lp-item-check"><Icons.Check /></span>
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="lp-faq-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <h2 className="lp-section-title">Frequently Asked Questions</h2>
            <p className="lp-section-subtitle">
              Everything you need to know about setting up, running payroll, and managing company benefits.
            </p>
          </div>

          <div className="lp-faq-accordion">
            {FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={faq.question} className={`lp-faq-item ${isOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="lp-faq-question"
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                  >
                    <span>{faq.question}</span>
                    <Icons.ChevronDown open={isOpen} />
                  </button>
                  {isOpen && (
                    <div className="lp-faq-answer">
                      <p>{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner (Solid Deep Emerald) */}
      <section className="lp-cta-banner">
        <div className="lp-container lp-cta-inner">
          <div className="lp-cta-content">
            <h2 className="lp-cta-title">Ready to streamline your company&apos;s payroll?</h2>
            <p className="lp-cta-desc">
              Experience fast, compliant payroll runs, zero spreadsheet headaches, and transparent employee benefits today.
            </p>
          </div>
          <div className="lp-cta-buttons">
            <Link to="/login?as=hr" className="lp-btn lp-btn-white lp-btn-xl">
              <span>HR Admin Portal</span>
              <Icons.ArrowRight />
            </Link>
            <Link to="/login?as=employee" className="lp-btn lp-btn-transparent lp-btn-xl">
              <span>Employee Portal</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-col lp-footer-brand-col">
            <div className="lp-brand">
              <img src="/logo.jpg" alt="Logo" className="lp-brand-logo" />
              <span className="lp-brand-title">{company}</span>
            </div>
            <p className="lp-footer-brand-text">
              Secure, accurate, and compliant semi-monthly payroll, statutory benefits, and employee self-service management.
            </p>
            <div className="lp-status-pill">
              <span className="lp-status-dot"></span>
              <span>All Systems Operational</span>
            </div>
          </div>

          <div className="lp-footer-col">
            <h4 className="lp-footer-head">Platform</h4>
            <ul className="lp-footer-links">
              <li><a href="#features">Payroll Runs</a></li>
              <li><a href="#compliance">Statutory Breakdown</a></li>
              <li><a href="#workflow">Workflow</a></li>
              <li><a href="#features">HMO Benefits</a></li>
              <li><a href="#features">13th Month Pay</a></li>
            </ul>
          </div>

          <div className="lp-footer-col">
            <h4 className="lp-footer-head">Compliance</h4>
            <ul className="lp-footer-links">
              <li><a href="#compliance">SSS Contributions</a></li>
              <li><a href="#compliance">PhilHealth Rates</a></li>
              <li><a href="#compliance">Pag-IBIG / HDMF</a></li>
              <li><a href="#compliance">BIR TRAIN Law</a></li>
              <li><a href="#compliance">Audit Trails</a></li>
            </ul>
          </div>

          <div className="lp-footer-col">
            <h4 className="lp-footer-head">Access &amp; Legal</h4>
            <ul className="lp-footer-links">
              <li><Link to="/login?as=hr">HR Admin Portal</Link></li>
              <li><Link to="/login?as=employee">Employee Portal</Link></li>
              <li><Link to="/register">Create HR Account</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
              <li><a href="#faq">Support FAQ</a></li>
            </ul>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <div className="lp-container lp-footer-bottom-inner">
            <p>&copy; {new Date().getFullYear()} {company}. All rights reserved.</p>
            <p className="lp-footer-built">Engineered for accuracy and statutory compliance.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
