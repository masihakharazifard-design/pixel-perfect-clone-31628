import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type Row = { id: string; data: Record<string, unknown> | null };

export default defineTool({
  name: "list_projects",
  title: "Projecten opzoeken",
  description:
    "Geef de projecten uit Maasmond planning terug, optioneel gefilterd op vrije tekst (projectnr, klant, omschrijving, calculator) en status.",
  inputSchema: {
    zoekterm: z.string().optional().describe("Vrije tekst om op te filteren."),
    status: z.string().optional().describe("Filter op status, bijvoorbeeld Gepland of Offerte."),
    limiet: z.number().int().optional().describe("Maximaal aantal projecten (standaard 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ zoekterm, status, limiet }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet ingelogd." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("projects").select("id, data");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const term = zoekterm?.trim().toLowerCase();
    let rows = ((data ?? []) as Row[]).map((r) => ({ ...(r.data ?? {}), id: r.id }));
    if (status) {
      const s = status.trim().toLowerCase();
      rows = rows.filter((p) => String((p as Record<string, unknown>)['status'] ?? "").toLowerCase() === s);
    }
    if (term) rows = rows.filter((p) => JSON.stringify(p).toLowerCase().includes(term));
    const max = Math.min(Math.max(limiet ?? 25, 1), 200);
    const result = rows.slice(0, max);

    return {
      content: [{ type: "text", text: JSON.stringify({ totaal: rows.length, projecten: result }, null, 2) }],
      structuredContent: { totaal: rows.length, projecten: result },
    };
  },
});
