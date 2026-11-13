import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "../lib/api";
import { queryClient } from "../lib/queryClient";

interface AuthState {
  user: User | null;
  /**
   * Los permisos de la sesión, tal cual los manda /auth/me. La interfaz
   * pregunta por permiso ("channels.create"), nunca por rol: es la misma
   * regla que sigue el servidor, y así cambiar una política no obliga a
   * tocar el frontend.
   */
  permissions: string[];
  can: (permiso: string) => boolean;
  ready: boolean;
  login: (b: { email: string; password: string }) => Promise<void>;
  register: (b: { username: string; displayName: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.me()
      .then((r) => { setUser(r.user); setPermissions(r.permissions ?? []); })
      .catch(() => { setUser(null); setPermissions([]); })
      .finally(() => setReady(true));
  }, []);

  /**
   * Tras iniciar sesión hay que preguntar los permisos: la respuesta del
   * login sólo trae el usuario, y sin esto la interfaz escondería opciones
   * que la persona sí tiene hasta la siguiente recarga.
   */
  async function cargarPermisos() {
    try {
      const r = await api.me();
      setPermissions(r.permissions ?? []);
    } catch {
      setPermissions([]);
    }
  }

  const value: AuthState = {
    user,
    permissions,
    can: (permiso) => permissions.includes(permiso),
    ready,
    // Cada cambio de sesión vacía la caché de consultas. Las claves no llevan
    // el usuario adentro (["perfil"], ["snippets"], ["repos"]…), así que sin
    // esto la siguiente persona que entra en el mismo navegador alcanza a ver
    // los datos de la anterior mientras se revalidan en segundo plano.
    login: async (b) => {
      const r = await api.login(b);
      queryClient.clear();
      setUser(r.user);
      await cargarPermisos();
    },
    register: async (b) => {
      const r = await api.register(b);
      queryClient.clear();
      setUser(r.user);
      await cargarPermisos();
    },
    logout: async () => {
      // Aunque el servidor falle, cerramos sesión en el cliente: el botón "Salir"
      // siempre debe surtir efecto para la persona.
      try { await api.logout(); } catch { /* ignoramos el error del servidor */ }
      queryClient.clear();
      setUser(null);
      setPermissions([]);
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
