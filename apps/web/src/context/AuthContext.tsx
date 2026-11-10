import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "../lib/api";
import { queryClient } from "../lib/queryClient";

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
    // Cada cambio de sesión vacía la caché de consultas. Las claves no llevan
    // el usuario adentro (["perfil"], ["snippets"], ["repos"]…), así que sin
    // esto la siguiente persona que entra en el mismo navegador alcanza a ver
    // los datos de la anterior mientras se revalidan en segundo plano.
    login: async (b) => { const r = await api.login(b); queryClient.clear(); setUser(r.user); },
    register: async (b) => { const r = await api.register(b); queryClient.clear(); setUser(r.user); },
    logout: async () => {
      // Aunque el servidor falle, cerramos sesión en el cliente: el botón "Salir"
      // siempre debe surtir efecto para la persona.
      try { await api.logout(); } catch { /* ignoramos el error del servidor */ }
      queryClient.clear();
      setUser(null);
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
