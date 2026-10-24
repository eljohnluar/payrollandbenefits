import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import { Loading } from './components/ui.jsx';
import AppLayout from './components/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Landing from './pages/Landing.jsx';
import PayrollRun from './pages/PayrollRun.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Employees from './pages/Employees.jsx';
import EmployeeProfile from './pages/EmployeeProfile.jsx';
import Compensation from './pages/Compensation.jsx';
import Attendance from './pages/Attendance.jsx';
import Tax from './pages/Tax.jsx';
import Claims from './pages/Claims.jsx';
import Benefits from './pages/Benefits.jsx';
import BenefitPlans from './pages/BenefitPlans.jsx';
import ThirteenthMonth from './pages/ThirteenthMonth.jsx';
import Settings from './pages/Settings.jsx';
import Records from './pages/Records.jsx';
import Profile from './pages/Profile.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Archive from './pages/Archive.jsx';
import AuthConfirm from './pages/AuthConfirm.jsx';
import Terms from './pages/Terms.jsx';
import About from './pages/About.jsx';
import EmployeeDashboard from './pages/portal/EmployeeDashboard.jsx';
import MyAttendance from './pages/portal/MyAttendance.jsx';
import MyClaims from './pages/portal/MyClaims.jsx';
import MyBenefits from './pages/portal/MyBenefits.jsx';
import MyPayroll from './pages/portal/MyPayroll.jsx';
import MyProfile from './pages/portal/MyProfile.jsx';
import MyLeave from './pages/portal/MyLeave.jsx';
import EmployeeSettings from './pages/portal/EmployeeSettings.jsx';
import EmployeePending from './pages/portal/EmployeePending.jsx';

function HomeGate() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return user ? <AppLayout /> : <Landing />;
}

/** Two entry points: HR Admin sees the payroll dashboard, Employee the portal. */
function RequireHr() {
  const { user } = useAuth();
  return user?.role === 'Employee' ? <Navigate to="/employee" replace /> : <Outlet />;
}

function RequireEmployee() {
  const { user } = useAuth();
  const location = useLocation();
  if (user?.role !== 'Employee') return <Navigate to="/" replace />;
  // Unlinked employee logins still get Settings; everything else waits for HR to attach the record.
  if (!user.employee_id && !location.pathname.startsWith('/employee/settings')) return <EmployeePending />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/confirm" element={<AuthConfirm />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/about" element={<About />} />
      <Route
        path="/"
        element={<HomeGate />}
      >
        <Route element={<RequireHr />}>
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<Employees />} />
          <Route path="employees/:id" element={<EmployeeProfile />} />
          <Route path="compensation" element={<Compensation />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="payroll-run" element={<PayrollRun />} />
          <Route path="tax" element={<Tax />} />
          <Route path="claims" element={<Claims />} />
          <Route path="benefits" element={<Benefits />} />
          <Route path="benefit-plans" element={<BenefitPlans />} />
          <Route path="thirteenth-month" element={<ThirteenthMonth />} />
          <Route path="settings" element={<Settings />} />
          <Route path="records" element={<Records />} />
          <Route path="profile" element={<Profile />} />
          <Route path="audit-log" element={<AuditLog />} />
          <Route path="archive" element={<Archive />} />
        </Route>
        <Route path="employee" element={<RequireEmployee />}>
          <Route index element={<EmployeeDashboard />} />
          <Route path="attendance" element={<MyAttendance />} />
          <Route path="leave" element={<MyLeave />} />
          <Route path="claims" element={<MyClaims />} />
          <Route path="benefits" element={<MyBenefits />} />
          <Route path="payroll" element={<MyPayroll />} />
          <Route path="profile" element={<MyProfile />} />
          <Route path="settings" element={<EmployeeSettings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
