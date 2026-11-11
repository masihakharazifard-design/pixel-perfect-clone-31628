import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import werkplaats from "@/assets/login-werkplaats.webp";

// Inlogscherm in een video van de vakmensen aan het werk (vloer leggen, schilderen, screen ophangen).
// De video staat in public/maasmond-achtergrond.mp4; zolang die ontbreekt of laadt, of bij "minder beweging",
// is de foto als stilstaand beeld te zien.
// Het inlogformulier hangt als poster op de lege witte achtermuur: het zit in de foto, schaalt mee
// en schuift mee met het muiseffect. Is de muur te klein om prettig in te typen (smal scherm),
// dan staat het formulier gewoon in het midden over de foto.
// Het hele beeld schuift subtiel mee met de muis; bij "minder beweging" staat alles stil.

// Plek van de poster op de achtermuur, in procenten van de foto (1672 × 941)
const POSTER = { links: 33, boven: 13, breed: 30, hoog: 45 };
const POSTER_BREEDTE = 360; // ontwerpbreedte van het formulier in px
const POSTER_HOOGTE = 470; // geschatte hoogte zolang het formulier nog niet op de muur hangt
const MIN_SCHAAL = 0.72;
const VIDEO = "/maasmond-achtergrond.mp4";

export function LoginAchtergrond({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const plekRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [geenVideo, setGeenVideo] = useState(false);
  const [schaal, setSchaal] = useState(0);
  const opMuur = schaal >= MIN_SCHAAL;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const minderBeweging = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reset = () => {
      el.style.setProperty("--foto-x", "0px");
      el.style.setProperty("--foto-y", "0px");
    };
    const video = () => {
      const v = videoRef.current;
      if (!v) return;
      if (minderBeweging.matches) {
        v.pause();
        v.classList.remove("is-playing");
      } else {
        v.muted = true;
        v.play().catch(() => {});
      }
    };
    const opWijziging = () => { reset(); video(); };
    video();
    const opMuis = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || minderBeweging.matches) return;
      el.style.setProperty("--foto-x", `${(e.clientX / window.innerWidth - 0.5) * 28}px`);
      el.style.setProperty("--foto-y", `${(e.clientY / window.innerHeight - 0.5) * 20}px`);
    };
    window.addEventListener("pointermove", opMuis, { passive: true });
    document.documentElement.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    minderBeweging.addEventListener("change", opWijziging);
    return () => {
      window.removeEventListener("pointermove", opMuis);
      document.documentElement.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      minderBeweging.removeEventListener("change", opWijziging);
    };
  }, []);

  // Schaal van de poster: zo groot mogelijk binnen de muurplek
  useLayoutEffect(() => {
    const plek = plekRef.current;
    if (!plek) return;
    const meet = () => {
      const h = posterRef.current?.offsetHeight || POSTER_HOOGTE;
      const s = Math.min(plek.clientWidth / POSTER_BREEDTE, plek.clientHeight / h, 1.15);
      setSchaal(window.innerWidth < 768 ? 0 : s);
    };
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(plek);
    if (posterRef.current) ro.observe(posterRef.current);
    window.addEventListener("resize", meet);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", meet);
    };
  }, [opMuur]);

  return (
    <>
      <div ref={ref} className="mm-bg" style={{ "--scene": `url("${werkplaats}")` } as CSSProperties}>
        <div className="mm-bg__foto">
          <div className="mm-bg__scene">
            {!geenVideo && (
              <video
                ref={videoRef}
                className="mm-bg__video"
                src={VIDEO}
                muted
                loop
                playsInline
                preload="auto"
                disablePictureInPicture
                aria-hidden="true"
                onPlaying={(e) => e.currentTarget.classList.add("is-playing")}
                onError={() => setGeenVideo(true)}
              />
            )}
            <div aria-hidden="true" className="mm-bg__waas" />
            <div
              ref={plekRef}
              className="mm-poster-plek"
              style={{ left: `${POSTER.links}%`, top: `${POSTER.boven}%`, width: `${POSTER.breed}%`, height: `${POSTER.hoog}%` }}
            >
              {opMuur && (
                <div ref={posterRef} className="mm-poster" style={{ width: POSTER_BREEDTE, transform: `translate(-50%, -50%) scale(${schaal})` }}>
                  {children}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {!opMuur && <div className="relative w-full max-w-sm mm-login-los">{children}</div>}
    </>
  );
}
