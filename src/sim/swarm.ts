/**
 * Etapa 5: a horda de verdade. Insetos em typed arrays (SoA), grade de 1 m com muralha,
 * portões, entulho e núcleo; flow field por Dijkstra a partir do núcleo (a muralha custa
 * pelo HP, então o enxame procura o ponto fraco); separação por hash espacial; mordida em
 * muralha, portão e núcleo; torres com mira pelo hash grosso.
 *
 * Determinístico: só + - * / e sqrt no que volta para o estado. A direção de desenho
 * (atan2) não volta para a simulação.
 */
import type { Config } from './config.ts';
import { bugScale } from './world.ts';
import { rand } from './rng.ts';
import type { Tower, Unit, Worker, World } from './types.ts';
import { plugCells } from './units.ts';
import { damageBuilding } from './build.ts';
import { buildingMaxHp, towerStats, unitStats } from './production.ts';
import { fortStats } from './fort.ts';

export const FREE = 0;
export const WALL = 1;
export const GATE = 2;
export const RUBBLE = 3;
export const CORE = 4;
/** Prédio do jogador (torre, gerador, refinaria, fábrica). */
export const STRUCT = 5;
/** Portão das muralhas do jogador (abre e fecha junto com os do posto). */
export const PLAYER_GATE = 4;

/** Estado de cada inseto. */
export const B_NONE = 0;
export const B_WALK = 1;
export const B_BITE = 2;
export const B_DYING = 3;
/** Escavador indo para a boca do túnel; e embaixo da terra (não leva tiro, não aparece). */
export const B_DIG = 4;
export const B_UNDER = 5;

const DYING_TIME = 1.5;
const COARSE = 8;

export interface Swarm {
  size: number;
  half: number;
  /** Quantos slots esta onda usa. */
  n: number;
  max: number;
  alive: number;
  x: Float32Array;
  z: Float32Array;
  px: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vz: Float32Array;
  hp: Float32Array;
  speed: Float32Array;
  slow: Float32Array;
  timer: Float32Array;
  heading: Float32Array;
  state: Uint8Array;
  terrain: Uint8Array;
  wallHp: Float32Array;
  /** Portão de cada célula (-1: não é portão). */
  gateOf: Int8Array;
  /** Campo do assalto: distância e direção até o núcleo. */
  dist: Int32Array;
  dirX: Float32Array;
  dirZ: Float32Array;
  /** Campo dos caçadores: até o alvo mais perto entre o núcleo e os prédios do jogador. */
  dist2: Int32Array;
  dir2X: Float32Array;
  dir2Z: Float32Array;
  /**
   * Quantos insetos empurraram cada prédio no último tick (a "fila" do alvo, Etapa 17), quando
   * o campo dos caçadores foi refeito e a assinatura dos alvos com que foi feito.
   */
  crowd: Map<number, number>;
  sinceHunt: number;
  huntSig: number;
  /** Papel (0 assalto, 1 caçador), lado preferido (-1 a 1), fase própria (0 a 1) e hora de acordar (s). */
  role: Uint8Array;
  bias: Float32Array;
  phase: Float32Array;
  wake: Float32Array;
  /** Células de muralha e portão (as do posto primeiro, depois as do jogador, na ordem em que foram feitas). */
  wallIdx: number[];
  /** 1 nas células da muralha original (não se demolem). */
  wallFixed: Uint8Array;
  /** Prédio de cada célula (id + 1; 0: nenhum). */
  structOf: Int32Array;
  gateOpen: boolean[];
  flowDirty: boolean;
  sinceFlow: number;
  cellCount: Int32Array;
  cellStart: Int32Array;
  agentCell: Int32Array;
  sorted: Int32Array;
  /** Quantos mordem cada célula neste tick (teto por célula). */
  biteTick: Int32Array;
  biteN: Uint8Array;
  coarseN: number;
  coarseCount: Int32Array;
  coarseStart: Int32Array;
  coarseSorted: Int32Array;
  agentCoarse: Int32Array;
  flowCount: number;
  /** Células tampadas por robô (índice do robô + 1) e o HP dele, para o campo e a mordida. */
  plug: Int16Array;
  plugHp: Float32Array;
  plugList: number[];
  plugSig: number;
  /** Unidade perto de cada célula (índice + 1), para o inseto saber em quem morder. */
  unitNear: Int16Array;
  unitNearList: number[];
  /** Pilha de insetos em cada célula de muralha (0 a 1) e quem empurra neste tick. */
  pile: Float32Array;
  pressN: Uint16Array;
  pressTick: Int32Array;
  pileCells: number[];
  /** Células escaláveis (contador: várias pilhas podem cobrir a mesma). */
  climb: Uint8Array;
  /** Pilhas cheias (origem de cada área escalável). */
  climbOrigins: number[];
  /** Túnel de cada inseto escavador (-1: não é escavador). */
  dig: Int16Array;
}

export function cellCenter(sw: Swarm, c: number): { x: number; z: number } {
  return { x: (c % sw.size) - sw.half + 0.5, z: Math.floor(c / sw.size) - sw.half + 0.5 };
}

export function cellAt(sw: Swarm, x: number, z: number): number {
  const i = Math.floor(x + sw.half);
  const j = Math.floor(z + sw.half);
  if (i < 0 || j < 0 || i >= sw.size || j >= sw.size) return -1;
  return j * sw.size + i;
}

/** Lado do portão pela posição (0 norte, 1 leste, 2 sul, 3 oeste), igual a world.makeGates. */
function gateSide(cx: number, cz: number): number {
  if (Math.abs(cz) > Math.abs(cx)) return cz < 0 ? 0 : 2;
  return cx > 0 ? 1 : 3;
}

export interface WallCell {
  /** Índice na grade, centro (m), portão (-1: muralha). */
  cell: number;
  x: number;
  z: number;
  gate: number;
}

/** As células de muralha e portão, sempre na mesma ordem (a tela usa sem montar a grade). */
export function wallLayout(cfg: Config): WallCell[] {
  const size = cfg.swarm.grid;
  const half = size / 2;
  const h = cfg.baseHalf;
  const out: WallCell[] = [];
  const lo = Math.floor(half - h - 2);
  const hi = Math.ceil(half + h + 2);
  for (let j = lo; j < hi; j++)
    for (let i = lo; i < hi; i++) {
      const cx = i - half + 0.5;
      const cz = j - half + 0.5;
      const m = Math.max(Math.abs(cx), Math.abs(cz));
      if (!(m > h - 1 && m < h + 1)) continue;
      const along = Math.min(Math.abs(cx), Math.abs(cz));
      out.push({ cell: j * size + i, x: cx, z: cz, gate: along < cfg.gateHalf - 0.5 ? gateSide(cx, cz) : -1 });
    }
  return out;
}

