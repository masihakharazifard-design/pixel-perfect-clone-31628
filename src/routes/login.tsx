import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Inloggen — Maasmond planning" },
      { name: "description", content: "Log in met uw Maasmond e-mailadres voor Maasmond planning." },
      { property: "og:title", content: "Inloggen — Maasmond planning" },
      { property: "og:description", content: "Log in met uw Maasmond e-mailadres voor Maasmond planning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginRoute,
});

// The AuthGate in __root renders the login screen for unauthenticated users,
// so reaching this component means the user is already signed in.
function LoginRoute() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/dashboard", replace: true });
  }, [navigate]);
  return <div className="min-h-screen bg-background" />;
}
