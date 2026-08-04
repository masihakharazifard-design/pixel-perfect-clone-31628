import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type Row = { id: string; data: Record<string, unknown> | null };

export default defineTool({
  name: "list_employees",
  title: "Medewerkers opvragen",
  description: "Geef de medewerkers uit Maasmond planning terug, optioneel gefilterd op naam, functie of discipline.",
  inputSchema: {
    zoekterm: z.string().optional().describe("Vrije tekst om medewerkers op te filteren."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ zoekterm }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet ingelogd." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("employees").select("id, data");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    let rows = ((data ?? []) as Row[]).map((r) => ({ ...(r.data ?? {}), id: r.id }));
    const term = zoekterm?.trim().toLowerCase();
    if (term) rows = rows.filter((e) => JSON.stringify(e).toLowerCase().includes(term));

    return {
      content: [{ type: "text", text: JSON.stringify({ totaal: rows.length, medewerkers: rows }, null, 2) }],
      structuredContent: { totaal: rows.length, medewerkers: rows },
    };
  },
});
