/**
 * O mundo em 3D: base (muralha por célula, portões, torres, depósito), nós de recurso,
 * trabalhadores, perímetro e o enxame. Só lê o retrato (WorldView) e o buffer de insetos
 * que vêm do worker; nunca escreve neles.
 */
import * as THREE from 'three';
import { BUG_FLOATS, insideBase } from '../sim/index.ts';
import type { Building, BuildingKind, Tower, Unit, UnitKind, Worker, WorldView } from '../sim/index.ts';
import type { Selection } from '../game/controls.ts';
import { cloneProp } from './assets.ts';
import type { Art, CharKind, PropKind } from './assets.ts';
import { BugSwarm } from './bugs.ts';
import { CharView } from './chars.ts';
import { BuildSites, Particles } from './sites.ts';
import { FORT_LAMP, makeFortModel } from './fortModel.ts';
import { fortStats } from '../sim/index.ts';
import { FOG } from './stage.ts';
import { Fortress, makePad, makeTowerModel, yardFloor } from './fortress.ts';
import { YardDecor } from './yard.ts';
import { BIOMES } from './biome.ts';
import type { Biome } from './biome.ts';
import { Flora } from './flora.ts';
import type { FloraArt } from './flora.ts';
import { Ambient } from './ambient.ts';
import { ShotFx } from './shotFx.ts';

const RING_COLORS = ['#9aa6b4', '#c8703f', '#e8c547'];
const CUBES_PER_NODE = 6;
const LEAPERS = 32;
/** Lugares de tiro: um laço por torre e o anel dos disparos das tropas. */
const TOWER_FX = 64;
const SHOT_FX = 512;
/** Tamanho do px do clarão da torre (m). */
const TOWER_PX = 0.05;
/**
 * Disparos de enfeite das tropas (o dano da simulação é contínuo): intervalo médio (s),
 * tamanho do px do clarão (m) e, sem o boneco do KayKit, onde fica a ponta da arma.
 */
const GUN: Record<UnitKind, { every: number; px: number; reach: number; y: number }> = {
  soldado: { every: 0.32, px: 0.026, reach: 0.8, y: 1.15 },
  atirador: { every: 1.1, px: 0.034, reach: 1.35, y: 1.15 },
  robo: { every: 0.16, px: 0.036, reach: 1.6, y: 1.75 },
};

function stripes(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#e8b21c';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#1c1a17';
  for (let i = -64; i < 128; i += 22) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 11, 0);
    g.lineTo(i + 11 - 64, 64);
    g.lineTo(i - 64, 64);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Mancha irregular de líquido escuro (mortes marcantes, Etapa 17). */
