// Server-functie: werkbon mailen naar een ingeplande medewerker.
// Alleen voor ingelogde planners/beheerders. Ontvanger en werkgegevens komen uit de
// database (niet uit de browser), zodat er nooit naar een willekeurig adres gemaild kan worden.
import { createServerFn } from "@tanstack/react-start";
import { sendLovableEmail } from "@lovable.dev/email-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maakWerkbon, maakWerkplanMail, type WerkbonDag } from "./werkbon";

const AFZENDER_DOMEIN = "notify.maasmond.nl";

export interface WerkbonVerzoek {
  employeeId: string;
  projectId: string;
  dagen: WerkbonDag[];
  /** Weergavenaam projectleider zoals de app hem toont (afkorting al omgezet) */
  projectleider?: string;
}

function controleer(d: unknown): WerkbonVerzoek {
  const v = d as WerkbonVerzoek;
  if (!v || typeof v.employeeId !== "string" || typeof v.projectId !== "string" || !Array.isArray(v.dagen)) {
    throw new Error("Ongeldig werkbonverzoek");
  }
  const tijd = (t: unknown) => (typeof t === "string" && /^\d{2}:\d{2}$/.test(t) ? t : undefined);
  const dagen = v.dagen
    .filter((x) => x && typeof x.datum === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.datum))
    .slice(0, 60)
    .map((x) => ({ datum: x.datum, start: tijd(x.start), eind: tijd(x.eind) }));
  if (!dagen.length) throw new Error("Geen ingeplande dagen voor de werkbon");
  return {
    employeeId: v.employeeId.slice(0, 200),
    projectId: v.projectId.slice(0, 200),
    dagen,
    projectleider: typeof v.projectleider === "string" ? v.projectleider.slice(0, 120) : undefined,
  };
}

