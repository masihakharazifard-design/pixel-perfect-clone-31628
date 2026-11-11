import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// 3D-werkplaats voor het inlogscherm: een hoge loftruimte in verbouwing (baksteen, houten balken,
// grote ramen met zonlicht) met drie vakmensen van Maasmond aan het werk:
// - een stoffeerder legt geknield vloertegels (Stoffering)
// - een schilderes zet de bakstenen muur baan voor baan in het wit (Schilderwerk)
// - een monteur op een ladder hangt een screen op; zakt het screen, dan wordt het zonlicht minder (Zonwering)
// Het inlogvak hangt als bord midden op de achterwand. De camera beweegt licht mee met de muis.

const KAMER = { b: 6, h: 6, achter: -6 }; // x van -b tot b, plafond op h, achterwand op z = achter
const KLEUR = {
  lucht: "#FFF6EA",
  stof: "#26A69A",
  schilder: "#EF6A50",
  zon: "#F2A43A",
  blauw: "#1E3A7B",
  rood: "#C24A3B",
};

// Vaste toevalsgenerator, zodat de rommel elke keer op dezelfde plek ligt
function maakRnd(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mat = (c: string, ruw = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: ruw, metalness: 0, ...extra });
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, schaduw = true) {
  const x = new THREE.Mesh(geo, m);
  x.castShadow = schaduw;
  x.receiveShadow = true;
  return x;
}
const blok = (b: number, h: number, d: number, m: THREE.Material, r = 0.02) =>
  mesh(new RoundedBoxGeometry(b, h, d, 2, Math.min(r, b / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), m);

// ===== Getekende texturen =====
function textuur(w: number, h: number, teken: (ctx: CanvasRenderingContext2D, rnd: () => number) => void, herhaal: [number, number], seed = 1) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  teken(c.getContext("2d")!, maakRnd(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...herhaal);
  t.anisotropy = 4;
  return t;
}
const vlekken = (ctx: CanvasRenderingContext2D, rnd: () => number, n: number, kleur: string, max: number) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * ctx.canvas.width, y = rnd() * ctx.canvas.height, r = 10 + rnd() * max;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, kleur);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
};
const baksteen = () =>
  textuur(512, 512, (ctx, rnd) => {
    ctx.fillStyle = "#E3CCAE";
    ctx.fillRect(0, 0, 512, 512);
    const bh = 21, bb = 62;
    for (let r = 0; r * bh < 512; r++) {
      const off = r % 2 ? bb / 2 : 0;
      for (let k = -1; k * bb < 512; k++) {
        const l = 44 + rnd() * 14, s = 42 + rnd() * 16, hue = 16 + rnd() * 12;
        ctx.fillStyle = `hsl(${hue} ${s}% ${l}%)`;
        ctx.fillRect(k * bb + off + 2, r * bh + 2, bb - 4, bh - 4);
      }
    }
    // pleisterresten
    vlekken(ctx, rnd, 5, "rgba(238,226,208,0.35)", 120);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(${rnd() > 0.5 ? "255,240,220" : "90,50,30"},${0.05 + rnd() * 0.08})`;
      ctx.fillRect(rnd() * 512, rnd() * 512, 2, 2);
    }
  }, [3, 2], 7);
const pleister = () =>
  textuur(1024, 512, (ctx, rnd) => {
    ctx.fillStyle = "#EBD3B8";
    ctx.fillRect(0, 0, 1024, 512);
    vlekken(ctx, rnd, 70, "rgba(246,230,210,0.22)", 220);
    vlekken(ctx, rnd, 40, "rgba(205,160,120,0.1)", 180);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(${rnd() > 0.5 ? "255,248,236" : "150,105,70"},${rnd() * 0.06})`;
      ctx.fillRect(rnd() * 1024, rnd() * 512, 2, 2);
    }
  }, [1, 1], 3);
const beton = () =>
  textuur(512, 512, (ctx, rnd) => {
    ctx.fillStyle = "#EEE6DA";
    ctx.fillRect(0, 0, 512, 512);
    vlekken(ctx, rnd, 40, "rgba(205,190,170,0.12)", 160);
    vlekken(ctx, rnd, 30, "rgba(252,248,240,0.25)", 140);
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = `rgba(${rnd() > 0.5 ? "120,95,70" : "255,250,240"},${rnd() * 0.12})`;
      ctx.fillRect(rnd() * 512, rnd() * 512, 1.5, 1.5);
    }
  }, [4, 4], 11);
