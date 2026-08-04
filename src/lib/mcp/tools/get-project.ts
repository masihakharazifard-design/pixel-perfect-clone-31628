import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type Row = { id: string; data: Record<string, unknown> | null };

export default defineTool({
  name: "get_project",
  title: "Projectdetails opvragen",
  description: "Geef alle opgeslagen gegevens van één project terug op basis van projectnummer of interne id.",
  inputSchema: {
    projectnr: z.string().describe("Het projectnummer, werknummer of de interne id van het project."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectnr }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Niet ingelogd." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("projects").select("id, data");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const needle = projectnr.trim().toLowerCase();
    const rows = ((data ?? []) as Row[]).map((r) => ({ ...(r.data ?? {}), id: r.id }) as Record<string, unknown>);
    const match = rows.find(
      (p) =>
        String(p['id'] ?? "").toLowerCase() === needle ||
        String(p['projectnr'] ?? "").trim().toLowerCase() === needle ||
        String(p['werknummer'] ?? "").trim().toLowerCase() === needle,
    );
    if (!match) {
      return { content: [{ type: "text", text: `Geen project gevonden voor "${projectnr}".` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(match, null, 2) }],
      structuredContent: { project: match },
    };
  },
});
