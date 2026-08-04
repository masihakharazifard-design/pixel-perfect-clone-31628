import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjects from "./tools/list-projects";
import getProject from "./tools/get-project";
import listEmployees from "./tools/list-employees";
import listAvailability from "./tools/list-availability";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "maasmond-planning",
  title: "Maasmond planning",
  version: "0.1.0",
  instructions:
    "Tools voor Maasmond planning. Gebruik list_projects en get_project voor projectinformatie, list_employees voor medewerkers en list_availability voor verlof en afwezigheid. Alle gegevens zijn in het Nederlands.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjects, getProject, listEmployees, listAvailability],
});