function splat(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  let s = 7;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = 'rgba(70,16,10,0.92)';
  g.beginPath();
  g.arc(64, 64, 26, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2;
    const d = 18 + r() * 38;
    g.globalAlpha = 0.6 + r() * 0.35;
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + r() * 9, 0, Math.PI * 2);
    g.fill();
  }
  // Escorridos para fora.
  g.strokeStyle = 'rgba(70,16,10,0.8)';
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    g.lineWidth = 2 + r() * 4;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20);
    g.lineTo(64 + Math.cos(a) * (40 + r() * 22), 64 + Math.sin(a) * (40 + r() * 22));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function blob(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

interface WorkerView {
  char: CharView | null;
  root: THREE.Group;
  body: THREE.Group;
  cargo: THREE.Mesh;
  helmet: THREE.Mesh;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  dead: boolean;
  stain: THREE.Mesh;
  heading: number;
  walk: number;
}

interface UnitView {
  char: CharView | null;
  kind: UnitKind;
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  heading: number;
  walk: number;
  dead: boolean;
  /** Hora (tempo de jogo) do próximo disparo de enfeite. */
  nextShot: number;
}

interface TowerView {
  root: THREE.Group;
  head: THREE.Group;
  lamp: THREE.Mesh;
  yaw: number;
  level: number;
}

export class World3D {
  readonly root = new THREE.Group();
  /** Muralha, portões, colunas e escombros (Etapa 18). */
  private fortress: Fortress;
  private gateOpen = [1, 1, 1, 1, 1];
  private buildingViews = new Map<
    number,
    { root: THREE.Group; body: THREE.Group; kind: BuildingKind; spin: THREE.Object3D | null; parts: THREE.Mesh[]; level: number; busy: THREE.Mesh | null; scaffold: THREE.LineSegments; lamps: THREE.Mesh[] | null }
  >();
  private selRing: THREE.Mesh;
  /** Anéis verdes embaixo das tropas escolhidas. */
  private unitRings: THREE.InstancedMesh;
  private ringM = new THREE.Matrix4();
  private pings: { mesh: THREE.Mesh; age: number }[] = [];
  private mounds: THREE.Mesh[] = [];
  private scaffoldGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  readonly ghost: THREE.Group = new THREE.Group();
  private ghostCells: THREE.InstancedMesh;
  private nodeCubes: THREE.InstancedMesh;
  private nodeStock: number[] = [];
  private oreCubes: THREE.InstancedMesh;
  private oreShown = -1;
  private perimeter: THREE.Mesh;
  private workers = new Map<number, WorkerView>();
  private towers = new Map<number, TowerView>();
  private units = new Map<number, UnitView>();
  private rallyMarks: Record<UnitKind, THREE.Mesh>;
  /** Tiros (Etapa 21): clarões do pixelfx; um laço por torre (índice por slot) e os disparos das tropas. */
  private shots: ShotFx;
  private towerFx = new Map<number, number>();
  private fxFree: number[] = [];
  private muzzleAt = new THREE.Vector3();
  private mats: Record<string, THREE.Material>;
  private geos: Record<string, THREE.BufferGeometry>;
  readonly bugs: BugSwarm;
  private bugPhase: Float32Array;
  private bugScale: Float32Array;
  private bugTone: Float32Array;
  private tmp = new THREE.Object3D();
  private col = new THREE.Color();
  private shadowTex = blob();
  private view: WorldView;

  private art: Art | null;
  /** Suavização entre retratos: de onde cada um sai (o que estava na tela) e para onde vai. */
  private lastSnap = -1;
  private fresh = false;
  private smooth = new Map<string, { fx: number; fz: number; sx: number; sz: number; ok: boolean }>();
  private bFromX = new Float32Array(0);
  private bFromZ = new Float32Array(0);
  private bShownX = new Float32Array(0);
  private bShownZ = new Float32Array(0);
  private bValid = new Uint8Array(0);

  /** Posição suave de uma pessoa: do que estava na tela até a posição do retrato. */
  private smoothPos(key: string, px: number, pz: number, x: number, z: number, alpha: number): [number, number] {
    let sm = this.smooth.get(key);
    if (!sm) {
      sm = { fx: px, fz: pz, sx: px, sz: pz, ok: true };
      this.smooth.set(key, sm);
    }
    if (this.fresh) {
      sm.fx = sm.sx;
      sm.fz = sm.sz;
      // Pulo grande (nasceu, teleportou): não arrasta pelo mapa.
      if (Math.abs(x - sm.fx) + Math.abs(z - sm.fz) > 6) {
        sm.fx = x;
        sm.fz = z;
      }
    }
    sm.sx = sm.fx + (x - sm.fx) * alpha;
    sm.sz = sm.fz + (z - sm.fz) * alpha;
    return [sm.sx, sm.sz];
  }

  /** Posição da câmera (o boot atualiza a cada quadro), para o nível de detalhe dos insetos. */
  readonly cameraPos = new THREE.Vector3(0, 80, 80);
  /** Altura do canvas em pixels (tamanho das partículas); a tela atualiza. */
  pixelH = 800;
  /** Canteiros de obra: guindaste, faíscas, poeira, barra e a entrega. */
  readonly sites = new BuildSites();
  /** Mortes marcantes (Etapa 17): jato de líquido escuro. */
  private gore = new Particles(320, { color: '#7a1a10', end: '#2a0806', alpha: 0.95, soft: 0.35, additive: false, gravity: 11, drag: 0.4 });
  /** Cuspe de ácido do cuspidor (Etapa 20): bolhas em arco e o respingo onde caem. */
  private acid = new Particles(420, { color: '#c8ff3a', end: '#3d6a12', alpha: 0.95, soft: 0.3, additive: true, gravity: 9, drag: 0.05 });
  private spitAt = new Float32Array(0);
  private splashes: { at: number; x: number; y: number; z: number }[] = [];
  private lastT = 0;
  /** Mortes que a tela pediu para tremer (a câmera lê). */
  readonly deaths: { x: number; z: number; at: number }[] = [];
  private nodeProps = new Map<number, THREE.Object3D>();
  private decor: YardDecor | null = null;
  /** Flora e partículas do bioma (Etapa 19). */
  private flora: Flora | null = null;
  private ambient: Ambient;
  /** Alvo da câmera (a tela atualiza): as partículas do ar giram em volta dele. */
  readonly camTarget = new THREE.Vector2();

  constructor(scene: THREE.Scene, view: WorldView, art: Art | null = null, biome: Biome = BIOMES.deserto, floraArt: FloraArt | null = null) {
    this.art = art;
    this.view = view;
    scene.add(this.root);
    const c = view.cfg;
    const h = c.baseHalf;
    this.mats = {
      wall: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      door: new THREE.MeshLambertMaterial({ map: stripes() }),
      tower: new THREE.MeshLambertMaterial({ color: '#77746d' }),
      metal: new THREE.MeshLambertMaterial({ color: '#3d4247' }),
      floor: new THREE.MeshLambertMaterial({ color: '#a39a8a' }),
      crate: new THREE.MeshLambertMaterial({ color: '#d0762a' }),
      vest: new THREE.MeshLambertMaterial({ color: '#ff8a1f' }),
      skin: new THREE.MeshLambertMaterial({ color: '#d9a27a' }),
      helmet: new THREE.MeshLambertMaterial({ color: '#f2efe8' }),
      hurt: new THREE.MeshLambertMaterial({ color: '#e5402a' }),
      pants: new THREE.MeshLambertMaterial({ color: '#4b5560' }),
      cargo: new THREE.MeshLambertMaterial({ color: '#c8703f' }),
      shadow: new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }),
      stain: new THREE.MeshBasicMaterial({ map: splat(), transparent: true, opacity: 0.95, depthWrite: false }),
      pingDeath: new THREE.MeshBasicMaterial({ color: '#ff3b2a', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      cube: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      perimeter: new THREE.MeshBasicMaterial({ color: '#e5402a', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
      lampOn: new THREE.MeshBasicMaterial({ color: '#ffd23a' }),
      lampOff: new THREE.MeshBasicMaterial({ color: '#3a3a3a' }),
      genBody: new THREE.MeshLambertMaterial({ color: '#4f6b5b' }),
      tank: new THREE.MeshLambertMaterial({ color: '#b9b2a2' }),
      hangar: new THREE.MeshLambertMaterial({ color: '#6c7a86' }),
      roof: new THREE.MeshLambertMaterial({ color: '#8a5a3a' }),
      sniper: new THREE.MeshLambertMaterial({ color: '#3d4a5c' }),
      chevron: new THREE.MeshBasicMaterial({ color: '#ffb020' }),
      busyTrain: new THREE.MeshBasicMaterial({ color: '#7fb2e0' }),
      busyUpgrade: new THREE.MeshBasicMaterial({ color: '#8fd16a' }),
      flag: new THREE.MeshLambertMaterial({ color: '#ff8a1f', side: THREE.DoubleSide }),
      team: new THREE.MeshLambertMaterial({ color: '#ff8a1f' }),
      scaffold: new THREE.LineBasicMaterial({ color: '#e8b21c', transparent: true, opacity: 0.9 }),
      pingMove: new THREE.MeshBasicMaterial({ color: '#8fd16a', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      pingBuild: new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      selRing: new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
      unitRing: new THREE.MeshBasicMaterial({ color: '#7dff8a', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      ghostOk: new THREE.MeshBasicMaterial({ color: '#5cc46a', transparent: true, opacity: 0.45, depthWrite: false }),
      ghostBad: new THREE.MeshBasicMaterial({ color: '#e5402a', transparent: true, opacity: 0.45, depthWrite: false }),
      soldier: new THREE.MeshLambertMaterial({ color: '#5d6b3a' }),
      soldierHelmet: new THREE.MeshLambertMaterial({ color: '#3c4430' }),
      gun: new THREE.MeshLambertMaterial({ color: '#25282b' }),
      robot: new THREE.MeshLambertMaterial({ color: '#5b6b7a' }),
      robotDark: new THREE.MeshLambertMaterial({ color: '#3a4450' }),
      visor: new THREE.MeshBasicMaterial({ color: '#ffb020' }),
      wreck: new THREE.MeshLambertMaterial({ color: '#2b2f33' }),
      rallySoldier: new THREE.MeshBasicMaterial({ color: '#8fd16a', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
      rallyRobot: new THREE.MeshBasicMaterial({ color: '#7fb2e0', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
    };
    this.geos = {
      body: new THREE.CapsuleGeometry(0.3, 0.55, 4, 8),
      head: new THREE.SphereGeometry(0.21, 10, 8),
      helmet: new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      leg: new THREE.BoxGeometry(0.16, 0.5, 0.18),
      cargo: new THREE.BoxGeometry(0.42, 0.42, 0.42),
      shadow: new THREE.PlaneGeometry(1.4, 1.4),
      stain: new THREE.PlaneGeometry(2.6, 2.6),
    };

    // Piso do pátio (areia batida com trilhas) e a laje do depósito.
    this.root.add(yardFloor(h * 2 - 2));
    const depotPad = makePad(8.2, 8);
    depotPad.position.set(0.9, 0, 0);
    this.root.add(depotPad);

    // Muralha e portões: por célula (o dano aparece célula a célula), com colunas,
    // painéis, batentes e escombros (fortress.ts).
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.fortress = new Fortress(c);
    this.root.add(this.fortress.root);

    // Anel do prédio escolhido.
    const sr = new THREE.RingGeometry(0.92, 1, 48);
    sr.rotateX(-Math.PI / 2);
    this.selRing = new THREE.Mesh(sr, this.mats.selRing);
    this.selRing.position.y = 0.2;
    this.selRing.visible = false;
    this.root.add(this.selRing);
    this.root.add(this.sites.root);
    this.root.add(this.gore.points, this.acid.points);
    const ur = new THREE.RingGeometry(0.55, 0.7, 24);
    ur.rotateX(-Math.PI / 2);
    this.unitRings = new THREE.InstancedMesh(ur, this.mats.unitRing!, 128);
    this.unitRings.count = 0;
    this.unitRings.frustumCulled = false;
    this.root.add(this.unitRings);

    // Fantasma do modo construir.
    this.ghostCells = new THREE.InstancedMesh(box, this.mats.ghostOk!, 400);
    this.ghostCells.count = 0;
    this.ghostCells.frustumCulled = false;
    this.ghost.add(this.ghostCells);
    this.ghost.visible = false;
    this.root.add(this.ghost);

    // Tiros: clarões de cano numa malha instanciada só (Etapa 21).
    this.shots = new ShotFx(TOWER_FX, SHOT_FX);
    for (let i = TOWER_FX - 1; i >= 0; i--) this.fxFree.push(i);
    this.root.add(this.shots.mesh);

    // Depósito no centro e a pilha do minério guardado.
    if (art) {
      const dep = cloneProp(art, 'deposito', 4.6);
      dep.position.set(0, 0, -1.2);
      const cont = cloneProp(art, 'containers', 2.6);
      cont.position.set(3.3, 0, 2.2);
      dep.position.y = cont.position.y = 0.15;
      this.root.add(dep, cont);
      this.decor = new YardDecor(art);
      this.root.add(this.decor.root);
      // Rochas espalhadas no deserto (só enfeite; posições fixas, longe da base). Nos outros
      // biomas, as pedras vêm da flora.
      let sd = 31;
      const r = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
      const kinds: PropKind[] = ['rockA', 'rockB', 'rocks'];
      for (let i = 0; i < (biome.id === 'deserto' ? 46 : 0); i++) {
        const a = r() * Math.PI * 2;
        const d = 22 + r() * 115;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (view.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 6)) continue;
        const rk = cloneProp(art, kinds[i % 3]!, 1.2 + r() * 2.6);
        rk.position.set(x, 0, z);
        rk.rotation.y = r() * 6.28;
        this.root.add(rk);
      }
    }
    for (const [x, z, sy] of art ? [] : [
      [-1.6, -1.2, 1],
      [1.6, -1.2, 1],
      [-1.6, -1.2, 2],
    ] as const) {
      const cr = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 1.4), this.mats.crate);
      cr.position.set(x, 0.6 + (sy - 1) * 1.2 + 0.12, z);
      this.root.add(cr);
    }
    this.oreCubes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.mats.cube, 80);
    this.oreCubes.count = 0;
    this.root.add(this.oreCubes);

    // Folga para as jazidas novas que surgem entre ondas.
    this.nodeCubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.mats.cube, (view.nodes.length + 40) * CUBES_PER_NODE);
    this.nodeCubes.count = 0;
    this.root.add(this.nodeCubes);

    const ring = new THREE.RingGeometry(1.6, 2.1, 32);
    ring.rotateX(-Math.PI / 2);
    this.rallyMarks = {
      soldado: new THREE.Mesh(ring, this.mats.rallySoldier),
      atirador: new THREE.Mesh(ring, this.mats.rallySoldier),
      robo: new THREE.Mesh(ring, this.mats.rallyRobot),
    };
    for (const m of Object.values(this.rallyMarks)) {
      m.position.y = 0.08;
      m.visible = false;
      this.root.add(m);
    }

    this.perimeter = new THREE.Mesh(new THREE.RingGeometry(c.dangerRadius - 0.7, c.dangerRadius + 0.7, 160), this.mats.perimeter);
    this.perimeter.rotation.x = -Math.PI / 2;
    this.perimeter.position.y = 0.05;
    this.root.add(this.perimeter);

    if (floraArt) {
      this.flora = new Flora(floraArt, biome, view.seed, view.nodes);
      this.root.add(this.flora.root);
    }
    this.ambient = new Ambient(biome);
    this.root.add(this.ambient.points);

    const max = c.horde.cap + LEAPERS;
    this.bugs = new BugSwarm(scene, max, FOG);
    // Casco do bioma e a luz vindo do lado do sol.
    const bu = this.bugs.material.uniforms;
    bu.uColorA!.value.set(biome.bug[0]);
    bu.uColorB!.value.set(biome.bug[1]);
    bu.uLight!.value.set(...biome.sun.dir).normalize();
    bu.uFogNear!.value = FOG.near;
    bu.uFogFar!.value = FOG.far;
    this.bugPhase = new Float32Array(max);
    this.bugScale = new Float32Array(max);
    this.bugTone = new Float32Array(max);
    let s = 99;
    const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < max; i++) {
      this.bugPhase[i] = r() * Math.PI * 2;
      this.bugScale[i] = 1 + r() * 0.35;
      this.bugTone[i] = r();
    }
  }

  private makeWorker(): WorkerView {
    const root = new THREE.Group();
    const body = new THREE.Group();
    if (this.art) {
      const char = new CharView(this.art, 'worker');
      root.add(char.root);
      const shadow = new THREE.Mesh(this.geos.shadow!, this.mats.shadow);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.08;
      root.add(shadow);
      const stain = new THREE.Mesh(this.geos.stain!, this.mats.stain);
      stain.rotation.x = -Math.PI / 2;
      stain.position.y = 0.04;
      stain.visible = false;
      this.root.add(root, stain);
      const dummy = new THREE.Object3D();
      const cargo = new THREE.Mesh();
      return { char, root, body, cargo, helmet: cargo, legL: dummy, legR: dummy, dead: false, stain, heading: 0, walk: 0 };
    }
    const torso = new THREE.Mesh(this.geos.body!, this.mats.vest);
    torso.position.y = 0.95;
    const head = new THREE.Mesh(this.geos.head!, this.mats.skin);
    head.position.y = 1.55;
    const helmet = new THREE.Mesh(this.geos.helmet!, this.mats.helmet);
    helmet.position.y = 1.58;
    const legL = new THREE.Mesh(this.geos.leg!, this.mats.pants);
    legL.position.set(0, 0.3, 0.12);
    const legR = legL.clone();
    legR.position.z = -0.12;
    const cargo = new THREE.Mesh(this.geos.cargo!, this.mats.cargo);
    cargo.position.set(-0.36, 1.05, 0);
    body.add(torso, head, helmet, legL, legR, cargo);
    const shadow = new THREE.Mesh(this.geos.shadow!, this.mats.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.08;
    root.add(body, shadow);
    const stain = new THREE.Mesh(this.geos.stain!, this.mats.stain);
    stain.rotation.x = -Math.PI / 2;
    stain.position.y = 0.04;
    stain.visible = false;
    this.root.add(root, stain);
    return { char: null, root, body, cargo, helmet, legL, legR, dead: false, stain, heading: 0, walk: 0 };
  }

  private syncWalls(dt: number): void {
    const v = this.view;
    const c = v.cfg;
    const closedPhase = v.phase === 'breach' || v.phase === 'assault';
    const t = v.tick / c.ticksPerSecond;
    let moving = false;
    for (let g = 0; g < 5; g++) {
      const closeAt = g < 4 ? v.gates[g]!.closeAt : v.times.gatesClose;
      const target = closedPhase && t >= closeAt ? 0 : 1;
      const before = this.gateOpen[g]!;
      const now = before + (target - before) * Math.min(1, dt * (target ? 1.5 : 6));
      this.gateOpen[g] = Math.abs(now - target) < 0.002 ? target : now;
      if (this.gateOpen[g] !== before) moving = true;
    }
    void moving;
    this.fortress.sync(v, this.gateOpen, closedPhase);
  }

  private makeTower(t: Tower): TowerView {
    const m = makeTowerModel(t.level, t.buildingId < 0);
    m.root.position.set(t.x, 0, t.z);
    this.root.add(m.root);
    return { root: m.root, head: m.head, lamp: m.lamp, yaw: Math.atan2(-t.z, t.x), level: t.level };
  }

  private makeBuilding(b: Building): {
    root: THREE.Group;
    body: THREE.Group;
    kind: BuildingKind;
    spin: THREE.Object3D | null;
    parts: THREE.Mesh[];
    level: number;
    busy: THREE.Mesh | null;
    scaffold: THREE.LineSegments;
    lamps: THREE.Mesh[] | null;
  } {
    const outer = new THREE.Group();
    outer.position.set(b.x, 0, b.z);
    // `root` é o corpo que sobe durante a obra; o andaime fica fixo em `outer`.
    const root = new THREE.Group();
    outer.add(root);
    const s = b.size;
    // Laje de concreto (fica parada; o corpo sobe em cima dela durante a obra).
    const pad = makePad(s + 0.7, s + 0.7);
    outer.add(pad);
    root.position.y = 0.15;
    const parts: THREE.Mesh[] = [];
    let spin: THREE.Object3D | null = null;
    const add = (m: THREE.Mesh) => {
      root.add(m);
      parts.push(m);
      return m;
    };
    const artKind: PropKind | null = this.art ? ({ quartel: 'quartel', fabrica: 'fabrica', refinaria: 'refinaria', gerador: 'gerador' } as Record<string, PropKind>)[b.kind] ?? null : null;
    let lamps: THREE.Mesh[] | null = null;
    if (b.kind === 'fortim') {
      // Feito por código mesmo com a arte (ver fortModel.ts); a faixa do time já vem nele.
      const f = makeFortModel(s, fortStats(this.view, b).slots);
      root.add(f.root);
      lamps = f.lamps;
    } else if (artKind && this.art) {
      const pr = cloneProp(this.art, artKind, s * 1.05);
      root.add(pr);
    } else if (b.kind === 'gerador') {
      const body = add(new THREE.Mesh(new THREE.BoxGeometry(s * 0.9, 1.4, s * 0.9), this.mats.genBody));
      body.position.y = 0.7;
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), this.mats.metal));
      pole.position.y = 2.2;
      const blades = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const bl = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 1.1), this.mats.tank));
        bl.position.z = 0.55;
        const arm = new THREE.Group();
        arm.rotation.y = (k * Math.PI * 2) / 3;
        arm.add(bl);
        blades.add(arm);
      }
      blades.position.y = 3;
      root.add(blades);
      spin = blades;
      const lamp = add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), this.mats.lampOn));
      lamp.position.set(s * 0.45, 1.2, 0);
    } else if (b.kind === 'refinaria') {
      const base = add(new THREE.Mesh(new THREE.BoxGeometry(s * 0.95, 0.6, s * 0.95), this.mats.metal));
      base.position.y = 0.3;
      for (const [x, z] of [
        [-0.7, -0.6],
        [0.6, 0.5],
      ]) {
        const tank = add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.2, 12), this.mats.tank));
        tank.position.set(x!, 1.7, z!);
      }
      const chimney = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 4.2, 8), this.mats.roof));
      chimney.position.set(0.9, 2.1, -0.9);
    } else if (b.kind === 'quartel') {
      const hall = add(new THREE.Mesh(new THREE.BoxGeometry(s * 0.95, 1.9, s * 0.95), this.mats.genBody));
      hall.position.y = 0.95;
      const roof = add(new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, 0.25, s * 1.02), this.mats.metal));
      roof.position.y = 2;
      const door = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 1.1), this.mats.door));
      door.position.set(s * 0.48, 0.7, 0);
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), this.mats.metal));
      pole.position.set(-s * 0.35, 3.2, -s * 0.35);
      const flag = add(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), this.mats.flag));
      flag.position.set(-s * 0.35 + 0.45, 4.05, -s * 0.35);
    } else if (b.kind === 'fabrica') {
      const hall = add(new THREE.Mesh(new THREE.BoxGeometry(s * 0.95, 2.6, s * 0.95), this.mats.hangar));
      hall.position.y = 1.3;
      const roof = add(new THREE.Mesh(new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 0.95, 12, 1, false, 0, Math.PI), this.mats.roof));
      roof.rotation.z = Math.PI / 2;
      roof.rotation.y = Math.PI / 2;
      roof.position.y = 2.6;
      const door = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 1.4), this.mats.door));
      door.position.set(s * 0.48, 0.9, 0);
    }
    // Divisas do nível (em cima) e a luz de trabalho (azul treinando, verde melhorando).
    for (let k = 1; k < b.level; k++) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.18), this.mats.chevron);
      ch.position.set(0, (b.kind === 'fabrica' ? 4.4 : b.kind === 'quartel' ? 2.25 : 2.6) + k * 0.25, 0);
      root.add(ch);
    }
    let busy: THREE.Mesh | null = null;
    if (b.kind === 'quartel' || b.kind === 'fabrica') {
      busy = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), this.mats.busyTrain);
      busy.position.set(s * 0.48, b.kind === 'fabrica' ? 2.3 : 1.7, s * 0.3);
      busy.visible = false;
      root.add(busy);
    }
    // Faixa da cor do time na base dos prédios feitos em código (os do KayKit já têm a cor).
    if (!artKind && b.kind !== 'fortim') {
      const band = new THREE.Mesh(new THREE.BoxGeometry(s * 0.98, 0.18, s * 0.98), this.mats.team);
      band.position.y = 0.35;
      root.add(band);
    }
    // Andaime (só aparece em obra).
    const scaffold = new THREE.LineSegments(this.scaffoldGeo, this.mats.scaffold);
    const sh = b.kind === 'fabrica' ? 4 : b.kind === 'refinaria' ? 4.4 : b.kind === 'gerador' ? 3.2 : b.kind === 'fortim' ? 1.8 : 2.6;
    scaffold.scale.set(s * 1.08, sh, s * 1.08);
    scaffold.position.y = sh / 2;
    scaffold.visible = false;
    outer.add(scaffold);
    this.root.add(outer);
    return { root: outer, body: root, kind: b.kind, spin, parts, level: b.level, busy, scaffold, lamps };
  }

  private syncBuildings(dt: number): void {
    const v = this.view;
    this.decor?.sync(v.buildings);
    this.flora?.sync(v.buildings, v.nodes);
    const seen = new Set<number>();
    for (const b of v.buildings) {
      if (b.kind === 'torre') continue;
      seen.add(b.id);
      let bv = this.buildingViews.get(b.id);
      if (bv && bv.level !== b.level) {
        this.root.remove(bv.root);
        bv = undefined;
      }
      if (!bv) {
        bv = this.makeBuilding(b);
        this.buildingViews.set(b.id, bv);
      }
      if (bv.spin) bv.spin.rotation.y += dt * 4;
      if (bv.lamps) {
        // Uma luz verde por tropa lá dentro e, nas que sobram, âmbar por trabalhador abrigado.
        let n = 0;
        for (const u of v.units) if (u.inside === b.id && !u.dead) n++;
        let k = 0;
        for (const wk of v.workers) if (wk.fort === b.id && wk.state === 'sheltered') k++;
        bv.lamps.forEach((m, i) => (m.material = i < n ? FORT_LAMP.on : i < n + k ? FORT_LAMP.worker : FORT_LAMP.off));
      }
      if (bv.busy) {
        const working = b.upgradeLeft > 0 || b.queue.length > 0;
        bv.busy.visible = working && Math.sin(v.tick * 0.5) > -0.2;
        bv.busy.material = b.upgradeLeft > 0 ? this.mats.busyUpgrade! : this.mats.busyTrain!;
      }
      const full = v.cfg.build[b.kind].hp;
      const f = Math.max(0, Math.min(1, b.hp / full));
      // Em obra: o corpo sobe com o progresso e o andaime aparece.
      const total = v.cfg.build[b.kind].time;
      const prog = b.buildLeft > 0 ? 1 - b.buildLeft / total : 1;
      bv.scaffold.visible = b.buildLeft > 0;
      bv.body.scale.y = (0.12 + 0.88 * prog) * (0.75 + 0.25 * f) * this.sites.popScale(b.id);
    }
    for (const [id, bv] of this.buildingViews) {
      if (!seen.has(id)) {
        this.root.remove(bv.root);
        this.buildingViews.delete(id);
      }
    }
  }

  /**
   * Uma cusparada do cuspidor i: duas bolhas saem de cima do abdômen, fazem o arco por cima
   * da cabeça e caem a `d` m à frente, na altura do meio da muralha; lá, um respingo.
   */
  private spit(i: number, x: number, z: number, h: number, d: number, scale: number, t: number): void {
    if (this.spitAt.length <= i) {
      const a = new Float32Array(Math.max(i + 1, this.bugs.max));
      a.set(this.spitAt);
      this.spitAt = a;
    }
    if (t < this.spitAt[i]!) return;
    this.spitAt[i] = t + 0.65 + ((i * 0.37) % 0.4);
    const ch = Math.cos(h);
    const sh = Math.sin(h);
    const ox = x - ch * 0.5 * scale;
    const oz = z - sh * 0.5 * scale;
    const oy = 1.15 * scale;
    const T = 0.55;
    const ty = 1.8;
    const dist = d + 0.5 * scale;
    for (let k = 0; k < 2; k++) {
      const jit = (k - 0.5) * 0.25;
      const vxz = dist / T;
      const vy = (ty - oy) / T + 4.5 * T;
      this.acid.emit(ox, oy, oz, ch * vxz - sh * jit, vy, sh * vxz + ch * jit, T, 0.55 - k * 0.15, 0);
    }
    if (this.splashes.length < 60) this.splashes.push({ at: t + T, x: x + ch * d, y: ty, z: z + sh * d });
  }

  /** Marcador de ordem: anel que abre e some no chão. */
  ping(x: number, z: number, kind: 'move' | 'build' | 'death'): void {
    const g = new THREE.RingGeometry(0.7, 1, 32);
    g.rotateX(-Math.PI / 2);
    const mat = (kind === 'move' ? this.mats.pingMove! : kind === 'death' ? this.mats.pingDeath! : this.mats.pingBuild!).clone() as THREE.MeshBasicMaterial;
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, 0.12, z);
    this.root.add(m);
    this.pings.push({ mesh: m, age: 0 });
  }

  /** Monte de terra andando da boca do túnel até a saída, enquanto há escavadores embaixo. */
  private syncTunnels(t: number): void {
    const v = this.view;
    v.tunnels.forEach((tn, i) => {
      let m = this.mounds[i];
      if (!m) {
        m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#7a5636' }));
        m.scale.y = 0.45;
        this.root.add(m);
        this.mounds[i] = m;
      }
      const active = tn.started >= 0 && tn.under > 0;
      m.visible = active;
      if (!active) return;
      const k = Math.min(1, Math.max(0, (t - tn.started) / v.cfg.tunnel.time));
      m.position.set(tn.ex + (tn.ix - tn.ex) * k, 0, tn.ez + (tn.iz - tn.ez) * k);
      m.scale.set(1 + Math.sin(t * 9) * 0.06, 0.45 + Math.sin(t * 13) * 0.05, 1);
    });
    for (let i = v.tunnels.length; i < this.mounds.length; i++) this.mounds[i]!.visible = false;
  }

  private syncPings(dt: number): void {
    for (const p of this.pings) {
      p.age += dt;
      const k = Math.min(1, p.age / 0.9);
      p.mesh.scale.setScalar(1 + k * 2.5);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    }
    const done = this.pings.filter((p) => p.age >= 0.9);
    for (const p of done) {
      this.root.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    if (done.length) this.pings = this.pings.filter((p) => p.age < 0.9);
  }

  /** Morte marcante: jato, mancha que fica até o fim da onda e anel vermelho. */
  private deathFx(x: number, z: number, h: number, big = 1): void {
    const n = Math.round(26 * big);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1.2 + Math.random() * 2.6 * big;
      this.gore.emit(x, h, z, Math.cos(a) * v, 2 + Math.random() * 3.5, Math.sin(a) * v, 0.55 + Math.random() * 0.5, 0.22 + Math.random() * 0.24);
    }
    this.ping(x, z, 'death');
    this.deaths.push({ x, z, at: performance.now() });
    if (this.deaths.length > 8) this.deaths.shift();
  }

  /** Onde a unidade está desenhada agora (já suavizada), para o toque acertar o que se vê. */
  unitPos(id: number): THREE.Vector3 | null {
    const v = this.units.get(id);
    return v && !v.dead ? v.root.position : null;
  }

  /** Anel em volta do prédio ou da torre escolhida, ou embaixo de cada tropa escolhida. */
  setSelection(sel: Selection): void {
    const v = this.view;
    let x = 0;
    let z = 0;
    let r = 0;
    let n = 0;
    if (sel?.type === 'worker') {
      const k = this.workers.get(sel.id);
      if (k && !k.dead) {
        this.ringM.makeScale(1, 1, 1).setPosition(k.root.position.x, 0.16, k.root.position.z);
        this.unitRings.setMatrixAt(n++, this.ringM);
        this.unitRings.instanceMatrix.needsUpdate = true;
      }
    }
    if (sel?.type === 'units') {
      for (const id of sel.ids) {
        const u = this.units.get(id);
        if (!u || u.dead || n >= 128) continue;
        const s = u.kind === 'robo' ? 1.9 : 1;
        // O piso da base vai até 0,12 m: o anel fica logo acima.
        this.ringM.makeScale(s, 1, s).setPosition(u.root.position.x, 0.16, u.root.position.z);
        this.unitRings.setMatrixAt(n++, this.ringM);
      }
      if (n) this.unitRings.instanceMatrix.needsUpdate = true;
    }
    this.unitRings.count = n;
    if (sel?.type === 'tower') {
      const t = v.towers.find((q) => q.slot === sel.slot);
      if (t) {
        x = t.x;
        z = t.z;
        r = 2.2;
      }
    } else if (sel?.type === 'building') {
      const b = v.buildings.find((q) => q.id === sel.id);
      if (b) {
        x = b.x;
        z = b.z;
        r = b.size * 0.85;
      }
    }
    this.selRing.visible = r > 0;
    if (r > 0) {
      this.selRing.position.set(x, 0.2, z);
      this.selRing.scale.setScalar(r);
    }
  }

  /** Fantasma: células (verdes ou vermelhas) do que vai ser construído ou demolido. */
  setGhost(cells: { cell: number; ok: boolean; height: number }[] | null, size: number): void {
    if (!cells || !cells.length) {
      this.ghost.visible = false;
      return;
    }
    this.ghost.visible = true;
    const half = size / 2;
    const n = Math.min(cells.length, 400);
    const allOk = cells.every((c) => c.ok);
    this.ghostCells.material = allOk ? this.mats.ghostOk! : this.mats.ghostBad!;
    for (let i = 0; i < n; i++) {
      const g = cells[i]!;
      this.tmp.position.set((g.cell % size) - half + 0.5, 0.02, Math.floor(g.cell / size) - half + 0.5);
      this.tmp.rotation.set(0, 0, 0);
      this.tmp.scale.set(0.98, g.height, 0.98);
      this.tmp.updateMatrix();
      this.ghostCells.setMatrixAt(i, this.tmp.matrix);
    }
    this.ghostCells.count = n;
    this.ghostCells.instanceMatrix.needsUpdate = true;
  }

  private syncNodes(): void {
    const v = this.view;
    if (this.art) {
      // Minério do Resource Bits: pedra perto, cobre no meio, ouro longe. Encolhe com o estoque.
      for (const n of v.nodes) {
        let o = this.nodeProps.get(n.id);
        if (!o) {
          o = cloneProp(this.art, (['ore0', 'ore1', 'ore2'] as PropKind[])[n.ring]!, n.ring === 2 ? 3 : 2.6);
          o.position.set(n.x, 0, n.z);
          o.rotation.y = n.id * 1.7;
          this.root.add(o);
          this.nodeProps.set(n.id, o);
        }
        o.visible = n.stock > 0;
        o.scale.setScalar(0.55 + 0.45 * Math.min(1, n.stock / n.max));
      }
      return;
    }
    let changed = this.nodeStock.length !== v.nodes.length;
    if (!changed) changed = v.nodes.some((n, i) => this.nodeStock[i] !== n.stock);
    if (!changed) return;
    this.nodeStock = v.nodes.map((n) => n.stock);
    let k = 0;
    for (const n of v.nodes) {
      if (k + CUBES_PER_NODE > this.nodeCubes.instanceMatrix.count) break;
      const full = n.max;
      const cubes = n.stock <= 0 ? 0 : Math.max(1, Math.ceil((n.stock / full) * CUBES_PER_NODE));
      this.col.set(RING_COLORS[n.ring]!);
      for (let i = 0; i < cubes; i++) {
        const a = i * 2.4 + n.id;
        const r = i === 0 ? 0 : 0.9 + (i % 2) * 0.35;
        const s = (1.5 - i * 0.12) * (n.ring === 2 ? 1.15 : 1);
        this.tmp.position.set(n.x + Math.cos(a) * r, s / 2 + (i >= 4 ? 0.9 : 0), n.z + Math.sin(a) * r);
        this.tmp.rotation.set(0, a, 0);
        this.tmp.scale.setScalar(s);
        this.tmp.updateMatrix();
        this.nodeCubes.setMatrixAt(k, this.tmp.matrix);
        this.nodeCubes.setColorAt(k, this.col);
        k++;
      }
    }
    this.nodeCubes.count = k;
    this.nodeCubes.instanceMatrix.needsUpdate = true;
    if (this.nodeCubes.instanceColor) this.nodeCubes.instanceColor.needsUpdate = true;
  }

  private syncOre(): void {
    const shown = Math.min(80, Math.floor(this.view.ore / 5));
    if (shown === this.oreShown) return;
    this.oreShown = shown;
    this.col.set(RING_COLORS[1]!);
    for (let i = 0; i < shown; i++) {
      const layer = Math.floor(i / 16);
      const j = i % 16;
      this.tmp.position.set(-1.8 + (j % 4) * 0.55, 0.4 + layer * 0.5, 1.6 + Math.floor(j / 4) * 0.55);
      this.tmp.rotation.set(0, (i * 0.7) % 0.4, 0);
      this.tmp.scale.setScalar(1);
      this.tmp.updateMatrix();
      this.oreCubes.setMatrixAt(i, this.tmp.matrix);
      this.oreCubes.setColorAt(i, this.col);
    }
    this.oreCubes.count = shown;
    this.oreCubes.instanceMatrix.needsUpdate = true;
    if (this.oreCubes.instanceColor) this.oreCubes.instanceColor.needsUpdate = true;
  }

  private syncWorker(k: Worker, alpha: number, dt: number): void {
    let v = this.workers.get(k.id);
    if (!v) {
      v = this.makeWorker();
      this.workers.set(k.id, v);
    }
    let [x, z] = this.smoothPos(`w${k.id}`, k.px, k.pz, k.x, k.z, alpha);
    // Abrigado no fortim: some do mapa até a onda acabar.
    v.root.visible = k.state !== 'sheltered';
    // Pego: no último meio segundo ele se debate (só visual).
    if (k.state === 'panic' && k.panic?.outcome === 'devorado' && k.panic.catchAt - this.lastT < 0.5) {
      x += (Math.random() - 0.5) * 0.22;
      z += (Math.random() - 0.5) * 0.22;
    }
    const dx = k.x - k.px;
    const dz = k.z - k.pz;
    const moving = Math.hypot(dx, dz) > 0.001;
    if (moving) {
      const target = Math.atan2(dx, dz);
      let d = target - v.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.heading += d * Math.min(1, dt * 12);
    }
    v.root.position.set(x, 0, z);
    if (v.char) {
      const ch = v.char;
      ch.root.rotation.y = v.heading;
      if (ch.cargo) ch.cargo.visible = k.cargo > 0;
      if (k.state === 'dead') {
        if (!v.dead) {
          v.dead = true;
          v.stain.visible = true;
          v.stain.position.set(x, 0.04, z);
          v.stain.rotation.z = (k.id * 2.39) % (Math.PI * 2);
          this.deathFx(x, z, 0.9);
        }
        ch.play('Death_A');
      } else if (k.state === 'panic') ch.play('Running_A', 1.3);
      else if (k.state === 'gathering') ch.play('Pickaxing');
      else if (moving) ch.play('Walking_A', k.wounded > 0 ? 0.8 : 1.1);
      else ch.play('Idle_A');
      return;
    }
    if (k.state === 'dead') {
      if (!v.dead) {
        v.dead = true;
        v.body.rotation.set(0, 0, Math.PI / 2);
        v.body.position.set(0, 0.25, 0);
        v.stain.visible = true;
        v.stain.position.set(x, 0.04, z);
        v.stain.rotation.z = (k.id * 2.39) % (Math.PI * 2);
        this.deathFx(x, z, 0.9);
      }
      v.cargo.visible = false;
      return;
    }
    const sprint = k.state === 'panic';
    v.walk += moving ? dt * (sprint ? 16 : 10) : 0;
    const swing = moving ? Math.sin(v.walk) * (sprint ? 0.9 : 0.5) : 0;
    v.body.rotation.set(0, v.heading - Math.PI / 2, sprint ? -0.25 : 0);
    v.body.position.y = moving ? Math.abs(Math.sin(v.walk)) * 0.08 : 0;
    v.legL.rotation.z = swing;
    v.legR.rotation.z = -swing;
    v.cargo.visible = k.cargo > 0;
    v.helmet.material = k.wounded > 0 ? this.mats.hurt! : this.mats.helmet!;
    if (sprint && k.route.length === 1 && insideBase(this.view.cfg, x, z)) v.body.rotation.z = -0.6;
  }

  private makeUnit(kind: UnitKind): UnitView {
    const root = new THREE.Group();
    const body = new THREE.Group();
    if (this.art) {
      const ck: CharKind = kind === 'soldado' ? 'soldier' : kind === 'atirador' ? 'sniper' : 'robot';
      const char = new CharView(this.art, ck);
      const shadow = new THREE.Mesh(this.geos.shadow!, this.mats.shadow);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.08;
      if (kind === 'robo') shadow.scale.setScalar(2);
      root.add(char.root, shadow);
      this.root.add(root);
      const dummy = new THREE.Object3D();
      return { char, kind, root, body, legL: dummy, legR: dummy, heading: 0, walk: 0, dead: false, nextShot: 0 };
    }
    let legL: THREE.Object3D;
    let legR: THREE.Object3D;
    if (kind === 'soldado' || kind === 'atirador') {
      const sniper = kind === 'atirador';
      const torso = new THREE.Mesh(this.geos.body!, sniper ? this.mats.sniper : this.mats.soldier);
      torso.position.y = 0.95;
      const head = new THREE.Mesh(this.geos.head!, this.mats.skin);
      head.position.y = 1.55;
      const helmet = new THREE.Mesh(this.geos.helmet!, this.mats.soldierHelmet);
      helmet.position.y = 1.6;
      helmet.scale.set(1.1, 1, 1.1);
      const gun = new THREE.Mesh(new THREE.BoxGeometry(sniper ? 1.5 : 0.9, sniper ? 0.08 : 0.1, sniper ? 0.08 : 0.1), this.mats.gun);
      gun.position.set(sniper ? 0.6 : 0.35, 1.15, -0.18);
      legL = new THREE.Mesh(this.geos.leg!, this.mats.soldierHelmet);
      legL.position.set(0, 0.3, 0.12);
      legR = legL.clone();
      legR.position.z = -0.12;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.66), this.mats.team);
      band.position.set(0, 1.18, 0);
      body.add(torso, head, helmet, gun, legL, legR, band);
    } else {
      const chest = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.5), this.mats.robot);
      chest.position.y = 1.9;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.9), this.mats.visor);
      visor.position.set(0.66, 2.1, 0);
      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.4, 8), this.mats.robotDark);
      cannon.rotation.z = Math.PI / 2;
      cannon.position.set(0.9, 1.75, 0.85);
      const cannon2 = cannon.clone();
      cannon2.position.z = -0.85;
      legL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.4, 0.42), this.mats.robotDark);
      legL.position.set(0, 0.7, 0.42);
      legR = legL.clone();
      legR.position.z = -0.42;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.16, 1.54), this.mats.team);
      stripe.position.y = 1.55;
      body.add(chest, visor, cannon, cannon2, legL, legR, stripe);
    }
    const shadow = new THREE.Mesh(this.geos.shadow!, this.mats.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.08;
    if (kind === 'robo') shadow.scale.setScalar(2);
    root.add(body, shadow);
    this.root.add(root);
    return { char: null, kind, root, body, legL, legR, heading: 0, walk: 0, dead: false, nextShot: 0 };
  }

  private syncUnit(u: Unit, alpha: number, dt: number): void {
    let v = this.units.get(u.id);
    if (!v) {
      v = this.makeUnit(u.kind);
      this.units.set(u.id, v);
    }
    const [x, z] = this.smoothPos(`u${u.id}`, u.px, u.pz, u.x, u.z, alpha);
    v.root.position.set(x, 0, z);
    // Dentro do fortim: some do mapa (os tiros saem das seteiras).
    v.root.visible = u.inside < 0;
    if (u.inside >= 0) return;
    if (u.dead && v.char) {
      if (!v.dead) this.deathFx(x, z, u.kind === 'robo' ? 1.4 : 0.9, u.kind === 'robo' ? 0.6 : 1);
      v.dead = true;
      v.char.play('Death_A');
      return;
    }
    if (u.dead) {
      if (!v.dead) {
        this.deathFx(x, z, u.kind === 'robo' ? 1.4 : 0.9, u.kind === 'robo' ? 0.6 : 1);
        v.dead = true;
        if (u.kind !== 'robo') {
          v.body.rotation.set(0, v.heading - Math.PI / 2, Math.PI / 2);
          v.body.position.y = 0.25;
        } else {
          v.body.rotation.set(0.5, v.heading - Math.PI / 2, 0.3);
          v.body.position.y = -0.4;
          v.body.traverse((o) => {
            if (o instanceof THREE.Mesh) o.material = this.mats.wreck!;
          });
        }
      }
      return;
    }
    const dx = u.x - u.px;
    const dz = u.z - u.pz;
    const moving = Math.hypot(dx, dz) > 0.001;
    let target = v.heading;
    if (u.target >= 0) target = Math.atan2(u.tx - x, u.tz - z);
    else if (moving) target = Math.atan2(dx, dz);
    let d = target - v.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    v.heading += d * Math.min(1, dt * 10);
    if (v.char) {
      v.char.root.rotation.y = v.heading;
      const fight = this.view.phase === 'breach' || this.view.phase === 'assault';
      if (moving) v.char.play(u.kind === 'robo' ? 'Walking_A' : 'Running_A', u.kind === 'robo' ? 0.9 : 1);
      else if (u.target >= 0) v.char.play('Ranged_2H_Shooting');
      else v.char.play(fight ? 'Ranged_2H_Aiming' : 'Idle_A');
      return;
    }
    v.walk += moving ? dt * (u.kind === 'robo' ? 6 : 10) : 0;
    const swing = moving ? Math.sin(v.walk) * (u.kind === 'robo' ? 0.35 : 0.5) : 0;
    v.legL.rotation.z = swing;
    v.legR.rotation.z = -swing;
    const recoil = u.target >= 0 ? Math.max(0, Math.sin(this.view.tick * 2.3 + u.id)) * 0.05 : 0;
    v.body.rotation.set(0, v.heading - Math.PI / 2, 0);
    v.body.position.set(-recoil, moving ? Math.abs(Math.sin(v.walk)) * 0.06 : 0, 0);
  }

  private syncTowers(t: number, dt: number): void {
    const present = new Set<number>();
    for (const tw of this.view.towers) {
      present.add(tw.slot);
      let tv = this.towers.get(tw.slot);
      if (tv && tv.level !== tw.level) {
        // Subiu de nível: refaz o modelo (mais canos e as divisas).
        const yaw = tv.yaw;
        this.root.remove(tv.root);
        tv = this.makeTower(tw);
        tv.yaw = yaw;
        this.towers.set(tw.slot, tv);
      }
      if (!tv) {
        tv = this.makeTower(tw);
        this.towers.set(tw.slot, tv);
      }
      tv.root.visible = tw.built;
      tv.lamp.material = tw.powered ? this.mats.lampOn! : this.mats.lampOff!;
      const site = tw.buildingId >= 0 ? this.view.buildings.find((q) => q.id === tw.buildingId) : undefined;
      tv.root.scale.y = (site && site.buildLeft > 0 ? 0.12 + 0.88 * (1 - site.buildLeft / this.view.cfg.build.torre.time) : 1) * (site ? this.sites.popScale(site.id) : 1);
      const firing = tw.built && tw.powered && tw.target >= 0;
      if (firing) {
        const want = Math.atan2(-(tw.tz - tw.z), tw.tx - tw.x);
        let d = want - tv.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        tv.yaw += d * Math.min(1, dt * 14);
      }
      tv.head.rotation.y = tv.yaw;
      // Rajada em laço na ponta do cano (a mesma conta do modelo em fortress.ts).
      let fx = this.towerFx.get(tw.slot);
      if (fx === undefined) {
        fx = this.fxFree.pop() ?? -1;
        this.towerFx.set(tw.slot, fx);
      }
      const reach = 0.7 * (tw.buildingId < 0 ? 1 : 0.85) + 1.55;
      const mx = tw.x + Math.cos(tv.yaw) * reach;
      const my = tv.head.position.y * tv.root.scale.y;
      const mz = tw.z - Math.sin(tv.yaw) * reach;
      this.shots.loop(fx, firing, mx, my, mz, tw.tx - mx, 0.45 - my, tw.tz - mz, TOWER_PX, t);
    }
    for (const [slot, tv] of this.towers) {
      if (!present.has(slot)) {
        this.root.remove(tv.root);
        this.towers.delete(slot);
        const fx = this.towerFx.get(slot) ?? -1;
        this.towerFx.delete(slot);
        if (fx >= 0) {
          this.shots.clearLoop(fx);
          this.fxFree.push(fx);
        }
      }
    }
  }

  /** Disparos dos soldados, atiradores e robôs: um clarão de pistola a cada tanto, na ponta da arma. */
  private syncUnitShots(t: number): void {
    const at = this.muzzleAt;
    for (const u of this.view.units) {
      const v = this.units.get(u.id);
      if (!v) continue;
      const gun = GUN[u.kind];
      // Tempo voltou (partida carregada): recomeça a contagem.
      if (v.nextShot - t > 2) v.nextShot = t;
      if (u.dead || u.target < 0) {
        // Parado: o primeiro tiro sai logo que achar alvo, cada um num instante diferente.
        v.nextShot = Math.max(v.nextShot, t + ((u.id * 0.618) % 1) * 0.15);
        continue;
      }
      if (t < v.nextShot) continue;
      v.nextShot = t + gun.every * (0.8 + 0.4 * Math.random());
      if (u.inside >= 0) {
        // Da seteira do fortim, do lado do alvo.
        const dx = u.tx - u.x;
        const dz = u.tz - u.z;
        const l = Math.hypot(dx, dz) || 1;
        at.set(u.x + (dx / l) * 1.35, 0.86, u.z + (dz / l) * 1.35);
      } else if (v.char?.muzzle) {
        v.char.muzzle.getWorldPosition(at);
      } else {
        at.set(v.root.position.x + Math.sin(v.heading) * gun.reach, gun.y, v.root.position.z + Math.cos(v.heading) * gun.reach);
      }
      this.shots.shot(at.x, at.y, at.z, u.tx - at.x, 0.45 - at.y, u.tz - at.z, gun.px, t);
    }
  }

  update(view: WorldView, bugs: Float32Array, t: number, alpha: number, dt: number, snapId = 0): void {
    this.fresh = snapId !== this.lastSnap;
    this.lastSnap = snapId;
    this.view = view;
    // Jato das mortes anda pelo tempo do jogo (para na pausa).
    const gdt = Math.max(0, Math.min(0.1, t - this.lastT));
    this.lastT = t;
    this.ambient.update(performance.now() / 1000, this.camTarget.x, this.camTarget.y, this.pixelH);
    this.gore.material.uniforms.uScale!.value = this.pixelH * 0.9;
    this.gore.update(gdt);
    this.acid.update(gdt);
    // Respingos agendados (quando a bolha chega).
    if (this.splashes.length) {
      const keep: typeof this.splashes = [];
      for (const sp of this.splashes) {
        if (sp.at > t) {
          keep.push(sp);
          continue;
        }
        for (let k = 0; k < 5; k++) this.acid.emit(sp.x, sp.y, sp.z, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5, 0.45, 0.8);
      }
      this.splashes = keep;
    }
    this.syncWalls(dt);
    this.sites.update(view, t, this.cameraPos, this.pixelH);
    this.syncBuildings(dt);
    this.syncPings(dt);
    this.syncTunnels(t);
    this.syncNodes();
    this.syncOre();
    const pm = this.mats.perimeter as THREE.MeshBasicMaterial;
    pm.opacity = view.phase === 'warning' ? 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 6)) : view.phase === 'calm' ? 0.18 : 0.45;
    // Trabalhadores.
    const alive = new Set<number>();
    for (const k of view.workers) {
      alive.add(k.id);
      this.syncWorker(k, alpha, dt);
    }
    for (const [id, v] of this.workers) {
      if (!alive.has(id)) {
        this.root.remove(v.root, v.stain);
        this.workers.delete(id);
        this.smooth.delete(`w${id}`);
      }
    }
    // Soldados e robôs.
    const present = new Set<number>();
    for (const u of view.units) {
      present.add(u.id);
      this.syncUnit(u, alpha, dt);
    }
    for (const [id, v] of this.units) {
      if (!present.has(id)) {
        this.root.remove(v.root);
        this.units.delete(id);
      }
    }
    for (const kind of ['soldado', 'robo'] as UnitKind[]) {
      const r = view.rally[kind];
      const m = this.rallyMarks[kind];
      m.visible = r !== null;
      if (r) m.position.set(r.x, 0.08 + (kind === 'robo' ? 0.01 : 0), r.z);
    }
    this.syncTowers(t, dt);
    this.syncUnitShots(t);
    this.shots.update(t);
    for (const wv of this.workers.values()) wv.char?.update(dt);
    for (const uv of this.units.values()) uv.char?.update(dt);
    // Enxame (do buffer do worker), com o nível de detalhe pela distância até a câmera.
    this.bugs.begin();
    let n = 0;
    const count = Math.min(view.bugCount, Math.floor(bugs.length / BUG_FLOATS));
    const cx = this.cameraPos.x;
    const cy = this.cameraPos.y;
    const cz = this.cameraPos.z;
    if (this.bValid.length < count) {
      const n2 = Math.max(count, this.bugs.max);
      this.bFromX = new Float32Array(n2);
      this.bFromZ = new Float32Array(n2);
      this.bShownX = new Float32Array(n2);
      this.bShownZ = new Float32Array(n2);
      this.bValid = new Uint8Array(n2);
    }
    const near2 = 26 * 26;
    const mid2 = 60 * 60;
    for (let i = 0; i < count; i++) {
      const o = i * BUG_FLOATS;
      const st = bugs[o + 5]!;
      if (st < 0) {
        this.bValid[i] = 0;
        continue;
      }
      const tx = bugs[o + 2]!;
      const tz = bugs[o + 3]!;
      if (this.fresh) {
        if (this.bValid[i]) {
          this.bFromX[i] = this.bShownX[i]!;
          this.bFromZ[i] = this.bShownZ[i]!;
        } else {
          this.bFromX[i] = bugs[o]!;
          this.bFromZ[i] = bugs[o + 1]!;
        }
        if (Math.abs(tx - this.bFromX[i]!) + Math.abs(tz - this.bFromZ[i]!) > 4) {
          this.bFromX[i] = tx;
          this.bFromZ[i] = tz;
        }
        this.bValid[i] = 1;
      }
      const x = this.bFromX[i]! + (tx - this.bFromX[i]!) * alpha;
      const z = this.bFromZ[i]! + (tz - this.bFromZ[i]!) * alpha;
      this.bShownX[i] = x;
      this.bShownZ[i] = z;
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz + cy * cy;
      const lod = d2 < near2 ? 0 : d2 < mid2 ? 1 : 2;
      const kind = bugs[o + 7]!;
      // Tamanho de cada espécie (Etapa 20): besouro grande, cuspidor um pouco maior.
      const scale = this.bugScale[i]! * (kind === 2 ? 1.55 : kind === 4 ? 1.2 : kind === 3 ? 0.95 : 1);
      const yy = bugs[o + 6]!;
      this.bugs.add(lod, x, z, bugs[o + 4]!, this.bugPhase[i]!, scale, 0.9, this.bugTone[i]!, st, yy, kind);
      // Cuspidor cuspindo (altura negativa = distância até o alvo), só os de perto e de meio.
      if (kind === 4 && yy < 0 && st > 0.5 && st < 1.5 && lod < 2) this.spit(i, x, z, bugs[o + 4]!, -yy, scale, t);
      n++;
    }
    // Saltadores: os que pegam quem foi devorado fora dos muros.
    for (const k of view.workers) {
      if (!k.panic || k.panic.outcome !== 'devorado' || n >= this.bugs.max) continue;
      const left = k.panic.catchAt - t;
      if (left > 1.4) continue;
      const wp = this.workerPosition(k.id);
      const x = wp ? wp.x : k.x;
      const z = wp ? wp.z : k.z;
      const r = Math.hypot(x, z) || 1;
      const base = Math.atan2(z / r, x / r);
      // Etapa 17: quatro dão o bote, de lados diferentes, em arco; depois ficam em cima mordendo.
      for (let j = 0; j < 4 && n < this.bugs.max; j++) {
        const a = base + (j - 1.5) * 0.95 + ((k.id * 0.37) % 0.4);
        const ox = Math.cos(a);
        const oz = Math.sin(a);
        const lj = left - j * 0.12;
        const L = Math.max(0, lj) * 9 + (lj <= 0 ? 0.55 : 0.4);
        const y = lj > 0 ? Math.sin(Math.min(1, lj / 1.4) * Math.PI) * 1.1 : 0.15;
        this.bugs.add(0, x + ox * L, z + oz * L, Math.atan2(-oz, -ox), k.id + j, 1.35, 1.6, 0.2, lj <= 0 ? 1 : 0, y, 3);
        n++;
      }
    }
    this.bugs.commit(t);
  }

  /** O trabalhador está desenhado (não está abrigado num fortim)? */
  workerVisible(id: number): boolean {
    const v = this.workers.get(id);
    return !!v && v.root.visible;
  }

  workerPosition(id: number): THREE.Vector3 | null {
    const v = this.workers.get(id);
    return v ? v.root.position : null;
  }
}
