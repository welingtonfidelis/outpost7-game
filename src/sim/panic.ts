/**
 * Fator Pânico (GDD §3): quando a horda cruza o perímetro externo, cada trabalhador que ficou
 * fora rola uma vez. A chance sai da geometria real (distância até o portão mais perto e
 * velocidade de fuga contra o tempo até o portão fechar). Depois o resultado só é animado:
 * quem foi salvo corre e se joga no portão; quem não foi é pego no caminho.
 */
import { doorOf } from './build.ts';
import { findPath } from './path.ts';
import { hash01 } from './rng.ts';
import type { Worker, World } from './types.ts';
import { dist, insideBase, now } from './world.ts';

type Ctx = Pick<World, 'cfg' | 'morale' | 'gates'> & Partial<Pick<World, 'buildings' | 'workers'>>;

export function effectiveSpeed(w: Pick<World, 'cfg' | 'morale'>, k: Worker): number {
  const c = w.cfg;
  let v = k.speed;
  if (k.cargo > 0) v *= c.carrySlow;
  if (k.wounded > 0) v *= c.woundSlow;
  if (w.morale < c.morale.lowAt) v *= c.morale.lowSpeed;
  return v;
}

export function nearestGate(w: Pick<World, 'gates'>, x: number, z: number): { gate: number; d: number } {
  let gate = 0;
  let d = Infinity;
  w.gates.forEach((g, i) => {
    const dd = dist(x, z, g.outer.x, g.outer.z);
    if (dd < d) {
      d = dd;
      gate = i;
    }
  });
  return { gate, d };
}

/**
 * Etapa 17: o refúgio mais perto, entre o portão (até passar por ele) e os fortins prontos com
 * vaga de abrigo (até a porta). `reserved`: vagas já prometidas nesta rolagem.
 */
export function nearestRefuge(w: Ctx, k: Pick<Worker, 'x' | 'z'>, reserved?: Map<number, number>): { fort: number; gate: number; d: number } {
  const { gate, d: dg } = nearestGate(w, k.x, k.z);
  const g = w.gates[0]!;
  let best = { fort: -1, gate, d: dg + dist(g.outer.x, g.outer.z, g.inner.x, g.inner.z) };
  if (!w.buildings || !w.workers) return best;
  for (const b of w.buildings) {
    if (b.kind !== 'fortim' || b.buildLeft > 0) continue;
    let used = reserved?.get(b.id) ?? 0;
    for (const o of w.workers) if (o.fort === b.id && o.state === 'sheltered') used++;
    if (used >= w.cfg.build.fortim.shelter) continue;
    const dd = dist(k.x, k.z, doorOf(b).x, doorOf(b).z);
    if (dd < best.d) best = { fort: b.id, gate, d: dd };
  }
  return best;
}

/** Tempo de corrida em disparada até o refúgio mais perto (s). */
export function runTime(w: Ctx, k: Worker): number {
  return nearestRefuge(w, k).d / (effectiveSpeed(w, k) * w.cfg.sprint);
}

/** A fórmula do pânico para um tempo de disparada até o portão. */
function chanceFromRun(w: Ctx, k: Worker, tRun: number): number {
  const p = w.cfg.panic;
  if (tRun > w.cfg.gateGrace + w.cfg.gateMaxHold) return 0;
  const chance = p.base + (w.cfg.gateGrace - tRun) * p.perSecond + (k.speed - 3) * p.perSpeed;
  return Math.min(p.max, Math.max(p.min, chance));
}

/** Chance de se salvar se a horda cruzasse o perímetro agora (0 a 1). */
export function survivalChance(w: Ctx, k: Worker): number {
  if (k.state === 'dead') return 0;
  if (isSafe(w.cfg, k)) return 1;
  return chanceFromRun(w, k, runTime(w, k));
}

/** Distância (m) até passar o portão mais perto. */
function toSafety(w: Pick<World, 'gates'>, k: Worker): number {
  const { d } = nearestGate(w, k.x, k.z);
  const g = w.gates[0]!;
  return d + dist(g.outer.x, g.outer.z, g.inner.x, g.inner.z);
}

/** Etapa 16: quanto leva para passar o portão andando, se for chamado agora (s; 0 se já está dentro ou abrigado). */
export function returnTime(w: Ctx, k: Worker): number {
  if (k.state === 'dead' || k.state === 'sheltered' || insideBase(w.cfg, k.x, k.z)) return 0;
  return toSafety(w, k) / effectiveSpeed(w, k);
}

