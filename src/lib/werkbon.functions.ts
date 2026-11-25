// Server-functie: werkbon mailen naar een ingeplande medewerker.
// Alleen voor ingelogde planners/beheerders. Ontvanger en werkgegevens komen uit de
// database (niet uit de browser), zodat er nooit naar een willekeurig adres gemaild kan worden.
import { createServerFn } from "@tanstack/react-start";
import { sendLovableEmail } from "@lovable.dev/email-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maakWerkbon, type WerkbonDag } from "./werkbon";

const AFZENDER_DOMEIN = "notify.maasmond.nl";

export interface WerkbonVerzoek {
  employeeId: string;
  projectId: string;
  dagen: WerkbonDag[];
  /** Weergavenaam projectleider zoals de app hem toont (afkorting al omgezet) */
  projectleider?: string;
  /** Downloadlink naar de werkbon-pdf uit onze eigen opslag */
  pdfUrl?: string;
}

/** Alleen een (getekende) downloadlink uit de eigen Supabase-opslag accepteren. */
function eigenOpslagLink(u: unknown): string | undefined {
  const basis = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  return typeof u === "string" && basis && u.startsWith(basis + "/storage/v1/object/sign/") ? u : undefined;
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
    pdfUrl: eigenOpslagLink(v.pdfUrl),
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
      pdfUrl: data.pdfUrl,
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

// ===== Gereed gemeld: projectleider per e-mail laten weten (met de foto) =====
export interface GereedMailVerzoek { gereedId: string }

export const mailGereedAanProjectleider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown): GereedMailVerzoek => {
    const v = d as GereedMailVerzoek;
    if (!v || typeof v.gereedId !== "string" || !/^[0-9a-f-]{36}$/i.test(v.gereedId)) throw new Error("Ongeldige gereedmelding");
    return { gereedId: v.gereedId };
  })
  .handler(async ({ data, context }) => {
    // Eerst met de rechten van de gebruiker lezen: zo kan alleen wie de melding mag zien, de mail laten versturen
    const gereedTabel = (context.supabase as unknown as { from: (t: string) => ReturnType<typeof context.supabase.from> }).from("werk_gereed");
    const { data: g, error } = await gereedTabel.select("employee_id, project_id, datum, foto_pad, opmerking, created_by").eq("id", data.gereedId).maybeSingle();
    if (error) throw error;
    const melding = g as unknown as { employee_id: string; project_id: string; datum: string; foto_pad: string; opmerking: string; created_by: string } | null;
    if (!melding || melding.created_by !== context.userId) throw new Error("Gereedmelding niet gevonden.");
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { verstuurd: false as const, reden: "E-mail is op deze server niet ingesteld." };

    // Projectleider en werk opzoeken met serverrechten (een schilder mag andere medewerkers niet zien)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { projectleiderEmail, projectleiderNaam } = await import("./projectleiders");
    const [proj, mensen, inst] = await Promise.all([
      supabaseAdmin.from("projects").select("data").eq("id", melding.project_id).maybeSingle(),
      supabaseAdmin.from("employees").select("id, data"),
      supabaseAdmin.from("app_settings").select("data").eq("id", "default").maybeSingle(),
    ]);
    const str = (x: unknown) => (x == null ? "" : String(x));
    const p = (proj.data?.data ?? {}) as Record<string, unknown>;
    const s = (inst.data?.data ?? {}) as Record<string, unknown>;
    const lijst = ((mensen.data ?? []) as { id: string; data: Record<string, unknown> }[]).map((e) => ({ id: e.id, naam: str(e.data?.naam), email: str(e.data?.email) }));
    const namen = (s.projectleiderNamen || {}) as Record<string, string>;
    const naar = projectleiderEmail(p.projectleider, lijst, namen);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(naar)) return { verstuurd: false as const, reden: "Geen e-mailadres van de projectleider bekend." };

    const foto = await supabaseAdmin.storage.from("gereed-fotos").createSignedUrl(melding.foto_pad, 60 * 60 * 24 * 7);
    const fotoUrl = foto.data?.signedUrl || "";
    const schilder = lijst.find((e) => e.id === melding.employee_id)?.naam || "Een medewerker";
    const werk = [str(p.werknummer), str(p.projectnaam)].filter(Boolean).join(" – ") || "een werk";
    const adres = [str(p.straatObject) || str(p.adres), str(p.plaatsObject) || str(p.plaats)].filter(Boolean).join(", ");
    const dag = new Date(melding.datum + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
    const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
    const onderwerp = `Gereed gemeld: ${werk} (${dag})`;
    const html = `<!doctype html><html lang="nl"><body style="margin:0;background:#EEF1F5;font-family:Aptos,'Segoe UI',Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1E3A7B;padding:18px 24px;color:#fff;font-size:20px;font-weight:bold">Werk gereed gemeld</td></tr>
<tr><td style="padding:20px 24px;font-size:15px;color:#23272F;line-height:1.5">Beste ${esc(projectleiderNaam(p.projectleider, lijst, namen) || "projectleider")},<br><br>
<b>${esc(schilder)}</b> heeft <b>${esc(werk)}</b> gereed gemeld voor ${esc(dag)}.${adres ? `<br>Adres: ${esc(adres)}` : ""}
${melding.opmerking ? `<br><br>Opmerking: ${esc(melding.opmerking)}` : ""}</td></tr>
${fotoUrl ? `<tr><td style="padding:0 24px 8px"><a href="${esc(fotoUrl)}"><img src="${esc(fotoUrl)}" alt="Foto van het werk" width="552" style="width:100%;max-width:552px;border-radius:8px;display:block"></a></td></tr>
<tr><td style="padding:4px 24px 20px;font-size:12px;color:#5F6673">De foto is 7 dagen via deze link te openen; daarna staat hij nog in Maasmond Planning.</td></tr>` : ""}
</table></td></tr></table></body></html>`;
    const tekst = [`Werk gereed gemeld`, "", `${schilder} heeft ${werk} gereed gemeld voor ${dag}.`, ...(adres ? [`Adres: ${adres}`] : []), ...(melding.opmerking ? ["", `Opmerking: ${melding.opmerking}`] : []), ...(fotoUrl ? ["", `Foto: ${fotoUrl}`] : [])].join("\n");
    const sleutelMail = `gereed-${data.gereedId}`;
    await sendLovableEmail(
      { to: naar, from: { name: str(s.bedrijfsnaam) || "Maasmond Planning", address: `noreply@${AFZENDER_DOMEIN}` }, sender_domain: AFZENDER_DOMEIN,
        subject: onderwerp, html, text: tekst, purpose: "transactional", label: "gereed", idempotency_key: sleutelMail },
      { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"], idempotencyKey: sleutelMail },
    );
    return { verstuurd: true as const, naar };
  });
