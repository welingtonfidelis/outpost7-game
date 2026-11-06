/**
 * Etapa 7: construção da base (GDD §4). Muralhas e portões traçados, torres, geradores,
 * refinarias e fábricas em qualquer lugar livre até `build.radius` do centro. Tudo na grade
 * de 1 m do enxame: prédio é célula STRUCT com HP (o campo cobra pelo HP), muralha e portão
 * do jogador são células WALL/GATE como as do posto.
 */
import type { BuildingConfig } from './config.ts';
import { findPath } from './path.ts';
import { DEPOT } from './world.ts';
import { CORE, FREE, GATE, PLAYER_GATE, RUBBLE, STRUCT, WALL, cellAt, cellCenter } from './swarm.ts';
import type { Building, BuildingKind, World } from './types.ts';

export type WallKind = 'muralha' | 'portao';

export function buildingConfig(w: Pick<World, 'cfg'>, kind: BuildingKind): BuildingConfig {
  return w.cfg.build[kind];
}

/** Onde um prédio de lado `size` com centro perto de (x, z) ocupa (canto arredondado para a grade). */
export function footprint(w: World, size: number, x: number, z: number): number[] {
  const sw = w.swarm;
  const x0 = Math.round(x - size / 2);
  const z0 = Math.round(z - size / 2);
  const out: number[] = [];
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const c = cellAt(sw, x0 + i + 0.5, z0 + j + 0.5);
      if (c < 0) return [];
      out.push(c);
    }
  return out;
}

/** A célula aceita construção? (livre, dentro do raio, longe do núcleo e dos nós de recurso) */
/** Até onde (m do centro) se constrói este tipo: o fortim vai longe (posto avançado, Etapa 17). */
export function buildReach(cfg: World['cfg'], kind?: string): number {
  return kind === 'fortim' ? cfg.build.fortim.reach : cfg.build.radius;
}

export function cellBuildable(w: World, c: number, reach = w.cfg.build.radius): boolean {
  const sw = w.swarm;
  if (sw.terrain[c] !== FREE) return false;
  const p = cellCenter(sw, c);
  const r = reach;
  if (p.x * p.x + p.z * p.z > r * r) return false;
  if (Math.max(Math.abs(p.x), Math.abs(p.z)) < 3.5) return false;
  for (const n of w.nodes) {
    const dx = p.x - n.x;
    const dz = p.z - n.z;
    if (dx * dx + dz * dz < 2.5 * 2.5 && n.stock > 0) return false;
  }
  return true;
}

export function canPlace(w: World, kind: BuildingKind, x: number, z: number): { ok: boolean; reason: string; cells: number[] } {
  const bc = buildingConfig(w, kind);
  if (w.lost) return { ok: false, reason: 'A colônia caiu.', cells: [] };
  if (kind === 'refinaria' && w.buildings.filter((b) => b.kind === 'refinaria').length >= w.cfg.build.refinaria.max)
    return { ok: false, reason: `No máximo ${w.cfg.build.refinaria.max} refinarias.`, cells: [] };
  const cells = footprint(w, bc.size, x, z);
  if (!cells.length) return { ok: false, reason: 'Fora do mapa.', cells };
  if (!cells.every((c) => cellBuildable(w, c, buildReach(w.cfg, kind)))) return { ok: false, reason: 'Não cabe aí.', cells };
  if (w.ore < bc.cost) return { ok: false, reason: 'Falta minério.', cells };
  return { ok: true, reason: '', cells };
}

export function placeBuilding(w: World, kind: BuildingKind, x: number, z: number): Building | null {
  const chk = canPlace(w, kind, x, z);
  if (!chk.ok) {
    w.events.push({ type: 'buildFail', reason: chk.reason });
    return null;
  }
  const bc = buildingConfig(w, kind);
  const sw = w.swarm;
  const id = w.nextBuildId++;
  const p0 = cellCenter(sw, chk.cells[0]!);
  const b: Building = {
    id,
    kind,
    x: p0.x - 0.5 + bc.size / 2,
    z: p0.z - 0.5 + bc.size / 2,
    size: bc.size,
    hp: bc.hp,
    cells: chk.cells,
    level: 1,
    upgradeLeft: 0,
    queue: [],
    trainLeft: 0,
    buildLeft: bc.time,
  };
  for (const c of b.cells) {
    sw.terrain[c] = STRUCT;
    sw.structOf[c] = id + 1;
    sw.wallHp[c] = b.hp;
  }
  w.buildings.push(b);
  w.ore -= bc.cost;
  if (kind === 'torre')
    w.towers.push({ slot: 100 + id, buildingId: id, powered: false, level: 1, upgradeLeft: 0, x: b.x, z: b.z, built: true, target: -1, tx: 0, tz: 0 });
  sw.flowDirty = true;
  updateEnergy(w);
  w.events.push({ type: 'built', kind, cells: b.cells.length });
  return b;
}

