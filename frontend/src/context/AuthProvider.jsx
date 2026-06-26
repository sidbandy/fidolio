import { createContext, useContext, useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const AuthContext = createContext(null);

// status: "loading" | "guest" (exploring the owner's demo) | "authed" (logged in as themselves)
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null, demoOwner: null });

  const refresh = useCallback(async () => {
    try {
      const d = await (await fetch(`${API}/auth/me`)).json();
      if (d.authenticated) setState({ status: "authed", user: d, demoOwner: null });
      else setState({ status: "guest", user: null, demoOwner: d.demo_owner });
    } catch {
      setState({ status: "guest", user: null, demoOwner: null });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = () => { window.location.href = `${API}/auth/login`; };
  const logout = async () => {
    try { await fetch(`${API}/auth/logout`, { method: "POST" }); } catch {}
    setState({ status: "guest", user: null, demoOwner: state.demoOwner });
  };

  return (
    <AuthContext.Provider value={{ ...state, isGuest: state.status === "guest", refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
