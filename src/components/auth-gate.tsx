import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapMyRole } from "@/lib/planning-store";
import { LogIn, Loader2, Mail } from "lucide-react";
import maasmondLogo from "@/assets/maasmond-logo.jpg.asset.json";

const TOEGESTAAN_DOMEIN = "@maasmond.nl";
const OUDE_DEMO_KEY = "maasmond-demo-user";

const MSG = {
  domein: "Gebruik je Maasmond e-mailadres om in te loggen.",
  verzonden: "We hebben een inloglink naar je Maasmond e-mailadres gestuurd.",
  geenRol:
    "Je account is aangemeld, maar heeft nog geen toegang tot Maasmond Planning. Neem contact op met de beheerder.",
  fout: "Inloggen is niet gelukt. Probeer het opnieuw.",
};

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

function isMaasmond(mail: string): boolean {
  return mail.trim().toLowerCase().endsWith(TOEGESTAAN_DOMEIN);
}

export function LoginScreen({ melding }: { melding?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stap, setStap] = useState<"email" | "code">("email");
  const [bezig, setBezig] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const vraagCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    setInfo("");
    if (!isMaasmond(mail)) {
      setError(MSG.domein);
      return;
    }
    setError("");
    setBezig(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: mail,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setBezig(false);
    if (err) {
      setError(/maasmond/i.test(err.message) ? MSG.domein : MSG.fout);
      return;
    }
    setInfo(MSG.verzonden);
    setStap("code");
  };

  const bevestigCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    const token = code.trim();
    if (token.length < 6) {
      setError("Vul de 6-cijferige code uit de e-mail in.");
      return;
    }
    setError("");
    setBezig(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: mail, token, type: "email" });
    setBezig(false);
    if (err) {
      setError(MSG.fout);
      return;
    }
    // onAuthStateChange in AuthGate laat de app zien.
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
          <p className="text-sm text-[#6B7A99] mt-1">
            {stap === "email" ? "Vul je Maasmond e-mailadres in om in te loggen" : "Vul de code uit je e-mail in"}
          </p>
        </div>

        {stap === "email" ? (
          <form onSubmit={vraagCode} className="space-y-3">
            <label className="block text-xs font-semibold text-[#1A2744]" htmlFor="login-email">
              E-mailadres
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@maasmond.nl"
              className="w-full px-3 py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-sm text-[#1A2744] outline-none focus:border-[#0ABFB8]"
            />
            <button
              type="submit"
              disabled={bezig}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-[#0ABFB8] text-white text-sm font-semibold hover:bg-[#09a9a3] disabled:opacity-60"
            >
              {bezig ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Inloggen
            </button>
          </form>
        ) : (
          <form onSubmit={bevestigCode} className="space-y-3">
            <label className="block text-xs font-semibold text-[#1A2744]" htmlFor="login-code">
              Inlogcode
            </label>
            <input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="w-full px-3 py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-sm tracking-[0.3em] text-[#1A2744] outline-none focus:border-[#0ABFB8]"
            />
            <button
              type="submit"
              disabled={bezig}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-[#0ABFB8] text-white text-sm font-semibold hover:bg-[#09a9a3] disabled:opacity-60"
            >
              {bezig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Bevestigen
            </button>
            <button
              type="button"
              onClick={() => {
                setStap("email");
                setCode("");
                setError("");
                setInfo("");
              }}
              className="w-full text-xs text-[#6B7A99] hover:text-[#1A2744]"
            >
              Ander e-mailadres gebruiken
            </button>
          </form>
        )}

        {info && !error && <p className="mt-3 text-xs text-[#0A8F8A]">{info}</p>}
        {(melding || error) && <p className="mt-3 text-xs text-[#c0392b]">{melding || error}</p>}
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesReady, setRolesReady] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem(OUDE_DEMO_KEY);
    } catch {
      /* noop */
    }
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
      setRolesReady(false);
      return;
    }
    let cancelled = false;
    void bootstrapMyRole()
      .then(() => supabase.from("user_roles").select("role").eq("user_id", user.id))
      .then(({ data }) => {
        if (!cancelled) {
          setRoles(((data ?? []) as { role: string }[]).map((r) => r.role as AppRole));
          setRolesReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoles([]);
          setRolesReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (!ready) return <div className="min-h-screen bg-[#F0F3F8]" />;

  if (!user) return <LoginScreen />;

  if (rolesReady && roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F0F3F8] px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-[rgba(26,39,68,0.08)] p-7 shadow-sm text-center">
          <img
            src={maasmondLogo.url}
            alt="Maasmond logo"
            className="w-14 h-14 rounded-xl object-contain mb-3 mx-auto"
          />
          <p className="text-sm text-[#1A2744]">{MSG.geenRol}</p>
          <button
            onClick={() => void signOut()}
            className="mt-4 w-full py-2.5 rounded-xl bg-[#0ABFB8] text-white text-sm font-semibold hover:bg-[#09a9a3]"
          >
            Uitloggen
          </button>
        </div>
      </div>
    );
  }

  const primary = (["beheerder", "planner", "projectleider", "financieel", "medewerker"] as AppRole[]).find((r) =>
    roles.includes(r),
  );

  return (
    <Ctx.Provider
      value={{
        user,
        roles,
        roleLabel: primary ? ROLE_LABELS[primary] : "Medewerker",
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
