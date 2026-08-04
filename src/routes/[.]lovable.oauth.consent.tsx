import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import maasmondLogo from "@/assets/maasmond-logo.jpg.asset.json";

type OAuthResult = { redirect_url?: string; redirect_to?: string; client?: { name?: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
};
function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s['authorization_id'] === "string" ? s['authorization_id'] : "",
  }),
  component: Consent,
});

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#F0F3F8] px-4"
      style={{ fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[rgba(26,39,68,0.08)] p-7 shadow-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <img src={maasmondLogo.url} alt="Maasmond logo" className="w-14 h-14 rounded-xl object-contain mb-3" />
          <h1 className="text-lg font-bold text-[#1A2744]">Maasmond planning</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function Consent() {
  const { authorization_id: authorizationId } = Route.useSearch();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientName, setClientName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  useEffect(() => {
    if (!signedIn || !authorizationId) return;
    void oauthApi()
      .getAuthorizationDetails(authorizationId)
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setClientName(data?.client?.name ?? "de client");
      })
      .catch((e: unknown) => setError(String((e as Error)?.message ?? e)));
  }, [signedIn, authorizationId]);

  if (!authorizationId) {
    return (
      <Card>
        <p className="text-sm text-[#6B7A99]">Ongeldig autorisatieverzoek: authorization_id ontbreekt.</p>
      </Card>
    );
  }

  const signIn = async () => {
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSignedIn(true);
  };

  const signUp = async () => {
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.href },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) setSignedIn(true);
    else setNotice("Bevestig je e-mailadres via de verstuurde link en open daarna deze pagina opnieuw.");
  };

  const decide = async (approve: boolean) => {
    setError(null);
    setBusy(true);
    const api = oauthApi();
    const { data, error: err } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("De autorisatieserver gaf geen doorstuur-URL terug.");
      return;
    }
    window.location.href = target;
  };

  if (signedIn === null) {
    return (
      <Card>
        <p className="text-sm text-[#6B7A99]">Laden…</p>
      </Card>
    );
  }

  if (!signedIn) {
    return (
      <Card>
        <p className="text-sm text-[#6B7A99] mb-4">Log in met uw account om deze koppeling goed te keuren.</p>
        <label className="block text-xs font-semibold text-[#6B7A99] mb-1.5">E-mailadres</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-sm text-[#1A2744] outline-none focus:border-[#0ABFB8] mb-3"
        />
        <label className="block text-xs font-semibold text-[#6B7A99] mb-1.5">Wachtwoord</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-sm text-[#1A2744] outline-none focus:border-[#0ABFB8] mb-3"
        />
        <button
          onClick={() => void signIn()}
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-[#1A2744] text-white text-sm font-semibold hover:bg-[#24365c] disabled:opacity-50 mb-2"
        >
          Inloggen
        </button>
        <button
          onClick={() => void signUp()}
          disabled={busy}
          className="w-full py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-[#1A2744] text-sm font-semibold hover:bg-[#F0F3F8] disabled:opacity-50"
        >
          Account aanmaken
        </button>
        {notice && <p className="mt-3 text-xs text-[#1A2744]">{notice}</p>}
        {error && <p className="mt-3 text-xs text-[#c0392b]">{error}</p>}
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-[#1A2744] mb-2">
        {clientName || "Een client"} koppelen aan uw account
      </h2>
      <p className="text-sm text-[#6B7A99] mb-2">
        {clientName || "Deze client"} kan de tools van Maasmond planning namens u gebruiken: projecten, medewerkers en
        beschikbaarheid lezen.
      </p>
      <p className="text-xs text-[#6B7A99] mb-5">
        Dit omzeilt de rechten en beveiligingsregels van deze app niet.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-xs text-[#c0392b]">
          {error}
        </p>
      )}
      <button
        onClick={() => void decide(true)}
        disabled={busy}
        className="w-full py-2.5 rounded-xl bg-[#0ABFB8] text-white text-sm font-semibold hover:bg-[#09a9a3] disabled:opacity-50 mb-2"
      >
        Goedkeuren
      </button>
      <button
        onClick={() => void decide(false)}
        disabled={busy}
        className="w-full py-2.5 rounded-xl border border-[rgba(26,39,68,0.15)] text-[#1A2744] text-sm font-semibold hover:bg-[#F0F3F8] disabled:opacity-50"
      >
        Koppeling annuleren
      </button>
    </Card>
  );
}
