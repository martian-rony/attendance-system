import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { LoadingScreen } from "../components/ui/index.jsx";

export function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  return children;
}

export function PublicRoute({ children }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  if (isAuthenticated && user) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  return children;
}