export function makeSwarm(cfg: Config): Swarm {
  const size = cfg.swarm.grid;
  const half = size / 2;
  const NC = size * size;
  const max = cfg.horde.cap;
  const terrain = new Uint8Array(NC);
  const wallHp = new Float32Array(NC);
  const gateOf = new Int8Array(NC).fill(-1);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const cx = i - half + 0.5;
      const cz = j - half + 0.5;
      if (Math.max(Math.abs(cx), Math.abs(cz)) < 3) terrain[j * size + i] = CORE;
    }
  const layout = wallLayout(cfg);
  for (const wc of layout) {
    if (wc.gate >= 0) {
      terrain[wc.cell] = GATE;
      wallHp[wc.cell] = cfg.swarm.gateHp;
      gateOf[wc.cell] = wc.gate;
    } else {
      terrain[wc.cell] = WALL;
      wallHp[wc.cell] = cfg.swarm.wallHp;
    }
  }
  const walls = layout.map((wc) => wc.cell);
  const wallFixed = new Uint8Array(NC);
  for (const c of walls) wallFixed[c] = 1;
  const coarseN = Math.ceil(size / COARSE);
  return {
    size,
    half,
    n: 0,
    max,
    alive: 0,
    x: new Float32Array(max),
    z: new Float32Array(max),
    px: new Float32Array(max),
    pz: new Float32Array(max),
    vx: new Float32Array(max),
    vz: new Float32Array(max),
    hp: new Float32Array(max),
    speed: new Float32Array(max),
    slow: new Float32Array(max),
    timer: new Float32Array(max),
    heading: new Float32Array(max),
    state: new Uint8Array(max),
    terrain,
    wallHp,
    gateOf,
    dist: new Int32Array(NC),
    dirX: new Float32Array(NC),
    dirZ: new Float32Array(NC),
    dist2: new Int32Array(NC),
    dir2X: new Float32Array(NC),
    dir2Z: new Float32Array(NC),
    crowd: new Map(),
    sinceHunt: 0,
    huntSig: 0,
    role: new Uint8Array(max),
    bias: new Float32Array(max),
    phase: new Float32Array(max),
    wake: new Float32Array(max),
    wallIdx: walls,
    wallFixed,
    structOf: new Int32Array(NC),
    gateOpen: [true, true, true, true, true],
    flowDirty: true,
    sinceFlow: 1e9,
    cellCount: new Int32Array(NC),
    cellStart: new Int32Array(NC),
    agentCell: new Int32Array(max),
    sorted: new Int32Array(max),
    biteTick: new Int32Array(NC).fill(-1),
    biteN: new Uint8Array(NC),
    coarseN,
    coarseCount: new Int32Array(coarseN * coarseN),
    coarseStart: new Int32Array(coarseN * coarseN),
    coarseSorted: new Int32Array(max),
    agentCoarse: new Int32Array(max),
    flowCount: 0,
    plug: new Int16Array(NC),
    plugHp: new Float32Array(NC),
    plugList: [],
    plugSig: 0,
    unitNear: new Int16Array(NC),
    unitNearList: [],
    pile: new Float32Array(NC),
    pressN: new Uint16Array(NC),
    pressTick: new Int32Array(NC).fill(-1),
    pileCells: [],
    climb: new Uint8Array(NC),
    climbOrigins: [],
    dig: new Int16Array(max).fill(-1),
  };
}

/** Torres: 4 nos cantos (prontas) e 4 vagas na muralha. */
/** As 4 torres fixas dos cantos (em cima da muralha, alimentadas pelo núcleo). */
export function makeTowers(cfg: Config): Tower[] {
  const h = cfg.baseHalf;
  const spots: [number, number][] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  return spots.map(([x, z], slot) => ({ slot, buildingId: -1, powered: true, level: 1, upgradeLeft: 0, x, z, built: true, target: -1, tx: 0, tz: 0 }));
}

function blocked(sw: Swarm, c: number): boolean {
  if (sw.plug[c]! > 0) return true;
  // Pilha cheia: o enxame passa por cima (devagar).
  if (sw.climb[c]! > 0) return false;
  const t = sw.terrain[c]!;
  if (t === WALL || t === STRUCT) return true;
  if (t === GATE) return !sw.gateOpen[sw.gateOf[c]!];
  return false;
}

// ---------- flow field ----------
const OX = [1, -1, 0, 0, 1, 1, -1, -1];
const OZ = [0, 0, 1, -1, 1, -1, 1, -1];
const OC = [10, 10, 10, 10, 14, 14, 14, 14];
/** Baldes do Dijkstra (os custos são inteiros e cada passo custa no máximo 14 × 255 < 4096). */
const BUCKETS = 4096;
const MAX_MULT = 255;
let bHead = new Int32Array(BUCKETS);
let nCell = new Int32Array(0);
let nNext = new Int32Array(0);
/** Custo de entrar em cada célula, calculado uma vez por recálculo e usado pelos dois campos. */
let multArr = new Uint8Array(0);

let climbCost = 6;

/** Quanto custa entrar na célula n (multiplica os 10/14 do passo). */
function stepMult(sw: Swarm, n: number): number {
  const t = sw.terrain[n]!;
  const m =
    sw.plug[n]! > 0
      ? 1 + ((sw.plugHp[n]! / 20) | 0)
      : sw.climb[n]! > 0 && (t === WALL || t === GATE)
        ? climbCost
        : blocked(sw, n)
          ? 1 + ((sw.wallHp[n]! / 20) | 0)
          : t === RUBBLE
            ? 2
            : 1;
  return m > MAX_MULT ? MAX_MULT : m;
}

/**
 * Dijkstra por baldes (algoritmo de Dial) a partir das células-semente, e a direção de cada
 * célula para a vizinha mais perto do alvo. Resultado igual ao do heap, mais rápido.
 */
