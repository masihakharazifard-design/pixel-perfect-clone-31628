import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { LogIn } from "lucide-react";
import maasmondLogo from "@/assets/maasmond-logo.jpg.asset.json";
import { Ctx, ROLE_LABELS } from "@/components/auth-context";

// DEMO MODE: geen Supabase, geen OTP, geen e-mail. Alles wat wordt ingevuld wordt geaccepteerd.
const SESSION_KEY = "maasmond-demo-session";
const OUDE_DEMO_KEY = "maasmond-demo-user";

interface DemoSession {
  email: string;
  ingelogdOp: string;
}

function leesSessie(): DemoSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as DemoSession;
    return s && typeof s.email === "string" ? s : null;
  } catch {
    return null;
  }
}

function DemoLoginScreen({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#F0F3F8] px-4"
      style={{ fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onLogin(email.trim() || "demo@maasmond.nl");
        }}
        className="w-full max-w-sm bg-white rounded-2xl border border-[rgba(26,39,68,0.08)] p-7 shadow-sm space-y-3"
      >
        <div className="flex flex-col items-center text-center mb-3">
          <img src={maasmondLogo.url} alt="Maasmond logo" className="w-14 h-14 rounded-xl object-contain mb-3" />
          <h1 className="text-lg font-bold text-[#1A2744]">Maasmond planning</h1>
          <p className="text-sm text-[#6B7A99] mt-1">Demo-omgeving — vul iets in en log in</p>
        </div>

        <label className="block text-xs font-semibold text-[#1A2744]" htmlFor="demo-email">
          E-mailadres
        </label>
        <input
          id="demo-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="naam@maasmond.nl"
          className="w-full px-3 py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-sm text-[#1A2744] outline-none focus:border-[#0ABFB8]"
        />

        <label className="block text-xs font-semibold text-[#1A2744]" htmlFor="demo-code">
          Code
        </label>
        <input
          id="demo-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          className="w-full px-3 py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-sm tracking-[0.2em] text-[#1A2744] outline-none focus:border-[#0ABFB8]"
        />

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-[#0ABFB8] text-white text-sm font-semibold hover:bg-[#09a9a3]"
        >
          <LogIn className="w-4 h-4" />
          Inloggen
        </button>
        <p className="text-[11px] text-[#6B7A99] text-center">
          Demo-modus: er worden geen echte gegevens of e-mails verstuurd.
        </p>
      </form>
    </div>
  );
}

export default function DemoAuthGate({ children }: { children: ReactNode }) {
  const [sessie, setSessie] = useState<DemoSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem(OUDE_DEMO_KEY);
    } catch {
      /* noop */
    }
    setSessie(leesSessie());
    setReady(true);
  }, []);

  const login = (email: string) => {
    const s: DemoSession = { email, ingelogdOp: new Date().toISOString() };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      /* noop */
    }
    setSessie(s);
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(OUDE_DEMO_KEY);
    } catch {
      /* noop */
    }
    setSessie(null);
  };

  if (!ready) return <div className="min-h-screen bg-[#F0F3F8]" />;
  if (!sessie) return <DemoLoginScreen onLogin={login} />;

  // Alleen frontend-demostatus; wordt nooit in user_roles opgeslagen.
  const demoUser = {
    id: "demo-user",
    email: sessie.email,
    app_metadata: {},
    user_metadata: {},
    aud: "demo",
    created_at: sessie.ingelogdOp,
  } as unknown as User;

  return (
    <Ctx.Provider value={{ user: demoUser, roles: ["beheerder"], roleLabel: ROLE_LABELS.beheerder, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
