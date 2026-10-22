import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function RoleGuard({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role)) {
    return <div className="access-denied">Access Denied</div>;
  }
  return children;
}
