import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Card } from '../../components/ui.jsx';

export default function EmployeePending() {
  const { user, logout } = useAuth();
  return (
    <Card body title="Welcome — one more step">
      <p style={{ marginTop: 0 }}>
        Hi {user?.name}, your employee login <strong>{user?.email}</strong> was created successfully.
      </p>
      <p>
        It is not yet attached to your employee record, so attendance, claims, leave and payroll
        aren’t visible yet. This happens automatically when you register with the email HR has on
        file or enter your employee code — otherwise just ask your HR Admin to link your account to
        your record from the Employees page. They can also create your record if it doesn’t exist yet.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <Link to="/employee/settings" className="btn small">Open Settings</Link>
        <button type="button" className="btn small ghost" onClick={logout}>Sign out</button>
      </div>
    </Card>
  );
}