/** Porta do prédio (lado +x, um pouco para fora). */
export function doorOf(b: Building): { x: number; z: number } {
  return { x: b.x + b.size / 2 + 1.2, z: b.z };
}

/** Casas em volta de um ponto para quem sai do fortim (sem trigonometria). */
const EXIT_SPOTS: [number, number][] = [
  [0, 0],
  [0, 1.2],
  [0, -1.2],
  [1.2, 0],
  [1.2, 1.2],
  [1.2, -1.2],
  [0, 2.4],
  [0, -2.4],
  [2.4, 0],
  [2.4, 1.2],
  [2.4, -1.2],
  [1.2, 2.4],
];

/**
 * Tira todo mundo do fortim. Saída normal: na porta, paradas ali. Fortim derrubado: no
 * entulho, feridas, de volta ao automático. Quem estava a caminho desiste.
 */
export function ejectFort(w: World, b: Building, fell: boolean): number {
  const d = fell ? { x: b.x, z: b.z } : doorOf(b);
  let k = 0;
  for (const u of w.units) {
    if (u.enter === b.id) {
      u.enter = -1;
      if (fell) u.order = null;
    }
    if (u.inside !== b.id || u.dead) continue;
    const s = EXIT_SPOTS[k % EXIT_SPOTS.length]!;
    k++;
    u.inside = -1;
    u.x = u.px = d.x + (fell ? s[0] - 1.2 : s[0]);
    u.z = u.pz = d.z + s[1];
    u.route = [];
    u.goal = { x: u.x, z: u.z };
    u.target = -1;
    if (fell) {
      u.hp = Math.max(1, u.hp * (1 - w.cfg.build.fortFall));
      u.order = null;
    } else u.order = { x: u.x, z: u.z };
  }
  return k;
}

function removeBuilding(w: World, b: Building, asRubble: boolean): void {
  if (b.kind === 'fortim') {
    ejectFort(w, b, asRubble);
    // Trabalhadores abrigados: com o fortim derrubado, o enxame os pega; demolido, saem e voltam.
    const t = w.tick / w.cfg.ticksPerSecond;
    for (const k of w.workers) {
      if (k.fort !== b.id || k.state !== 'sheltered') continue;
      k.fort = -1;
      const d = doorOf(b);
      k.x = k.px = d.x;
      k.z = k.pz = d.z;
      if (asRubble) {
        k.state = 'panic';
        k.route = [];
        k.panic = { outcome: 'devorado', chance: 0, gate: 0, catchAt: t, fort: -1 };
      } else {
        k.state = 'returning';
        k.timer = 0;
        k.route = findPath(w, k.x, k.z, DEPOT.x, DEPOT.z);
      }
    }
  }
  const sw = w.swarm;
  for (const c of b.cells) {
    sw.terrain[c] = asRubble ? RUBBLE : FREE;
    sw.structOf[c] = 0;
    sw.wallHp[c] = 0;
  }
  w.buildings = w.buildings.filter((x) => x.id !== b.id);
  if (b.kind === 'torre') w.towers = w.towers.filter((t) => t.buildingId !== b.id);
  sw.flowDirty = true;
  updateEnergy(w);
}

/** Mordida num prédio: o HP é do prédio inteiro (todas as células espelham para o campo). */
export function damageBuilding(w: World, id: number, dmg: number): void {
  const b = w.buildings.find((x) => x.id === id);
  if (!b) return;
  // Fortim fora da fortaleza (posto avançado) é blindado.
  if (b.kind === 'fortim' && Math.max(Math.abs(b.x), Math.abs(b.z)) >= w.cfg.baseHalf) dmg *= 1 - w.cfg.build.fortim.armor;
  b.hp -= dmg;
  const sw = w.swarm;
  if (b.hp <= 0) {
    const inside = w.units.filter((u) => !u.dead && u.inside === b.id).length;
    removeBuilding(w, b, true);
    w.events.push({ type: 'buildingDown', kind: b.kind, x: b.x, z: b.z, inside });
    return;
  }
  for (const c of b.cells) sw.wallHp[c] = b.hp;
  if (!b.hurt && b.hp < buildingConfig(w, b.kind).hp * 0.5) {
    b.hurt = true;
    w.events.push({ type: 'buildingHurt', kind: b.kind, x: b.x, z: b.z });
  }
}

/**
 * Células de uma linha 4-conectada de a até b (sem buracos na diagonal, que o enxame
 * atravessaria andando em 8 direções).
 */
