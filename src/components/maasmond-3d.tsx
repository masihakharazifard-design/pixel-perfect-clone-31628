import { useEffect, useRef, useState } from "react";
import { MaasmondScene } from "@/components/maasmond-scene";

// 3D-werkplaats achter het inlogscherm. De 3D-code (three.js) wordt pas geladen als het scherm opent;
// werkt WebGL niet op een apparaat, dan valt hij terug op de getekende huis-scène.
export function Maasmond3D() {
  const ref = useRef<HTMLDivElement>(null);
  const [terugval, setTerugval] = useState(false);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let stop = () => {};
    let weg = false;
    import("@/lib/maasmond-3d-wereld")
      .then(({ startWereld }) => {
        if (weg) return;
        try {
          stop = startWereld(host);
        } catch {
          setTerugval(true);
        }
      })
      .catch(() => setTerugval(true));
    return () => {
      weg = true;
      stop();
    };
  }, []);

  if (terugval) return <MaasmondScene />;
  return <div ref={ref} aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden mm-scene-login" />;
}
