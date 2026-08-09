import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type User } from './api';

type BranchCtx = {
  id: string;
  name: string;
  code: string;
  role?: string;
  pos_terminals?: { id: string; code: string; name: string; status: string }[];
};

type AuthState = {
  user: User | null;
  token: string | null;
  branches: BranchCtx[];
  branchId: string | null;
  posId: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setBranchId: (id: string) => void;
  setPosId: (id: string) => void;
  refreshBranches: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('lscala_token'));
  const [branches, setBranches] = useState<BranchCtx[]>([]);
  const [branchId, setBranchIdState] = useState<string | null>(localStorage.getItem('lscala_branch'));
  const [posId, setPosIdState] = useState<string | null>(localStorage.getItem('lscala_pos'));
  const [loading, setLoading] = useState(true);

  const refreshBranches = async () => {
    const data = await api<{ branches: BranchCtx[] }>('/api/auth/context/branches');
    setBranches(data.branches);
    if (!branchId && data.branches[0]) {
      setBranchIdState(data.branches[0].id);
      localStorage.setItem('lscala_branch', data.branches[0].id);
      const firstPos = data.branches[0].pos_terminals?.find((p) => p.status === 'active');
      if (firstPos) {
        setPosIdState(firstPos.id);
        localStorage.setItem('lscala_pos', firstPos.id);
      }
    }
  };

  useEffect(() => {
    (async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await api<{ user: User }>('/api/auth/me');
        setUser(me.user);
        await refreshBranches();
      } catch {
        localStorage.removeItem('lscala_token');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      branches,
      branchId,
      posId,
      loading,
      async login(email, password) {
        const data = await api<{ token: string; user: User }>('/api/auth/login', {
          method: 'POST',
          body: { email, password },
          token: null,
        });
        localStorage.setItem('lscala_token', data.token);
        setToken(data.token);
        setUser(data.user);
      },
      logout() {
        localStorage.removeItem('lscala_token');
        localStorage.removeItem('lscala_branch');
        localStorage.removeItem('lscala_pos');
        setToken(null);
        setUser(null);
        setBranches([]);
        setBranchIdState(null);
        setPosIdState(null);
      },
      setBranchId(id: string) {
        localStorage.setItem('lscala_branch', id);
        setBranchIdState(id);
        const b = branches.find((x) => x.id === id);
        const firstPos = b?.pos_terminals?.find((p) => p.status === 'active');
        if (firstPos) {
          localStorage.setItem('lscala_pos', firstPos.id);
          setPosIdState(firstPos.id);
        }
      },
      setPosId(id: string) {
        localStorage.setItem('lscala_pos', id);
        setPosIdState(id);
      },
      refreshBranches,
    }),
    [user, token, branches, branchId, posId, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
