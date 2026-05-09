import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";

export interface WaiterUser {
  id: number;
  email: string;
  name: string;
  role: string;
  organizationId: number | null;
}

interface AuthContextType {
  user: WaiterUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

const BASE_API = import.meta.env.BASE_URL.replace(/\/waiter\/?$/, "") + "/api";

async function fetchMe(token: string): Promise<WaiterUser | null> {
  try {
    const r = await fetch(`${BASE_API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<WaiterUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("waiter_token"));

  useEffect(() => {
    const t = localStorage.getItem("waiter_token");
    if (!t) { setIsLoading(false); return; }
    fetchMe(t).then(u => { setUser(u); setToken(t); setIsLoading(false); });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await fetch(`${BASE_API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.message || "Невірний email або пароль");
    }
    const d = await r.json();
    localStorage.setItem("waiter_token", d.token);
    setToken(d.token);
    setUser(d.user);
    setLocation("/tables");
  }, [setLocation]);

  const logout = useCallback(() => {
    localStorage.removeItem("waiter_token");
    setToken(null);
    setUser(null);
    setLocation("/login");
  }, [setLocation]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
