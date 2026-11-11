// Nederlandse officiële feestdagen, voor elk jaar automatisch berekend (geen handmatige lijst meer die verloopt).

export interface Feestdag {
  date: string; // JJJJ-MM-DD
  name: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDagen = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

/** Eerste Paasdag (gregoriaanse kalender, anonieme algoritme van Meeus/Jones/Butcher). */
export function paaszondag(jaar: number): Date {
  const a = jaar % 19, b = Math.floor(jaar / 100), c = jaar % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maand = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jaar, maand - 1, dag, 12);
}

/** Alle feestdagen van één jaar, op datum gesorteerd. */
export function feestdagenVan(jaar: number): Feestdag[] {
  const pasen = paaszondag(jaar);
  // Koningsdag valt op 26 april als 27 april een zondag is
  const koningsdag = new Date(jaar, 3, 27, 12);
  if (koningsdag.getDay() === 0) koningsdag.setDate(26);
  const lijst: [Date, string][] = [
    [new Date(jaar, 0, 1, 12), "Nieuwjaarsdag"],
    [plusDagen(pasen, -2), "Goede Vrijdag"],
    [pasen, "Eerste Paasdag"],
    [plusDagen(pasen, 1), "Tweede Paasdag"],
    [koningsdag, "Koningsdag"],
    [new Date(jaar, 4, 5, 12), "Bevrijdingsdag"],
    [plusDagen(pasen, 39), "Hemelvaartsdag"],
    [plusDagen(pasen, 49), "Eerste Pinksterdag"],
    [plusDagen(pasen, 50), "Tweede Pinksterdag"],
    [new Date(jaar, 11, 25, 12), "Eerste Kerstdag"],
    [new Date(jaar, 11, 26, 12), "Tweede Kerstdag"],
  ];
  return lijst.map(([d, name]) => ({ date: iso(d), name })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Feestdagen van een reeks jaren (inclusief). */
export function feestdagenTussen(vanJaar: number, totJaar: number): Feestdag[] {
  const uit: Feestdag[] = [];
  for (let j = vanJaar; j <= totJaar; j++) uit.push(...feestdagenVan(j));
  return uit;
}

const cache = new Map<number, Map<string, string>>();
/** Naam van de feestdag op deze datum (JJJJ-MM-DD), of null. */
export function feestdagOp(datum: string): string | null {
  const jaar = Number(datum.slice(0, 4));
  if (!jaar) return null;
  let m = cache.get(jaar);
  if (!m) {
    m = new Map(feestdagenVan(jaar).map((f) => [f.date, f.name]));
    cache.set(jaar, m);
  }
  return m.get(datum) ?? null;
}