export function lineCells(w: World, ax: number, az: number, bx: number, bz: number): number[] {
  return gridLine(w.swarm.size, ax, az, bx, bz);
}

/** Quanto custa e quais células uma linha de muralha ou portão ocuparia de verdade. */
export function planWall(w: World, kind: WallKind, ax: number, az: number, bx: number, bz: number): { cells: number[]; cost: number } {
  let cells = lineCells(w, ax, az, bx, bz).filter((c) => cellBuildable(w, c));
  if (kind === 'portao') cells = cells.slice(0, w.cfg.build.gate.maxLen);
  const per = kind === 'portao' ? w.cfg.build.gate.costPerCell : w.cfg.build.wall.costPerCell;
  return { cells, cost: cells.length * per };
}

export function buildWall(w: World, kind: WallKind, ax: number, az: number, bx: number, bz: number): number {
  if (w.lost) return 0;
  const { cells, cost } = planWall(w, kind, ax, az, bx, bz);
  if (!cells.length) {
    w.events.push({ type: 'buildFail', reason: 'Nada para construir aí.' });
    return 0;
  }
  if (w.ore < cost) {
    w.events.push({ type: 'buildFail', reason: `Falta minério (${cost}).` });
    return 0;
  }
  const sw = w.swarm;
  const gate = kind === 'portao';
  for (const c of cells) {
    sw.terrain[c] = gate ? GATE : WALL;
    sw.gateOf[c] = gate ? PLAYER_GATE : -1;
    sw.wallHp[c] = gate ? w.cfg.build.gate.hp : w.cfg.build.wall.hp;
    sw.wallIdx.push(c);
  }
  w.ore -= cost;
  sw.flowDirty = true;
  w.events.push({ type: 'built', kind, cells: cells.length });
  return cells.length;
}

/** Demolir no ponto: prédio inteiro, ou as células de muralha/portão do jogador num 3×3. */
export function demolish(w: World, x: number, z: number): number {
  const sw = w.swarm;
  const c = cellAt(sw, x, z);
  if (c < 0 || w.lost) return 0;
  let refund = 0;
  const id = sw.structOf[c]! - 1;
  if (id >= 0) {
    const b = w.buildings.find((q) => q.id === id);
    if (b) {
      refund = Math.floor(buildingConfig(w, b.kind).cost * w.cfg.build.refund);
      removeBuilding(w, b, false);
    }
  } else {
    const gone = new Set<number>();
    for (let oz = -1; oz <= 1; oz++)
      for (let ox = -1; ox <= 1; ox++) {
        const n = c + oz * sw.size + ox;
        if (n < 0 || n >= sw.terrain.length || sw.wallFixed[n]) continue;
        const t = sw.terrain[n]!;
        if (t !== WALL && t !== GATE && !(t === RUBBLE && sw.wallIdx.includes(n))) continue;
        const per = sw.gateOf[n] === PLAYER_GATE ? w.cfg.build.gate.costPerCell : w.cfg.build.wall.costPerCell;
        refund += per * w.cfg.build.refund;
        sw.terrain[n] = FREE;
        sw.gateOf[n] = -1;
        sw.wallHp[n] = 0;
        gone.add(n);
      }
    if (gone.size) sw.wallIdx = sw.wallIdx.filter((q) => !gone.has(q));
    refund = Math.floor(refund);
  }
  if (refund > 0 || id >= 0) {
    w.ore += refund;
    sw.flowDirty = true;
    w.events.push({ type: 'demolished', refund });
  }
  return refund;
}

/** Energia: núcleo + geradores contra torres. As torres mais antigas ficam com a energia. */
export function updateEnergy(w: World): void {
  const gens = w.buildings.filter((b) => b.kind === 'gerador' && b.buildLeft <= 0).length;
  const supply = w.cfg.build.coreEnergy + gens * w.cfg.build.gerador.energy;
  let left = supply;
  let demand = 0;
  for (const t of w.towers) {
    // Torre em obra não gasta nem atira.
    const ready = t.buildingId < 0 || (w.buildings.find((b) => b.id === t.buildingId)?.buildLeft ?? 0) <= 0;
    if (!ready) {
      t.powered = false;
      continue;
    }
    demand++;
    t.powered = left > 0;
    if (left > 0) left--;
  }
  w.energy = { supply, demand };
}

/** Prédio pronto (fora de obra)? */
export function isReady(b: Building): boolean {
  return b.buildLeft <= 0;
}

/** Testes e ferramentas: termina todas as obras na hora. */
export function finishConstruction(w: World): void {
  for (const b of w.buildings) b.buildLeft = 0;
  updateEnergy(w);
}

