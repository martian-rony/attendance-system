import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext.jsx";
import { ProtectedRoute, PublicRoute } from "./routes/ProtectedRoute.jsx";
import { AppLayout } from "./components/layout/AppLayout.jsx";

import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";
import ForgotPassword, { ResetPassword } from "./pages/auth/ForgotPassword.jsx";

import AdminDashboard from "./pages/admin/Dashboard.jsx";
import AdminUsers from "./pages/admin/Users.jsx";
import AdminCourses from "./pages/admin/Courses.jsx";
import AdminSessions from "./pages/admin/Sessions.jsx";
import AdminReports from "./pages/admin/Reports.jsx";
import AdminAudit from "./pages/admin/AuditLogs.jsx";

import FacultyDashboard from "./pages/faculty/Dashboard.jsx";
import FacultyCourses from "./pages/faculty/Courses.jsx";
import FacultySessions from "./pages/faculty/Sessions.jsx";
import FacultySessionDetail from "./pages/faculty/SessionDetail.jsx";
import FacultyReports from "./pages/faculty/Reports.jsx";

import StudentDashboard from "./pages/student/Dashboard.jsx";
import StudentCourses from "./pages/student/Courses.jsx";
import StudentBrowse from "./pages/student/Browse.jsx";
import StudentAttendance from "./pages/student/Attendance.jsx";
import StudentScan from "./pages/student/Scan.jsx";

import NotFound from "./pages/NotFound.jsx";

function RoleLayout({ role, title, children }) {
  return (
    <ProtectedRoute roles={[role]}>
      <AppLayout role={role} title={title}>
        {children}
      </AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  const { user } = useAuth();

  return (
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <PublicRoute>
              <ResetPassword />
            </PublicRoute>
          }
        />

        {/* Root redirect */}
        <Route
          path="/"
          element={
            user ? (
              <Navigate to={`/${user.role}`} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Admin */}
        <Route
          path="/admin"
          element={
            <RoleLayout role="admin" title="Admin Dashboard">
              <AdminDashboard />
            </RoleLayout>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RoleLayout role="admin" title="Users">
              <AdminUsers />
            </RoleLayout>
          }
        />
        <Route
          path="/admin/courses"
          element={
            <RoleLayout role="admin" title="Courses">
              <AdminCourses />
            </RoleLayout>
          }
        />
        <Route
          path="/admin/sessions"
          element={
            <RoleLayout role="admin" title="Sessions">
              <AdminSessions />
            </RoleLayout>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <RoleLayout role="admin" title="Reports">
              <AdminReports />
            </RoleLayout>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RoleLayout role="admin" title="Audit Logs">
              <AdminAudit />
            </RoleLayout>
          }
        />

        {/* Faculty */}
        <Route
          path="/faculty"
          element={
            <RoleLayout role="faculty" title="Faculty Dashboard">
              <FacultyDashboard />
            </RoleLayout>
          }
        />
        <Route
          path="/faculty/courses"
          element={
            <RoleLayout role="faculty" title="My Courses">
              <FacultyCourses />
            </RoleLayout>
          }
        />
        <Route
          path="/faculty/sessions"
          element={
            <RoleLayout role="faculty" title="Sessions">
              <FacultySessions />
            </RoleLayout>
          }
        />
        <Route
          path="/faculty/sessions/:id"
          element={
            <RoleLayout role="faculty" title="Session">
              <FacultySessionDetail />
            </RoleLayout>
          }
        />
        <Route
          path="/faculty/reports"
          element={
            <RoleLayout role="faculty" title="Reports">
              <FacultyReports />
            </RoleLayout>
          }
        />

        {/* Student */}
        <Route
          path="/student"
          element={
            <RoleLayout role="student" title="Student Dashboard">
              <StudentDashboard />
            </RoleLayout>
          }
        />
        <Route
          path="/student/courses"
          element={
            <RoleLayout role="student" title="My Courses">
              <StudentCourses />
            </RoleLayout>
          }
        />
        <Route
          path="/student/browse"
          element={
            <RoleLayout role="student" title="Browse Courses">
              <StudentBrowse />
            </RoleLayout>
          }
        />
        <Route
          path="/student/attendance"
          element={
            <RoleLayout role="student" title="My Attendance">
              <StudentAttendance />
            </RoleLayout>
          }
        />
        <Route
          path="/student/scan"
          element={
            <RoleLayout role="student" title="Mark Attendance">
              <StudentScan />
            </RoleLayout>
          }
        />

        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
