/**
 * Etapa 18: o forte com cara de base militar (referência do usuário em 2026-11-06). O KayKit
 * local não tem muralha de concreto, guarita nem portão blindado, então isto é feito por
 * código, com texturas pintadas em canvas:
 *  - muralha por célula (o dano continua aparecendo célula a célula), com capa no alto,
 *    painéis escuros com grade entre as colunas e poeira de areia no pé;
 *  - colunas (contrafortes) a intervalos e nas pontas, batentes listrados com luz nos portões;
 *  - portões de chapa nervurada com faixa de perigo, que descem no chão (listras à vista);
 *  - escombros no lugar das células caídas;
 *  - baluartes octogonais nos cantos e casamatas nas torres construídas, com canhão.
 * Tudo instanciado: poucas chamadas de desenho, para o iPhone.
 */
import * as THREE from 'three';
import { RUBBLE, wallLayout } from '../sim/index.ts';
import type { Config, WorldView } from '../sim/index.ts';
import { BIOMES } from './biome.ts';
import type { Biome } from './biome.ts';

/** Bioma da partida (poeira no pé da muralha, piso do pátio). */
let LOOK: Biome = BIOMES.deserto;
export function setFortressBiome(b: Biome): void {
  LOOK = b;
  TEX = null;
  MATS = null;
  PAD_MATS = null;
}

export const WALL_H = 3.4;
const CAP_H = 0.26;
const MAX_WALLS = 6000;
const MAX_GATES = 800;
const MAX_PILLARS = 1600;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function canvasTex(w: number, h: number, seed: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  draw(g, lcg(seed));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Grão de concreto: pontinhos claros e escuros e manchas grandes de tempo. */
function grain(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, n: number): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(40,36,30,${0.05 + r() * 0.08})` : `rgba(255,250,240,${0.05 + r() * 0.07})`;
    const s = 1 + r() * 2;
    g.fillRect(r() * w, r() * h, s, s);
  }
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(60,52,44,${0.03 + r() * 0.04})`;
    g.beginPath();
    g.arc(r() * w, r() * h, 8 + r() * 22, 0, Math.PI * 2);
    g.fill();
  }
}

/** Listras de perigo amarelas e pretas na diagonal. */
function hazard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step = 22): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = '#e8b21c';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#1c1a17';
  for (let i = x - h - step; i < x + w + h; i += step) {
    g.beginPath();
    g.moveTo(i, y);
    g.lineTo(i + step / 2, y);
    g.lineTo(i + step / 2 - h, y + h);
    g.lineTo(i - h, y + h);
    g.fill();
  }
  g.restore();
}

