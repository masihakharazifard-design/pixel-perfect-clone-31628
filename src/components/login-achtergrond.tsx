import { useEffect, useRef, type CSSProperties } from "react";
import werkplaats from "@/assets/login-werkplaats.webp";

// Achtergrond van het inlogscherm: foto van de vakmensen aan het werk (vloer leggen, schilderen,
// screen ophangen). Drie zachte werkbewegingen spelen altijd af, ook als de muis stilstaat;
// de foto schuift licht mee met de muis. Bij "minder beweging" staat alles stil.
export function LoginAchtergrond() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const minderBeweging = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reset = () => {
      el.style.setProperty("--foto-x", "0px");
      el.style.setProperty("--foto-y", "0px");
    };
    const opMuis = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || minderBeweging.matches) return;
      el.style.setProperty("--foto-x", `${(e.clientX / window.innerWidth - 0.5) * 28}px`);
      el.style.setProperty("--foto-y", `${(e.clientY / window.innerHeight - 0.5) * 20}px`);
    };
    window.addEventListener("pointermove", opMuis, { passive: true });
    document.documentElement.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    minderBeweging.addEventListener("change", reset);
    return () => {
      window.removeEventListener("pointermove", opMuis);
      document.documentElement.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      minderBeweging.removeEventListener("change", reset);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="mm-bg mm-scene-login" style={{ "--scene": `url("${werkplaats}")` } as CSSProperties}>
      <div className="mm-bg__foto">
        <div className="mm-bg__scene">
          <div className="mm-gebaar mm-gebaar--vloer" />
          <div className="mm-gebaar mm-gebaar--schilder" />
          <div className="mm-gebaar mm-gebaar--screen" />
        </div>
      </div>
    </div>
  );
}
