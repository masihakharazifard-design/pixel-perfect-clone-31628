// Printbare Gantt-planning per opdrachtgever (openen in een nieuw venster → Afdrukken als PDF).
import { TAAK_TYPES, taakKleur, taakEind, fmtDay, parseDay, toDay, weekNr, sorteerTaken, type Taak } from "@/lib/taken";

export interface GanttProject {
  id: string;
  werknummer: string;
  projectnaam: string;
  omschrijving: string;
  adres: string;
  plaats: string;
  projectleider: string;
  taken: Taak[];
}

export interface GanttOptions {
  opdrachtgever: string;
  projectleider: string;
  logoUrl: string;
  systeemnaam: string;
  projecten: GanttProject[];
}

const MAAND = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
/** Dagletters maandag t/m zondag, zoals in de voorbeeldplanning. */
const DAGLETTER = ["M", "W", "V", "Z", "D", "D", "Z"];

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function dagenTussen(van: string, tot: string): string[] {
  const a = parseDay(van), b = parseDay(tot);
  if (!a || !b) return [];
  const out: string[] = [];
  const d = new Date(a);
  while (d.getTime() <= b.getTime() && out.length < 1000) {
    out.push(toDay(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

interface Regel {
  groepsregel: boolean;
  regel: number;
  werknummer: string;
  werkzaamheden: string;
  plaats: string;
  omschrijving: string;
  adres: string;
  start: string;
  duur: number;
  eind: string;
  kleur: string;
}

function bouwRegels(projecten: GanttProject[]): Regel[] {
  const regels: Regel[] = [];
  let nr = 0;
  projecten.forEach((p) => {
    const taken = sorteerTaken(p.taken);
    if (!taken.length) return;
    const adres = [p.adres, p.plaats].filter(Boolean).join(", ");
    const omschrijving = p.omschrijving || p.projectnaam;
    const starts = taken.map((t) => t.start).filter(Boolean).sort();
    const einden = taken.map((t) => taakEind(t)).filter(Boolean).sort();
    const gStart = starts[0] || "";
    const gEind = einden[einden.length - 1] || "";
    const gDuur = gStart && gEind ? dagenTussen(gStart, gEind).length : 0;
    regels.push({
      groepsregel: true, regel: ++nr, werknummer: p.werknummer, werkzaamheden: p.projectnaam,
      plaats: p.plaats, omschrijving, adres,
      start: gStart, duur: gDuur, eind: gEind, kleur: "#F2D024",
    });
    taken.forEach((t) => regels.push({
      groepsregel: false, regel: ++nr, werknummer: "", werkzaamheden: t.taaknaam,
      plaats: p.plaats, omschrijving, adres,
      start: t.start, duur: Math.max(1, t.duur || 1), eind: taakEind(t), kleur: taakKleur(t.type),
    }));
  });
  return regels;
}

export function buildGanttHtml(opts: GanttOptions): string {
  const regels = bouwRegels(opts.projecten);
  const alleStarts = regels.map((r) => r.start).filter(Boolean).sort();
  const alleEinden = regels.map((r) => r.eind).filter(Boolean).sort();
  const van = alleStarts[0] || toDay(new Date());
  const tot = alleEinden[alleEinden.length - 1] || van;
  const dagen = dagenTussen(van, tot);

  // Maandkoppen
  const maanden: { label: string; span: number }[] = [];
  dagen.forEach((ds) => {
    const d = parseDay(ds)!;
    const label = `${MAAND[d.getMonth()]} ${d.getFullYear()}`;
    const laatste = maanden[maanden.length - 1];
    if (laatste && laatste.label === label) laatste.span++;
    else maanden.push({ label, span: 1 });
  });
  // Weekkoppen
  const weken: { label: string; span: number }[] = [];
  dagen.forEach((ds) => {
    const label = `${weekNr(parseDay(ds)!)}`;
    const laatste = weken[weken.length - 1];
    if (laatste && laatste.label === label) laatste.span++;
    else weken.push({ label, span: 1 });
  });

  const isWeekend = (ds: string) => { const w = parseDay(ds)!.getDay(); return w === 0 || w === 6; };
  const dagIdx = new Map(dagen.map((d, i) => [d, i]));

  const balkCellen = (r: Regel) => dagen.map((ds) => {
    const i = dagIdx.get(ds)!;
    const s = r.start ? dagIdx.get(r.start) : undefined;
    const e = r.eind ? dagIdx.get(r.eind) : undefined;
    const actief = s !== undefined && e !== undefined && i >= s && i <= e;
    const cls = `d${isWeekend(ds) ? " we" : ""}${actief ? (r.groepsregel ? " groepbalk" : " balk") : ""}`;
    const style = actief && !r.groepsregel ? ` style="background:${r.kleur}"` : "";
    return `<td class="${cls}"${style}></td>`;
  }).join("");

  const rijen = regels.map((r) => `<tr class="${r.groepsregel ? "groep" : ""}">
    <td class="l">${r.regel}</td>
    <td class="l">${esc(r.werknummer)}</td>
    <td class="l naam">${esc(r.werkzaamheden)}</td>
    <td class="l">${esc(r.plaats)}</td>
    <td class="l">${esc(r.omschrijving)}</td>
    <td class="l">${esc(r.adres)}</td>
    <td class="l c">${r.start ? fmtDay(r.start) : "-"}</td>
    <td class="l c">${r.duur || 0}</td>
    <td class="l c">${r.eind ? fmtDay(r.eind) : "-"}</td>
    ${balkCellen(r)}
  </tr>`).join("");

  const legenda = TAAK_TYPES.map((t) =>
    `<span class="lg"><i style="background:${taakKleur(t)}"></i>${esc(t)}</span>`).join("");

  const kop = (label: string) => `<th class="l">${label}</th>`;

  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"/>
<title>Planning ${esc(opts.opdrachtgever)}</title>
<style>
  @page { size: A3 landscape; margin: 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; color:#1A2744; margin:0; padding:12px; }
  header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:10px; }
  header img { height:44px; }
  .klant { font-size:26px; font-weight:bold; }
  .pl { font-size:13px; text-align:right; }
  table { border-collapse:collapse; width:100%; table-layout:fixed; }
  th, td { border:1px solid #C9D1E0; font-size:9px; padding:2px 3px; }
  th { background:#F0F3F8; font-weight:bold; }
  td.l, th.l { text-align:left; width:70px; }
  td.c { text-align:center; }
  td.naam, th.naam { width:150px; }
  td.d, th.d { width:11px; padding:0; height:14px; }
  th.d { text-align:center; font-size:8px; font-weight:normal; }
  .we { background:#EDF0F6; }
  tr.groep td { font-weight:bold; font-size:10px; background:#FAFBFE; }
  tr.groep td.groepbalk { background:#FFF3A8; border-top:2px solid #C9A400; border-bottom:2px solid #C9A400; }
  .legenda { margin-top:12px; font-size:10px; }
  .legenda b { display:block; margin-bottom:4px; }
  .lg { display:inline-flex; align-items:center; margin:0 10px 4px 0; }
  .lg i { width:12px; height:12px; display:inline-block; margin-right:4px; border:1px solid #98A3B8; }
  footer { margin-top:14px; display:flex; justify-content:space-between; gap:20px; font-size:10px; }
  footer .veld { border-top:1px solid #98A3B8; padding-top:3px; min-width:140px; }
  .rechts { text-align:right; align-self:flex-end; }
</style></head><body>
<header>
  <div style="display:flex;align-items:center;gap:14px">
    <img src="${esc(opts.logoUrl)}" alt="Maasmond"/>
    <span class="klant">${esc(opts.opdrachtgever)}</span>
  </div>
  <div class="pl"><strong>Projectleider</strong><br/>${esc(opts.projectleider || "—")}</div>
</header>
<table>
  <thead>
    <tr>
      ${kop("Regel")}${kop("Werk nummer")}<th class="l naam">Werkzaamheden</th>${kop("Plaats")}${kop("Project omschrijving")}${kop("Adres")}${kop("Start")}${kop("Duur")}${kop("Eind")}
      ${maanden.map((m) => `<th class="d" colspan="${m.span}">${esc(m.label)}</th>`).join("")}
    </tr>
    <tr>
      <th class="l" colspan="9"></th>
      ${weken.map((w) => `<th class="d" colspan="${w.span}">${esc(w.label)}</th>`).join("")}
    </tr>
    <tr>
      <th class="l" colspan="9"></th>
      ${dagen.map((ds) => {
        const dow = (parseDay(ds)!.getDay() + 6) % 7;
        return `<th class="d${isWeekend(ds) ? " we" : ""}">${DAGLETTER[dow]}</th>`;
      }).join("")}
    </tr>
  </thead>
  <tbody>${rijen || `<tr><td colspan="9">Geen taken gevonden voor deze opdrachtgever.</td></tr>`}</tbody>
</table>
<div class="legenda"><b>Type Activiteit</b>${legenda}</div>
<footer>
  <div class="veld">Getekend door</div>
  <div class="veld">Werk Nr.</div>
  <div class="veld">Revisie Nr.</div>
  <div class="veld" style="flex:1">Opmerkingen</div>
  <div class="rechts">Planning gemaakt met ${esc(opts.systeemnaam)}</div>
</footer>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},400);});</script>
</body></html>`;
}

/** Opent de planning in een nieuw venster; de gebruiker kiest "Bewaren als PDF". */
export function openGanttPrint(opts: GanttOptions): boolean {
  const html = buildGanttHtml(opts);
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