function makeTextures() {
  // Lado da muralha: 1 m de largura por 3,1 m de altura.
  const side = canvasTex(128, 256, 11, (g, r) => {
    g.fillStyle = '#8b877f';
    g.fillRect(0, 0, 128, 256);
    grain(g, r, 128, 256, 1600);
    // Manchas de ferrugem e fuligem (concreto velho de posto avançado).
    for (let i = 0; i < 4; i++) {
      const x = r() * 128;
      const gr = g.createLinearGradient(0, 0, 0, 200);
      gr.addColorStop(0, `rgba(${r() < 0.5 ? '110,60,30' : '30,28,26'},0.28)`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x, 0, 3 + r() * 6, 200);
    }
    // Furos de forma (concreto moldado no lugar).
    g.fillStyle = 'rgba(70,66,60,0.75)';
    for (const y of [46, 118, 190]) for (const x of [30, 98]) {
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // Escorridos finos de cima para baixo.
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(60,54,46,${0.05 + r() * 0.05})`;
      g.fillRect(r() * 128, 0, 1 + r() * 2, 60 + r() * 140);
    }
    // Sombra sob a capa e poeira de areia no pé.
    g.fillStyle = 'rgba(40,36,32,0.45)';
    g.fillRect(0, 0, 128, 5);
    const dust = g.createLinearGradient(0, 196, 0, 256);
    dust.addColorStop(0, `rgba(${LOOK.dust},0)`);
    dust.addColorStop(1, `rgba(${LOOK.dust},0.8)`);
    g.fillStyle = dust;
    g.fillRect(0, 196, 128, 60);
  });
  const top = canvasTex(128, 128, 12, (g, r) => {
    g.fillStyle = '#b1ada5';
    g.fillRect(0, 0, 128, 128);
    grain(g, r, 128, 128, 900);
  });
  // Painel escuro com grade (contínuo na horizontal: células vizinhas formam uma faixa só).
  const panel = canvasTex(128, 128, 13, (g, r) => {
    g.fillStyle = '#56544f';
    g.fillRect(0, 0, 128, 128);
    grain(g, r, 128, 128, 500);
    g.fillStyle = '#7b7871';
    g.fillRect(0, 0, 128, 7);
    g.fillStyle = '#34322f';
    g.fillRect(0, 121, 128, 7);
    g.fillStyle = '#2b2927';
    for (let y = 30; y < 98; y += 9) g.fillRect(0, y, 128, 4);
    g.fillStyle = 'rgba(140,135,125,0.35)';
    for (let y = 34; y < 98; y += 9) g.fillRect(0, y, 128, 1);
  });
  // Chapa do portão: nervuras verticais e faixa de perigo no pé.
  const door = canvasTex(128, 128, 14, (g, r) => {
    g.fillStyle = '#41454a';
    g.fillRect(0, 0, 128, 128);
    grain(g, r, 128, 128, 400);
    for (let x = 4; x < 128; x += 16) {
      g.fillStyle = '#565b61';
      g.fillRect(x, 0, 4, 128);
      g.fillStyle = '#2c2f33';
      g.fillRect(x + 4, 0, 2, 128);
    }
    g.fillStyle = '#5d6268';
    g.fillRect(0, 0, 128, 6);
    hazard(g, 0, 98, 128, 30, 24);
  });
  const stripes = canvasTex(64, 64, 15, (g) => hazard(g, 0, 0, 64, 64, 22));
  const rubble = canvasTex(64, 64, 16, (g, r) => {
    g.fillStyle = '#6f6b64';
    g.fillRect(0, 0, 64, 64);
    grain(g, r, 64, 64, 500);
    g.strokeStyle = 'rgba(30,28,25,0.6)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(r() * 64, r() * 64);
      g.lineTo(r() * 64, r() * 64);
      g.stroke();
    }
  });
  // Concreto que repete em volta dos octógonos (baluartes e casamatas).
  const ring = side.clone();
  ring.wrapS = THREE.RepeatWrapping;
  ring.repeat.set(8, 1);
  ring.needsUpdate = true;
  return { side, top, panel, door, stripes, rubble, ring };
}

let TEX: ReturnType<typeof makeTextures> | null = null;
function tex() {
  return (TEX ??= makeTextures());
}

let MATS: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const t = tex();
  return {
    side: new THREE.MeshLambertMaterial({ map: t.side }),
    top: new THREE.MeshLambertMaterial({ map: t.top }),
    panel: new THREE.MeshLambertMaterial({ map: t.panel }),
    door: new THREE.MeshLambertMaterial({ map: t.door }),
    stripes: new THREE.MeshLambertMaterial({ map: t.stripes }),
    rubble: new THREE.MeshLambertMaterial({ map: t.rubble }),
    ring: new THREE.MeshLambertMaterial({ map: t.ring }),
    dark: new THREE.MeshLambertMaterial({ color: '#4a4844' }),
    plinth: new THREE.MeshLambertMaterial({ color: '#6c6862' }),
    metal: new THREE.MeshLambertMaterial({ color: '#3b4045' }),
    gun: new THREE.MeshLambertMaterial({ color: '#2a2d30' }),
    housing: new THREE.MeshLambertMaterial({ color: '#626a5f' }),
    lamp: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    chevron: new THREE.MeshBasicMaterial({ color: '#ffb020' }),
  };
}
export function fortMats() {
  return (MATS ??= makeMats());
}

/** Caixa com a base em y = 0. */
function box(w: number, h: number, d: number, y = 0): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y + h / 2, 0);
  return g;
}

/**
 * Caixa com só dois grupos (duas chamadas de desenho): as faces em `alt` (0 +x, 1 -x, 2 +y,
 * 3 -y, 4 +z, 5 -z) usam o material 1, as outras o 0.
 */
function box2(w: number, h: number, d: number, y: number, alt: number[]): THREE.BufferGeometry {
  const g = box(w, h, d, y);
  const idx = g.getIndex()!.array;
  const a: number[] = [];
  const b: number[] = [];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 6; i++) (alt.includes(f) ? b : a).push(idx[f * 6 + i]!);
  g.setIndex([...a, ...b]);
  g.clearGroups();
  g.addGroup(0, a.length, 0);
  g.addGroup(a.length, b.length, 1);
  return g;
}

/** Monte de pedaços de concreto (escombro de uma célula). */
function rubbleGeo(): THREE.BufferGeometry {
  const r = lcg(5);
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < 6; i++) {
    const g = new THREE.BoxGeometry(0.3 + r() * 0.35, 0.18 + r() * 0.3, 0.3 + r() * 0.35);
    e.set((r() - 0.5) * 0.9, r() * 3, (r() - 0.5) * 0.9);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3((r() - 0.5) * 0.6, 0.1 + r() * 0.15, (r() - 0.5) * 0.6), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    parts.push(g.toNonIndexed());
  }
  return mergeSimple(parts);
}

/** Junta geometrias não indexadas com posição, normal e uv. */
function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv'] as const;
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = parts[0]!.getAttribute(n).itemSize;
    const total = parts.reduce((s, p) => s + p.getAttribute(n).count, 0);
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const p of parts) {
      const a = p.getAttribute(n).array as Float32Array;
      arr.set(a, o);
      o += a.length;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

function inst(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], max: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0;
  m.frustumCulled = false;
  m.setColorAt(0, new THREE.Color(1, 1, 1));
  return m;
}

interface PillarSpot {
  x: number;
  z: number;
  /** Ao longo da muralha em x? */
  alongX: boolean;
  /** Largura atravessando a muralha. */
  across: number;
  h: number;
  /** Batente de portão (listras e luz). */
  post: boolean;
  /** Índices (em wallCells) que a coluna cobre. */
  cells: number[];
  gate: number;
}

/**
 * A muralha inteira (anel fixo e o que o jogador traçou), os portões, as colunas e os
 * escombros. `sync` refaz as instâncias quando algo muda.
 */
export class Fortress {
  readonly root = new THREE.Group();
  private body: THREE.InstancedMesh;
  private cap: THREE.InstancedMesh;
  private panel: THREE.InstancedMesh;
  private doors: THREE.InstancedMesh;
  private rubble: THREE.InstancedMesh;
  private pillars: THREE.InstancedMesh;
  private pillarCaps: THREE.InstancedMesh;
  private posts: THREE.InstancedMesh;
  private postBands: THREE.InstancedMesh;
  private lamps: THREE.InstancedMesh;
  private fixed: Map<number, { x: number; z: number; gate: number; alongX: boolean; a: number }>;
  private tmp = new THREE.Object3D();
  private col = new THREE.Color();
  private seenHp: Float32Array | null = null;
  private seenCells: Int32Array | null = null;
  private seenOpen = '';
  private seenClosed = false;

  private cfg: Config;

  constructor(cfg: Config) {
    this.cfg = cfg;
    const M = fortMats();
    this.body = inst(box(1, WALL_H - CAP_H, 1), M.side, MAX_WALLS);
    this.cap = inst(box(1, CAP_H, 1.12, WALL_H - CAP_H), M.top, MAX_WALLS);
    // Painel: um pouco mais grosso que a muralha, para aparecer nas duas faces.
    this.panel = inst(box2(1, 1.45, 1.03, 1.05, [4, 5]), [M.dark, M.panel], MAX_WALLS);
    this.doors = inst(box2(1, 1, 1, 0, [2]), [M.door, M.stripes], MAX_GATES);
    this.rubble = inst(rubbleGeo(), M.rubble, MAX_WALLS);
    this.pillars = inst(box(1, 1, 1), M.side, MAX_PILLARS);
    this.pillarCaps = inst(box(1.14, 0.07, 1.1, 0.93), M.top, MAX_PILLARS);
    this.posts = inst(box(1, 1, 1), M.side, 400);
    this.postBands = inst(box(1.06, 1.1, 1.04, 0.35), M.stripes, 400);
    this.lamps = inst(new THREE.BoxGeometry(0.34, 0.22, 0.34), M.lamp, 400);
    this.root.add(this.body, this.cap, this.panel, this.doors, this.rubble, this.pillars, this.pillarCaps, this.posts, this.postBands, this.lamps);
    this.fixed = new Map();
    for (const wc of wallLayout(cfg)) {
      const alongX = Math.abs(wc.z) >= Math.abs(wc.x);
      this.fixed.set(wc.cell, { x: wc.x, z: wc.z, gate: wc.gate, alongX, a: alongX ? wc.x : wc.z });
    }
  }

  /** `open[g]`: 0 fechado, 1 aberto (o portão desce no chão). `closed`: horda chegando. */
  sync(v: WorldView, open: number[], closed: boolean): void {
    const openKey = open.map((o) => o.toFixed(3)).join(',');
    const same =
      this.seenHp &&
      this.seenCells &&
      this.seenCells.length === v.wallCells.length &&
      this.seenHp.every((x, i) => x === v.wallHp[i]) &&
      this.seenCells.every((x, i) => x === v.wallCells[i]) &&
      openKey === this.seenOpen &&
      closed === this.seenClosed;
    if (same) return;
    this.seenHp = v.wallHp.slice();
    this.seenCells = v.wallCells.slice();
    this.seenOpen = openKey;
    this.seenClosed = closed;

    const c = this.cfg;
    const size = v.gridSize;
    const half = size / 2;
    const idx = new Map<number, number>();
    for (let k = 0; k < v.wallCells.length; k++) idx.set(v.wallCells[k]!, k);
    const isWall = (cell: number) => {
      const k = idx.get(cell);
      return k !== undefined && v.wallGate[k]! < 0;
    };
    const isGate = (cell: number) => {
      const k = idx.get(cell);
      return k !== undefined && v.wallGate[k]! >= 0;
    };
    const down = (k: number) => v.wallTerrain[k] === RUBBLE || v.wallHp[k]! <= 0;
    const frac = (k: number) => {
      const g = v.wallGate[k]!;
      const full = g >= 0 ? (g === 4 ? c.build.gate.hp : c.swarm.gateHp) : g === -1 && this.fixed.has(v.wallCells[k]!) ? c.swarm.wallHp : c.build.wall.hp;
      return Math.max(0, Math.min(1, v.wallHp[k]! / full));
    };
    const tint = (cell: number, f: number) => {
      const h = ((cell * 2654435761) >>> 0) / 4294967296;
      const b = (0.42 + 0.58 * f) * (0.95 + h * 0.08);
      return this.col.setRGB(b, b * 0.995, b * 0.985);
    };

    // Colunas: as do anel fixo vêm do traçado; as do jogador, das pontas e a cada 5 células.
    const pillars: PillarSpot[] = [];
    const h = c.baseHalf;
    const gh = c.gateHalf;
    const cellAt = (x: number, z: number) => Math.floor(z + half) * size + Math.floor(x + half);
    // Primeira célula de muralha depois do vão do portão (o batente) e a do meio do lance.
    const postA = Math.floor(gh - 0.5) + 0.5;
    for (const side of [0, 1, 2, 3]) {
      const alongX = side < 2;
      const sgn = side % 2 ? 1 : -1;
      for (const a of [-postA, postA, -7.5, 7.5]) {
        const post = Math.abs(a) === postA;
        const x = alongX ? a : sgn * h;
        const z = alongX ? sgn * h : a;
        const cells: number[] = [];
        for (const off of [-0.5, 0.5]) {
          const k = idx.get(alongX ? cellAt(x, z + off) : cellAt(x + off, z));
          if (k !== undefined) cells.push(k);
        }
        // O portão é o da célula vizinha, do lado do vão.
        const gx = alongX ? x - Math.sign(a) : x - 0.5;
        const gz = alongX ? z - 0.5 : z - Math.sign(a);
        const gate = post ? this.fixed.get(cellAt(gx, gz))?.gate ?? -1 : -1;
        pillars.push({ x, z, alongX, across: 2.7, h: post ? 4.5 : 4.05, post, cells, gate });
      }
    }
    const pillarCells = new Set<number>();
    let wi = 0;
    let pi = 0;
    let gi = 0;
    let ri = 0;
    for (let k = 0; k < v.wallCells.length; k++) {
      const cell = v.wallCells[k]!;
      const gate = v.wallGate[k]!;
      const x = (cell % size) - half + 0.5;
      const z = Math.floor(cell / size) - half + 0.5;
      const fx = this.fixed.get(cell);
      let alongX: boolean;
      let panel = false;
      if (fx) {
        alongX = fx.alongX;
        const a = Math.abs(fx.a);
        const corner = Math.abs(Math.abs(x) - Math.abs(z)) < 1.1 && Math.abs(x) > h - 1.5;
        panel = !corner && a > gh + 0.6 && Math.abs(a - 7.5) > 0.6 && a < h - 1.4;
      } else {
        const xN = (isWall(cell - 1) || isGate(cell - 1) ? 1 : 0) + (isWall(cell + 1) || isGate(cell + 1) ? 1 : 0);
        const zN = (isWall(cell - size) || isGate(cell - size) ? 1 : 0) + (isWall(cell + size) || isGate(cell + size) ? 1 : 0);
        alongX = xN >= zN;
        if (gate < 0) {
          const nextToGate = isGate(cell - 1) || isGate(cell + 1) || isGate(cell - size) || isGate(cell + size);
          const end = xN + zN <= 1;
          const a = Math.round(alongX ? x - 0.5 : z - 0.5);
          const bend = xN > 0 && zN > 0;
          if (nextToGate || end || (!bend && ((a % 5) + 5) % 5 === 0)) {
            pillars.push({ x, z, alongX, across: 1.3, h: nextToGate ? 4.4 : 4.0, post: nextToGate, cells: [k], gate: -1 });
            pillarCells.add(k);
          }
          panel = !bend && !pillarCells.has(k);
        }
      }
      this.tmp.position.set(x, 0, z);
      this.tmp.rotation.set(0, alongX ? 0 : Math.PI / 2, 0);
      this.tmp.scale.set(1, 1, 1);
      if (down(k)) {
        if (ri >= MAX_WALLS) continue;
        this.tmp.rotation.y = ((cell * 7) % 12) * 0.52;
        this.tmp.updateMatrix();
        this.rubble.setMatrixAt(ri, this.tmp.matrix);
        this.rubble.setColorAt(ri++, tint(cell, 0.7));
        continue;
      }
      const f = frac(k);
      if (gate >= 0) {
        if (gi >= MAX_GATES) continue;
        const o = open[gate] ?? 1;
        this.tmp.scale.set(1, WALL_H * 0.94 * (1 - o) + 0.02, 1);
        this.tmp.updateMatrix();
        this.doors.setMatrixAt(gi, this.tmp.matrix);
        this.doors.setColorAt(gi++, tint(cell, f));
        continue;
      }
      if (wi >= MAX_WALLS) continue;
      this.tmp.updateMatrix();
      tint(cell, f);
      this.body.setMatrixAt(wi, this.tmp.matrix);
      this.body.setColorAt(wi, this.col);
      this.cap.setMatrixAt(wi, this.tmp.matrix);
      this.cap.setColorAt(wi++, this.col);
      if (panel) {
        this.panel.setMatrixAt(pi, this.tmp.matrix);
        this.panel.setColorAt(pi++, this.col);
      }
    }

    let ci = 0;
    let si = 0;
    for (const p of pillars) {
      if (!p.cells.length || p.cells.some(down)) continue;
      const f = Math.min(...p.cells.map(frac));
      this.tmp.position.set(p.x, 0, p.z);
      this.tmp.rotation.set(0, p.alongX ? 0 : Math.PI / 2, 0);
      this.tmp.scale.set(p.post ? 1.15 : 1.05, p.h, p.across);
      this.tmp.updateMatrix();
      const cell = v.wallCells[p.cells[0]!]!;
      tint(cell, f);
      if (p.post) {
        if (si >= 400) continue;
        this.posts.setMatrixAt(si, this.tmp.matrix);
        this.posts.setColorAt(si, this.col);
        this.tmp.scale.set(1.15, 1, p.across);
        this.tmp.updateMatrix();
        this.postBands.setMatrixAt(si, this.tmp.matrix);
        this.postBands.setColorAt(si, this.col.setRGB(1, 1, 1));
        // Luz no alto: âmbar com o portão aberto, vermelha com ele fechando ou fechado.
        this.tmp.position.y = p.h + 0.11;
        this.tmp.scale.set(1, 1, 1);
        this.tmp.updateMatrix();
        this.lamps.setMatrixAt(si, this.tmp.matrix);
        const o = p.gate >= 0 ? open[p.gate] ?? 1 : open[4] ?? 1;
        this.lamps.setColorAt(si++, o > 0.98 && !closed ? this.col.set('#ffc23a') : this.col.set('#ff3b2a'));
      } else {
        if (ci >= MAX_PILLARS) continue;
        this.pillars.setMatrixAt(ci, this.tmp.matrix);
        this.pillars.setColorAt(ci, this.col);
        this.pillarCaps.setMatrixAt(ci, this.tmp.matrix);
        this.pillarCaps.setColorAt(ci++, this.col);
      }
    }
    this.body.count = this.cap.count = wi;
    this.panel.count = pi;
    this.doors.count = gi;
    this.rubble.count = ri;
    this.pillars.count = this.pillarCaps.count = ci;
    this.posts.count = this.postBands.count = this.lamps.count = si;
    for (const m of [this.body, this.cap, this.panel, this.doors, this.rubble, this.pillars, this.pillarCaps, this.posts, this.postBands, this.lamps]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

export interface TowerModel {
  root: THREE.Group;
  head: THREE.Group;
  lamp: THREE.Mesh;
}

/** Octógono com uma face virada para +x (com dois materiais: lado e tampas). */
function oct(rt: number, rb: number, h: number, y: number, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rt, rb, h, 8);
  if (Array.isArray(mat)) {
    // As duas tampas num grupo só (uma chamada de desenho a menos).
    const [side, top, bottom] = geo.groups;
    geo.clearGroups();
    geo.addGroup(side!.start, side!.count, 0);
    geo.addGroup(top!.start, top!.count + bottom!.count, 1);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y + h / 2;
  m.rotation.y = Math.PI / 8;
  return m;
}

/**
 * Torre: baluarte octogonal de concreto (cantos fixos) ou casamata menor (as construídas),
 * laje com parapeito e o canhão giratório em cima. A cabeça aponta para +x; o centro dela
 * fica na altura do cano (os rastros de tiro saem de lá).
 */
export function makeTowerModel(level: number, fixed: boolean): TowerModel {
  const M = fortMats();
  const root = new THREE.Group();
  const r = fixed ? 2.2 : 1.05;
  const bodyH = fixed ? 4.25 : 2.55;
  root.add(oct(r * 1.12, r * 1.16, 0.32, 0, M.plinth));
  root.add(oct(r * 0.96, r * 1.06, bodyH, 0, [M.ring, M.top]));
  // Faixa de perigo no alto do corpo e laje com parapeito em volta.
  const band = oct(r * 0.985, r * 0.99, 0.32, bodyH - 0.62, M.stripes);
  root.add(band);
  root.add(oct(r * 1.1, r * 1.04, 0.28, bodyH, [M.ring, M.top]));
  const slab = bodyH + 0.28;
  const edge = r * 1.1 * Math.cos(Math.PI / 8);
  const side = 2 * r * 1.1 * Math.sin(Math.PI / 8);
  // Parapeito: oito muretas numa malha só.
  const walls: THREE.BufferGeometry[] = [];
  const pm = new THREE.Matrix4();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pm.makeRotationY(a + Math.PI / 2).setPosition(Math.cos(a) * (edge - 0.11), 0, -Math.sin(a) * (edge - 0.11));
    walls.push(box(side * 0.98, fixed ? 0.5 : 0.36, 0.22, slab).applyMatrix4(pm).toNonIndexed());
  }
  root.add(new THREE.Mesh(mergeSimple(walls), M.side));
  // Canhão: anel, carcaça blindada com chapa inclinada na frente e cano(s).
  const head = new THREE.Group();
  const gy = slab + (fixed ? 0.95 : 0.85);
  head.position.y = gy;
  const k = fixed ? 1 : 0.85;
  const ringG = new THREE.Mesh(new THREE.CylinderGeometry(0.72 * k, 0.82 * k, 0.32, 12), M.metal);
  ringG.position.y = -0.62 * k;
  const hous = new THREE.Mesh(new THREE.BoxGeometry(1.3 * k, 0.72 * k, 1.12 * k), M.housing);
  hous.position.y = -0.1 * k;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62 * k, 1.16 * k), M.housing);
  plate.position.set(0.7 * k, -0.08 * k, 0);
  plate.rotation.z = -0.38;
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.1, 10), M.metal);
  hatch.position.set(-0.25 * k, 0.3 * k, 0);
  head.add(ringG, hous, plate, hatch);
  const barrel = (z: number, rad: number, len: number, y = 0) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 8), M.gun);
    b.rotation.z = Math.PI / 2;
    b.position.set(0.7 * k + len / 2, y, z);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(rad * 1.35, rad * 1.35, 0.18, 8), M.gun);
    tip.rotation.z = Math.PI / 2;
    tip.position.set(0.7 * k + len - 0.05, y, z);
    head.add(b, tip);
  };
  if (level >= 2) {
    barrel(-0.22 * k, 0.08, 1.5);
    barrel(0.22 * k, 0.08, 1.5);
  } else barrel(0, 0.09, 1.5);
  if (level >= 3) barrel(0, 0.17, 1.0, 0.3 * k);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22), M.lamp);
  lamp.position.set(-0.52 * k, 0.32 * k, 0.36 * k);
  head.add(lamp);
  for (let n = 1; n < level; n++) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.04), M.chevron);
    ch.position.set(-0.15 * k, 0.12 * k - n * 0.17, 0.57 * k);
    head.add(ch);
  }
  root.add(head);
  return { root, head, lamp };
}

let PAD_MATS: THREE.Material[] | null = null;
function padMats(): THREE.Material[] {
  if (PAD_MATS) return PAD_MATS;
  const top = canvasTex(128, 128, 21, (g, r) => {
    g.fillStyle = '#64625d';
    g.fillRect(0, 0, 128, 128);
    grain(g, r, 128, 128, 700);
    // Juntas da laje e borda chanfrada.
    g.fillStyle = 'rgba(30,28,26,0.35)';
    g.fillRect(63, 0, 2, 128);
    g.fillRect(0, 63, 128, 2);
    g.strokeStyle = '#8a877f';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 124, 124);
    g.strokeStyle = '#3b3936';
    g.lineWidth = 2;
    g.strokeRect(6, 6, 116, 116);
    // Cantoneiras listradas.
    for (const [x, y] of [
      [9, 9],
      [101, 9],
      [9, 101],
      [101, 101],
    ] as const) {
      hazard(g, x, y, 18, 5, 8);
      hazard(g, x + (x > 64 ? 13 : 0), y, 5, 18, 8);
    }
  });
  const side = new THREE.MeshLambertMaterial({ color: '#57554f' });
  const t = new THREE.MeshLambertMaterial({ map: top });
  PAD_MATS = [side, t];
  return PAD_MATS;
}

/** Laje de concreto escuro embaixo de um prédio (topo em 0,15 m, acima do piso do pátio). */
export function makePad(w: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(box2(w, 0.15, d, 0, [2]), padMats());
  return m;
}

/** Piso do pátio: areia batida, trilhas de pneu até os portões, terra junto da muralha. */
export function yardFloor(size: number): THREE.Mesh {
  const px = 512;
  const k = px / size;
  const t = canvasTex(px, px, 22, (g, r) => {
    const Y = LOOK.yard;
    g.fillStyle = Y.base;
    g.fillRect(0, 0, px, px);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(${Y.dark},${0.08 + r() * 0.1})` : `rgba(${Y.light},${0.07 + r() * 0.08})`;
      const s = 1 + r() * 2;
      g.fillRect(r() * px, r() * px, s, s);
    }
    // Manchas de terra mais escura e de areia solta.
    for (let i = 0; i < 40; i++) {
      g.fillStyle = r() < 0.6 ? `rgba(${Y.dark},${0.05 + r() * 0.06})` : `rgba(${Y.light},${0.06 + r() * 0.06})`;
      g.beginPath();
      g.ellipse(r() * px, r() * px, 10 + r() * 40, 6 + r() * 26, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // Trilhas de pneu do centro até cada portão (duas faixas com sulcos).
    const c = px / 2;
    for (const off of [-0.85, 0.85]) {
      for (let i = 0; i < px; i += 7) {
        g.fillStyle = Y.track;
        g.fillRect(i, c + off * k - 3, 4, 6);
        g.fillRect(c + off * k - 3, i, 6, 4);
      }
    }
    // Terra acumulada junto da muralha.
    const edge = 26;
    for (const [x0, y0, x1, y1, w, h] of [
      [0, 0, edge, 0, edge, px],
      [px, 0, px - edge, 0, edge, px],
      [0, 0, 0, edge, px, edge],
      [0, px, 0, px - edge, px, edge],
    ] as const) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(${Y.edge},0.35)`);
      gr.addColorStop(1, `rgba(${Y.edge},0)`);
      g.fillStyle = gr;
      g.fillRect(x0 === px ? px - w : 0, y0 === px ? px - h : 0, w, h);
    }
    // Pedrinhas.
    for (let i = 0; i < 160; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(80,70,60,0.55)' : 'rgba(200,190,175,0.5)';
      g.beginPath();
      g.ellipse(r() * px, r() * px, 1 + r() * 2.2, 1 + r() * 1.6, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  const mat = new THREE.MeshLambertMaterial({ map: t });
  const side = new THREE.MeshLambertMaterial({ color: LOOK.yard.side });
  const m = new THREE.Mesh(box2(size, 0.12, size, 0, [2]), [side, mat]);
  return m;
}
