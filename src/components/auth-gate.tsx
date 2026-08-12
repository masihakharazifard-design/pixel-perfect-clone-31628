import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapMyRole } from "@/lib/planning-store";
import { LogIn } from "lucide-react";
import maasmondLogo from "@/assets/maasmond-logo.jpg.asset.json";

// Tijdelijk: inloggen met Microsoft staat uit.
// Iedereen met een @maasmond.nl e-mailadres komt direct binnen (demo-login).
const TOEGESTAAN_DOMEIN = "maasmond.nl";
const DEMO_KEY = "maasmond-demo-user";

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

function emailDomain(mail: string): string {
  const idx = mail.lastIndexOf("@");
  return idx < 0 ? "" : mail.slice(idx + 1).toLowerCase();
}

export function LoginScreen({
  melding,
  onDemoLogin,
}: {
  melding?: string;
  onDemoLogin?: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    if (emailDomain(mail) !== TOEGESTAAN_DOMEIN) {
      setError("Gebruik een e-mailadres dat eindigt op @maasmond.nl.");
      return;
    }
    setError("");
    onDemoLogin?.(mail);
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
          <p className="text-sm text-[#6B7A99] mt-1">Vul uw Maasmond e-mailadres in om verder te gaan</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="naam@maasmond.nl"
            className="w-full px-3 py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-sm text-[#1A2744] outline-none focus:border-[#0ABFB8]"
          />
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-[#0ABFB8] text-white text-sm font-semibold hover:bg-[#09a9a3]"
          >
            <LogIn className="w-4 h-4" />
            Inloggen
          </button>
        </form>

        {(melding || error) && <p className="mt-3 text-xs text-[#c0392b]">{melding || error}</p>}
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [demoEmail, setDemoEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>([]);

  useEffect(() => {
    setDemoEmail(localStorage.getItem(DEMO_KEY));
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

  useEffect(() => {
    if (!user) {
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
  }, [user]);

  if (!ready) return <div className="min-h-screen bg-[#F0F3F8]" />;

  if (!user && !demoEmail) {
    return (
      <LoginScreen
        onDemoLogin={(mail) => {
          localStorage.setItem(DEMO_KEY, mail);
          setDemoEmail(mail);
        }}
      />
    );
  }

  const primary = (["beheerder", "planner", "projectleider", "financieel", "medewerker"] as AppRole[]).find((r) =>
    roles.includes(r),
  );

  const demoUser = demoEmail ? ({ id: "demo", email: demoEmail } as unknown as User) : null;

  return (
    <Ctx.Provider
      value={{
        user: user ?? demoUser,
        roles,
        roleLabel: primary ? ROLE_LABELS[primary] : "Medewerker",
        signOut: async () => {
          localStorage.removeItem(DEMO_KEY);
          await supabase.auth.signOut();
          window.location.href = "/";
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
