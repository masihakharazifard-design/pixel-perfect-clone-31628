// Geschiedenis van alle veranderingen (auditlog). Gedeeld tussen de Supabase-store, de demo-store en het scherm.

export interface GeschiedenisRegel {
  id: string;
  /** ISO-tijdstip */
  tijd: string;
  /** E-mailadres van wie het deed (null = onbekend of systeem) */
  wie: string | null;
  actie: string;
  tabel: string;
  recordId: string | null;
  oud: unknown;
  nieuw: unknown;
}

export interface GeschiedenisOpties {
  limit?: number;
  /** Alleen regels ouder dan dit tijdstip (voor "meer laden") */
  voor?: string;
  /** Alleen regels van dit werk (ook de planningregels van dat werk) */
  recordId?: string;
}

type Obj = Record<string, unknown>;

/** Alleen de velden die echt veranderd zijn, oud en nieuw naast elkaar. */
export function verschil(oud: Obj | null | undefined, nieuw: Obj | null | undefined): { oud: Obj; nieuw: Obj } {
  const o: Obj = {};
  const n: Obj = {};
  const sleutels = new Set([...Object.keys(oud || {}), ...Object.keys(nieuw || {})]);
  for (const k of sleutels) {
    if (k === "id") continue;
    const a = oud?.[k];
    const b = nieuw?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      o[k] = a;
      n[k] = b;
    }
  }
  return { oud: o, nieuw: n };
}

/** Planningregel zoals die in het log staat: {id, data} */
export interface LogPlanRij {
  id: string;
  data: Obj;
}

/** Hoort deze regel bij het gegeven werk? (recordId zelf of een planningregel van dat werk) */
export function hoortBijWerk(r: GeschiedenisRegel, werkId: string): boolean {
  if (r.recordId === werkId) return true;
  if (r.tabel !== "availability") return false;
  const lijst = [r.nieuw, r.oud].flatMap((x) => (Array.isArray(x) ? (x as LogPlanRij[]) : []));
  return lijst.some((x) => x?.data?.projectId === werkId);
}
