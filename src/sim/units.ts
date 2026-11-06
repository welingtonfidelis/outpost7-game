/**
 * Etapa 6: soldados e robôs (GDD §4, recrutamento militar).
 * Soldados se dividem entre os portões por padrão; robôs procuram brechas e ficam parados
 * nelas (o enxame trata a brecha tampada como muralha com o HP do robô). Um ponto de
 * reunião dado pelo jogador substitui o automático. Movimento só com + - * / e sqrt.
 */
import { stepForts } from './fort.ts';
import { doorOf, producerOf, spawnUnit, unitCap, unitLoad, unlocked } from './production.ts';
import { cellAt, cellCenter, RUBBLE } from './swarm.ts';
import type { UnitKind, Vec, World } from './types.ts';
import { dist } from './world.ts';
import { moveAlong, routeTo } from './workers.ts';

/** Formação fixa (sem trigonometria): centro, cruz, diagonais, anel de fora. */
const FORMATION: [number, number][] = [
  [0, 0],
  [1.4, 0],
  [-1.4, 0],
  [0, 1.4],
  [0, -1.4],
  [1.4, 1.4],
  [-1.4, -1.4],
  [1.4, -1.4],
  [-1.4, 1.4],
  [2.8, 0],
  [-2.8, 0],
  [0, 2.8],
  [0, -2.8],
  [2.8, 1.4],
  [-2.8, -1.4],
  [1.4, 2.8],
];

const SIDES: Vec[] = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];

export function aliveUnits(w: Pick<World, 'units'>, kind: UnitKind): number {
  return w.units.filter((u) => u.kind === kind && !u.dead).length;
}

/** Recrutar na hora (bots e testes): exige o prédio certo e respeita o limite por prédio. */
export function canRecruitUnit(w: Pick<World, 'units' | 'ore' | 'cfg' | 'lost' | 'buildings'>, kind: UnitKind): boolean {
  if (w.lost || !unlocked(w, kind)) return false;
  return w.ore >= w.cfg.units[kind].cost && unitLoad(w, kind) < unitCap(w, kind);
}

export function recruitUnit(w: World, kind: UnitKind): boolean {
  if (!canRecruitUnit(w, kind)) return false;
  w.ore -= w.cfg.units[kind].cost;
  const b = w.buildings.find((x) => x.kind === producerOf(kind));
  const d = b ? doorOf(b) : { x: 0, z: 2 };
  spawnUnit(w, kind, d.x, d.z);
  return true;
}

function clampToMap(w: World, p: Vec): Vec {
  const lim = w.cfg.swarm.grid / 2 - 4;
  return { x: Math.max(-lim, Math.min(lim, p.x)), z: Math.max(-lim, Math.min(lim, p.z)) };
}

/** Ponto de reunião de um grupo inteiro (bots e testes). Tira as ordens individuais do grupo. */
export function setRally(w: World, kind: UnitKind, p: Vec | null): void {
  w.rally[kind] = p ? clampToMap(w, p) : null;
  const infantry = kind !== 'robo';
  for (const u of w.units)
    if ((u.kind !== 'robo') === infantry && u.inside < 0) {
      u.order = null;
      u.enter = -1;
    }
}

/**
 * Casas da formação de uma ordem, do centro para fora em anéis quadrados (sem
 * trigonometria). Dá para 169 unidades sem repetir casa.
 */
const SLOTS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let r = 0; r <= 6; r++) {
    const ring: [number, number][] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r) ring.push([dx, dz]);
    // Primeiro as casas da cruz, depois as que se afastam dela (fica mais redondo).
    ring.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])) || a[1] - b[1] || a[0] - b[0]);
    out.push(...ring);
  }
  return out;
})();

const KIND_ORDER: Record<UnitKind, number> = { robo: 0, soldado: 1, atirador: 2 };

