import { createContext, useContext, useState, useEffect } from 'react';
import { getMe } from '../api/services';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('tarzan_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tarzan_token');
    if (!token) { setLoading(false); return; }
    getMe()
      .then((res) => setUser(res.data.user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, []);

  function setAuth(token, userData) {
    localStorage.setItem('tarzan_token', token);
    localStorage.setItem('tarzan_user', JSON.stringify(userData));
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('tarzan_token');
    localStorage.removeItem('tarzan_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
