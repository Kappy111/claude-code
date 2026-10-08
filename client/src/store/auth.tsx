import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { auth as authApi, setToken, getToken } from '../api';
import type { User } from '../types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (data: any) => Promise<void>;
  oauth: (provider: string, data: any) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      const u = await authApi.me();
      setUser(u);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAuth = (res: { token: string; user: User }) => {
    setToken(res.token);
    setUser(res.user);
  };

  const value: AuthCtx = {
    user,
    loading,
    login: async (identifier, password) => handleAuth(await authApi.login(identifier, password)),
    signup: async (data) => handleAuth(await authApi.signup(data)),
    oauth: async (provider, data) => handleAuth(await authApi.oauth(provider, data)),
    logout: () => { setToken(null); setUser(null); },
    refresh,
    setUser: (u) => setUser(u),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
