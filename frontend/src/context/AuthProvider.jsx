import { createContext, useContext, useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const AuthContext = createContext(null);

// status: "loading" | "anon" | "authed"
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null });

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API}/auth/me`);
      if (r.ok) setState({ status: "authed", user: await r.json() });
      else setState({ status: "anon", user: null });
    } catch {
      setState({ status: "anon", user: null });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = () => { window.location.href = `${API}/auth/login`; };
  const logout = async () => {
    try { await fetch(`${API}/auth/logout`, { method: "POST" }); } catch {}
    setState({ status: "anon", user: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