function field(sw: Swarm, seed: (c: number) => number, dist: Int32Array, dirX: Float32Array, dirZ: Float32Array): void {
  const { size } = sw;
  const NC = size * size;
  const mult = multArr;
  if (nCell.length < NC * 3) {
    nCell = new Int32Array(NC * 3);
    nNext = new Int32Array(NC * 3);
  }
  bHead.fill(-1);
  let pn = 0;
  let pending = 0;
  const push = (c: number, key: number) => {
    if (pn >= nCell.length) {
      const a = new Int32Array(nCell.length * 2);
      const b = new Int32Array(nNext.length * 2);
      a.set(nCell);
      b.set(nNext);
      nCell = a;
      nNext = b;
    }
    const k = key & (BUCKETS - 1);
    nCell[pn] = c;
    nNext[pn] = bHead[k]!;
    bHead[k] = pn;
    pn++;
    pending++;
  };
  dist.fill(0x3fffffff);
  // Semente com custo inicial (a "fila" do alvo); -1: não é semente.
  for (let c = 0; c < NC; c++) {
    const k0 = seed(c);
    if (k0 < 0) continue;
    dist[c] = k0;
    push(c, k0);
  }
  for (let cur = 0; pending > 0; cur++) {
    const k = cur & (BUCKETS - 1);
    while (bHead[k]! >= 0) {
      const node = bHead[k]!;
      bHead[k] = nNext[node]!;
      pending--;
      const c = nCell[node]!;
      if (dist[c] !== cur) continue;
      const cx = c % size;
      const cz = (c / size) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + OX[d]!;
        const nz = cz + OZ[d]!;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        const n = nz * size + nx;
        const nd = cur + OC[d]! * mult[n]!;
        if (nd < dist[n]!) {
          dist[n] = nd;
          push(n, nd);
        }
      }
    }
  }
  for (let c = 0; c < NC; c++) {
    const cx = c % size;
    const cz = (c / size) | 0;
    let best = dist[c]!;
    let bx = 0;
    let bz = 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + OX[d]!;
      const nz = cz + OZ[d]!;
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const n = nz * size + nx;
      if (dist[n]! < best) {
        best = dist[n]!;
        bx = OX[d]!;
        bz = OZ[d]!;
      }
    }
    const l = bx && bz ? Math.SQRT1_2 : 1;
    dirX[c] = bx * l;
    dirZ[c] = bz * l;
  }
}

/** Custo de entrar em cada célula (os dois campos usam o mesmo). */
function refreshMult(sw: Swarm): void {
  const NC = sw.size * sw.size;
  if (multArr.length !== NC) multArr = new Uint8Array(NC);
  for (let c = 0; c < NC; c++) multArr[c] = stepMult(sw, c);
}

/** Campo dos caçadores: núcleo (0) e os prédios-alvo, cada um com a sua fila (custo inicial). */
export function computeHunterFlow(sw: Swarm, targets?: Map<number, number>): void {
  const t = sw.terrain;
  const so = sw.structOf;
  field(
    sw,
    (c) => (t[c] === CORE ? 0 : t[c] === STRUCT ? (targets ? (targets.get(so[c]! - 1) ?? -1) : 0) : -1),
    sw.dist2,
    sw.dir2X,
    sw.dir2Z,
  );
}

/**
 * Os dois campos: assalto (só o núcleo) e caçadores (núcleo e os prédios-alvo do jogador).
 * `targets`: id do prédio → custo inicial (sem a lista, todos com 0).
 */
export function computeFlow(sw: Swarm, cost = climbCost, targets?: Map<number, number> | Set<number>): void {
  climbCost = cost;
  refreshMult(sw);
  const t = sw.terrain;
  field(sw, (c) => (t[c] === CORE ? 0 : -1), sw.dist, sw.dirX, sw.dirZ);
  const m = targets instanceof Set ? new Map([...targets].map((id) => [id, 0])) : targets;
  computeHunterFlow(sw, m);
  sw.flowCount++;
}

/** Prédios-alvo dos caçadores agora, com a fila de cada um (Etapa 17). */
export function hunterTargets(w: World): Map<number, number> {
  const ai = w.cfg.ai;
  const out = new Map<number, number>();
  for (const b of w.buildings) {
    if (!ai.targets.includes(b.kind)) continue;
    if (ai.outsideOnly && Math.abs(b.x) < w.cfg.baseHalf && Math.abs(b.z) < w.cfg.baseHalf) continue;
    out.set(b.id, Math.min(ai.crowdMax, (w.swarm.crowd.get(b.id) ?? 0) * ai.crowdCost));
  }
  return out;
}

function targetSig(m: Map<number, number>): number {
  let s = m.size;
  for (const [id, v] of m) s = (Math.imul(s, 31) + id * 977 + v) | 0;
  return s;
}

/**
 * Onda periódica entre -1 e 1 (período 1), feita só com produtos e floor: serve de "seno"
 * determinístico para as oscilações do andar.
 */
export function wave(v: number): number {
  const p = v - Math.floor(v);
  return p < 0.5 ? 16 * p * (0.5 - p) : -16 * (p - 0.5) * (1 - p);
}

/** Posições das tropas no mapa (reaproveitado a cada tick). */
const huntX = new Float64Array(256);
const huntZ = new Float64Array(256);

