import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import paneelFoto from "@/assets/login-paneel.webp";

// Inlogscherm: stilstaande foto van de vakmensen aan het werk, met een wit kunststof paneel op de achtermuur.
// Het inlogformulier staat rechtstreeks op dat paneel (transparant, metalen bevestigingen blijven zichtbaar).
// Foto en formulier gebruiken dezelfde schaal en uitsnede, zodat ze bij elke schermgrootte op elkaar aansluiten.
// Wordt het paneel te klein om prettig in te typen (mobiel), dan staat het formulier als kaart in het midden.

// Binnenvlak van het paneel (binnen de vier bevestigingen), in procenten van de foto (1672 × 941).
// Paneel zelf: x 699–957, y 167–529; midden op 49,5% / 37,0%.
const PANEEL_VLAK = { links: 43.1, boven: 20.9, breed: 12.8, hoog: 32.1 };
const FORM_BREEDTE = 300; // ontwerpbreedte van het formulier op het paneel (px)
const FORM_HOOGTE = 420; // geschatte hoogte zolang het formulier nog niet op het paneel staat
const MIN_SCHAAL = 0.5;

export function LoginAchtergrond({ children }: { children?: ReactNode }) {
  const plekRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [schaal, setSchaal] = useState(0);
  const opPaneel = schaal >= MIN_SCHAAL;

  // Schaal van het formulier: zo groot mogelijk binnen het paneel
  useLayoutEffect(() => {
    const plek = plekRef.current;
    if (!plek) return;
    const meet = () => {
      const h = formRef.current?.offsetHeight || FORM_HOOGTE;
      const s = Math.min(plek.clientWidth / FORM_BREEDTE, plek.clientHeight / h);
      setSchaal(window.innerWidth < 768 ? 0 : s);
    };
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(plek);
    if (formRef.current) ro.observe(formRef.current);
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
            style={{ left: `${PANEEL_VLAK.links}%`, top: `${PANEEL_VLAK.boven}%`, width: `${PANEEL_VLAK.breed}%`, height: `${PANEEL_VLAK.hoog}%` }}
          >
            {opPaneel && (
              <div ref={formRef} className="mm-paneel-form" style={{ width: FORM_BREEDTE, transform: `translate(-50%, -50%) scale(${schaal})` }}>
                {children}
              </div>
            )}
          </div>
        </div>
      </div>
      {!opPaneel && <div className="relative w-full max-w-sm mm-login-los">{children}</div>}
    </>
  );
}