/**
 * Ordem do jogador para as unidades escolhidas: vão em formação para `p`. Com robôs e
 * infantaria juntos, os robôs ficam na frente (do lado de fora, longe do centro da base) e a
 * infantaria logo atrás. `p` nulo devolve as unidades ao automático.
 * Devolve quantas unidades receberam a ordem.
 */
export function orderUnits(w: World, ids: number[], p: Vec | null): number {
  const want = new Set(ids);
  // Quem está dentro de um fortim fica lá (sai pelo painel do fortim).
  const picked = w.units.filter((u) => want.has(u.id) && !u.dead && u.inside < 0).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id - b.id);
  for (const u of picked) u.enter = -1;
  if (!p) {
    for (const u of picked) u.order = null;
    return picked.length;
  }
  const c = clampToMap(w, p);
  const robots = picked.filter((u) => u.kind === 'robo');
  const infantry = picked.filter((u) => u.kind !== 'robo');
  // Para onde é "a frente": do centro da base para o ponto.
  const len = Math.sqrt(c.x * c.x + c.z * c.z);
  const fx = len > 1 ? c.x / len : 0;
  const fz = len > 1 ? c.z / len : 1;
  const ringOf = (n: number) => (n <= 1 ? 0 : n <= 9 ? 1 : n <= 25 ? 2 : n <= 49 ? 3 : 4);
  const shift = robots.length && infantry.length ? ringOf(infantry.length) * 1.4 + ringOf(robots.length) * 2.2 + 2.4 : 0;
  robots.forEach((u, i) => {
    const s = SLOTS[i % SLOTS.length]!;
    u.order = clampToMap(w, { x: c.x + fx * shift + s[0] * 2.2, z: c.z + fz * shift + s[1] * 2.2 });
  });
  infantry.forEach((u, i) => {
    const s = SLOTS[i % SLOTS.length]!;
    u.order = clampToMap(w, { x: c.x + s[0] * 1.4, z: c.z + s[1] * 1.4 });
  });
  return picked.length;
}

/** "Parar": cada unidade escolhida fica onde está. */
export function holdUnits(w: World, ids: number[]): number {
  const want = new Set(ids);
  let n = 0;
  for (const u of w.units) {
    if (!want.has(u.id) || u.dead || u.inside >= 0) continue;
    u.enter = -1;
    u.order = { x: u.x, z: u.z };
    n++;
  }
  return n;
}

/** Raio (em células) do tampão de um robô: 5×5 em volta dele. */
const PLUG_R = 2;

/**
 * Células de entulho da camada de dentro da muralha (por ali o enxame entra), com quantas
 * outras de entulho há em volta: o robô prefere o meio da brecha.
 */
export function openBreaches(w: World): (Vec & { weight: number })[] {
  const sw = w.swarm;
  const h = w.cfg.baseHalf;
  const out: (Vec & { weight: number })[] = [];
  for (const c of sw.wallIdx) {
    if (sw.terrain[c] !== RUBBLE) continue;
    const p = cellCenter(sw, c);
    if (Math.max(Math.abs(p.x), Math.abs(p.z)) >= h) continue;
    let weight = 0;
    for (let oz = -PLUG_R; oz <= PLUG_R; oz++)
      for (let ox = -PLUG_R; ox <= PLUG_R; ox++) if (sw.terrain[c + oz * sw.size + ox] === RUBBLE) weight++;
    out.push({ x: p.x, z: p.z, weight });
  }
  return out;
}