/** Bônus da refinaria em cada entrega (0 a 2 refinarias). */
export function refineryBonus(w: Pick<World, 'buildings' | 'cfg'>): number {
  const n = Math.min(w.cfg.build.refinaria.max, w.buildings.filter((b) => b.kind === 'refinaria' && b.buildLeft <= 0).length);
  return n * w.cfg.build.refinaria.bonus;
}

export function hasFactory(w: Pick<World, 'buildings'>): boolean {
  return w.buildings.some((b) => b.kind === 'fabrica' && b.buildLeft <= 0);
}

/** Vagas boas para torre fora da muralha, longe da frente dos portões (bots e testes). */
const AUTO_SPOTS: [number, number][] = [
  [-7, -16],
  [16, -7],
  [7, 16],
  [-16, 7],
  [7, -16],
  [16, 7],
  [-7, 16],
  [-16, -7],
];

/** Bots: põe a próxima torre numa vaga boa; se faltar energia, põe um gerador antes. */
export function autoTower(w: World): boolean {
  if (w.energy.demand >= w.energy.supply) {
    for (const [x, z] of AUTO_SPOTS) {
      const gx = x * 1.35;
      const gz = z * 1.35;
      if (canPlace(w, 'gerador', gx, gz).ok) return placeBuilding(w, 'gerador', gx, gz) !== null;
    }
    return false;
  }
  for (const [x, z] of AUTO_SPOTS) if (canPlace(w, 'torre', x, z).ok) return placeBuilding(w, 'torre', x, z) !== null;
  return false;
}

/** Ocupação vista da tela (para o fantasma ficar verde ou vermelho sem perguntar ao worker). */
export function terrainName(t: number): string {
  return t === FREE ? 'livre' : t === WALL ? 'muralha' : t === GATE ? 'portão' : t === RUBBLE ? 'entulho' : t === CORE ? 'núcleo' : 'prédio';
}

// ---------- vista da tela (sem a grade completa do worker) ----------

/** Linha 4-conectada só com a geometria da grade (a tela usa para o fantasma). */
export function gridLine(size: number, ax: number, az: number, bx: number, bz: number): number[] {
  const half = size / 2;
  let x = Math.floor(ax + half);
  let z = Math.floor(az + half);
  const x1 = Math.floor(bx + half);
  const z1 = Math.floor(bz + half);
  const dx = Math.abs(x1 - x);
  const dz = Math.abs(z1 - z);
  const sx = x < x1 ? 1 : -1;
  const sz = z < z1 ? 1 : -1;
  let err = dx - dz;
  const out: number[] = [];
  const add = (i: number, j: number) => {
    if (i >= 0 && j >= 0 && i < size && j < size) out.push(j * size + i);
  };
  add(x, z);
  let guard = 0;
  while ((x !== x1 || z !== z1) && guard++ < 2000) {
    const e2 = 2 * err;
    if (e2 > -dz) {
      err -= dz;
      x += sx;
      add(x, z);
    }
    if (e2 < dx) {
      err += dx;
      z += sz;
      add(x, z);
    }
  }
  return out;
}

/** Células que um prédio de lado `size` ocuparia, pela geometria (igual a footprint). */
export function gridFootprint(gridSize: number, size: number, x: number, z: number): number[] {
  const half = gridSize / 2;
  const x0 = Math.round(x - size / 2);
  const z0 = Math.round(z - size / 2);
  const out: number[] = [];
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const ci = Math.floor(x0 + i + 0.5 + half);
      const cj = Math.floor(z0 + j + 0.5 + half);
      if (ci < 0 || cj < 0 || ci >= gridSize || cj >= gridSize) return [];
      out.push(cj * gridSize + ci);
    }
  return out;
}

/** O que a tela sabe para pintar o fantasma: células ocupadas e nós de recurso. */
export interface BuildView {
  gridSize: number;
  cfg: World['cfg'];
  wallCells: Int32Array;
  buildings: Building[];
  nodes: World['nodes'];
}

export function viewOccupied(v: BuildView): Set<number> {
  const s = new Set<number>(v.wallCells);
  for (const b of v.buildings) for (const c of b.cells) s.add(c);
  return s;
}

export function viewBuildable(v: BuildView, occupied: Set<number>, c: number, reach = v.cfg.build.radius): boolean {
  if (occupied.has(c)) return false;
  const half = v.gridSize / 2;
  const x = (c % v.gridSize) - half + 0.5;
  const z = Math.floor(c / v.gridSize) - half + 0.5;
  const r = reach;
  if (x * x + z * z > r * r) return false;
  if (Math.max(Math.abs(x), Math.abs(z)) < 3.5) return false;
  for (const n of v.nodes) {
    const dx = x - n.x;
    const dz = z - n.z;
    if (dx * dx + dz * dz < 2.5 * 2.5 && n.stock > 0) return false;
  }
  return true;
}
