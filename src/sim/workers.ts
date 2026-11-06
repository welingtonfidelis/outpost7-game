/** Ciclo de vida do trabalhador (GDD §2): sai, coleta, volta, descarrega. */
import { refineryBonus } from './build.ts';
import { effectiveSpeed } from './panic.ts';
import { findPath } from './path.ts';
import type { Vec, Worker, World } from './types.ts';
import { DEPOT, dist, idleSpot, now } from './world.ts';

/** Caminho de pessoa até `to` (A* na grade, contornando muralhas e prédios, pelos portões). */
export function routeTo(w: World, fx: number, fz: number, to: Vec): Vec[] {
  return findPath(w, fx, fz, to.x, to.z);
}

/** Anda `step` metros pela rota. Devolve true quando a rota acabou. */
export function moveAlong(k: { x: number; z: number; route: Vec[] }, step: number): boolean {
  let left = step;
  while (left > 0 && k.route.length) {
    const p = k.route[0]!;
    const d = dist(k.x, k.z, p.x, p.z);
    if (d <= left) {
      k.x = p.x;
      k.z = p.z;
      k.route.shift();
      left -= d;
    } else {
      const f = left / d;
      k.x += (p.x - k.x) * f;
      k.z += (p.z - k.z) * f;
      left = 0;
    }
  }
  return k.route.length === 0;
}

export function canLeave(w: World): boolean {
  return (w.phase === 'calm' || w.phase === 'warning') && !w.alarm;
}

/** Escolhe o nó: anel do foco primeiro, o menos disputado, o mais perto da base. */
export function pickNode(w: World): number {
  const order = w.focus === 0 ? [0, 1, 2] : w.focus === 1 ? [1, 2, 0] : [2, 1, 0];
  const assigned = new Map<number, number>();
  for (const k of w.workers) {
    if (k.node >= 0 && (k.state === 'toNode' || k.state === 'gathering')) assigned.set(k.node, (assigned.get(k.node) ?? 0) + 1);
  }
  for (const ring of order) {
    let best = -1;
    let bestA = Infinity;
    let bestD = Infinity;
    for (const n of w.nodes) {
      if (n.ring !== ring) continue;
      const a = assigned.get(n.id) ?? 0;
      if (n.stock <= a * n.load) continue;
      const d = Math.sqrt(n.x * n.x + n.z * n.z);
      if (a < bestA || (a === bestA && d < bestD)) {
        best = n.id;
        bestA = a;
        bestD = d;
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

function sendHome(w: World, k: Worker): void {
  k.state = 'returning';
  k.timer = 0;
  k.node = -1;
  k.route = routeTo(w, k.x, k.z, DEPOT);
}

function deposit(w: World, k: Worker): void {
  if (k.cargo > 0) {
    // A refinaria rende mais em cada entrega (arredondado para inteiro).
    const amount = Math.round(k.cargo * (1 + refineryBonus(w)));
    w.ore += amount;
    w.oreTotal += amount;
    w.stats.delivered += amount;
    w.events.push({ type: 'deposit', worker: k.id, amount });
    k.cargo = 0;
  }
  k.state = 'inside';
  k.route = [idleSpot(k.id)];
}

export function die(w: World, k: Worker): void {
  const c = w.cfg;
  w.stats.devoured++;
  w.stats.cargoLost += k.cargo;
  w.events.push({ type: 'devoured', worker: k.id, name: k.name, x: k.x, z: k.z, cargo: k.cargo });
  k.cargo = 0;
  k.state = 'dead';
  k.route = [];
  k.diedAt = now(w);
  w.morale = Math.max(0, w.morale - c.morale.deathHit);
}

export function stepWorker(w: World, k: Worker, dt: number): void {
  k.px = k.x;
  k.pz = k.z;
  if (k.state === 'dead') return;
  if (k.wounded > 0) k.wounded = Math.max(0, k.wounded - dt);
  const c = w.cfg;
  switch (k.state) {
    case 'inside': {
      if (canLeave(w) && k.wounded <= 0 && !k.hold) {
        const n = pickNode(w);
        if (n >= 0) {
          const node = w.nodes[n]!;
          k.node = n;
          k.state = 'toNode';
          k.route = routeTo(w, k.x, k.z, node);
        }
      }
      moveAlong(k, effectiveSpeed(w, k) * dt);
      return;
    }
    case 'toNode': {
      if (!canLeave(w) || k.hold) return sendHome(w, k);
      if (moveAlong(k, effectiveSpeed(w, k) * dt)) {
        k.state = 'gathering';
        k.timer = c.gatherTime;
      }
      return;
    }
    case 'gathering': {
      if (!canLeave(w) || k.hold) return sendHome(w, k);
      k.timer -= dt;
      if (k.timer <= 0) {
        const node = w.nodes[k.node]!;
        const take = Math.min(node.load, node.stock);
        node.stock -= take;
        k.cargo = take;
        if (node.stock <= 0) w.events.push({ type: 'depleted', node: node.id });
        sendHome(w, k);
      }
      return;
    }
    case 'returning': {
      if (moveAlong(k, effectiveSpeed(w, k) * dt)) deposit(w, k);
      return;
    }
    case 'sheltered':
      // Abrigado no fortim: espera a onda acabar (o fim da onda manda para casa).
      return;
    case 'panic': {
      const p = k.panic!;
      if (p.outcome === 'devorado' && now(w) >= p.catchAt) return die(w, k);
      if (moveAlong(k, effectiveSpeed(w, k) * c.sprint * dt) && p.outcome !== 'devorado') {
        // Refúgio no fortim: se ele caiu antes de chegar, não há onde se esconder.
        const fort = p.fort >= 0 ? w.buildings.find((b) => b.id === p.fort) : undefined;
        if (p.fort >= 0 && !fort) return die(w, k);
        if (p.outcome === 'ferido') {
          k.wounded = c.woundRest;
          w.stats.wounded++;
        } else if (p.outcome === 'sem-carga') w.stats.dropped++;
        else w.stats.saved++;
        w.events.push({ type: 'saved', worker: k.id, name: k.name, outcome: p.outcome, fort: !!fort });
        k.panic = null;
        if (fort) {
          k.state = 'sheltered';
          k.fort = fort.id;
          k.x = k.px = fort.x;
          k.z = k.pz = fort.z;
          k.route = [];
          return;
        }
        sendHome(w, k);
      } else if (!k.route.length) {
        // Devorado que chegou ao portão antes da hora marcada: é pego ali mesmo.
        die(w, k);
      }
      return;
    }
  }
}