// ---------- onda ----------
export function spawnWave(w: World): void {
  const sw = w.swarm;
  const c = w.cfg;
  const n = Math.min(sw.max, w.times.bugs);
  const t = w.tick / c.ticksPerSecond;
  const hpScale = bugScale(c, w.wave).hp;
  // Escavadores (a partir de tunnel.fromWave): um túnel por onda, numa direção sorteada.
  const tc = c.tunnel;
  let diggers = 0;
  let tdx = 0;
  let tdz = 0;
  w.tunnels = [];
  if (w.wave >= tc.fromWave) {
    diggers = Math.min(tc.max, Math.max(tc.min, Math.round(n * tc.share)), n);
    let l2 = 0;
    do {
      tdx = rand(w) * 2 - 1;
      tdz = rand(w) * 2 - 1;
      l2 = tdx * tdx + tdz * tdz;
    } while (l2 > 1 || l2 < 0.05);
    const l = Math.sqrt(l2);
    tdx /= l;
    tdz /= l;
    const side = Math.abs(tdz) > Math.abs(tdx) ? (tdz < 0 ? 'norte' : 'sul') : tdx > 0 ? 'leste' : 'oeste';
    w.tunnels.push({ id: 0, side, ex: tdx * tc.entry, ez: tdz * tc.entry, ix: tdx * tc.exit, iz: tdz * tc.exit, started: -1, under: 0 });
  }
  // Bandos (Etapa 15): cada um vem de uma direção, com leque e atraso próprios. A primeira
  // leva cruza o perímetro na hora da chegada; as outras, até `ai.surge` s depois.
  const ai = c.ai;
  const nPacks = Math.max(ai.packsMin, Math.min(ai.packsMax, ai.packsMin + Math.floor(n / ai.perPack)));
  const packs: { x: number; z: number; spread: number; delay: number }[] = [];
  for (let p = 0; p < nPacks; p++) {
    let px = 0;
    let pz = 0;
    let l2 = 0;
    do {
      px = rand(w) * 2 - 1;
      pz = rand(w) * 2 - 1;
      l2 = px * px + pz * pz;
    } while (l2 > 1 || l2 < 0.01);
    const l = Math.sqrt(l2);
    packs.push({ x: px / l, z: pz / l, spread: ai.spreadMin + rand(w) * (ai.spreadMax - ai.spreadMin), delay: p === 0 ? 0 : rand(w) * ai.surge });
  }
  const hunters = Math.min(ai.huntersMax, ai.hunters + ai.huntersPerWave * w.wave);
  for (let i = 0; i < n; i++) {
    // Direção ao acaso no disco unitário, normalizada (só sqrt).
    let dx = 0;
    let dz = 0;
    let l = 0;
    do {
      dx = rand(w) * 2 - 1;
      dz = rand(w) * 2 - 1;
      l = dx * dx + dz * dz;
    } while (l > 1 || l < 0.01);
    l = Math.sqrt(l);
    let delay = 0;
    if (i < diggers) {
      // Escavador vem do lado do túnel (com um leque pequeno).
      dx = tdx * l + (dx / l) * 0.25 * l;
      dz = tdz * l + (dz / l) * 0.25 * l;
      l = Math.sqrt(dx * dx + dz * dz);
    } else if (rand(w) >= ai.loners) {
      // Num bando: a direção dele mais um desvio de lado (soma de três sorteios, quase normal).
      const pk = packs[Math.floor(rand(w) * nPacks) % nPacks]!;
      const off = (rand(w) + rand(w) + rand(w) - 1.5) * pk.spread * 2;
      dx = pk.x - pk.z * off;
      dz = pk.z + pk.x * off;
      l = Math.sqrt(dx * dx + dz * dz);
      delay = pk.delay;
    } else delay = rand(w) * ai.surge;
    const r0 = c.hordeSpawnRadius + rand(w) * 40;
    sw.x[i] = sw.px[i] = (dx / l) * r0;
    sw.z[i] = sw.pz[i] = (dz / l) * r0;
    sw.vx[i] = sw.vz[i] = 0;
    sw.hp[i] = c.swarm.bugHp * hpScale;
    sw.speed[i] = c.horde.speed * (0.8 + 0.4 * rand(w));
    const cross = w.times.arrive - 1 + delay + rand(w) * ai.jitter;
    sw.wake[i] = cross;
    sw.slow[i] = (r0 - c.dangerRadius) / Math.max(4, cross - t);
    sw.timer[i] = 0;
    sw.state[i] = i < diggers ? B_DIG : B_WALK;
    sw.dig[i] = i < diggers ? 0 : -1;
    sw.heading[i] = 0;
    sw.role[i] = i >= diggers && rand(w) < hunters ? 1 : 0;
    sw.bias[i] = rand(w) * 2 - 1;
    sw.phase[i] = rand(w);
  }
  for (let i = n; i < sw.n; i++) sw.state[i] = B_NONE;
  sw.n = n;
  sw.alive = n;
}

/** Fim da onda: some com quem sobrou e refaz os portões. */
export function clearWave(w: World): void {
  const sw = w.swarm;
  for (let i = 0; i < sw.n; i++) sw.state[i] = B_NONE;
  sw.n = 0;
  sw.alive = 0;
  for (const c of sw.wallIdx) {
    if (sw.gateOf[c]! >= 0) {
      sw.terrain[c] = GATE;
      sw.wallHp[c] = sw.gateOf[c] === PLAYER_GATE ? w.cfg.build.gate.hp : w.cfg.swarm.gateHp;
    }
  }
  for (const t of w.towers) t.target = -1;
  for (const c of sw.pileCells) sw.pile[c] = 0;
  sw.pileCells = [];
  sw.climb.fill(0);
  sw.climbOrigins = [];
  w.tunnels = [];
  sw.flowDirty = true;
}

/** Quanto falta de HP na muralha (sem os portões, que são refeitos de graça). */
export function wallMissing(w: World): number {
  const sw = w.swarm;
  let m = 0;
  for (const c of sw.wallIdx) if (sw.gateOf[c]! < 0) m += w.cfg.swarm.wallHp - sw.wallHp[c]!;
  return m;
}

/** Quanto falta de vida nos prédios (Etapa 17: o enxame ataca o que está fora). */
export function buildingMissing(w: Pick<World, 'buildings' | 'cfg'>): number {
  let m = 0;
  for (const b of w.buildings) m += Math.max(0, buildingMaxHp(w, b) - b.hp);
  return m;
}

export function repairCost(w: World): number {
  return Math.ceil((wallMissing(w) + buildingMissing(w)) * w.cfg.swarm.repairPerHp);
}

/** Conserta a muralha e os prédios com o minério que houver (proporcional se faltar). */
export function repairWalls(w: World): number {
  const cost = repairCost(w);
  if (cost <= 0 || w.ore <= 0) return 0;
  const pay = Math.min(cost, w.ore);
  const f = pay / cost;
  const sw = w.swarm;
  for (const c of sw.wallIdx) {
    if (sw.gateOf[c]! >= 0) continue;
    sw.wallHp[c] = sw.wallHp[c]! + (w.cfg.swarm.wallHp - sw.wallHp[c]!) * f;
    if (sw.wallHp[c]! > 0 && sw.terrain[c] === RUBBLE) sw.terrain[c] = WALL;
  }
  for (const b of w.buildings) {
    const full = buildingMaxHp(w, b);
    if (b.hp >= full) continue;
    b.hp += (full - b.hp) * f;
    for (const c of b.cells) sw.wallHp[c] = b.hp;
    if (b.hp >= full * 0.5) b.hurt = false;
  }
  w.ore -= pay;
  sw.flowDirty = true;
  return pay;
}

