import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// 3D-werkplaats voor het inlogscherm: een lichte kamer met drie vakmensen van Maasmond.
// - Een vrouw schildert de muur baan voor baan met een verfroller (Schilderwerk)
// - Iemand stoffeert een fauteuil (Stoffering)
// - Een man op een trap hangt een screen op dat op en neer rolt (Zonwering)
// De camera kijkt licht mee met de muis. Bij "minder beweging" wordt één stilstaand beeld getoond.

const KLEUR = {
  achtergrond: "#FDFBF7",
  vloer: "#F6F0E7",
  muur: "#FDFAF5",
  verf: "#F7B9A6",
  stof: "#26A69A",
  stofLicht: "#8FD6CD",
  schilder: "#EF6A50",
  zon: "#F2A43A",
  blauw: "#1E3A7B",
  hout: "#C9A27A",
  huid: "#E9B994",
  huid2: "#C98E66",
};
const MUUR_Z = -3.5;

const mat = (c: string, ruw = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: ruw, metalness: 0 });
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, schaduw = true) {
  const x = new THREE.Mesh(geo, m);
  x.castShadow = schaduw;
  x.receiveShadow = true;
  return x;
}
const blok = (b: number, h: number, d: number, m: THREE.Material, r = 0.04) => mesh(new RoundedBoxGeometry(b, h, d, 3, r), m);

interface Mens { groep: THREE.Group; armL: THREE.Group; armR: THREE.Group; handR: THREE.Object3D; handL: THREE.Object3D; hoofd: THREE.Group }

function maakMens(o: { huid: string; shirt: string; broek: string; haar: string; vrouw?: boolean; pet?: string }): Mens {
  const g = new THREE.Group();
  const broek = mat(o.broek), shirt = mat(o.shirt), huid = mat(o.huid, 0.6), haar = mat(o.haar, 0.95), schoen = mat("#4A3F35");
  for (const x of [-0.12, 0.12]) {
    const been = mesh(new THREE.CapsuleGeometry(0.1, 0.6, 4, 12), broek);
    been.position.set(x, 0.42, 0);
    g.add(been);
    const voet = blok(0.16, 0.08, 0.27, schoen, 0.03);
    voet.position.set(x, 0.04, 0.05);
    g.add(voet);
  }
  const romp = mesh(new THREE.CapsuleGeometry(0.23, 0.42, 6, 16), shirt);
  romp.position.y = 1.12;
  g.add(romp);
  const nek = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10), huid);
  nek.position.y = 1.47;
  g.add(nek);
  const hoofd = new THREE.Group();
  hoofd.position.y = 1.64;
  g.add(hoofd);
  hoofd.add(mesh(new THREE.SphereGeometry(0.17, 24, 18), huid));
  const kap = mesh(new THREE.SphereGeometry(0.182, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), haar);
  kap.position.y = 0.015;
  kap.rotation.x = -0.35;
  hoofd.add(kap);
  if (o.vrouw) {
    const staart = mesh(new THREE.SphereGeometry(0.1, 16, 12), haar);
    staart.scale.set(0.9, 1.9, 0.9);
    staart.position.set(0, -0.1, -0.19);
    hoofd.add(staart);
  }
  if (o.pet) {
    const p = mat(o.pet, 0.7);
    const bol = mesh(new THREE.SphereGeometry(0.19, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), p);
    bol.position.y = 0.03;
    hoofd.add(bol);
    const klep = blok(0.26, 0.025, 0.16, p, 0.01);
    klep.position.set(0, 0.07, 0.2);
    hoofd.add(klep);
  }
  const oog = mat("#2B2620", 0.4);
  for (const x of [-0.06, 0.06]) {
    const e = mesh(new THREE.SphereGeometry(0.022, 8, 8), oog, false);
    e.position.set(x, 0.02, 0.158);
    hoofd.add(e);
  }
  const maakArm = (x: number) => {
    const p = new THREE.Group();
    p.position.set(x, 1.36, 0);
    const arm = mesh(new THREE.CapsuleGeometry(0.065, 0.42, 4, 10), shirt);
    arm.position.y = -0.27;
    p.add(arm);
    const hand = mesh(new THREE.SphereGeometry(0.07, 12, 10), huid);
    hand.position.y = -0.56;
    p.add(hand);
    g.add(p);
    return { p, hand };
  };
  const l = maakArm(-0.3), r = maakArm(0.3);
  return { groep: g, armL: l.p, armR: r.p, handL: l.hand, handR: r.hand, hoofd };
}

