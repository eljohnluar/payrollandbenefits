import { Link } from 'react-router-dom';

export function HomeButton() {
  return (
    <Link to="/" className="home-btn" title="Back to home">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5 12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5H15v-6.5H9v6.5H4.5A1.5 1.5 0 0 1 3 20Z" />
      </svg>
      Home
    </Link>
  );
}

/** Horizontal split auth card: company/portal info on the left, form on the right. */
export default function AuthShell({ company, info, children }) {
  return (
    <div className="login-wrap">
      <div className="login-card split">
        <div className="login-info">
          {company && <div className="brand-company">{company}</div>}
          <h2>{info.title}</h2>
          <p className="info-sub">{info.subtitle}</p>
          <ul>
            {info.bullets.map((b) => (
              <li key={b}><span className="tick">✓</span><span>{b}</span></li>
            ))}
          </ul>
          {info.foot && <div className="info-foot">{info.foot}</div>}
        </div>
        <div className="login-form-side">
          <HomeButton />
          {children}
        </div>
      </div>
    </div>
  );
}
