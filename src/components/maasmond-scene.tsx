import { useEffect, useRef, type ReactNode } from "react";

// Gelaagde havenscène van de Maasmond (zon, skyline met kranen, golven) die met diepte meebeweegt.
// "login": volle scène die de muis volgt en bij het openen laag voor laag opkomt.
// "app": vage lagen onderin de app die heel licht meeschuiven met scrollen.
// Bij "minder beweging" (systeeminstelling) blijft alles stil staan.

type Variant = "login" | "app";

const W = 1440;
const golf = (y: number, amp: number, stap: number) => {
  let d = `M0 ${y} Q ${stap / 2} ${y - amp} ${stap} ${y}`;
  for (let x = stap * 2; x <= W + stap; x += stap) d += ` T ${x} ${y}`;
  return `${d} V600 H0 Z`;
};

// skyline: gebouwen [x, breedte, hoogte] en kranen [x, hoogte, armlengte]
const GEBOUWEN: [number, number, number][] = [
  [40, 70, 60], [120, 40, 95], [170, 90, 45], [300, 55, 80], [365, 30, 120], [520, 110, 50],
  [700, 60, 70], [770, 35, 105], [930, 80, 55], [1180, 50, 85], [1240, 90, 40], [1350, 60, 75],
];
const KRANEN: [number, number, number][] = [[460, 150, 90], [620, 175, -110], [1060, 160, 100]];
const BASIS = 470;

const skyline = () => {
  let d = "";
  for (const [x, b, h] of GEBOUWEN) d += `M${x} ${BASIS} V${BASIS - h} H${x + b} V${BASIS} Z `;
  return d;
};

const LAGEN: { diepte: number; scroll: number; inhoud: ReactNode }[] = [
  { diepte: 8, scroll: 0.02, inhoud: <circle cx={1090} cy={230} r={110} fill="#E0402F" opacity={0.16} /> },
  {
    diepte: 16,
    scroll: 0.04,
    inhoud: (
      <g fill="#C9D5EE">
        <path d={skyline()} />
        {KRANEN.map(([x, h, arm]) => (
          <g key={x} stroke="#C9D5EE" strokeWidth={6} strokeLinecap="round">
            <line x1={x} y1={BASIS} x2={x} y2={BASIS - h} />
            <line x1={x - Math.sign(arm) * 25} y1={BASIS - h + 8} x2={x + arm} y2={BASIS - h + 8} />
            <line x1={x + arm * 0.8} y1={BASIS - h + 8} x2={x + arm * 0.8} y2={BASIS - h + 60} strokeWidth={2} />
          </g>
        ))}
        <rect x={0} y={BASIS - 2} width={W} height={140} />
      </g>
    ),
  },
  { diepte: 28, scroll: 0.07, inhoud: <path d={golf(495, 18, 180)} fill="#9FB3DD" opacity={0.75} /> },
  { diepte: 44, scroll: 0.11, inhoud: <path d={golf(535, 14, 240)} fill="#1E3A7B" opacity={0.9} /> },
];

export function MaasmondScene({ variant }: { variant: Variant }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let mx = 0;
    let my = 0;
    let sy = 0;
    const teken = () => {
      frame = 0;
      el.style.setProperty("--mx", mx.toFixed(3));
      el.style.setProperty("--my", my.toFixed(3));
      el.style.setProperty("--sy", String(sy));
    };
    const plan = () => {
      if (!frame) frame = requestAnimationFrame(teken);
    };
    const opMuis = (e: PointerEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
      plan();
    };
    const opScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.scrollHeight > t.clientHeight) {
        sy = Math.min(t.scrollTop, 1500);
        plan();
      }
    };
    if (variant === "login") window.addEventListener("pointermove", opMuis, { passive: true });
    else document.addEventListener("scroll", opScroll, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", opMuis);
      document.removeEventListener("scroll", opScroll, { capture: true });
    };
  }, [variant]);

  const login = variant === "login";
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none overflow-hidden ${login ? "mm-scene-login" : "-z-10 opacity-40"}`}
    >
      {LAGEN.map((laag, i) => (
        <div
          key={i}
          className="absolute -inset-x-16 -bottom-8 top-0 will-change-transform"
          style={{
            transform: login
              ? `translate3d(calc(var(--mx, 0) * ${-laag.diepte}px), calc(var(--my, 0) * ${-laag.diepte / 2}px), 0)`
              : `translate3d(0, calc(var(--sy, 0) * ${-laag.scroll}px), 0)`,
          }}
        >
          <svg
            viewBox={`0 0 ${W} 600`}
            preserveAspectRatio="xMidYMax slice"
            className={`w-full h-full ${login ? "mm-laag-op" : ""}`}
            style={login ? { animationDelay: `${i * 140}ms` } : undefined}
          >
            {laag.inhoud}
          </svg>
        </div>
      ))}
    </div>
  );
}