export const stuurWerkbon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(controleer)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: magPlannen, error: rolFout } = await supabase.rpc("can_plan");
    if (rolFout || !magPlannen) throw new Error("Alleen planners en beheerders kunnen werkbonnen versturen.");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("E-mail is op deze server niet ingesteld (LOVABLE_API_KEY ontbreekt).");

    const [emp, proj, inst] = await Promise.all([
      supabase.from("employees").select("data").eq("id", data.employeeId).maybeSingle(),
      supabase.from("projects").select("data").eq("id", data.projectId).maybeSingle(),
      supabase.from("app_settings").select("data").eq("id", "default").maybeSingle(),
    ]);
    if (emp.error) throw emp.error;
    if (proj.error) throw proj.error;
    const m = (emp.data?.data ?? {}) as Record<string, unknown>;
    const p = (proj.data?.data ?? {}) as Record<string, unknown>;
    const s = (inst.data?.data ?? {}) as Record<string, unknown>;
    const email = String(m.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${m.naam ?? "Deze medewerker"} heeft geen geldig e-mailadres.`);

    const str = (x: unknown) => (x == null ? "" : String(x));
    const afdelingen = Array.isArray(p.afdelingen) && p.afdelingen.length ? (p.afdelingen as string[]).join(", ") : str(p.afdeling);
    const wb = maakWerkbon({
      medewerker: str(m.naam) || "collega",
      werk: {
        werknummer: str(p.werknummer),
        projectnaam: str(p.projectnaam),
        opdrachtgever: str(p.opdrachtgever),
        adres: str(p.straatObject) || str(p.adres),
        plaats: str(p.plaatsObject) || str(p.plaats),
        projectleider: data.projectleider || str(p.projectleider),
        opmerkingen: str(p.opmerkingen),
        afdeling: afdelingen,
      },
      dagen: data.dagen,
      bedrijf: { naam: str(s.bedrijfsnaam) || "Maasmond", telefoon: str(s.telefoon), email: str(s.email) },
    });

    const sleutel = `werkbon-${data.employeeId}-${data.projectId}-${data.dagen.map((d) => d.datum + (d.start ?? "")).join(",")}`.slice(0, 250);
    await sendLovableEmail(
      {
        to: email,
        from: { name: str(s.bedrijfsnaam) || "Maasmond Planning", address: `noreply@${AFZENDER_DOMEIN}` },
        sender_domain: AFZENDER_DOMEIN,
        subject: wb.onderwerp,
        html: wb.html,
        text: wb.tekst,
        purpose: "transactional",
        label: "werkbon",
        reply_to: /@/.test(str(s.email)) ? str(s.email) : undefined,
        idempotency_key: sleutel,
      },
      { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"], idempotencyKey: sleutel },
    );
    return { ok: true as const, naar: email, naam: str(m.naam) };
  });

// ===== Werkplan mailen (overzicht van een periode + link naar de pdf) =====
export interface WerkplanVerzoek { employeeId: string; van: string; tot: string; pdfUrl?: string }

function controleerWerkplan(d: unknown): WerkplanVerzoek {
  const v = d as WerkplanVerzoek;
  const datum = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (!v || typeof v.employeeId !== "string" || !datum(v.van) || !datum(v.tot) || v.tot < v.van) throw new Error("Ongeldig werkplanverzoek");
  // Alleen een downloadlink uit onze eigen opslag accepteren
  const basis = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const pdfUrl = typeof v.pdfUrl === "string" && basis && v.pdfUrl.startsWith(basis + "/storage/v1/object/sign/") ? v.pdfUrl : undefined;
  return { employeeId: v.employeeId.slice(0, 200), van: v.van, tot: v.tot, pdfUrl };
}

export const stuurWerkplan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(controleerWerkplan)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: magPlannen, error: rolFout } = await supabase.rpc("can_plan");
    if (rolFout || !magPlannen) throw new Error("Alleen planners en beheerders kunnen werkplannen versturen.");
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("E-mail is op deze server niet ingesteld (LOVABLE_API_KEY ontbreekt).");

    const [emp, plan, inst] = await Promise.all([
      supabase.from("employees").select("data").eq("id", data.employeeId).maybeSingle(),
      supabase.from("availability").select("data").filter("data->>employeeId", "eq", data.employeeId)
        .filter("data->>date", "gte", data.van).filter("data->>date", "lte", data.tot).limit(500),
      supabase.from("app_settings").select("data").eq("id", "default").maybeSingle(),
    ]);
    if (emp.error) throw emp.error;
    if (plan.error) throw plan.error;
    const str = (x: unknown) => (x == null ? "" : String(x));
    const m = (emp.data?.data ?? {}) as Record<string, unknown>;
    const s = (inst.data?.data ?? {}) as Record<string, unknown>;
    const email = str(m.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${str(m.naam) || "Deze medewerker"} heeft geen geldig e-mailadres.`);

    const rijen = ((plan.data ?? []) as unknown as { data: Record<string, unknown> }[]).map((r) => r.data)
      .filter((a) => a.status === "Ingepland" && a.projectId);
    const pids = [...new Set(rijen.map((a) => str(a.projectId)))];
    const proj = pids.length ? await supabase.from("projects").select("id, data").in("id", pids) : { data: [], error: null };
    if (proj.error) throw proj.error;
    const werken = new Map(((proj.data ?? []) as unknown as { id: string; data: Record<string, unknown> }[]).map((p) => [p.id, p.data]));
    const regels = rijen.map((a) => {
      const p = werken.get(str(a.projectId)) ?? {};
      return {
        datum: str(a.date), start: str(a.startTime), eind: str(a.endTime),
        werk: [str(p.werknummer), str(p.projectnaam)].filter(Boolean).join(" – ") || "Werk",
        adres: [str(p.straatObject) || str(p.adres), str(p.plaatsObject) || str(p.plaats)].filter(Boolean).join(", "),
      };
    });
    const mail = maakWerkplanMail({ medewerker: str(m.naam) || "collega", van: data.van, tot: data.tot, regels, pdfUrl: data.pdfUrl, bedrijf: str(s.bedrijfsnaam) || "Maasmond" });
    const sleutel = `werkplan-${data.employeeId}-${data.van}-${data.tot}-${Date.now()}`.slice(0, 250);
    await sendLovableEmail(
      {
        to: email,
        from: { name: str(s.bedrijfsnaam) || "Maasmond Planning", address: `noreply@${AFZENDER_DOMEIN}` },
        sender_domain: AFZENDER_DOMEIN,
        subject: mail.onderwerp, html: mail.html, text: mail.tekst,
        purpose: "transactional", label: "werkplan",
        reply_to: /@/.test(str(s.email)) ? str(s.email) : undefined,
        idempotency_key: sleutel,
      },
      { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"], idempotencyKey: sleutel },
    );
    return { ok: true as const, naar: email, naam: str(m.naam) };
  });