const hout = (basis: string, seed: number) =>
  textuur(256, 256, (ctx, rnd) => {
    ctx.fillStyle = basis;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = `rgba(80,45,20,${0.05 + rnd() * 0.12})`;
      ctx.lineWidth = 1 + rnd() * 2;
      ctx.beginPath();
      const y = rnd() * 256;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y + rnd() * 10 - 5, 170, y + rnd() * 10 - 5, 256, y);
      ctx.stroke();
    }
  }, [1, 1], seed);

// ===== Mensen: echte verhoudingen, met ellebogen en knieën =====
interface Mens {
  root: THREE.Group; heup: THREE.Group; romp: THREE.Group; hoofd: THREE.Group;
  schL: THREE.Group; schR: THREE.Group; ellL: THREE.Group; ellR: THREE.Group;
  handL: THREE.Object3D; handR: THREE.Object3D;
  dijL: THREE.Group; dijR: THREE.Group; knieL: THREE.Group; knieR: THREE.Group;
}
function maakMens(o: { huid: string; shirt: string; broek: string; haar: string; schoen: string; vrouw?: boolean; pet?: string; kortMouw?: boolean }): Mens {
  const huid = mat(o.huid, 0.55), shirt = mat(o.shirt, 0.9), broek = mat(o.broek, 0.9), haar = mat(o.haar, 0.95), schoen = mat(o.schoen, 0.7);
  const root = new THREE.Group();
  const heup = new THREE.Group();
  heup.position.y = 0.92;
  root.add(heup);
  const bekken = mesh(new THREE.SphereGeometry(1, 20, 14), broek);
  bekken.scale.set(o.vrouw ? 0.17 : 0.16, 0.12, 0.115);
  bekken.position.y = 0.03;
  heup.add(bekken);
  const been = (x: number) => {
    const dij = new THREE.Group();
    dij.position.set(x, 0, 0);
    heup.add(dij);
    const boven = mesh(new THREE.CapsuleGeometry(0.075, 0.32, 4, 12), broek);
    boven.position.y = -0.21;
    dij.add(boven);
    const knie = new THREE.Group();
    knie.position.y = -0.44;
    dij.add(knie);
    const scheen = mesh(new THREE.CapsuleGeometry(0.058, 0.33, 4, 12), broek);
    scheen.position.y = -0.2;
    knie.add(scheen);
    const voet = blok(0.1, 0.08, 0.26, schoen, 0.03);
    voet.position.set(0, -0.43, 0.05);
    knie.add(voet);
    return { dij, knie };
  };
  const L = been(-0.085), R = been(0.085);
  const romp = new THREE.Group();
  romp.position.y = 0.06;
  heup.add(romp);
  const profiel = [[0.001, 0], [0.14, 0], [0.145, 0.08], [0.15, 0.18], [0.17, 0.32], [0.18, 0.43], [0.15, 0.5], [0.06, 0.55], [0.001, 0.555]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const torso = mesh(new THREE.LatheGeometry(profiel, 28), shirt);
  torso.scale.set(o.vrouw ? 1.05 : 1.18, 1, 0.72);
  romp.add(torso);
  const nek = mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.12, 12), huid);
  nek.position.y = 0.58;
  romp.add(nek);
  const hoofd = new THREE.Group();
  hoofd.position.y = 0.73;
  romp.add(hoofd);
  const schedel = mesh(new THREE.SphereGeometry(0.1, 28, 20), huid);
  schedel.scale.set(0.9, 1.15, 1.02);
  hoofd.add(schedel);
  const neus = mesh(new THREE.ConeGeometry(0.016, 0.04, 8), huid);
  neus.rotation.x = Math.PI / 2;
  neus.position.set(0, -0.01, 0.105);
  hoofd.add(neus);
  for (const x of [-0.09, 0.09]) {
    const oor = mesh(new THREE.SphereGeometry(0.022, 10, 8), huid);
    oor.scale.set(0.6, 1, 0.8);
    oor.position.set(x, 0, 0);
    hoofd.add(oor);
  }
  const kap = mesh(new THREE.SphereGeometry(0.106, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), haar);
  kap.scale.set(0.93, 1.12, 1.05);
  kap.rotation.x = -0.45;
  kap.position.set(0, 0.012, -0.008);
  hoofd.add(kap);
  if (o.vrouw) {
    const knot = mesh(new THREE.SphereGeometry(0.05, 14, 10), haar);
    knot.position.set(0, 0.04, -0.11);
    hoofd.add(knot);
    const lok = mesh(new THREE.SphereGeometry(1, 14, 10), haar);
    lok.scale.set(0.085, 0.09, 0.05);
    lok.position.set(0, -0.04, -0.075);
    hoofd.add(lok);
  }
  if (o.pet) {
    const p = mat(o.pet, 0.7);
    const bol = mesh(new THREE.SphereGeometry(0.11, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), p);
    bol.scale.set(0.95, 1.05, 1.05);
    bol.position.y = 0.03;
    hoofd.add(bol);
    const klep = blok(0.15, 0.015, 0.1, p, 0.005);
    klep.position.set(0, 0.055, 0.12);
    hoofd.add(klep);
  }
  const arm = (x: number) => {
    const sch = new THREE.Group();
    sch.position.set(x, 0.45, 0);
    romp.add(sch);
    sch.add(mesh(new THREE.SphereGeometry(0.06, 14, 10), shirt));
    const boven = mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 10), shirt);
    boven.position.y = -0.14;
    sch.add(boven);
    const ell = new THREE.Group();
    ell.position.y = -0.29;
    sch.add(ell);
    const onder = mesh(new THREE.CapsuleGeometry(0.042, 0.19, 4, 10), o.kortMouw ? huid : shirt);
    onder.position.y = -0.12;
    ell.add(onder);
    const hand = blok(0.055, 0.095, 0.035, huid, 0.015);
    hand.position.y = -0.29;
    ell.add(hand);
    return { sch, ell, hand };
  };
  const AL = arm(-0.205), AR = arm(0.205);
  AL.sch.rotation.z = 0.08;
  AR.sch.rotation.z = -0.08;
  return { root, heup, romp, hoofd, schL: AL.sch, schR: AR.sch, ellL: AL.ell, ellR: AR.ell, handL: AL.hand, handR: AR.hand, dijL: L.dij, dijR: R.dij, knieL: L.knie, knieR: R.knie };
}