// ---------- pilhas ----------
function setClimb(sw: Swarm, origin: number, delta: 1 | -1): void {
  for (let oz = -1; oz <= 1; oz++)
    for (let ox = -1; ox <= 1; ox++) {
      const n = origin + oz * sw.size + ox;
      const t = sw.terrain[n]!;
      if (t !== WALL && t !== GATE) continue;
      sw.climb[n] = Math.max(0, sw.climb[n]! + delta);
    }
}

function updatePiles(w: World, dt: number): void {
  const sw = w.swarm;
  const cc = w.cfg.climb;
  const keep: number[] = [];
  for (const c of sw.pileCells) {
    const pressing = sw.pressTick[c] === w.tick ? sw.pressN[c]! : 0;
    const before = sw.pile[c]!;
    let p = before;
    if (pressing > cc.threshold) p = Math.min(1, p + (pressing - cc.threshold) * cc.rate * dt);
    else p = Math.max(0, p - cc.decay * dt);
    sw.pile[c] = p;
    if (before < 1 && p >= 1) {
      sw.climbOrigins.push(c);
      setClimb(sw, c, 1);
      sw.flowDirty = true;
      const q = cellCenter(sw, c);
      w.events.push({ type: 'climb', x: q.x, z: q.z });
    } else if (before >= 0.5 && p < 0.5 && sw.climbOrigins.includes(c)) {
      sw.climbOrigins = sw.climbOrigins.filter((o) => o !== c);
      setClimb(sw, c, -1);
      sw.flowDirty = true;
    }
    if (p > 0 || sw.climbOrigins.includes(c)) keep.push(c);
  }
  sw.pileCells = keep;
}

