import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";


const PlanningApp = lazy(() => import("@/components/planning-app"));


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Maasmond plant — Projectplanning" },
      {
        name: "description",
        content:
          "Plan projecten, personeel en agenda voor stoffering, schilderwerk en zonwering in één overzichtelijk planbord.",
      },
      { property: "og:title", content: "Projectplanning voor uitvoerende teams" },
      {
        property: "og:description",
        content:
          "Dashboard, projecten, agenda, personeelsplanning, beschikbaarheid en facturatie in één app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <PlanningApp />
      </Suspense>
    </ClientOnly>
  );
}