/** Onde cada unidade deveria estar agora. */
function goals(w: World): Map<number, Vec> {
  const out = new Map<number, Vec>();
  const h = w.cfg.baseHalf;
  // Quem tem ordem do jogador vai para ela; o resto se divide no automático.
  for (const u of w.units) if (u.order && !u.dead) out.set(u.id, u.order);
  const free = (u: (typeof w.units)[number]) => !u.dead && !u.order && u.inside < 0;
  // Infantaria: soldados na frente e atiradores logo atrás, juntos no mesmo ponto.
  const soldiers = w.units.filter((u) => u.kind !== 'robo' && free(u)).sort((a, b) => (a.kind === b.kind ? a.id - b.id : a.kind === 'soldado' ? -1 : 1));
  const robots = w.units.filter((u) => u.kind === 'robo' && free(u));
  const rs = w.rally.soldado;
  soldiers.forEach((u, i) => {
    const f = FORMATION[i % FORMATION.length]!;
    if (rs) {
      out.set(u.id, { x: rs.x + f[0], z: rs.z + f[1] });
      return;
    }
    // Automático: um portão por vez, fileira ao longo da muralha, por dentro.
    const s = SIDES[i % 4]!;
    const j = Math.floor(i / 4);
    const along = [0, 1.4, -1.4, 2.8][j % 4]!;
    const depth = h - 2.5 - Math.floor(j / 4) * 1.3 - (u.kind === 'atirador' ? 1.5 : 0);
    out.set(u.id, { x: s.x * depth + s.z * along, z: s.z * depth + s.x * along });
  });
  const rr = w.rally.robo;
  if (rr) {
    robots.forEach((u, i) => {
      const f = FORMATION[i % FORMATION.length]!;
      out.set(u.id, { x: rr.x + f[0] * 1.8, z: rr.z + f[1] * 1.8 });
    });
  } else {
    // Automático: cada robô no meio da brecha livre que mais rende (mais entulho em volta),
    // desempatando pela distância (na ordem dos robôs).
    const open = openBreaches(w);
    const taken: Vec[] = [];
    robots.forEach((u, i) => {
      let best = -1;
      let bs = -Infinity;
      open.forEach((b, k) => {
        if (taken.some((t) => dist(t.x, t.z, b.x, b.z) < PLUG_R * 2 + 0.5)) return;
        const score = b.weight * 100 - dist(u.x, u.z, b.x, b.z);
        if (score > bs) {
          bs = score;
          best = k;
        }
      });
      if (best >= 0) {
        const b = open[best]!;
        taken.push(b);
        out.set(u.id, { x: b.x, z: b.z });
      } else {
        const f = FORMATION[(i + 5) % FORMATION.length]!;
        out.set(u.id, { x: f[0] * 2.2, z: 4 + f[1] * 1.2 });
      }
    });
  }
  return out;
}

export function stepUnits(w: World, dt: number): void {
  if (!w.units.length) return;
  stepForts(w);
  const g = goals(w);
  for (const u of w.units) {
    u.px = u.x;
    u.pz = u.z;
    if (u.dead || u.inside >= 0) continue;
    const goal = g.get(u.id);
    if (goal && dist(goal.x, goal.z, u.goal.x, u.goal.z) > 0.3) {
      u.goal = goal;
      u.route = routeTo(w, u.x, u.z, goal);
    }
    moveAlong(u, w.cfg.units[u.kind].speed * dt);
  }
}

/**
 * Robôs parados tampam as aberturas em volta (5×5 células de entulho ou portão).
 * Devolve a lista de células tampadas, com o índice do robô em `plug`.
 */
export function plugCells(w: World, plug: Int16Array, plugHp: Float32Array): number[] {
  const sw = w.swarm;
  const out: number[] = [];
  w.units.forEach((u, idx) => {
    if (u.kind !== 'robo' || u.dead || u.route.length) return;
    const c = cellAt(sw, u.x, u.z);
    if (c < 0) return;
    for (let oz = -PLUG_R; oz <= PLUG_R; oz++)
      for (let ox = -PLUG_R; ox <= PLUG_R; ox++) {
        const n = c + oz * sw.size + ox;
        const t = sw.terrain[n]!;
        if (t !== RUBBLE && !(sw.gateOf[n]! >= 0)) continue;
        if (plug[n]) continue;
        plug[n] = idx + 1;
        plugHp[n] = u.hp;
        out.push(n);
      }
  });
  return out;
}
