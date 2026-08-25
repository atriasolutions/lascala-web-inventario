import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type User } from './api';
import { persistentSessionHints } from './pwaSession';

type PosTerminal = { id: string; code: string; name: string; status: string };

type BranchCtx = {
  id: string;
  name: string;
  code: string;
  role?: string;
  pos_terminals?: PosTerminal[];
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
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function activePosList(branch?: BranchCtx | null) {
  return (branch?.pos_terminals || []).filter((p) => p.status === 'active');
}

function pickPosId(branch: BranchCtx | undefined, preferred: string | null) {
  const list = activePosList(branch);
  if (preferred && list.some((p) => p.id === preferred)) return preferred;
  return list[0]?.id ?? null;
}

function persistPos(id: string | null) {
  if (id) localStorage.setItem('lscala_pos', id);
  else localStorage.removeItem('lscala_pos');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('lscala_token'));
  const [branches, setBranches] = useState<BranchCtx[]>([]);
  const [branchId, setBranchIdState] = useState<string | null>(localStorage.getItem('lscala_branch'));
  const [posId, setPosIdState] = useState<string | null>(localStorage.getItem('lscala_pos'));
  const [loading, setLoading] = useState(true);
  const persistentUpgraded = useRef(false);

  const applyWorkplace = (list: BranchCtx[], preferredBranch: string | null, preferredPos: string | null) => {
    const nextBranch =
      (preferredBranch && list.some((b) => b.id === preferredBranch) ? preferredBranch : null) ||
      list[0]?.id ||
      null;
    const branch = list.find((b) => b.id === nextBranch);
    const nextPos = pickPosId(branch, preferredPos);
    setBranchIdState(nextBranch);
    setPosIdState(nextPos);
    if (nextBranch) localStorage.setItem('lscala_branch', nextBranch);
    else localStorage.removeItem('lscala_branch');
    persistPos(nextPos);
    return { nextBranch, nextPos };
  };

  const refreshUser = async () => {
    const me = await api<{ user: User }>('/api/auth/me');
    setUser(me.user);
  };

  const refreshBranches = async () => {
    const data = await api<{ branches: BranchCtx[] }>('/api/auth/context/branches');
    setBranches(data.branches);
    applyWorkplace(data.branches, branchId, posId);
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
        const hints = persistentSessionHints();
        if (hints.persistent && !persistentUpgraded.current) {
          persistentUpgraded.current = true;
          try {
            const session = await api<{ token: string }>('/api/auth/refresh', {
              method: 'POST',
              body: hints,
            });
            if (session.token && session.token !== token) {
              localStorage.setItem('lscala_token', session.token);
              setToken(session.token);
            }
          } catch {
            /* Sesión actual sigue válida; no forzar re-login. */
          }
        }
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
        const hints = persistentSessionHints();
        const data = await api<{ token: string; user: User }>('/api/auth/login', {
          method: 'POST',
          body: { email, password, ...hints },
          token: null,
        });
        if (hints.persistent) persistentUpgraded.current = true;
        localStorage.setItem('lscala_token', data.token);
        setToken(data.token);
        setUser(data.user);
      },
      logout() {
        persistentUpgraded.current = false;
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
        const b = branches.find((x) => x.id === id);
        if (!b) return;
        localStorage.setItem('lscala_branch', id);
        setBranchIdState(id);
        const nextPos = pickPosId(b, posId);
        setPosIdState(nextPos);
        persistPos(nextPos);
      },
      setPosId(id: string) {
        const b = branches.find((x) => x.id === branchId);
        if (!activePosList(b).some((p) => p.id === id)) return;
        persistPos(id);
        setPosIdState(id);
      },
      refreshBranches,
      refreshUser,
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

