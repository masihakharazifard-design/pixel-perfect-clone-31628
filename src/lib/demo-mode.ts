// Demo-modus staat alleen aan als de vlag exact "true" is.
// Productie draait met VITE_DEMO_AUTH_MODE=false (of zonder de variabele).
export const DEMO_MODE = import.meta.env.VITE_DEMO_AUTH_MODE === "true";

let gemeld = false;
if (DEMO_MODE && !gemeld) {
  gemeld = true;
  // Duidelijk zichtbaar bij start/build wanneer de demo-login actief is.
  console.warn("MAASMOND PLANNING DRAAIT IN DEMO MODE — GEEN PRODUCTIEDATA");
}
