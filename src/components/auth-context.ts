import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";
import { STANDAARD_RECHTEN, type AppRole, type Rechten } from "@/lib/rechten";

export { ROLE_LABELS, type AppRole } from "@/lib/rechten";

export interface AuthCtx {
  user: User | null;
  roles: AppRole[];
  roleLabel: string;
  /** Wat deze gebruiker mag (volgens de rechten per rol). */
  rechten: Rechten;
  signOut: () => Promise<void>;
}

export const Ctx = createContext<AuthCtx>({
  user: null,
  roles: [],
  roleLabel: "",
  rechten: STANDAARD_RECHTEN.medewerker,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(Ctx);
}
