import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "../lib/api";

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (b: { email: string; password: string }) => Promise<void>;
  register: (b: { username: string; displayName: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const value: AuthState = {
    user,
    ready,
    login: async (b) => { const r = await api.login(b); setUser(r.user); },
    register: async (b) => { const r = await api.register(b); setUser(r.user); },
    logout: async () => { await api.logout(); setUser(null); },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
