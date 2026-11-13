import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { bootstrapMyRole } from "@/lib/planning-store";
import { LogIn, Loader2, Mail } from "lucide-react";
import maasmondLogo from "@/assets/maasmond-logo.jpg";
import { LoginAchtergrond } from "@/components/login-achtergrond";
import { Ctx, ROLE_LABELS, type AppRole } from "@/components/auth-context";

const TOEGESTAAN_DOMEIN = "@maasmond.nl";

// Terugkomst van Microsoft (via de Lovable-aanmeldservice): de inloggegevens staan in het adres
// (#access_token=…&refresh_token=… of ?access_token=…). Vastleggen bij het laden van de pagina.
const START_ADRES = typeof window !== "undefined" ? { hash: window.location.hash, search: window.location.search } : { hash: "", search: "" };
function tokensUitAdres(): { access_token: string; refresh_token: string } | null {
  for (const deel of [START_ADRES.hash, START_ADRES.search]) {
    const p = new URLSearchParams(deel.replace(/^[#?]/, ""));
    const access_token = p.get("access_token"), refresh_token = p.get("refresh_token");
    if (access_token && refresh_token) return { access_token, refresh_token };
  }
  return null;
}
const OUDE_DEMO_KEY = "maasmond-demo-user";

const MSG = {
  domein: "Gebruik je Maasmond e-mailadres om in te loggen.",
  verzonden: "We hebben een inlogcode naar je Maasmond e-mailadres gestuurd. Gebruik altijd de code uit de nieuwste e-mail.",
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

  // Terug van Microsoft met een fout? Die staat in het adres (#error_description=… of ?error_description=…).
  // Toon hem, zodat duidelijk is waarom inloggen niet lukte, en haal hem daarna uit het adres.
  useEffect(() => {
    const uitAdres = (s: string) => new URLSearchParams(s.replace(/^[#?]/, ""));
    const h = uitAdres(START_ADRES.hash), q = uitAdres(START_ADRES.search);
    const fout = h.get("error_description") || q.get("error_description") || h.get("error") || q.get("error");
    if (!fout) return;
    const tekst = decodeURIComponent(fout.replace(/\+/g, " "));
    console.warn("Inloggen mislukt (terug van de aanmeldpagina):", tekst);
    setError(/maasmond/i.test(tekst) ? MSG.domein : `Inloggen met Microsoft is niet gelukt: ${tekst}`);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Inloggen met het Microsoft-account van Maasmond (Outlook/Teams), zonder code per e-mail.
  // Alleen @maasmond.nl-accounts worden toegelaten (database-controle); de rol volgt automatisch.
  const inloggenMicrosoft = async () => {
    setError("");
    setInfo("");
    setBezig(true);
    try {
      const result = await lovable.auth.signInWithOAuth("microsoft", { redirect_uri: window.location.origin });
      if (result.redirected) return;
      if (result.error) {
        console.warn("Inloggen met Microsoft mislukt:", result.error);
        const m = result.error.message || "";
        setError(/maasmond/i.test(m) ? MSG.domein : `Inloggen met Microsoft is niet gelukt. Probeer het opnieuw of log in met een code per e-mail. (${m})`);
      }
      // Gelukt: de sessie is gezet; de gate toont de app.
    } catch (e) {
      console.warn("Inloggen met Microsoft mislukt:", e);
      setError("Inloggen met Microsoft is niet gelukt. Probeer het opnieuw of log in met een code per e-mail.");
    } finally {
      setBezig(false);
    }
  };

  const vraagCode = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
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
    // Alleen bij een server- of netwerkfout opnieuw proberen: anders komt er een tweede e-mail
    // en is de code uit de eerste e-mail niet meer geldig.
    if (err && !isLimiet(err) && !/maasmond/i.test(err.message) && (!err.status || err.status >= 500)) {
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
    setCode("");
    setStap("code");
  };

  const bevestigCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    const token = code.trim();
    if (token.length < 6) {
      setError("Vul de volledige code uit de e-mail in.");
      return;
    }
    setError("");
    setBezig(true);
    let { error: err } = await supabase.auth.verifyOtp({ email: mail, token, type: "email" });
    // Bij de allereerste keer inloggen is het een aanmeldcode; die wordt soms alleen als "signup" geaccepteerd.
    if (err && !/expired|verlopen/i.test(err.message)) {
      const tweede = await supabase.auth.verifyOtp({ email: mail, token, type: "signup" });
      if (!tweede.error) err = null;
    }
    setBezig(false);
    if (err) {
      console.warn("Inlogcode controleren mislukt:", err.status, err.message);
      setError(
        /expired|invalid|verlopen/i.test(err.message)
          ? "Deze code klopt niet of is verlopen. Gebruik de code uit de nieuwste e-mail, of vraag hieronder een nieuwe code aan."
          : `${MSG.fout} (${err.message})`,
      );
      return;
    }
    // onAuthStateChange in de gate laat de app zien.
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center bg-[#1E3A7B] px-4 overflow-hidden"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <LoginAchtergrond>
      <div className="relative w-full max-w-sm bg-white rounded-lg border border-[rgba(15,23,42,0.08)] p-7 shadow-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <img src={maasmondLogo} alt="Maasmond logo" className="w-14 h-14 rounded-md object-contain mb-3" />
          <h1 className="text-lg font-bold text-[#23272F]">Maasmond planning</h1>
          <p className="text-sm text-[#5F6673] mt-1">
            {stap === "email" ? "Vul je Maasmond e-mailadres in om in te loggen" : "Vul de code uit je e-mail in"}
          </p>
        </div>

        {stap === "email" ? (
          <>
          <button
            type="button"
            disabled={bezig}
            onClick={() => void inloggenMicrosoft()}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-full border border-[rgba(15,23,42,0.18)] bg-white text-sm font-semibold text-[#23272F] hover:bg-[#F2F4F7] disabled:opacity-60"
          >
            {/* Microsoft-logo (functioneel aanmeldsymbool) */}
            <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Inloggen met Microsoft
          </button>
          <div className="flex items-center gap-3 my-4 text-xs text-[#5F6673]">
            <span className="flex-1 h-px bg-[rgba(15,23,42,0.12)]" />
            of met een code per e-mail
            <span className="flex-1 h-px bg-[rgba(15,23,42,0.12)]" />
          </div>
          <form onSubmit={vraagCode} className="space-y-3">
            <label className="block text-xs font-semibold text-[#23272F]" htmlFor="login-email">
              E-mailadres
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@maasmond.nl"
              className="w-full px-3 py-2.5 rounded-md border border-[rgba(15,23,42,0.15)] text-sm text-[#23272F] outline-none focus:border-[#1E3A7B]"
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
          </>
        ) : (
          <form onSubmit={bevestigCode} className="space-y-3">
            <label className="block text-xs font-semibold text-[#23272F]" htmlFor="login-code">
              Inlogcode
            </label>
            <input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Code uit de e-mail"
              className="w-full px-3 py-2.5 rounded-md border border-[rgba(15,23,42,0.15)] text-sm tracking-[0.3em] text-[#23272F] outline-none focus:border-[#1E3A7B]"
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
              className="w-full text-xs text-[#5F6673] hover:text-[#23272F]"
            >
              Ander e-mailadres gebruiken
            </button>
            <button
              type="button"
              disabled={bezig}
              onClick={() => void vraagCode()}
              className="w-full text-xs text-[#1E3A7B] font-semibold hover:underline disabled:opacity-60"
            >
              Nieuwe code sturen
            </button>
          </form>
        )}

        {info && !error && <p className="mt-3 text-xs text-[#1E3A7B]">{info}</p>}
        {(melding || error) && <p className="mt-3 text-xs text-[#c0392b]">{melding || error}</p>}
      </div>
      </LoginAchtergrond>
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
    const start = async () => {
      // Terug van Microsoft met inloggegevens in het adres: zelf de sessie starten en het adres opschonen.
      const tokens = tokensUitAdres();
      if (tokens) {
        try {
          const { error } = await supabase.auth.setSession(tokens);
          if (error) console.warn("Sessie na Microsoft-login starten mislukt:", error.message);
        } catch (e) {
          console.warn("Sessie na Microsoft-login starten mislukt:", e);
        }
        window.history.replaceState(null, "", window.location.pathname);
      }
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setReady(true);
    };
    void start();
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

  if (!ready) return <div className="min-h-screen bg-[#F2F4F7]" />;

  if (!user) return <LoginScreen />;

  if (rolesReady && roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F2F4F7] px-4">
        <div className="w-full max-w-sm bg-white rounded-lg border border-[rgba(15,23,42,0.08)] p-7 shadow-sm text-center">
          <img
            src={maasmondLogo}
            alt="Maasmond logo"
            className="w-14 h-14 rounded-md object-contain mb-3 mx-auto"
          />
          <p className="text-sm text-[#23272F]">{MSG.geenRol}</p>
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
