/// <reference lib="webworker" />
// Leest en normaliseert Excelbestanden buiten de hoofdthread.
// Kolommapping en validatieregels zijn identiek aan de vorige UI-implementatie.
import * as XLSX from "xlsx";
import {
  COL_PROJECTLEIDER,
  COL_STATUS,
  COL_WERKZAAMHEDEN,
  LARGE_FILE_WARN,
  cellStr,
  combineDT,
  mapVacStatus,
  normalizeProjectnr,
  parseTimeCell,
  parseXlDate,
  parseXlTime,
  resolveDept,
  type ImportRow,
  type ImportWorkerRequest,
  type ImportWorkerResponse,
  type VacBaseRow,
} from "@/lib/excel-parse";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: ImportWorkerResponse) => ctx.postMessage(msg);
const PROGRESS_CHUNK = 1000;

function readSheet(buffer: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: true, sheets: 0 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
}

function handleProjects(buffer: ArrayBuffer, existing: string[]): void {
  const raw = readSheet(buffer);

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 30); i++) {
    const row = raw[i] as unknown[];
    if (
      row.some((c) =>
        cellStr(c).toLowerCase().replace(/\s/g, "").replace(/\.$/, "").match(/^projectnr?$/),
      )
    ) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    post({ type: "error", message: "Geen headerrij gevonden. Zorg dat de rij met 'Projectnr.' aanwezig is in het bestand." });
    return;
  }

  const headerRow = (raw[headerRowIdx] as unknown[]).map((h) => cellStr(h).toLowerCase().trim());

  let omschrijvingCount = 0;
  let col_projectnr = -1,
    col_omschr1 = -1,
    col_opdrachtgever = -1,
    col_contactpersoon = -1,
    col_datum_opdracht = -1,
    col_startdatum = -1,
    col_einddatum = -1,
    col_starttijd = -1,
    col_eindtijd = -1,
    col_werknr = -1,
    col_calccode = -1,
    col_straat = -1,
    col_plaatsobject = -1,
    col_opmerkingen = -1,
    col_status = -1,
    col_ar = -1;

  headerRow.forEach((h, i) => {
    const norm = h.replace(/\s+/g, "").replace(/\.$/, "");
    if (norm === "projectnr" && col_projectnr === -1) col_projectnr = i;
    else if (h === "omschrijving") {
      omschrijvingCount++;
      if (omschrijvingCount === 1) col_omschr1 = i;
    } else if (norm === "naamopdrachtgever" || norm === "opdrachtgever") col_opdrachtgever = i;
    else if (norm === "contactpersoon") col_contactpersoon = i;
    else if (norm === "datumopdracht") col_datum_opdracht = i;
    else if (norm === "startdatum" && col_startdatum === -1) col_startdatum = i;
    else if ((norm === "einddatum" || norm === "afloopdatum" || norm === "eindedatum") && col_einddatum === -1)
      col_einddatum = i;
    else if (norm === "starttijd" && col_starttijd === -1) col_starttijd = i;
    else if ((norm === "eindtijd" || norm === "eindetijd") && col_eindtijd === -1) col_eindtijd = i;
    else if (norm === "werknr" || norm === "werknummer" || norm === "wnr" || (/werk/.test(norm) && /(nr|nummer)/.test(norm)))
      col_werknr = i;
    else if (/calculatiecode|calccode/.test(norm) && col_calccode === -1) col_calccode = i;
    else if ((norm === "straatobject" || norm === "straat" || /^straat/.test(norm)) && col_straat === -1) col_straat = i;
    else if ((norm === "plaatsobject" || norm === "plaats" || /^plaats/.test(norm)) && col_plaatsobject === -1)
      col_plaatsobject = i;
    else if (/^opmerking/.test(norm) && col_opmerkingen === -1) col_opmerkingen = i;
    else if (norm === "status" && col_status === -1) col_status = i;
    else if ((norm === "a/r" || norm === "ar" || norm === "a-r" || /^a\/r/.test(norm)) && col_ar === -1) col_ar = i;
  });

  if (col_status === -1 && headerRow.length > COL_STATUS) col_status = COL_STATUS; // Excel kolom S

  if (col_werknr === -1) {
    col_werknr = headerRow.findIndex((h) => {
      const n = h.replace(/\s+/g, "").replace(/\./g, "");
      return n !== "projectnr" && /werk/.test(n) && /(nr|nummer)/.test(n);
    });
  }

  if (col_projectnr === -1) {
    post({ type: "error", message: "Kolom 'Projectnr.' niet gevonden in de headerrij." });
    return;
  }

  const existingProjectNumbers = new Set(existing);
  const dataRows = raw.slice(headerRowIdx + 1);
  const allRows: ImportRow[] = [];

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx] as unknown[];
    if (idx % PROGRESS_CHUNK === 0) {
      post({ type: "progress", pct: Math.round((idx / Math.max(dataRows.length, 1)) * 100) });
    }
    if (!row || row.every((c) => c == null || cellStr(c) === "")) continue;

    const absRow = headerRowIdx + 2 + idx;
    const projectnr = col_projectnr >= 0 ? cellStr(row[col_projectnr]) : "";
    const projectnaam = col_omschr1 >= 0 ? cellStr(row[col_omschr1]) : "";
    const rawDeptCell = cellStr(row[COL_WERKZAAMHEDEN]);
    const opdrachtgever = col_opdrachtgever >= 0 ? cellStr(row[col_opdrachtgever]) : "";
    const contactpersoon = col_contactpersoon >= 0 ? cellStr(row[col_contactpersoon]) : "";
    const calculator = cellStr(row[COL_PROJECTLEIDER]);
    const startdatumRaw = col_startdatum >= 0 ? row[col_startdatum] : null;
    const einddatumRaw = col_einddatum >= 0 ? row[col_einddatum] : null;
    const starttijd = col_starttijd >= 0 ? parseXlTime(row[col_starttijd]) : null;
    const eindtijd = col_eindtijd >= 0 ? parseXlTime(row[col_eindtijd]) : null;
    const datumOpdrachtRaw = col_datum_opdracht >= 0 ? row[col_datum_opdracht] : null;
    const werknrRaw = col_werknr >= 0 ? cellStr(row[col_werknr]) : "";

    let invalidReason = "";
    if (!projectnr && !projectnaam) continue;
    if (!projectnr) invalidReason = `Rij ${absRow}: Projectnr. ontbreekt`;

    const { afdelingen, turnkey } = resolveDept(rawDeptCell);
    const startISO = combineDT(parseXlDate(startdatumRaw as string | number | null), starttijd, 8, 0);
    const eindBase =
      parseXlDate(einddatumRaw as string | number | null) || parseXlDate(startdatumRaw as string | number | null);
    const eindISO = combineDT(eindBase, eindtijd, 17, 0);

    allRows.push({
      projectnr,
      projectnaam: projectnaam || projectnr,
      opdrachtgever,
      contactpersoon,
      projectleider: calculator,
      startdatum: startISO,
      einddatum: eindISO,
      datumOpdracht: parseXlDate(datumOpdrachtRaw as string | number | null),
      werknummer: werknrRaw || projectnr,
      werkzaamheden: rawDeptCell,
      calculatiecode: col_calccode >= 0 ? cellStr(row[col_calccode]) : "",
      straat: col_straat >= 0 ? cellStr(row[col_straat]) : "",
      plaatsobject: col_plaatsobject >= 0 ? cellStr(row[col_plaatsobject]) : "",
      opmerkingen: col_opmerkingen >= 0 ? cellStr(row[col_opmerkingen]) : "",
      statusRaw: col_status >= 0 ? cellStr(row[col_status]) : "",
      ar: col_ar >= 0 ? cellStr(row[col_ar]) : "",
      rawDept: rawDeptCell,
      afdelingen,
      turnkey,
      rowIndex: absRow,
      invalidReason,
    });
  }

  post({ type: "progress", pct: 100 });

  const ongeldig = allRows.filter((r) => r.invalidReason);
  const geldig = allRows.filter((r) => !r.invalidReason && r.projectnr);

  // Dubbele Projectnr.-regels binnen hetzelfde bestand samenvoegen (laatste wint)
  const byNr = new Map<string, ImportRow>();
  let duplicaten = 0;
  geldig.forEach((r) => {
    const nr = normalizeProjectnr(r.projectnr);
    if (byNr.has(nr)) duplicaten++;
    byNr.set(nr, r);
  });

  const nieuw: ImportRow[] = [];
  const bestaand: ImportRow[] = [];
  byNr.forEach((r, nr) => {
    (existingProjectNumbers.has(nr) ? bestaand : nieuw).push(r);
  });

  const warning =
    byNr.size > LARGE_FILE_WARN
      ? `Dit bestand bevat ${byNr.size} regels. Het wordt volledig verwerkt, maar dit kan even duren.`
      : "";

  post({ type: "projects", nieuw, bestaand, ongeldig, total: allRows.length, duplicaten, warning });
}

