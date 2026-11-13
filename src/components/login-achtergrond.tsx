import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import paneelFoto from "@/assets/login-paneel.webp";

// Inlogscherm: stilstaande foto van de vakmensen aan het werk, met een wit kunststof paneel op de achtermuur.
// Het inlogformulier staat op dat paneel. Foto en paneel gebruiken dezelfde schaal en uitsnede, zodat ze bij
// elke schermgrootte op elkaar aansluiten. Is het paneel in de foto te klein om het formulier goed leesbaar
// te tonen, dan hangt er een iets groter paneel in dezelfde kleur (met vier bevestigingen) over het fotopaneel.
// De tekst wordt via `zoom` op echte grootte getekend (geen beeldvergroting), zodat de letters scherp blijven.
// Op een smal scherm (mobiel) staat het formulier als kaart in het midden.

// Paneel in de foto (1672 × 941): x 699–957, y 167–529; midden op 49,5% / 37,0%.
const PANEEL = { links: 41.8, boven: 17.75, breed: 15.45, hoog: 38.5 };
const FORM_BREEDTE = 300; // ontwerpbreedte van het formulier op het paneel (px)
const FORM_HOOGTE = 400; // geschatte hoogte van het formulier op ware grootte
const BINNENRAND = 0.84; // deel van het paneel dat vrij is van de bevestigingen
const MIN_LEESBAAR = 0.9; // nooit kleiner dan 90% van de normale grootte
const MAX_SCHAAL = 1.15;

export function LoginAchtergrond({ children }: { children?: ReactNode }) {
  const plekRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [schaal, setSchaal] = useState(0);
  const opPaneel = schaal > 0;

  // Schaal: zo groot als het fotopaneel toelaat, maar altijd goed leesbaar
  useLayoutEffect(() => {
    const plek = plekRef.current;
    if (!plek) return;
    const meet = () => {
      if (window.innerWidth < 768) {
        setSchaal(0);
        return;
      }
      const z = Number(formRef.current?.style.zoom) || 1;
      const h = formRef.current ? formRef.current.offsetHeight / (z || 1) : FORM_HOOGTE;
      const past = Math.min((plek.clientWidth * BINNENRAND) / FORM_BREEDTE, (plek.clientHeight * BINNENRAND) / (h || FORM_HOOGTE));
      setSchaal(Math.min(MAX_SCHAAL, Math.max(MIN_LEESBAAR, past)));
    };
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(plek);
    window.addEventListener("resize", meet);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", meet);
    };
  }, [opPaneel]);

  return (
    <>
      <div className="mm-bg">
        <div className="mm-bg__scene" style={{ backgroundImage: `url("${paneelFoto}")` }}>
          <div
            ref={plekRef}
            className="mm-paneel-plek"
            style={{ left: `${PANEEL.links}%`, top: `${PANEEL.boven}%`, width: `${PANEEL.breed}%`, height: `${PANEEL.hoog}%` }}
          >
            {opPaneel && (
              <div className="mm-paneel">
                {(["lb", "rb", "lo", "ro"] as const).map((h) => <span key={h} aria-hidden="true" className={`mm-bout mm-bout--${h}`} />)}
                <div ref={formRef} className="mm-paneel-form" style={{ width: FORM_BREEDTE, zoom: schaal }}>
                  {children}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {!opPaneel && <div className="relative w-full max-w-sm mm-login-los">{children}</div>}
    </>
  );
}