// ---------- passo ----------
export function stepSwarm(w: World, dt: number, killWorker: (k: Worker) => void): void {
  const sw = w.swarm;
  const c = w.cfg;
  const t = w.tick / c.ticksPerSecond;
  // Portões abertos ou fechados mudam o campo.
  const calm = w.phase === 'calm' || w.phase === 'warning';
  for (let g = 0; g < 5; g++) {
    // 0 a 3: portões do posto (podem ser segurados); 4: portões do jogador.
    const open = calm || (g < 4 && t < w.gates[g]!.closeAt);
    if (open !== sw.gateOpen[g]) {
      sw.gateOpen[g] = open;
      sw.flowDirty = true;
    }
  }
  // Robôs parados tampam brechas; se a lista mudar, o campo muda.
  for (const cell of sw.plugList) sw.plug[cell] = 0;
  sw.plugList = plugCells(w, sw.plug, sw.plugHp);
  let sig = sw.plugList.length;
  for (const cell of sw.plugList) sig = (Math.imul(sig, 31) + cell) | 0;
  if (sig !== sw.plugSig) {
    sw.plugSig = sig;
    sw.flowDirty = true;
  }
  // Quem está perto de cada célula (para a mordida em unidades).
  for (const cell of sw.unitNearList) sw.unitNear[cell] = 0;
  sw.unitNearList = [];
  w.units.forEach((u, idx) => {
    // Dentro do fortim o enxame não alcança (morde o prédio).
    if (u.dead || u.inside >= 0) return;
    const uc = cellAt(sw, u.x, u.z);
    if (uc < 0) return;
    for (let oz = -1; oz <= 1; oz++)
      for (let ox = -1; ox <= 1; ox++) {
        const nc = uc + oz * sw.size + ox;
        if (sw.unitNear[nc]) continue;
        sw.unitNear[nc] = idx + 1;
        sw.unitNearList.push(nc);
      }
  });
  const unitBites = new Uint8Array(w.units.length);
  const biteK = bugScale(c, w.wave).bite;
  const biteUnit = (idx: number): boolean => {
    const u = w.units[idx]!;
    if (u.dead) return false;
    const uc = c.units[u.kind];
    if (unitBites[idx]! >= uc.biteSlots) return true;
    unitBites[idx]!++;
    u.hp -= c.units.bite * biteK * dt;
    if (u.hp <= 0) {
      u.hp = 0;
      u.dead = true;
      u.route = [];
      w.stats.unitsLost++;
      w.events.push({ type: 'unitDown', kind: u.kind, x: u.x, z: u.z });
    }
    return true;
  };
  sw.sinceFlow += dt;
  sw.sinceHunt += dt;
  if (sw.flowDirty && sw.sinceFlow >= c.swarm.flowEvery) {
    const targets = hunterTargets(w);
    computeFlow(sw, c.climb.cost, targets);
    sw.huntSig = targetSig(targets);
    sw.flowDirty = false;
    sw.sinceFlow = 0;
    sw.sinceHunt = 0;
  } else if (sw.sinceHunt >= c.swarm.flowEvery && sw.n > 0) {
    // A fila dos alvos mudou: só o campo dos caçadores é refeito.
    sw.sinceHunt = 0;
    const targets = hunterTargets(w);
    const sig = targetSig(targets);
    if (sig !== sw.huntSig) {
      refreshMult(sw);
      computeHunterFlow(sw, targets);
      sw.huntSig = sig;
    }
  }
  const crowdNow = new Map<number, number>();
  if (sw.n === 0) return;

  const { size, half, x, z, px, pz, vx, vz, hp, state, terrain, wallHp, dirX, dirZ, cellCount, cellStart, agentCell, sorted } = sw;
  const n = sw.n;
  // 1) hash fino (1 m), só de quem está em cena.
  cellCount.fill(0);
  for (let i = 0; i < n; i++) {
    if (state[i] !== B_WALK && state[i] !== B_BITE) {
      agentCell[i] = -1;
      continue;
    }
    let ci = Math.floor(x[i]! + half);
    let cj = Math.floor(z[i]! + half);
    ci = ci < 0 ? 0 : ci >= size ? size - 1 : ci;
    cj = cj < 0 ? 0 : cj >= size ? size - 1 : cj;
    const cell = cj * size + ci;
    agentCell[i] = cell;
    cellCount[cell]!++;
  }
  let s = 0;
  const NC = size * size;
  for (let k = 0; k < NC; k++) {
    cellStart[k] = s;
    s += cellCount[k]!;
    cellCount[k] = 0;
  }
  for (let i = 0; i < n; i++) {
    const cell = agentCell[i]!;
    if (cell < 0) continue;
    sorted[cellStart[cell]! + cellCount[cell]!] = i;
    cellCount[cell]!++;
  }

  // 2) movimento, separação, mordida.
  const R = c.swarm.radius;
  const R2 = R * R;
  const maxCheck = c.swarm.maxCheck;
  const danger2 = c.dangerRadius * c.dangerRadius;
  const reachU2 = c.units.reach * c.units.reach;
  const edge = half - 1;
  const ai = c.ai;
  const calm10 = ai.calm * 10;
  const sense10 = ai.sense * 10;
  const wallCalm = c.baseHalf + 3;
  // Tropas no mapa (as do fortim não contam): alvo dos caçadores que passam perto.
  const chase2 = ai.chase * ai.chase;
  let nHunt = 0;
  for (const u of w.units) {
    if (u.dead || u.inside >= 0) continue;
    huntX[nHunt] = u.x;
    huntZ[nHunt] = u.z;
    if (++nHunt >= huntX.length) break;
  }
  for (let i = 0; i < n; i++) {
    const st = state[i]!;
    px[i] = x[i]!;
    pz[i] = z[i]!;
    if (st === B_DYING) {
      sw.timer[i] = sw.timer[i]! + dt;
      if (sw.timer[i]! >= DYING_TIME) state[i] = B_NONE;
      continue;
    }
    if (st === B_NONE) continue;
    if (st === B_UNDER) {
      // Embaixo da terra: só o relógio anda.
      sw.timer[i] = sw.timer[i]! - dt;
      if (sw.timer[i]! <= 0) {
        const tn = w.tunnels[sw.dig[i]!];
        const k = i % 7;
        const ox = ((k % 3) - 1) * 0.8;
        const oz = (((k / 3) | 0) - 1) * 0.8;
        x[i] = px[i] = (tn ? tn.ix : 0) + ox;
        z[i] = pz[i] = (tn ? tn.iz : 0) + oz;
        vx[i] = vz[i] = 0;
        state[i] = B_WALK;
        sw.dig[i] = -1;
        if (tn) {
          tn.under--;
          if (!tn.emerged) {
            tn.emerged = true;
            w.events.push({ type: 'emerge', x: tn.ix, z: tn.iz });
          }
        }
      }
      continue;
    }
    if (st === B_DIG) {
      // Vai reto até a boca do túnel e some.
      const tn = w.tunnels[sw.dig[i]!];
      if (!tn) {
        state[i] = B_WALK;
        continue;
      }
      const dx = tn.ex - x[i]!;
      const dz = tn.ez - z[i]!;
      const d = Math.sqrt(dx * dx + dz * dz);
      const r2d = x[i]! * x[i]! + z[i]! * z[i]!;
      const sp = t < sw.wake[i]! && r2d > danger2 ? sw.slow[i]! : sw.speed[i]!;
      if (d < 1.5) {
        state[i] = B_UNDER;
        sw.timer[i] = c.tunnel.time;
        tn.under++;
        if (tn.started < 0) {
          tn.started = t;
          w.events.push({ type: 'tunnel', side: tn.side, x: tn.ex, z: tn.ez });
        }
        continue;
      }
      const k = Math.min(1, (sp * dt) / d);
      x[i] = x[i]! + dx * k;
      z[i] = z[i]! + dz * k;
      sw.heading[i] = Math.atan2(dz, dx);
      continue;
    }
    const xi = x[i]!;
    const zi = z[i]!;
    const r2 = xi * xi + zi * zi;
    const outside = Math.abs(xi) >= edge || Math.abs(zi) >= edge;
    let fx: number;
    let fz: number;
    const cell = agentCell[i]!;
    // Caçador segue o campo dos alvos (prédios e núcleo); o resto, o do núcleo.
    // Caçador só segue o campo dos alvos quando há um a menos de `ai.sense` m (pelo caminho).
    const hunter = sw.role[i] === 1 && (outside || sw.dist2[cell]! <= sense10);
    const DX = hunter ? sw.dir2X : dirX;
    const DZ = hunter ? sw.dir2Z : dirZ;
    // Quanto do andar caótico vale aqui: tudo longe; nada perto do alvo e da muralha do posto.
    let spread = 1;
    if (outside) {
      const r = Math.sqrt(r2) || 1;
      fx = -xi / r;
      fz = -zi / r;
    } else {
      const d0 = (hunter ? sw.dist2 : sw.dist)[cell]!;
      const cheb = Math.max(Math.abs(xi), Math.abs(zi));
      const nearTarget = d0 <= calm10 ? 0 : Math.min(1, (d0 - calm10) / 250);
      const nearWall = cheb <= wallCalm ? 0 : Math.min(1, (cheb - wallCalm) / 10);
      spread = nearTarget < nearWall ? nearTarget : nearWall;
      fx = DX[cell]!;
      fz = DZ[cell]!;
      if (spread > 0) {
        // Direção suavizada: mistura as 4 células em volta (sai das 8 direções fixas).
        const gx = xi + half - 0.5;
        const gz = zi + half - 0.5;
        const i0 = Math.floor(gx);
        const j0 = Math.floor(gz);
        if (i0 >= 0 && j0 >= 0 && i0 + 1 < size && j0 + 1 < size) {
          const ax = gx - i0;
          const az = gz - j0;
          const c00 = j0 * size + i0;
          const c01 = c00 + size;
          const w00 = (1 - ax) * (1 - az);
          const w10 = ax * (1 - az);
          const w01 = (1 - ax) * az;
          const w11 = ax * az;
          const bx = DX[c00]! * w00 + DX[c00 + 1]! * w10 + DX[c01]! * w01 + DX[c01 + 1]! * w11;
          const bz = DZ[c00]! * w00 + DZ[c00 + 1]! * w10 + DZ[c01]! * w01 + DZ[c01 + 1]! * w11;
          const bl = Math.sqrt(bx * bx + bz * bz);
          if (bl > 0.2) {
            fx = bx / bl;
            fz = bz / bl;
          }
        }
      }
      if (terrain[cell] === CORE) {
        // No núcleo: morde.
        state[i] = B_BITE;
        const before = w.core;
        w.core = Math.max(0, w.core - c.swarm.biteCore * biteK * dt);
        w.stats.coreDamage += before - w.core;
        vx[i] = vx[i]! * 0.5;
        vz[i] = vz[i]! * 0.5;
        continue;
      }
    }
    // Caçador perto de uma tropa no mapa: vai nela (sem desvio).
    if (sw.role[i] === 1 && nHunt > 0) {
      let best = chase2;
      let bx = 0;
      let bz = 0;
      for (let q = 0; q < nHunt; q++) {
        const dx = huntX[q]! - xi;
        const dz = huntZ[q]! - zi;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) {
          best = d2;
          bx = dx;
          bz = dz;
        }
      }
      if (best < chase2) {
        const d = Math.sqrt(best) || 1;
        fx = bx / d;
        fz = bz / d;
        spread = 0;
      }
    }
    const ph = sw.phase[i]!;
    if (spread > 0) {
      // Desvio de lado: o lado preferido do inseto mais uma oscilação com fase e ritmo dele.
      const lat = (sw.bias[i]! * 0.55 + wave(ph * 5.3 + t * (0.15 + 0.2 * ph))) * ai.lateral * spread;
      const gx = fx - fz * lat;
      const gz = fz + fx * lat;
      const gl = Math.sqrt(gx * gx + gz * gz) || 1;
      fx = gx / gl;
      fz = gz / gl;
    }
    let top = t < sw.wake[i]! && r2 > danger2 ? sw.slow[i]! : sw.speed[i]!;
    // Ritmo que oscila: uns aceleram, outros freiam.
    top *= 1 + ai.pace * wave(ph * 3.1 + t * 0.37);
    // Em cima da muralha (pilha): devagar.
    if (!outside && sw.climb[cell]! > 0 && (terrain[cell] === WALL || terrain[cell] === GATE)) top *= c.climb.speed;
    let sx = 0;
    let sz = 0;
    if (!outside) {
      const ci = cell % size;
      const cj = (cell / size) | 0;
      let checked = 0;
      outer: for (let oz = -1; oz <= 1; oz++) {
        const jj = cj + oz;
        if (jj < 0 || jj >= size) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const ii = ci + ox;
          if (ii < 0 || ii >= size) continue;
          const nc = jj * size + ii;
          const b = cellStart[nc]!;
          const e = b + cellCount[nc]!;
          for (let q = b; q < e; q++) {
            const j = sorted[q]!;
            if (j === i) continue;
            const dx = xi - x[j]!;
            const dz = zi - z[j]!;
            const d2 = dx * dx + dz * dz;
            if (d2 < R2 && d2 > 1e-8) {
              const d = Math.sqrt(d2);
              const f = (R - d) / (d * R);
              sx += dx * f;
              sz += dz * f;
            }
            if (++checked >= maxCheck) break outer;
          }
        }
      }
    }
    const dvx = fx * top + sx * 3;
    const dvz = fz * top + sz * 3;
    let nvx = vx[i]! + (dvx - vx[i]!) * 0.35;
    let nvz = vz[i]! + (dvz - vz[i]!) * 0.35;
    const sp2 = nvx * nvx + nvz * nvz;
    if (sp2 > top * top) {
      const k = top / Math.sqrt(sp2);
      nvx *= k;
      nvz *= k;
    }
    const nx = xi + nvx * dt;
    const nz = zi + nvz * dt;
    const next = cellAt(sw, nx, nz);
    // Unidade no caminho: morde.
    const near = next >= 0 ? sw.unitNear[next]! : 0;
    if (near > 0) {
      const u = w.units[near - 1]!;
      const ddx = nx - u.x;
      const ddz = nz - u.z;
      if (!u.dead && ddx * ddx + ddz * ddz < reachU2 && biteUnit(near - 1)) {
        state[i] = B_BITE;
        vx[i] = nvx * 0.1;
        vz[i] = nvz * 0.1;
        continue;
      }
    }
    if (next >= 0 && sw.plug[next]! > 0) {
      // Brecha tampada por robô: morde o robô.
      biteUnit(sw.plug[next]! - 1);
      state[i] = B_BITE;
      vx[i] = nvx * 0.1;
      vz[i] = nvz * 0.1;
      continue;
    }
    if (next >= 0 && blocked(sw, next)) {
      // Morde a muralha, o portão fechado ou o prédio. Só uns poucos cabem na frente de cada
      // célula; os de trás esperam (empurram, mas não fazem dano).
      state[i] = B_BITE;
      if (sw.biteTick[next] !== w.tick) {
        sw.biteTick[next] = w.tick;
        sw.biteN[next] = 0;
      }
      // Quem empurra conta para a pilha (só muralha e portão).
      if (terrain[next] === WALL || terrain[next] === GATE) {
        if (sw.pressTick[next] !== w.tick) {
          sw.pressTick[next] = w.tick;
          sw.pressN[next] = 0;
          if (sw.pile[next] === 0) sw.pileCells.push(next);
        }
        sw.pressN[next]!++;
      }
      const biting = sw.biteN[next]! < c.swarm.biteSlots;
      if (biting) sw.biteN[next]!++;
      if (terrain[next] === STRUCT) {
        const bid = sw.structOf[next]! - 1;
        crowdNow.set(bid, (crowdNow.get(bid) ?? 0) + 1);
        if (biting) damageBuilding(w, bid, c.swarm.biteWall * biteK * dt);
        vx[i] = nvx * 0.1;
        vz[i] = nvz * 0.1;
        continue;
      }
      wallHp[next] = wallHp[next]! - (biting ? c.swarm.biteWall * biteK * dt : 0);
      vx[i] = nvx * 0.1;
      vz[i] = nvz * 0.1;
      if (wallHp[next]! <= 0) {
        wallHp[next] = 0;
        terrain[next] = RUBBLE;
        sw.flowDirty = true;
        w.stats.breaches++;
        const cc = cellCenter(sw, next);
        w.events.push({ type: 'breach', x: cc.x, z: cc.z });
      }
    } else {
      state[i] = B_WALK;
      x[i] = nx;
      z[i] = nz;
      vx[i] = nvx;
      vz[i] = nvz;
    }
    if (nvx * nvx + nvz * nvz > 0.01) sw.heading[i] = Math.atan2(nvz, nvx);
  }

  sw.crowd = crowdNow;

  // 2b) pilhas: multidão parada numa célula de muralha sobe; sem multidão, desce.
  updatePiles(w, dt);

  // 3) dentro dos muros, inseto que encosta em trabalhador pega o trabalhador.
  const reach2 = c.swarm.reach * c.swarm.reach;
  for (const k of w.workers) {
    if (k.state === 'dead' || k.state === 'panic' || k.state === 'sheltered') continue;
    if (Math.abs(k.x) >= c.baseHalf - 1 || Math.abs(k.z) >= c.baseHalf - 1) continue;
    const cell = cellAt(sw, k.x, k.z);
    if (cell < 0) continue;
    const ci = cell % size;
    const cj = (cell / size) | 0;
    let hit = false;
    for (let oz = -1; oz <= 1 && !hit; oz++)
      for (let ox = -1; ox <= 1 && !hit; ox++) {
        const nc = (cj + oz) * size + ci + ox;
        const b = cellStart[nc]!;
        const e = b + cellCount[nc]!;
        for (let q = b; q < e; q++) {
          const j = sorted[q]!;
          if (state[j] !== B_WALK && state[j] !== B_BITE) continue;
          const dx = k.x - x[j]!;
          const dz = k.z - z[j]!;
          if (dx * dx + dz * dz < reach2) {
            hit = true;
            break;
          }
        }
      }
    if (hit) {
      w.stats.insideDeaths++;
      killWorker(k);
    }
  }

  // 4) torres: hash grosso (8 m) e re-mira escalonada (4 vezes por segundo cada).
  const { coarseN, coarseCount, coarseStart, coarseSorted, agentCoarse } = sw;
  coarseCount.fill(0);
  for (let i = 0; i < n; i++) {
    if (state[i] !== B_WALK && state[i] !== B_BITE) {
      agentCoarse[i] = -1;
      continue;
    }
    let ci = Math.floor((x[i]! + half) / COARSE);
    let cj = Math.floor((z[i]! + half) / COARSE);
    ci = ci < 0 ? 0 : ci >= coarseN ? coarseN - 1 : ci;
    cj = cj < 0 ? 0 : cj >= coarseN ? coarseN - 1 : cj;
    const cc = cj * coarseN + ci;
    agentCoarse[i] = cc;
    coarseCount[cc]!++;
  }
  s = 0;
  for (let k = 0; k < coarseN * coarseN; k++) {
    coarseStart[k] = s;
    s += coarseCount[k]!;
    coarseCount[k] = 0;
  }
  for (let i = 0; i < n; i++) {
    const cc = agentCoarse[i]!;
    if (cc < 0) continue;
    coarseSorted[coarseStart[cc]! + coarseCount[cc]!] = i;
    coarseCount[cc]!++;
  }
  const every = Math.max(1, Math.round(c.ticksPerSecond / 4));
  const kill = (j: number) => {
    state[j] = B_DYING;
    sw.timer[j] = 0;
    sw.alive--;
    w.stats.kills++;
  };
  /** Mira e tiro em hitscan; serve para torre, soldado e robô. */
  const fire = (sh: Tower | Unit, key: number, range: number, dps: number, splash: number) => {
    const range2 = range * range;
    let tg = sh.target;
    if (tg >= 0) {
      const dx = x[tg]! - sh.x;
      const dz = z[tg]! - sh.z;
      if ((state[tg] !== B_WALK && state[tg] !== B_BITE) || dx * dx + dz * dz > range2) tg = -1;
    }
    if (tg < 0 || (w.tick + key) % every === 0) {
      let best = -1;
      let bd = range2;
      let budget = 600;
      const x0 = Math.max(0, Math.floor((sh.x - range + half) / COARSE));
      const x1 = Math.min(coarseN - 1, Math.floor((sh.x + range + half) / COARSE));
      const z0 = Math.max(0, Math.floor((sh.z - range + half) / COARSE));
      const z1 = Math.min(coarseN - 1, Math.floor((sh.z + range + half) / COARSE));
      scan: for (let cj = z0; cj <= z1; cj++)
        for (let ci = x0; ci <= x1; ci++) {
          const cc = cj * coarseN + ci;
          const b = coarseStart[cc]!;
          const e = b + coarseCount[cc]!;
          for (let q = b; q < e; q++) {
            const j = coarseSorted[q]!;
            if (state[j] !== B_WALK && state[j] !== B_BITE) continue;
            const dx = x[j]! - sh.x;
            const dz = z[j]! - sh.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bd) {
              bd = d2;
              best = j;
            }
            if (--budget <= 0) break scan;
          }
        }
      tg = best;
    }
    sh.target = tg;
    if (tg < 0) return;
    const txx = x[tg]!;
    const tzz = z[tg]!;
    sh.tx = txx;
    sh.tz = tzz;
    hp[tg] = hp[tg]! - dps * dt;
    if (hp[tg]! <= 0) {
      kill(tg);
      sh.target = -1;
    }
    if (splash > 0) {
      // Respingo: metade do dano em quem está perto do alvo (hash fino do começo do tick).
      const s2 = splash * splash;
      const tc = cellAt(sw, txx, tzz);
      if (tc < 0) return;
      const ci = tc % size;
      const cj = (tc / size) | 0;
      for (let oz = -2; oz <= 2; oz++)
        for (let ox = -2; ox <= 2; ox++) {
          const ii = ci + ox;
          const jj = cj + oz;
          if (ii < 0 || jj < 0 || ii >= size || jj >= size) continue;
          const nc = jj * size + ii;
          const b = cellStart[nc]!;
          const e = b + cellCount[nc]!;
          for (let q = b; q < e; q++) {
            const j = sorted[q]!;
            if (j === tg || (state[j] !== B_WALK && state[j] !== B_BITE)) continue;
            const dx = x[j]! - txx;
            const dz = z[j]! - tzz;
            if (dx * dx + dz * dz > s2) continue;
            hp[j] = hp[j]! - dps * 0.5 * dt;
            if (hp[j]! <= 0) kill(j);
          }
        }
    }
  };
  for (const tw of w.towers) {
    if (!tw.built || !tw.powered) continue;
    const ts = towerStats(w, tw);
    fire(tw, tw.slot, ts.range, ts.dps, ts.splash);
  }
  const stats = { soldado: unitStats(w, 'soldado'), atirador: unitStats(w, 'atirador'), robo: unitStats(w, 'robo') };
  const forts = new Map<number, { dmg: number; range: number }>();
  for (const b of w.buildings) if (b.kind === 'fortim') forts.set(b.id, fortStats(w, b));
  for (const u of w.units) {
    if (u.dead) {
      u.target = -1;
      continue;
    }
    const us = stats[u.kind];
    const f = u.inside >= 0 ? forts.get(u.inside) : undefined;
    if (f) fire(u, u.id + 3, us.range + f.range, us.dps * (1 + f.dmg), us.splash);
    else fire(u, u.id + 3, us.range, us.dps, us.splash);
  }
}