function handleAvail(buffer: ArrayBuffer): void {
  const raw = readSheet(buffer);

  let headerIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const cells = (raw[i] as unknown[]).map((c) => cellStr(c).toLowerCase());
    if (cells.some((c) => c === "medewerker" || c === "naam" || c.includes("startdatum"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      if ((raw[i] as unknown[]).some((c) => cellStr(c).toLowerCase().includes("naam"))) {
        headerIdx = i;
        break;
      }
    }
  }
  if (headerIdx === -1) {
    post({ type: "error", message: "Geen headerrij gevonden. Voeg een rij toe met 'Medewerker', 'Naam' of 'Startdatum'." });
    return;
  }

  const headers = (raw[headerIdx] as unknown[]).map((h) => cellStr(h).toLowerCase().trim());
  const ci = (names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const colNaam = ci(["medewerker", "naam", "name", "employee", "werknemer"]);
  const colStart = ci(["startdatum", "start datum", "start", "van"]);
  const colEind = ci(["einddatum", "eind datum", "eind", "end", "tot", "t/m"]);
  const colStartT = ci(["starttijd", "start tijd", "begintijd", "van tijd", "time start"]);
  const colEindT = ci(["eindtijd", "eind tijd", "eindigd", "tot tijd", "time end"]);
  const colType = ci(["type", "reden", "status", "soort", "categorie"]);
  const colNote = ci(["notitie", "opmerking", "note", "toelichting"]);

  if (colNaam === -1 && colStart === -1) {
    post({ type: "error", message: "Kolommen 'Medewerker/Naam' en 'Startdatum' niet gevonden in de header." });
    return;
  }

  const dataRows = raw.slice(headerIdx + 1);
  const rows: VacBaseRow[] = [];
  for (let relIdx = 0; relIdx < dataRows.length; relIdx++) {
    const row = dataRows[relIdx] as unknown[];
    if (relIdx % PROGRESS_CHUNK === 0) {
      post({ type: "progress", pct: Math.round((relIdx / Math.max(dataRows.length, 1)) * 100) });
    }
    if (!row || row.every((c) => c == null || cellStr(c) === "")) continue;
    const absRow = headerIdx + 2 + relIdx;

    const rawName = colNaam >= 0 ? cellStr(row[colNaam]) : "";
    const startISO = parseXlDate((colStart >= 0 ? row[colStart] : null) as string | number | null);
    const eindISO = parseXlDate((colEind >= 0 ? row[colEind] : null) as string | number | null) || startISO;
    const startTimeRaw = parseTimeCell(colStartT >= 0 ? row[colStartT] : null);
    const endTimeRaw = parseTimeCell(colEindT >= 0 ? row[colEindT] : null);
    const status = mapVacStatus(colType >= 0 ? cellStr(row[colType]) : "");
    const note = colNote >= 0 ? cellStr(row[colNote]) : "";

    let invalidReason = "";
    if (!rawName && colNaam >= 0) invalidReason = `Rij ${absRow}: Medewerker naam ontbreekt`;
    else if (!startISO) invalidReason = `Rij ${absRow}: Startdatum ontbreekt of ongeldig`;

    const startDate = startISO ? startISO.split("T")[0] : "";
    const endDate = eindISO ? eindISO.split("T")[0] : startDate;

    rows.push({
      rowIndex: absRow,
      rawName,
      startDate,
      endDate,
      startTime: startTimeRaw || "08:00",
      endTime: endTimeRaw || "17:00",
      hasExplicitTimes: !!(startTimeRaw || endTimeRaw),
      status,
      note,
      invalidReason,
    });
  }

  post({ type: "progress", pct: 100 });
  const warning =
    rows.length > LARGE_FILE_WARN
      ? `Dit bestand bevat ${rows.length} regels. Het wordt volledig verwerkt, maar dit kan even duren.`
      : "";
  post({ type: "avail", rows, total: rows.length, warning });
}

ctx.onmessage = (ev: MessageEvent<ImportWorkerRequest>) => {
  const req = ev.data;
  try {
    if (req.mode === "projects") handleProjects(req.buffer, req.existingProjectNumbers);
    else handleAvail(req.buffer);
  } catch (err) {
    post({
      type: "error",
      message: "Fout bij het lezen van het bestand. Zorg dat het een geldig .xlsx of .xls bestand is.",
    });
    console.error(err);
  }
};
