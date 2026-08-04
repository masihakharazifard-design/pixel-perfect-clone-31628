import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Layers, LogIn } from "lucide-react";

export type AppRole = "beheerder" | "planner" | "projectleider" | "financieel" | "medewerker";
const ROLE_LABELS: Record<AppRole, string> = {
  beheerder: "Beheerder",
  planner: "Planner",
  projectleider: "Projectleider",
  financieel: "Financieel",
  medewerker: "Medewerker",
};

interface AuthCtx {
  user: User | null;
  roles: AppRole[];
  roleLabel: string;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>({ user: null, roles: [], roleLabel: "", signOut: async () => {} });
export function useAuth() {
  return useContext(Ctx);
}
export { ROLE_LABELS };

async function ensureDefaultRole(userId: string): Promise<AppRole[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as AppRole);
  if (roles.length > 0) return roles;
  await supabase.from("user_roles").insert({ user_id: userId, role: "medewerker" });
  return ["medewerker"];
}

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const microsoftLogin = async () => {
    setError("");
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid email profile",
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setBusy(false);
    if (err) setError(err.message);
  };

  const passwordLogin = async () => {
    setError("");
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) setError(err.message);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#F0F3F8] px-4"
      style={{ fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[rgba(26,39,68,0.08)] p-7 shadow-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#0ABFB8] flex items-center justify-center mb-3">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold text-[#1A2744]">Projectplanning</h1>
          <p className="text-sm text-[#6B7A99] mt-1">Log in met uw zakelijke account</p>
        </div>

        <label className="block text-xs font-semibold text-[#6B7A99] mb-1.5">Zakelijk e-mailadres</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="naam@bedrijf.nl"
          className="w-full px-3 py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-sm text-[#1A2744] outline-none focus:border-[#0ABFB8] mb-3"
        />

        {showPassword && (
          <>
            <label className="block text-xs font-semibold text-[#6B7A99] mb-1.5">Wachtwoord</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void passwordLogin();
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-sm text-[#1A2744] outline-none focus:border-[#0ABFB8] mb-3"
            />
            <button
              onClick={() => void passwordLogin()}
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-[#1A2744] text-white text-sm font-semibold hover:bg-[#24365c] disabled:opacity-50 mb-3"
            >
              Inloggen
            </button>
          </>
        )}

        <button
          onClick={() => void microsoftLogin()}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-[#0ABFB8] text-white text-sm font-semibold hover:bg-[#09a9a3] disabled:opacity-50"
        >
          <LogIn className="w-4 h-4" />
          Inloggen met Microsoft
        </button>

        {error && <p className="mt-3 text-xs text-[#c0392b]">{error}</p>}

        <button
          onClick={() => setShowPassword((v) => !v)}
          className="mt-4 w-full text-xs text-[#6B7A99] hover:text-[#1A2744]"
        >
          {showPassword ? "Verberg e-mail en wachtwoord" : "Inloggen met e-mail en wachtwoord"}
        </button>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>([]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) {
      setRoles([]);
      return;
    }
    let cancelled = false;
    void ensureDefaultRole(uid).then((r) => {
      if (!cancelled) setRoles(r);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  if (!ready) return <div className="min-h-screen bg-[#F0F3F8]" />;
  if (!session) return <LoginScreen />;


  const primary = (["beheerder", "planner", "projectleider", "financieel", "medewerker"] as AppRole[]).find((r) =>
    roles.includes(r),
  );

  return (
    <Ctx.Provider
      value={{
        user: session.user,
        roles,
        roleLabel: primary ? ROLE_LABELS[primary] : "Medewerker",
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
