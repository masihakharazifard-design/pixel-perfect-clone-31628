import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type AppRole = "beheerder" | "planner" | "projectleider" | "financieel" | "medewerker";

export const ROLE_LABELS: Record<AppRole, string> = {
  beheerder: "Beheerder",
  planner: "Planner",
  projectleider: "Projectleider",
  financieel: "Financieel",
  medewerker: "Medewerker",
};

export interface AuthCtx {
  user: User | null;
  roles: AppRole[];
  roleLabel: string;
  signOut: () => Promise<void>;
}

export const Ctx = createContext<AuthCtx>({
  user: null,
  roles: [],
  roleLabel: "",
  signOut: async () => {},
});

export function useAuth() {
  return useContext(Ctx);
}