function strepenTextuur(a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 8;
  const ctx = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? b : a;
    ctx.fillRect(i * 16, 0, 16, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const glad = (x: number) => x * x * (3 - 2 * x);

export function startWereld(host: HTMLElement): () => void {
  const stil = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;opacity:0;transition:opacity 900ms ease";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(KLEUR.achtergrond);
  scene.fog = new THREE.Fog(KLEUR.achtergrond, 18, 34);

  // Licht: zacht daglicht met warme zon
  scene.add(new THREE.HemisphereLight("#FFFFFF", "#F3EBDF", 1.9));
  const zon = new THREE.DirectionalLight("#FFF4E6", 1.6);
  zon.position.set(7, 10, 8);
  zon.target.position.set(2.5, 0, -1);
  zon.castShadow = true;
  zon.shadow.mapSize.set(1024, 1024);
  zon.shadow.camera.left = -9;
  zon.shadow.camera.right = 9;
  zon.shadow.camera.top = 8;
  zon.shadow.camera.bottom = -6;
  zon.shadow.radius = 6;
  zon.shadow.bias = -0.0005;
  scene.add(zon, zon.target);

  // Kamer
  const vloer = mesh(new THREE.PlaneGeometry(60, 30), mat(KLEUR.vloer, 0.95), false);
  vloer.rotation.x = -Math.PI / 2;
  scene.add(vloer);
  const muur = mesh(new THREE.PlaneGeometry(60, 14), mat(KLEUR.muur, 0.95), false);
  muur.position.set(0, 7, MUUR_Z);
  scene.add(muur);
  const plint = blok(60, 0.14, 0.05, mat("#EFE7DB"), 0.01);
  plint.position.set(0, 0.07, MUUR_Z + 0.03);
  scene.add(plint);

  // ===== Schilderwerk: vrouw met verfroller =====
  const verfMat = mat(KLEUR.verf, 0.9);
  const BANEN = 5, BAAN_B = 0.46, BAAN_X0 = 0.45, ONDER = 0.3, BOVEN = 2.7;
  const banen: THREE.Mesh[] = [];
  for (let i = 0; i < BANEN; i++) {
    const geo = new THREE.PlaneGeometry(BAAN_B, 1);
    geo.translate(0, 0.5, 0);
    const m = new THREE.Mesh(geo, verfMat);
    m.position.set(BAAN_X0 + i * BAAN_B, ONDER, MUUR_Z + 0.01);
    m.scale.y = 0.0001;
    m.receiveShadow = true;
    banen.push(m);
    scene.add(m);
  }
  const schilder = maakMens({ huid: KLEUR.huid, shirt: KLEUR.schilder, broek: "#F4EFE8", haar: "#6B4226", vrouw: true });
  schilder.groep.position.set(1.4, 0, -2.3);
  schilder.groep.rotation.y = Math.PI - 0.55;
  scene.add(schilder.groep);
  const roller = new THREE.Group();
  const rolKop = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 16), mat(KLEUR.schilder, 0.7));
  rolKop.rotation.z = Math.PI / 2;
  roller.add(rolKop);
  scene.add(roller);
  const steel = mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 8), mat("#7A6A58", 0.6));
  scene.add(steel);
  const emmer = mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.3, 20), mat("#E5DACB"));
  emmer.position.set(2.2, 0.15, -2.6);
  scene.add(emmer);
  const verfInEmmer = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 20), mat(KLEUR.schilder, 0.4), false);
  verfInEmmer.position.set(2.2, 0.29, -2.6);
  scene.add(verfInEmmer);

  // ===== Stoffering: fauteuil en stoffeerder =====
  const stof = mat(KLEUR.stof, 0.95);
  const stoel = new THREE.Group();
  const zit = blok(1.05, 0.3, 0.9, stof, 0.1);
  zit.position.set(0, 0.42, 0.05);
  const rug = blok(1.05, 0.85, 0.24, stof, 0.1);
  rug.position.set(0, 0.85, -0.36);
  stoel.add(zit, rug);
  for (const x of [-0.6, 0.6]) {
    const leuning = blok(0.2, 0.5, 0.95, stof, 0.08);
    leuning.position.set(x, 0.55, 0);
    stoel.add(leuning);
  }
  const hout = mat(KLEUR.hout, 0.7);
  for (const [x, z] of [[-0.55, -0.38], [0.55, -0.38], [-0.55, 0.42], [0.55, 0.42]]) {
    const poot = mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.3, 8), hout);
    poot.position.set(x, 0.15, z);
    stoel.add(poot);
  }
  stoel.position.set(2.9, 0, 1.0);
  stoel.rotation.y = 0.35;
  scene.add(stoel);
  const rol = mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 20), mat(KLEUR.stofLicht, 0.95));
  rol.rotation.z = Math.PI / 2;
  rol.rotation.y = 0.4;
  rol.position.set(2.4, 0.16, 2.1);
  scene.add(rol);
  const stoffeerder = maakMens({ huid: KLEUR.huid2, shirt: KLEUR.stof, broek: "#3E4A5C", haar: "#2E2420" });
  stoffeerder.groep.position.set(3.9, 0, 1.55);
  stoffeerder.groep.rotation.y = -2.0;
  scene.add(stoffeerder.groep);
  const tacker = blok(0.08, 0.14, 0.2, mat("#3A3A3A", 0.5), 0.02);
  tacker.position.set(0, -0.64, 0.06);
  stoffeerder.armR.add(tacker);

  // ===== Zonwering: raam, screen en man op trap =====
  const RAAM_X = 6.8, RAAM_Y = 1.75, RAAM_B = 1.5, RAAM_H = 1.3;
  const glas = mesh(new THREE.PlaneGeometry(RAAM_B, RAAM_H), new THREE.MeshStandardMaterial({ color: "#D8E8F5", emissive: "#CFE3F4", emissiveIntensity: 0.45, roughness: 0.2 }), false);
  glas.position.set(RAAM_X, RAAM_Y, MUUR_Z + 0.01);
  scene.add(glas);
  const kozijn = mat("#FFFFFF", 0.6);
  for (const [b, h, x, y] of [[RAAM_B + 0.16, 0.08, 0, RAAM_H / 2], [RAAM_B + 0.16, 0.08, 0, -RAAM_H / 2], [0.08, RAAM_H, -RAAM_B / 2, 0], [0.08, RAAM_H, RAAM_B / 2, 0], [0.05, RAAM_H, 0, 0]]) {
    const k = blok(b, h, 0.08, kozijn, 0.01);
    k.position.set(RAAM_X + x, RAAM_Y + y, MUUR_Z + 0.04);
    scene.add(k);
  }
  const cassette = blok(RAAM_B + 0.3, 0.16, 0.18, mat(KLEUR.zon, 0.6), 0.04);
  cassette.position.set(RAAM_X, RAAM_Y + RAAM_H / 2 + 0.14, MUUR_Z + 0.12);
  scene.add(cassette);
  const doekGeo = new THREE.PlaneGeometry(RAAM_B + 0.1, 1);
  doekGeo.translate(0, -0.5, 0);
  const doek = mesh(doekGeo, new THREE.MeshStandardMaterial({ map: strepenTextuur(KLEUR.zon, "#FFF3DF"), roughness: 0.95, side: THREE.DoubleSide }));
  doek.position.set(RAAM_X, RAAM_Y + RAAM_H / 2 + 0.06, MUUR_Z + 0.1);
  scene.add(doek);
  const onderlat = blok(RAAM_B + 0.14, 0.05, 0.06, mat("#8C7B66", 0.6), 0.015);
  scene.add(onderlat);
  // trap
  const trap = new THREE.Group();
  const trapMat = mat("#B8C2D0", 0.5);
  for (const [x, z, rx] of [[-0.3, 0.3, -0.18], [0.3, 0.3, -0.18], [-0.3, -0.3, 0.18], [0.3, -0.3, 0.18]]) {
    const poot = blok(0.05, 2.1, 0.06, trapMat, 0.01);
    poot.position.set(x, 1.0, z * 0.9);
    poot.rotation.x = rx;
    trap.add(poot);
  }
  for (let i = 1; i <= 4; i++) {
    const tree = blok(0.6, 0.04, 0.12, trapMat, 0.01);
    tree.position.set(0, i * 0.42, 0.27 - i * 0.07);
    trap.add(tree);
  }
  trap.position.set(5.6, 0, -2.6);
  scene.add(trap);
  const monteur = maakMens({ huid: KLEUR.huid, shirt: KLEUR.blauw, broek: KLEUR.blauw, haar: "#3B2B22", pet: KLEUR.blauw });
  monteur.groep.position.set(5.65, 0.86, -2.5);
  monteur.groep.rotation.y = Math.PI * 0.82;
  scene.add(monteur.groep);
  const boor = blok(0.08, 0.18, 0.22, mat(KLEUR.zon, 0.5), 0.02);
  boor.position.set(0, -0.62, 0.08);
  monteur.armR.add(boor);

  // Plant voor wat leven
  const pot = mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.36, 20), mat("#E3D3BF"));
  pot.position.set(8.2, 0.18, -2.4);
  scene.add(pot);
  for (let i = 0; i < 6; i++) {
    const blad = mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(i % 2 ? "#8DB98A" : "#A7CBA0", 0.9));
    blad.scale.set(0.7, 1.4, 0.7);
    blad.position.set(8.2 + Math.cos(i) * 0.15, 0.55 + (i % 3) * 0.12, -2.4 + Math.sin(i) * 0.15);
    blad.rotation.z = Math.cos(i * 2) * 0.5;
    scene.add(blad);
  }

  // Camera
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
  const doel = new THREE.Vector3(2.4, 1.2, -0.5);
  const basis = new THREE.Vector3(2.4, 3.3, 10.5);
  const pasAan = () => {
    const b = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(b, h, false);
    camera.aspect = b / h;
    // Smalle schermen: verder weg en meer naar het midden van de scène
    const smal = camera.aspect < 1.2;
    basis.set(smal ? 3.6 : 2.6, smal ? 4 : 3.1, smal ? 15 : 9.2);
    doel.set(smal ? 3.6 : 2.6, 1.25, -0.6);
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

  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), omhoog = new THREE.Vector3(0, 1, 0);
  const BAAN_T = 2.8;
  let baanFade = 1;

  const update = (t: number) => {
    // Camera kijkt mee met de muis (echte diepte)
    camera.position.set(basis.x + mx * 1.1, basis.y - my * 0.5, basis.z);
    camera.lookAt(doel);

    // Schilderen: per baan omhoog rollen (verf), dan terug omlaag; na alle banen opnieuw
    const ronde = BANEN * BAAN_T + 2.5;
    const rt = t % ronde;
    const i = Math.min(BANEN - 1, Math.floor(rt / BAAN_T));
    const bt = rt - i * BAAN_T;
    const klaar = rt >= BANEN * BAAN_T;
    const opP = klaar ? 1 : Math.min(1, bt / 1.9);
    const rolY = klaar ? ONDER + 0.2 : bt < 1.9 ? ONDER + 0.2 + glad(opP) * (BOVEN - ONDER - 0.3) : BOVEN - 0.1 - glad((bt - 1.9) / 0.9) * (BOVEN - ONDER - 0.3);
    baanFade = klaar ? Math.max(0, 1 - (rt - BANEN * BAAN_T) / 2.5) : 1;
    verfMat.transparent = baanFade < 1;
    verfMat.opacity = baanFade;
    banen.forEach((b, k) => {
      b.scale.y = klaar ? BOVEN - ONDER : k < i ? BOVEN - ONDER : k === i ? Math.max(0.0001, glad(opP) * (BOVEN - ONDER)) : 0.0001;
    });
    roller.position.set(BAAN_X0 + i * BAAN_B, rolY, MUUR_Z + 0.09);
    // armen volgen de hoogte van de roller
    const hoek = -0.9 - ((rolY - ONDER) / (BOVEN - ONDER)) * 1.5;
    schilder.armR.rotation.x = hoek;
    schilder.armL.rotation.x = hoek + 0.25;
    schilder.armR.rotation.z = -0.15;
    schilder.armL.rotation.z = 0.25;
    schilder.groep.updateMatrixWorld(true);
    schilder.handR.getWorldPosition(tmpA);
    tmpB.copy(roller.position);
    steel.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
    steel.scale.y = tmpA.distanceTo(tmpB);
    steel.quaternion.setFromUnitVectors(omhoog, tmpB.clone().sub(tmpA).normalize());
    schilder.hoofd.rotation.x = -0.15 - ((rolY - ONDER) / (BOVEN - ONDER)) * 0.35;

    // Stofferen: tacker tikt, stof veert mee
    const tik = Math.abs(Math.sin(t * 4.5));
    stoffeerder.armR.rotation.x = -1.15 - tik * 0.35;
    stoffeerder.armL.rotation.x = -0.9;
    stoffeerder.armL.rotation.z = 0.35;
    stoffeerder.hoofd.rotation.x = 0.35;
    zit.scale.y = 1 - (1 - tik) * 0.04;
    stoffeerder.groep.position.y = Math.sin(t * 9) * 0.004;

    // Zonwering: screen rolt rustig omlaag en weer omhoog
    const zt = (t % 9) / 9;
    const s = zt < 0.12 ? 0 : zt < 0.45 ? glad((zt - 0.12) / 0.33) : zt < 0.72 ? 1 : zt < 1 ? 1 - glad((zt - 0.72) / 0.28) : 0;
    const lengte = 0.12 + s * (RAAM_H + 0.05);
    doek.scale.y = lengte;
    onderlat.position.set(RAAM_X, doek.position.y - lengte, MUUR_Z + 0.12);
    monteur.armR.rotation.x = -2.55 + Math.sin(t * 6) * 0.08;
    monteur.armR.rotation.z = -0.35;
    monteur.armL.rotation.x = -0.6;
    monteur.hoofd.rotation.x = -0.35;
  };

  let frame = 0;
  const start = performance.now();
  const loop = () => {
    update((performance.now() - start) / 1000);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
  };
  if (stil) {
    update(4.2);
    renderer.render(scene, camera);
    ro.disconnect();
    const opnieuw = new ResizeObserver(() => { pasAan(); update(4.2); renderer.render(scene, camera); });
    opnieuw.observe(host);
    requestAnimationFrame(() => (renderer.domElement.style.opacity = "1"));
    return () => {
      opnieuw.disconnect();
      window.removeEventListener("pointermove", opMuis);
      opruimen();
    };
  }
  loop();
  requestAnimationFrame(() => (renderer.domElement.style.opacity = "1"));

  function opruimen() {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((x) => {
        const sm = x as THREE.MeshStandardMaterial;
        sm.map?.dispose();
        x.dispose();
      });
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
