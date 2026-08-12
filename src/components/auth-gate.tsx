import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapMyRole } from "@/lib/planning-store";
import { LogIn } from "lucide-react";
import maasmondLogo from "@/assets/maasmond-logo.jpg.asset.json";

// Inloggen kan uitsluitend met een Microsoft-account van Maasmond.
// Er is geen demo-login en geen wachtwoordlogin meer.
const TOEGESTAAN_DOMEIN = "maasmond.nl";

// Tijdelijk: inloggen met Microsoft staat uit. Zet op false om de login weer te verplichten.
const LOGIN_UITGESCHAKELD = true;

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

function emailDomain(user: User | null): string {
  const mail = user?.email ?? "";
  const idx = mail.lastIndexOf("@");
  return idx < 0 ? "" : mail.slice(idx + 1).toLowerCase();
}

export function LoginScreen({ melding }: { melding?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const microsoftLogin = async () => {
    setError("");
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid email profile",
        redirectTo: window.location.origin,
      },
    });
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
          <img src={maasmondLogo.url} alt="Maasmond logo" className="w-14 h-14 rounded-xl object-contain mb-3" />
          <h1 className="text-lg font-bold text-[#1A2744]">Maasmond planning</h1>
          <p className="text-sm text-[#6B7A99] mt-1">Log in met uw Maasmond Microsoft-account</p>
        </div>

        <button
          onClick={() => void microsoftLogin()}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-[#0ABFB8] text-white text-sm font-semibold hover:bg-[#09a9a3] disabled:opacity-50"
        >
          <LogIn className="w-4 h-4" />
          Inloggen met Microsoft
        </button>

        {(melding || error) && <p className="mt-3 text-xs text-[#c0392b]">{melding || error}</p>}
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [melding, setMelding] = useState("");

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

  const user = session?.user ?? null;
  const domeinOk = !user || emailDomain(user) === TOEGESTAAN_DOMEIN;

  // Accounts buiten het Maasmond-domein krijgen geen toegang.
  useEffect(() => {
    if (!LOGIN_UITGESCHAKELD && user && !domeinOk) {
      setMelding("Alleen accounts van maasmond.nl hebben toegang tot deze planning.");
      void supabase.auth.signOut();
    }
  }, [user, domeinOk]);

  useEffect(() => {
    if (!user || !domeinOk) {
      setRoles([]);
      return;
    }
    let cancelled = false;
    void bootstrapMyRole()
      .then(() => supabase.from("user_roles").select("role").eq("user_id", user.id))
      .then(({ data }) => {
        if (!cancelled) setRoles(((data ?? []) as { role: string }[]).map((r) => r.role as AppRole));
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, domeinOk]);

  if (!ready) return <div className="min-h-screen bg-[#F0F3F8]" />;
  if (!LOGIN_UITGESCHAKELD && (!user || !domeinOk)) return <LoginScreen melding={melding} />;

  const primary = (["beheerder", "planner", "projectleider", "financieel", "medewerker"] as AppRole[]).find((r) =>
    roles.includes(r),
  );

  return (
    <Ctx.Provider
      value={{
        user,
        roles,
        roleLabel: primary ? ROLE_LABELS[primary] : "Medewerker",
        signOut: async () => {
          await supabase.auth.signOut();
          window.location.href = "/";
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
