import { Suspense, lazy, type ReactNode } from "react";
import { DEMO_MODE } from "@/lib/demo-mode";
import DemoAuthGate from "@/components/demo-auth-gate";

export { useAuth, ROLE_LABELS, type AppRole } from "@/components/auth-context";

// Wordt alleen geladen wanneer DEMO MODE uit staat; zo blijft de Supabase-client
// in de demo-omgeving volledig ongeladen.
const SupabaseAuthGate = lazy(() => import("@/components/supabase-auth-gate"));

export function AuthGate({ children }: { children: ReactNode }) {
  if (DEMO_MODE) return <DemoAuthGate>{children}</DemoAuthGate>;
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F0F3F8]" />}>
      <SupabaseAuthGate>{children}</SupabaseAuthGate>
    </Suspense>
  );
}
