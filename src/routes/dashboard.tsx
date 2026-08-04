import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const PlanningApp = lazy(() => import("@/components/planning-app"));

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — Maasmond planning" },
      {
        name: "description",
        content: "Overzicht van projecten, personeel, agenda en facturatie in Maasmond planning.",
      },
      { property: "og:title", content: "Dashboard — Maasmond planning" },
      {
        property: "og:description",
        content: "Overzicht van projecten, personeel, agenda en facturatie in Maasmond planning.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <PlanningApp />
      </Suspense>
    </ClientOnly>
  );
}