const glad = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

export function startWereld(host: HTMLElement): () => void {
  const stil = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rnd = maakRnd(42);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;opacity:0;transition:opacity 900ms ease";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(KLEUR.lucht);

  // ===== Licht: warm zonlicht door de ramen rechts, zacht daglicht in de ruimte =====
  scene.add(new THREE.HemisphereLight("#FFF8EE", "#E6D6C0", 1.8));
  const vulLicht = new THREE.PointLight("#FFE7C7", 18, 14, 1.6);
  vulLicht.position.set(-1, 4.5, 1);
  scene.add(vulLicht);
  const zon = new THREE.DirectionalLight("#FFD6A0", 3.4);
  zon.position.set(13, 7.5, 0.5);
  zon.target.position.set(0, 0, -2.6);
  zon.castShadow = true;
  zon.shadow.mapSize.set(2048, 2048);
  Object.assign(zon.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 30 });
  zon.shadow.bias = -0.0004;
  zon.shadow.radius = 3;
  scene.add(zon, zon.target);

  // ===== Kamer =====
  const { b: B, h: H, achter: Z0 } = KAMER;
  const ZV = 4.5; // voorkant (achter de camera)
  const vloer = mesh(new THREE.PlaneGeometry(B * 2, ZV - Z0), mat("#FFFFFF", 0.95, { map: beton() }), false);
  vloer.rotation.x = -Math.PI / 2;
  vloer.position.z = (ZV + Z0) / 2;
  scene.add(vloer);
  const achterwand = mesh(new THREE.PlaneGeometry(B * 2, H), mat("#FFFFFF", 0.95, { map: pleister() }), false);
  achterwand.position.set(0, H / 2, Z0);
  scene.add(achterwand);
  const steen = baksteen();
  const linkerwand = mesh(new THREE.PlaneGeometry(ZV - Z0, H), mat("#FFFFFF", 0.95, { map: steen }));
  linkerwand.rotation.y = Math.PI / 2;
  linkerwand.position.set(-B, H / 2, (ZV + Z0) / 2);
  scene.add(linkerwand);
  // Rechterwand met drie hoge ramen (penanten ertussen, zodat het zonlicht in banen binnenvalt)
  const RAMEN = [[-5.2, -3.6], [-2.9, -1.3], [-0.6, 1.0]] as const;
  const SILL = 0.9, BOVENRAAM = 4.2;
  const wandMat = mat("#FFFFFF", 0.95, { map: steen.clone() });
  const wandStuk = (z1: number, z2: number, y1: number, y2: number) => {
    if (z2 - z1 <= 0.001 || y2 - y1 <= 0.001) return;
    const s = blok(0.25, y2 - y1, z2 - z1, wandMat, 0.005);
    s.position.set(B + 0.125, (y1 + y2) / 2, (z1 + z2) / 2);
    scene.add(s);
  };
  let zPrev = Z0;
  for (const [z1, z2] of RAMEN) {
    wandStuk(zPrev, z1, 0, H);
    wandStuk(z1, z2, 0, SILL);
    wandStuk(z1, z2, BOVENRAAM, H);
    // kozijn en roeden (geven het lijnenpatroon in het zonlicht)
    const kozijn = mat("#F4EEE6", 0.6);
    for (const y of [SILL, BOVENRAAM, (SILL + BOVENRAAM) / 2]) {
      const r = blok(0.08, 0.06, z2 - z1, kozijn, 0.01);
      r.position.set(B + 0.02, y, (z1 + z2) / 2);
      scene.add(r);
    }
    for (const z of [z1, z2, (z1 + z2) / 2]) {
      const r = blok(0.08, BOVENRAAM - SILL, 0.06, kozijn, 0.01);
      r.position.set(B + 0.02, (SILL + BOVENRAAM) / 2, z);
      scene.add(r);
    }
    const bank = blok(0.35, 0.05, z2 - z1 + 0.1, mat("#EDE4D8", 0.8), 0.01);
    bank.position.set(B - 0.12, SILL, (z1 + z2) / 2);
    scene.add(bank);
    zPrev = z2;
  }
  wandStuk(zPrev, ZV, 0, H);
  // Buiten: zacht licht achter de ramen
  const buiten = mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshBasicMaterial({ color: "#FFF1DC" }), false);
  buiten.rotation.y = -Math.PI / 2;
  buiten.position.set(B + 4, 4, -2);
  scene.add(buiten);
  // Plafond met houten balken
  const plafond = mesh(new THREE.PlaneGeometry(B * 2, ZV - Z0), mat("#FFFFFF", 0.9, { map: hout("#C7A07C", 5) }), false);
  plafond.rotation.x = Math.PI / 2;
  plafond.position.set(0, H, (ZV + Z0) / 2);
  scene.add(plafond);
  const balkMat = mat("#FFFFFF", 0.85, { map: hout("#B08560", 9) });
  for (let z = Z0 + 0.6; z < ZV; z += 1.1) {
    const balk = blok(B * 2, 0.22, 0.14, balkMat, 0.01);
    balk.position.set(0, H - 0.11, z);
    scene.add(balk);
  }
  for (const x of [-3.2, 3.2]) {
    const ligger = blok(0.3, 0.38, ZV - Z0, balkMat, 0.02);
    ligger.position.set(x, H - 0.33, (ZV + Z0) / 2);
    scene.add(ligger);
  }
  const plint = blok(B * 2, 0.12, 0.04, mat("#E8DCCB"), 0.01);
  plint.position.set(0, 0.06, Z0 + 0.02);
  scene.add(plint);

  // ===== Materialen en rommel =====
  const planken = mat("#FFFFFF", 0.8, { map: hout("#CDA57B", 13) });
  // planken tegen de linkermuur
  for (let i = 0; i < 6; i++) {
    const p = blok(0.22, 2.6 - rnd() * 0.5, 0.035, planken, 0.008);
    p.position.set(-B + 0.25 + i * 0.03, 1.2, Z0 + 0.7 + i * 0.26);
    p.rotation.z = -0.13 - rnd() * 0.06;
    p.rotation.y = Math.PI / 2;
    scene.add(p);
  }
  // houten trap tegen de achterwand links
  {
    const t = new THREE.Group();
    for (const x of [-0.22, 0.22]) {
      const r = blok(0.06, 3, 0.05, planken, 0.01);
      r.position.set(x, 1.5, 0);
      t.add(r);
    }
    for (let i = 0; i < 8; i++) {
      const s = blok(0.44, 0.04, 0.04, planken, 0.008);
      s.position.set(0, 0.3 + i * 0.35, 0);
      t.add(s);
    }
    t.position.set(-3.6, 0, Z0 + 0.4);
    t.rotation.x = -0.18;
    scene.add(t);
  }
  // pallet met dozen tegels en zakken (rechts achter)
  {
    const pallet = blok(1.2, 0.14, 1.0, planken, 0.01);
    pallet.position.set(4.3, 0.07, Z0 + 0.8);
    scene.add(pallet);
    const doos = mat("#D8C3A0", 0.9);
    for (let i = 0; i < 5; i++) {
      const d = blok(0.55, 0.16, 0.45, doos, 0.01);
      d.position.set(4.0 + (i % 2) * 0.58, 0.22 + Math.floor(i / 2) * 0.17, Z0 + 0.8 + (rnd() - 0.5) * 0.1);
      d.rotation.y = (rnd() - 0.5) * 0.2;
      scene.add(d);
    }
    const zak = mat("#EDE6DA", 0.95);
    for (let i = 0; i < 3; i++) {
      const z = blok(0.6, 0.16, 0.4, zak, 0.07);
      z.position.set(2.9 + i * 0.1, 0.08 + i * 0.15, Z0 + 0.6);
      z.rotation.y = rnd() * 0.4;
      scene.add(z);
    }
  }
  // rollen vloerbedekking (stoffering)
  for (let i = 0; i < 3; i++) {
    const r = mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.0, 24), mat(i === 1 ? "#9FD8D0" : i ? "#CBB89C" : KLEUR.stof, 0.95));
    r.rotation.z = Math.PI / 2;
    r.rotation.y = 0.15;
    r.position.set(-2.2, 0.16 + (i === 2 ? 0.3 : 0), Z0 + 0.9 + (i === 2 ? 0.17 : i * 0.34));
    scene.add(r);
  }
  // dozen screens (zonwering) bij het raam
  for (let i = 0; i < 2; i++) {
    const d = blok(2.2, 0.2, 0.22, mat("#E7D6B8", 0.9), 0.02);
    d.position.set(4.4, 0.1 + i * 0.2, 1.2 - i * 0.05);
    d.rotation.y = -0.4 + i * 0.05;
    scene.add(d);
  }
  // gereedschapskist in Maasmond-rood
  {
    const kist = blok(0.5, 0.24, 0.26, mat(KLEUR.rood, 0.55), 0.03);
    kist.position.set(-0.9, 0.12, -0.6);
    kist.rotation.y = 0.5;
    scene.add(kist);
  }
  // losse planken en puin op de vloer
  for (let i = 0; i < 10; i++) {
    const p = blok(0.18, 0.03, 1 + rnd() * 1.2, planken, 0.008);
    const x = (rnd() - 0.5) * 9, z = Z0 + 1 + rnd() * 7;
    if (Math.abs(x) < 1.6 && z > -2.5) continue;
    p.position.set(x, 0.015 + rnd() * 0.03, z);
    p.rotation.y = rnd() * Math.PI;
    scene.add(p);
  }
  const puin = [mat("#B98E6B", 0.95), mat("#C9A585", 0.95), mat("#A57B5C", 0.95)];
  for (let i = 0; i < 46; i++) {
    const x = (rnd() - 0.5) * 11, z = Z0 + 0.4 + rnd() * 8.5;
    if (Math.abs(x) < 2.2 && z > -3.2 && z < 1) continue;
    const brok = mesh(new THREE.DodecahedronGeometry(0.06 + rnd() * 0.1, 0), puin[i % 3]);
    brok.scale.y = 0.45;
    brok.position.set(x, 0.02, z);
    brok.rotation.set(rnd(), rnd() * 3, rnd());
    scene.add(brok);
  }
  // plant op de vensterbank
  {
    const pot = mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.2, 16), mat("#E3D3BF"));
    pot.position.set(B - 0.15, SILL + 0.12, 0.6);
    scene.add(pot);
    for (let i = 0; i < 5; i++) {
      const blad = mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(i % 2 ? "#7FAE7B" : "#9CC596", 0.9));
      blad.scale.set(0.7, 1.4, 0.7);
      blad.position.set(B - 0.15 + Math.cos(i * 1.3) * 0.08, SILL + 0.35 + (i % 2) * 0.08, 0.6 + Math.sin(i * 1.3) * 0.08);
      blad.rotation.z = Math.cos(i * 2) * 0.5;
      scene.add(blad);
    }
  }

  // ===== Schilderwerk: schilderes zet de bakstenen muur in het wit =====
  const verfMat = mat("#F6F0E6", 0.9);
  const BANEN = 5, BAAN_B = 0.45, BAAN_Z0 = -5.05, ONDER = 0.25, BOVEN = 2.9;
  const banen = Array.from({ length: BANEN }, (_, i) => {
    const geo = new THREE.PlaneGeometry(BAAN_B, 1);
    geo.translate(0, 0.5, 0);
    const m = new THREE.Mesh(geo, verfMat);
    m.rotation.y = Math.PI / 2;
    m.position.set(-B + 0.012, ONDER, BAAN_Z0 + i * BAAN_B);
    m.scale.y = 0.0001;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  });
  const schilder = maakMens({ huid: "#E8B896", shirt: KLEUR.schilder, broek: "#F2EEE7", haar: "#5A3A22", schoen: "#E9E2D6", vrouw: true });
  schilder.root.position.set(-5.05, 0, -4.15);
  schilder.root.rotation.y = -Math.PI / 2 + 0.35;
  scene.add(schilder.root);
  const roller = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 16), mat("#F6F0E6", 0.9));
  roller.rotation.x = Math.PI / 2;
  scene.add(roller);
  const steel = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 8), mat("#6E5D4B", 0.6));
  scene.add(steel);
  {
    const emmer = mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.32, 20), mat("#F1ECE4", 0.6));
    emmer.position.set(-4.4, 0.16, -3.2);
    scene.add(emmer);
    const rand = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 20), mat(KLEUR.schilder, 0.4), false);
    rand.position.set(-4.4, 0.32, -3.2);
    scene.add(rand);
    const bak = blok(0.35, 0.06, 0.28, mat("#3C3C3C", 0.6), 0.01);
    bak.position.set(-4.65, 0.03, -3.7);
    scene.add(bak);
  }

  // ===== Stoffering: stoffeerder legt geknield vloertegels =====
  const TEGEL = 0.5;
  const tegelMats = [mat("#D9CCB8", 0.6), mat("#CDBFA9", 0.6)];
  const RIJEN = 3, KOLOMMEN = 4;
  const tegelPlek = (k: number) => {
    const kol = k % KOLOMMEN, rij = Math.floor(k / KOLOMMEN);
    return new THREE.Vector3(0.9 + kol * (TEGEL + 0.01), 0.012, -3.0 - rij * (TEGEL + 0.01));
  };
  const tegels = Array.from({ length: RIJEN * KOLOMMEN }, (_, k) => {
    const t = blok(TEGEL, 0.02, TEGEL, tegelMats[(k + Math.floor(k / KOLOMMEN)) % 2], 0.004);
    t.visible = false;
    scene.add(t);
    return t;
  });
  const stapel = blok(0.52, 0.16, 0.52, tegelMats[0], 0.004);
  stapel.position.set(3.45, 0.08, -2.0);
  scene.add(stapel);
  const lijmEmmer = mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.26, 18), mat("#F0F0EE", 0.6));
  lijmEmmer.position.set(3.3, 0.13, -1.45);
  scene.add(lijmEmmer);
  const stoffeerder = maakMens({ huid: "#B9845E", shirt: KLEUR.stof, broek: "#39465A", haar: "#231C18", schoen: "#5A4636", kortMouw: true });
  stoffeerder.root.position.set(2.95, 0, -2.4);
  stoffeerder.root.rotation.y = -Math.PI / 2 - 0.25;
  scene.add(stoffeerder.root);
  // knielen: linkerknie op de grond, rechtervoet plat
  stoffeerder.heup.position.y = 0.5;
  stoffeerder.dijL.rotation.x = 0.05;
  stoffeerder.knieL.rotation.x = Math.PI / 2;
  stoffeerder.dijR.rotation.x = -1.45;
  stoffeerder.knieR.rotation.x = 1.45;
  const handTegel = blok(TEGEL * 0.9, 0.02, TEGEL * 0.9, tegelMats[0], 0.004);
  scene.add(handTegel);

  // ===== Zonwering: monteur op ladder hangt een screen op =====
  const [SZ1, SZ2] = RAMEN[1];
  const SCREEN_Z = (SZ1 + SZ2) / 2, SCREEN_B = SZ2 - SZ1 + 0.1;
  const cassette = blok(0.16, 0.16, SCREEN_B + 0.12, mat(KLEUR.zon, 0.5), 0.03);
  cassette.position.set(B - 0.12, BOVENRAAM + 0.12, SCREEN_Z);
  scene.add(cassette);
  const doekGeo = new THREE.PlaneGeometry(SCREEN_B, 1);
  doekGeo.translate(0, -0.5, 0);
  const doek = mesh(doekGeo, mat("#D8C2A0", 0.95, { side: THREE.DoubleSide }));
  doek.rotation.y = -Math.PI / 2;
  doek.position.set(B - 0.13, BOVENRAAM + 0.05, SCREEN_Z);
  scene.add(doek);
  const onderlat = blok(0.05, 0.04, SCREEN_B, mat("#8C7B66", 0.6), 0.01);
  scene.add(onderlat);
  const ladder = new THREE.Group();
  const aluMat = mat("#C3CAD3", 0.4);
  for (const z of [-0.24, 0.24]) {
    const r = blok(0.06, 3.7, 0.05, aluMat, 0.01);
    r.position.set(0, 1.85, z);
    ladder.add(r);
  }
  for (let i = 0; i < 11; i++) {
    const s = blok(0.04, 0.035, 0.48, aluMat, 0.008);
    s.position.set(0, 0.3 + i * 0.32, 0);
    ladder.add(s);
  }
  ladder.position.set(B - 0.75, 0, SCREEN_Z - 0.75);
  ladder.rotation.z = -0.17;
  scene.add(ladder);
  const monteur = maakMens({ huid: "#E3AE8A", shirt: KLEUR.blauw, broek: KLEUR.blauw, haar: "#3B2B22", schoen: "#2F2A26", pet: KLEUR.blauw });
  monteur.root.position.set(B - 1.05, 1.62, SCREEN_Z - 0.75);
  monteur.root.rotation.y = Math.PI / 2;
  scene.add(monteur.root);
  monteur.dijR.rotation.x = -0.5;
  monteur.knieR.rotation.x = 0.7;
  monteur.romp.rotation.x = -0.12;
  const boor = blok(0.06, 0.16, 0.2, mat(KLEUR.zon, 0.45), 0.02);
  boor.position.set(0, -0.32, 0.07);
  monteur.ellR.add(boor);

  // ===== Camera: recht de ruimte in, het inlogbord midden op de achterwand =====
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
  const doel = new THREE.Vector3(0, 2.9, Z0);
  const basis = new THREE.Vector3(0, 2.55, 3.2);
  const pasAan = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 72 : 55;
    camera.updateProjectionMatrix();
  };
  pasAan();
  const ro = new ResizeObserver(pasAan);
  ro.observe(host);
  let mx = 0, my = 0;
  const opMuis = (e: PointerEvent) => {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener("pointermove", opMuis, { passive: true });

  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), omhoog = new THREE.Vector3(0, 1, 0);
  const update = (t: number) => {
    camera.position.set(basis.x + mx * 0.35, basis.y - my * 0.15, basis.z);
    camera.lookAt(doel);

    // Schilderen: per baan omhoog rollen, dan terug; na alle banen vervaagt het en begint het opnieuw
    const BT = 2.8, ronde = BANEN * BT + 2.5, rt = t % ronde;
    const klaar = rt >= BANEN * BT;
    const i = Math.min(BANEN - 1, Math.floor(rt / BT));
    const bt = rt - i * BT;
    const p = klaar ? 1 : glad(bt / 1.9);
    const rolY = klaar ? ONDER + 0.25 : bt < 1.9 ? ONDER + 0.25 + p * (BOVEN - ONDER - 0.35) : BOVEN - 0.1 - glad((bt - 1.9) / 0.9) * (BOVEN - ONDER - 0.35);
    const fade = klaar ? Math.max(0, 1 - (rt - BANEN * BT) / 2.5) : 1;
    verfMat.transparent = fade < 1;
    verfMat.opacity = fade;
    banen.forEach((b, k) => { b.scale.y = klaar || k < i ? BOVEN - ONDER : k === i ? Math.max(0.0001, p * (BOVEN - ONDER)) : 0.0001; });
    roller.position.set(-B + 0.08, rolY, BAAN_Z0 + i * BAAN_B);
    const h = (rolY - ONDER) / (BOVEN - ONDER);
    schilder.schR.rotation.x = -0.7 - h * 1.6;
    schilder.ellR.rotation.x = -0.5 + h * 0.3;
    schilder.schL.rotation.x = -0.4 - h * 1.3;
    schilder.ellL.rotation.x = -0.9 + h * 0.4;
    schilder.schL.rotation.z = 0.35;
    schilder.hoofd.rotation.x = -0.1 - h * 0.45;
    schilder.romp.rotation.x = -0.05 - h * 0.08;
    schilder.root.updateMatrixWorld(true);
    schilder.handR.getWorldPosition(tA);
    tB.copy(roller.position);
    steel.position.copy(tA).add(tB).multiplyScalar(0.5);
    steel.scale.y = tA.distanceTo(tB);
    steel.quaternion.setFromUnitVectors(omhoog, tB.clone().sub(tA).normalize());

    // Tegels leggen: tegel van de stapel pakken, naar zijn plek brengen en neerleggen
    const TT = 1.8, n = tegels.length, tRonde = n * TT + 2.5, tr = t % tRonde;
    const tegelsKlaar = tr >= n * TT;
    const k = Math.min(n - 1, Math.floor(tr / TT));
    const kt = (tr - k * TT) / TT;
    tegels.forEach((tg, j) => {
      tg.visible = tegelsKlaar || j < k || (j === k && kt > 0.7);
      tg.position.copy(tegelPlek(j));
    });
    const doelPlek = tegelPlek(k);
    const reik = tegelsKlaar ? 0 : kt < 0.35 ? glad(kt / 0.35) : kt < 0.7 ? 1 : 1 - glad((kt - 0.7) / 0.3);
    handTegel.visible = !tegelsKlaar && kt > 0.12 && kt <= 0.7;
    if (handTegel.visible) {
      const van = new THREE.Vector3(3.45, 0.2, -2.0);
      const q = glad((kt - 0.12) / 0.58);
      handTegel.position.lerpVectors(van, doelPlek, q);
      handTegel.position.y = 0.2 + Math.sin(q * Math.PI) * 0.25 - q * 0.19;
    }
    stoffeerder.romp.rotation.x = 0.35 + reik * 0.45;
    stoffeerder.schR.rotation.x = -0.5 - reik * 0.9;
    stoffeerder.schL.rotation.x = -0.3 - reik * 0.8;
    stoffeerder.ellR.rotation.x = -0.6 + reik * 0.4;
    stoffeerder.ellL.rotation.x = -0.7 + reik * 0.3;
    stoffeerder.hoofd.rotation.x = 0.35;

    // Screen rolt rustig omlaag en weer omhoog (het zonlicht door dat raam wordt minder)
    const zt = (t % 10) / 10;
    const s = zt < 0.12 ? 0 : zt < 0.45 ? glad((zt - 0.12) / 0.33) : zt < 0.72 ? 1 : 1 - glad((zt - 0.72) / 0.28);
    const lengte = 0.1 + s * (BOVENRAAM - SILL - 0.05);
    doek.scale.y = lengte;
    onderlat.position.set(B - 0.13, doek.position.y - lengte, SCREEN_Z);
    monteur.schR.rotation.x = -2.5 + Math.sin(t * 7) * 0.06;
    monteur.ellR.rotation.x = -0.35;
    monteur.schL.rotation.x = -1.2;
    monteur.ellL.rotation.x = -0.6;
    monteur.hoofd.rotation.x = -0.45;
  };

  let frame = 0;
  const start = performance.now();
  const teken = (tijd: number) => { update(tijd); renderer.render(scene, camera); };
  if (stil) {
    teken(5.2);
    ro.disconnect();
    const ro2 = new ResizeObserver(() => { pasAan(); teken(5.2); });
    ro2.observe(host);
    requestAnimationFrame(() => (renderer.domElement.style.opacity = "1"));
    return () => { ro2.disconnect(); window.removeEventListener("pointermove", opMuis); opruimen(); };
  }
  const loop = () => {
    teken((performance.now() - start) / 1000);
    frame = requestAnimationFrame(loop);
  };
  loop();
  requestAnimationFrame(() => (renderer.domElement.style.opacity = "1"));

  function opruimen() {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); });
    });
    renderer.dispose();
    renderer.domElement.remove();
  }
  return () => {
    cancelAnimationFrame(frame);
    ro.disconnect();
    window.removeEventListener("pointermove", opMuis);
    opruimen();
  };
}
