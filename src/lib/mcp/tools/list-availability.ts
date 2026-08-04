import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type Row = { id: string; data: Record<string, unknown> | null };

export default defineTool({
  name: "list_availability",
  title: "Beschikbaarheid opvragen",
  description:
    "Geef de opgeslagen beschikbaarheid (verlof, ziekte, afwezigheid) van medewerkers terug, optioneel gefilterd op medewerker of datumtekst.",
  inputSchema: {
    zoekterm: z.string().optional().describe("Vrije tekst, bijvoorbeeld een naam of een datum als 2026-08."),
    limiet: z.number().int().optional().describe("Maximaal aantal regels (standaard 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ zoekterm, limiet }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet ingelogd." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("availability").select("id, data");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    let rows = ((data ?? []) as Row[]).map((r) => ({ ...(r.data ?? {}), id: r.id }));
    const term = zoekterm?.trim().toLowerCase();
    if (term) rows = rows.filter((a) => JSON.stringify(a).toLowerCase().includes(term));
    const max = Math.min(Math.max(limiet ?? 100, 1), 500);
    const result = rows.slice(0, max);

    return {
      content: [{ type: "text", text: JSON.stringify({ totaal: rows.length, beschikbaarheid: result }, null, 2) }],
      structuredContent: { totaal: rows.length, beschikbaarheid: result },
    };
  },
});
