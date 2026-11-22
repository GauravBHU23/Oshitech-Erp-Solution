"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Role, User } from "./types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, allowedRoles: Role[]) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const authRevision = useRef(0);

  const checkSession = useCallback(async (hideCurrentUser = false) => {
    const revision = ++authRevision.current;
    if (hideCurrentUser) {
      setUser(null);
      setLoading(true);
    }

    try {
      const currentUser = await api<User>("/auth/me/");
      if (revision === authRevision.current) setUser(currentUser);
    } catch {
      if (revision === authRevision.current) setUser(null);
    } finally {
      if (revision === authRevision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
    const restoredFromCache = (event: PageTransitionEvent) => {
      if (event.persisted) void checkSession(true);
    };
    const expired = () => {
      try { window.sessionStorage.setItem("oshitech-logout-reason", "expired"); } catch { /* ignore */ }
      authRevision.current += 1;
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("pageshow", restoredFromCache);
    window.addEventListener("auth:expired", expired);
    return () => {
      window.removeEventListener("pageshow", restoredFromCache);
      window.removeEventListener("auth:expired", expired);
    };
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string, allowedRoles: Role[]): Promise<User> => {
    authRevision.current += 1;
    setLoading(false);
    const r = await api<{ user: User }>("/auth/login/", { method: "POST", body: { email, password } });
    if (!allowedRoles.includes(r.user.role)) {
      await api("/auth/logout/", { method: "POST" }).catch(() => {});
      authRevision.current += 1;
      setUser(null);
      setLoading(false);
      throw new Error("Unable to sign in. Check your credentials or contact your administrator.");
    }
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    authRevision.current += 1;
    setUser(null);
    setLoading(false);
    await api("/auth/logout/", { method: "POST" });
  }, []);

  const refreshUser = useCallback(async () => {
    const current = await api<User>("/auth/me/");
    setUser(current);
    return current;
  }, []);

  return <Ctx.Provider value={{ user, loading, login, logout, refreshUser }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
