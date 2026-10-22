import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const adminLinks = [
  { to: '/dashboard', label: '📊 Dashboard' },
  { to: '/members', label: '👥 Members' },
  { to: '/savings', label: '💰 Savings' },
  { to: '/loans', label: '🏦 Loans' },
  { to: '/repayments', label: '💳 Repayments' },
  { to: '/reports', label: '📋 Reports' },
];

const memberLinks = [
  { to: '/dashboard', label: '📊 My Dashboard' },
  { to: '/savings', label: '💰 My Savings' },
  { to: '/loans', label: '🏦 My Loans' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = ['admin', 'treasurer'].includes(user?.role) ? adminLinks : memberLinks;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>🌿 Tarzan</h2>
          <p>SACCO Ledger</p>
        </div>
        <nav>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p className="user-info">{user?.username} <span className="role-badge">{user?.role}</span></p>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
