import { useEffect, useRef, type ReactNode } from "react";

// Bewegende scène voor het inlogscherm: twee huizen waar Maasmond aan werkt.
// Links wordt een gevel geschilderd (verfroller), rechts zakt een zonnescherm op en neer
// en zie je door het raam gordijnen en een bank (stoffering). De lagen volgen de muis
// en komen bij het openen één voor één op. Bij "minder beweging" staat alles stil.

const W = 1440;
// Afdelingskleuren in de scène
const STOF = "#26A69A";
const SCHILDER = "#EF6A50";
const ZON = "#F2A43A";
const GROND = 515;

const lucht: ReactNode = (
  <g>
    <circle cx={1200} cy={150} r={70} fill="#E0402F" opacity={0.12} />
    <g className="mm-wolk">
      <ellipse cx={420} cy={120} rx={70} ry={22} fill="#ffffff" />
      <ellipse cx={460} cy={105} rx={45} ry={22} fill="#ffffff" />
    </g>
    <g className="mm-wolk mm-wolk-2">
      <ellipse cx={900} cy={90} rx={60} ry={18} fill="#ffffff" />
      <ellipse cx={935} cy={78} rx={38} ry={18} fill="#ffffff" />
    </g>
  </g>
);

// Verre daken op de achtergrond
const verte: ReactNode = (
  <g fill="#EEE5D8">
    {[[40, 90, 70], [150, 70, 95], [520, 80, 60], [640, 60, 85], [760, 90, 70], [880, 70, 55]].map(([x, b, h]) => (
      <g key={x}>
        <rect x={x} y={GROND - h} width={b} height={h} />
        <polygon points={`${x - 8},${GROND - h} ${x + b / 2},${GROND - h - 35} ${x + b + 8},${GROND - h}`} />
      </g>
    ))}
  </g>
);

// Links: gevel wordt geschilderd
const schilderHuis: ReactNode = (
  <g>
    <polygon points="90,322 255,215 420,322" fill="#9DB0D3" />
    <rect x={110} y={320} width={290} height={GROND - 320} fill="#F1E8DA" stroke="#E2D4BF" strokeWidth={2} />
    {/* al geschilderd */}
    <rect x={130} y={340} width={60} height={GROND - 342} fill="#F8C6B5" />
    {/* wordt nu geschilderd */}
    <rect className="mm-verf" x={190} y={340} width={60} height={GROND - 342} fill="#F8C6B5" />
    <g className="mm-roller">
      <rect x={186} y={GROND - 22} width={68} height={14} rx={7} fill={SCHILDER} />
      <line x1={220} y1={GROND - 8} x2={220} y2={GROND + 40} stroke="#7A6A58" strokeWidth={4} strokeLinecap="round" />
    </g>
    <rect x={285} y={365} width={90} height={75} rx={4} fill="#DCE7F2" stroke="#ffffff" strokeWidth={6} />
    <line x1={330} y1={365} x2={330} y2={440} stroke="#ffffff" strokeWidth={4} />
    {/* verfemmer */}
    <rect x={262} y={GROND - 26} width={30} height={26} rx={3} fill="#D9CDBB" />
    <rect x={262} y={GROND - 26} width={30} height={7} rx={3} fill={SCHILDER} />
  </g>
);

// Rechts: zonnescherm en stoffering
const strepen = Array.from({ length: 8 }, (_, i) => i);
const zonHuis: ReactNode = (
  <g>
    <polygon points="990,302 1170,190 1350,302" fill="#D98B6F" />
    <circle cx={1170} cy={255} r={18} fill="#DCE7F2" stroke="#ffffff" strokeWidth={5} />
    <rect x={1010} y={300} width={320} height={GROND - 300} fill="#FFF7EC" stroke="#E7D9C6" strokeWidth={2} />
    {/* raam met kamer */}
    <rect x={1050} y={355} width={140} height={100} fill="#F4E9DA" stroke="#ffffff" strokeWidth={6} />
    <rect x={1070} y={402} width={100} height={22} rx={9} fill={STOF} />
    <rect x={1064} y={418} width={112} height={24} rx={9} fill={STOF} />
    <rect x={1066} y={438} width={8} height={10} fill="#1F7F75" />
    <rect x={1166} y={438} width={8} height={10} fill="#1F7F75" />
    <path className="mm-gordijn" d="M1053 358 h34 q-6 40 4 94 h-38 z" fill="#8FD3CB" />
    <path className="mm-gordijn mm-gordijn-2" d="M1187 358 h-34 q6 40 -4 94 h38 z" fill="#8FD3CB" />
    {/* zonnescherm */}
    <rect x={1038} y={334} width={164} height={8} rx={4} fill="#8C7B66" />
    <g className="mm-zonnescherm">
      {strepen.map((i) => (
        <rect key={i} x={1040 + i * 20} y={340} width={20} height={62} fill={i % 2 ? "#FFF3DF" : ZON} />
      ))}
      {strepen.map((i) => (
        <path key={i} d={`M${1040 + i * 20} 402 q10 14 20 0 z`} fill={i % 2 ? "#FFF3DF" : ZON} />
      ))}
    </g>
    {/* deur in Maasmond-blauw */}
    <path d={`M1235 ${GROND} v-92 a28 28 0 0 1 56 0 v92 z`} fill="#1E3A7B" />
    <circle cx={1280} cy={GROND - 45} r={3} fill="#F2D6A0" />
  </g>
);

const voorgrond: ReactNode = (
  <g>
    <rect x={0} y={GROND} width={W} height={600 - GROND} fill="#E3ECD6" />
    <path d={`M1118 ${GROND} L1080 600 H1210 L1170 ${GROND} Z`} fill="#EFE6D6" />
    {[[60, 22], [430, 26], [470, 18], [980, 24], [1370, 28], [1405, 20]].map(([x, r]) => (
      <circle key={x} cx={x} cy={GROND + 4} r={r} fill="#BFD6AE" />
    ))}
  </g>
);

const LAGEN: { diepte: number; inhoud: ReactNode }[] = [
  { diepte: 6, inhoud: lucht },
  { diepte: 12, inhoud: verte },
  { diepte: 22, inhoud: <><g transform="translate(120 0)">{schilderHuis}</g><g transform="translate(-120 0)">{zonHuis}</g></> },
  { diepte: 34, inhoud: voorgrond },
];

export function MaasmondScene(_props: { variant?: "login" }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let mx = 0;
    let my = 0;
    const teken = () => {
      frame = 0;
      el.style.setProperty("--mx", mx.toFixed(3));
      el.style.setProperty("--my", my.toFixed(3));
    };
    const opMuis = (e: PointerEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
      if (!frame) frame = requestAnimationFrame(teken);
    };
    window.addEventListener("pointermove", opMuis, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", opMuis);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden mm-scene-login">
      {LAGEN.map((laag, i) => (
        <div
          key={i}
          className="absolute -inset-x-16 -bottom-8 top-0 will-change-transform"
          style={{ transform: `translate3d(calc(var(--mx, 0) * ${-laag.diepte}px), calc(var(--my, 0) * ${-laag.diepte / 2}px), 0)` }}
        >
          <svg viewBox={`0 0 ${W} 600`} preserveAspectRatio="xMidYMax slice" className="w-full h-full mm-laag-op" style={{ animationDelay: `${i * 140}ms` }}>
            {laag.inhoud}
          </svg>
        </div>
      ))}
    </div>
  );
}
