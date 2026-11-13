import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  api,
  getToken,
  setToken,
  setUnauthorizedHandler,
  type User,
} from "./api";

interface Auth {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: Parameters<typeof api.register>[0]) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Parameters<typeof api.updateMe>[0]) => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!getToken());

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    if (!getToken()) return;
    api
      .me()
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (data: Parameters<typeof api.register>[0]) => {
      const res = await api.register(data);
      setToken(res.access_token);
      setUser(res.user);
    },
    [],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (data: Parameters<typeof api.updateMe>[0]) => {
      setUser(await api.updateMe(data));
    },
    [],
  );

  const value = useMemo(
    () => ({ user, ready, login, register, logout, updateProfile }),
    [user, ready, login, register, logout, updateProfile],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  if (!user)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`}
        replace
      />
    );
  return <>{children}</>;
}
