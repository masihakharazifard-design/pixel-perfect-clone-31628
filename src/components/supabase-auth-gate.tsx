import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapMyRole } from "@/lib/planning-store";
import { LogIn, Loader2, Mail } from "lucide-react";
import maasmondLogo from "@/assets/maasmond-logo.jpg";
import { MaasmondScene } from "@/components/maasmond-scene";
import { Ctx, ROLE_LABELS, type AppRole } from "@/components/auth-context";

const TOEGESTAAN_DOMEIN = "@maasmond.nl";
const OUDE_DEMO_KEY = "maasmond-demo-user";

const MSG = {
  domein: "Gebruik je Maasmond e-mailadres om in te loggen.",
  verzonden: "We hebben een inloglink naar je Maasmond e-mailadres gestuurd.",
  geenRol:
    "Je account is aangemeld, maar heeft nog geen toegang tot Maasmond Planning. Neem contact op met de beheerder.",
  fout: "Inloggen is niet gelukt. Probeer het opnieuw.",
};

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
    const vraagAan = () =>
      supabase.auth.signInWithOtp({
        email: mail,
        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
      });
    const isLimiet = (e: { status?: number; message: string }) =>
      e.status === 429 || /rate limit|too many|security purposes/i.test(e.message);
    let { error: err } = await vraagAan();
    // Bij de allereerste keer inloggen wordt eerst een account aangemaakt; dat mislukt soms één keer.
    // Dan direct zelf nog een keer proberen (zoals wanneer iemand het handmatig opnieuw probeert).
    if (err && !isLimiet(err) && !/maasmond/i.test(err.message)) {
      await new Promise((r) => setTimeout(r, 1500));
      ({ error: err } = await vraagAan());
    }
    setBezig(false);
    if (err) {
      console.warn("Inlogcode aanvragen mislukt:", err.status, err.message);
      setError(
        /maasmond/i.test(err.message)
          ? MSG.domein
          : isLimiet(err)
            ? "Er zijn net te veel inlogcodes aangevraagd. Wacht een paar minuten en probeer het dan opnieuw."
            : `${MSG.fout} (${err.message})`,
      );
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
    // onAuthStateChange in de gate laat de app zien.
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center bg-[#F5F5F5] px-4 overflow-hidden"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <MaasmondScene variant="login" />
      <div className="relative w-full max-w-sm bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-7 shadow-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <img src={maasmondLogo} alt="Maasmond logo" className="w-14 h-14 rounded-md object-contain mb-3" />
          <h1 className="text-lg font-bold text-[#242424]">Maasmond planning</h1>
          <p className="text-sm text-[#616161] mt-1">
            {stap === "email" ? "Vul je Maasmond e-mailadres in om in te loggen" : "Vul de code uit je e-mail in"}
          </p>
        </div>

        {stap === "email" ? (
          <form onSubmit={vraagCode} className="space-y-3">
            <label className="block text-xs font-semibold text-[#242424]" htmlFor="login-email">
              E-mailadres
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@maasmond.nl"
              className="w-full px-3 py-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-sm text-[#242424] outline-none focus:border-[#1E3A7B]"
            />
            <button
              type="submit"
              disabled={bezig}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-md bg-[#1E3A7B] text-white text-sm font-semibold hover:bg-[#1E3A7B] disabled:opacity-60"
            >
              {bezig ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Inloggen
            </button>
          </form>
        ) : (
          <form onSubmit={bevestigCode} className="space-y-3">
            <label className="block text-xs font-semibold text-[#242424]" htmlFor="login-code">
              Inlogcode
            </label>
            <input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="w-full px-3 py-2.5 rounded-md border border-[rgba(0,0,0,0.15)] text-sm tracking-[0.3em] text-[#242424] outline-none focus:border-[#1E3A7B]"
            />
            <button
              type="submit"
              disabled={bezig}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-md bg-[#1E3A7B] text-white text-sm font-semibold hover:bg-[#1E3A7B] disabled:opacity-60"
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
              className="w-full text-xs text-[#616161] hover:text-[#242424]"
            >
              Ander e-mailadres gebruiken
            </button>
          </form>
        )}

        {info && !error && <p className="mt-3 text-xs text-[#1E3A7B]">{info}</p>}
        {(melding || error) && <p className="mt-3 text-xs text-[#c0392b]">{melding || error}</p>}
      </div>
    </div>
  );
}

export default function SupabaseAuthGate({ children }: { children: ReactNode }) {
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

    const leesRollen = async (): Promise<AppRole[]> => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      return ((data ?? []) as { role: string }[]).map((r) => r.role as AppRole);
    };

    const bepaalRollen = async () => {
      // Maasmond-adressen krijgen automatisch toegang; probeer het meermaals
      // zodat een tijdelijke netwerkfout nooit als "geen toegang" oogt.
      for (let poging = 0; poging < 3; poging++) {
        try {
          await bootstrapMyRole();
        } catch {
          /* rol kan al bestaan of tijdelijke fout */
        }
        const gevonden = await leesRollen().catch(() => [] as AppRole[]);
        if (gevonden.length > 0) return gevonden;
        if (!isMaasmond(user.email ?? "")) return [];
        await new Promise((r) => setTimeout(r, 400 * (poging + 1)));
      }
      return [];
    };

    void bepaalRollen().then((gevonden) => {
      if (cancelled) return;
      setRoles(gevonden);
      setRolesReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (!ready) return <div className="min-h-screen bg-[#F5F5F5]" />;

  if (!user) return <LoginScreen />;

  if (rolesReady && roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5] px-4">
        <div className="w-full max-w-sm bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-7 shadow-sm text-center">
          <img
            src={maasmondLogo}
            alt="Maasmond logo"
            className="w-14 h-14 rounded-md object-contain mb-3 mx-auto"
          />
          <p className="text-sm text-[#242424]">{MSG.geenRol}</p>
          <button
            onClick={() => void signOut()}
            className="mt-4 w-full py-2.5 rounded-md bg-[#1E3A7B] text-white text-sm font-semibold hover:bg-[#1E3A7B]"
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