/** Está a salvo (dentro dos muros ou abrigado num fortim)? */
export function isSafe(cfg: World['cfg'], k: Pick<Worker, 'x' | 'z' | 'state'>): boolean {
  return k.state === 'sheltered' || insideBase(cfg, k.x, k.z);
}

/** Quanto falta para a horda cruzar o perímetro (s; 0 depois disso). */
export function timeLeft(w: Pick<World, 'times' | 'tick' | 'cfg' | 'phase'>): number {
  if (w.phase !== 'calm' && w.phase !== 'warning') return 0;
  return Math.max(0, w.times.arrive - w.tick / w.cfg.ticksPerSecond);
}

/**
 * Chance na rolagem se for chamado agora: anda o que der até a horda chegar e depois dispara
 * o resto. 1 se chega a tempo.
 */
export function projectedChance(w: Ctx & Pick<World, 'times' | 'tick' | 'phase'>, k: Worker): number {
  if (k.state === 'dead') return 0;
  if (isSafe(w.cfg, k)) return 1;
  const left = timeLeft(w);
  const v = effectiveSpeed(w, k);
  // Anda para casa até a horda chegar; dali corre para o refúgio mais perto (portão ou fortim).
  const home = toSafety(w, k);
  if (home - v * left <= 0) return 1;
  const f = home > 0 ? Math.min(1, (v * left) / home) : 1;
  const g = nearestGate(w, k.x, k.z);
  const ahead = { x: k.x + (w.gates[g.gate]!.outer.x - k.x) * f, z: k.z + (w.gates[g.gate]!.outer.z - k.z) * f };
  const rest = Math.min(home - v * left, nearestRefuge(w, ahead).d);
  return chanceFromRun(w, k, rest / (v * w.cfg.sprint));
}

/** Está fora e precisa de mais tempo que o que falta menos `margin` s? */
export function atRisk(w: Ctx & Pick<World, 'times' | 'tick' | 'phase'>, k: Worker, margin: number): boolean {
  if (k.state === 'dead' || k.state === 'panic' || isSafe(w.cfg, k)) return false;
  return returnTime(w, k) > timeLeft(w) - margin;
}

export function resolvePanic(w: World): void {
  const t = now(w);
  const c = w.cfg;
  const reserved = new Map<number, number>();
  for (const k of w.workers) {
    if (k.state === 'dead' || isSafe(c, k)) continue;
    w.stats.outsideAtArrive++;
    // Refúgio mais perto: portão ou fortim com vaga (Etapa 17).
    const ref = nearestRefuge(w, k, reserved);
    const tRun = ref.d / (effectiveSpeed(w, k) * c.sprint);
    const chance = chanceFromRun(w, k, tRun);
    const r = hash01(w.seed, w.wave, k.id, 1);
    let outcome: 'limpo' | 'sem-carga' | 'ferido' | 'devorado';
    if (r < chance) {
      const r2 = hash01(w.seed, w.wave, k.id, 2);
      outcome = r2 < c.panic.clean ? 'limpo' : r2 < c.panic.clean + c.panic.dropped ? 'sem-carga' : 'ferido';
    } else {
      outcome = 'devorado';
    }
    const gate = ref.gate;
    const g = w.gates[gate]!;
    const catchAt = outcome === 'devorado' ? t + 0.8 + hash01(w.seed, w.wave, k.id, 3) * Math.min(3, tRun * 0.6) : 0;
    if (outcome === 'sem-carga' && k.cargo > 0) {
      w.stats.cargoLost += k.cargo;
      k.cargo = 0;
    }
    let to = g.inner;
    if (ref.fort >= 0) {
      reserved.set(ref.fort, (reserved.get(ref.fort) ?? 0) + 1);
      const b = w.buildings.find((x) => x.id === ref.fort)!;
      to = doorOf(b);
    } else if (outcome !== 'devorado') {
      // Os guardas seguram o portão para quem ainda está chegando, até um limite.
      const arrival = t + tRun + 0.4;
      if (arrival > g.closeAt) g.closeAt = Math.min(arrival, w.times.gatesClose + c.gateMaxHold);
    }
    k.state = 'panic';
    k.node = -1;
    k.timer = 0;
    k.route = findPath(w, k.x, k.z, to.x, to.z);
    k.panic = { outcome, chance, gate, catchAt, fort: ref.fort };
    w.events.push({ type: 'panic', worker: k.id, name: k.name, outcome, chance });
  }
}
