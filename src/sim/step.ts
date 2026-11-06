/** Um tick da simulação (20 por segundo): fases da onda, trabalhadores e moral. */
import { resolvePanic } from './panic.ts';
import { clearWave, spawnWave, stepSwarm } from './swarm.ts';
import type { World } from './types.ts';
import { stepProduction, unitStats } from './production.ts';
import { stepUnits } from './units.ts';
import { die, routeTo, stepWorker } from './workers.ts';
import { DEPOT, emptyStats, now, renewResources, waveTimes } from './world.ts';
import { doorOf } from './build.ts';

/** Quando o último portão fecha nesta onda. */
export function lastGateClose(w: World): number {
  return Math.max(...w.gates.map((g) => g.closeAt));
}

/** O portão está passável agora? */
export function gateOpen(w: World, gate: number): boolean {
  if (w.phase === 'calm' || w.phase === 'warning') return true;
  return now(w) < w.gates[gate]!.closeAt;
}

function endWave(w: World): void {
  const end = now(w);
  clearWave(w);
  w.history.push(w.stats);
  w.events.push({ type: 'waveEnd', stats: w.stats });
  w.workers = w.workers.filter((k) => k.state !== 'dead');
  // Unidades: quem caiu sai; quem ficou volta com a vida cheia.
  w.units = w.units.filter((u) => !u.dead);
  for (const u of w.units) {
    u.hp = unitStats(w, u.kind).hp;
    u.target = -1;
  }
  for (const k of w.workers) {
    if (k.state === 'panic') {
      k.state = 'inside';
      k.panic = null;
      k.route = [];
    }
    // Abrigados no fortim saem pela porta e voltam para casa com a carga.
    if (k.state === 'sheltered') {
      const b = w.buildings.find((x) => x.id === k.fort);
      if (b) {
        const d = doorOf(b);
        k.x = k.px = d.x;
        k.z = k.pz = d.z;
      }
      k.fort = -1;
      k.state = 'returning';
      k.timer = 0;
      k.route = routeTo(w, k.x, k.z, DEPOT);
    }
  }
  renewResources(w);
  w.wave++;
  w.times = waveTimes(w.cfg, w.wave, end);
  for (const g of w.gates) g.closeAt = w.times.gatesClose;
  w.phase = 'calm';
  w.alarm = false;
  w.alarmAt = null;
  for (const k of w.workers) k.hold = false;
  w.stats = emptyStats(w.wave);
}

export function step(w: World): void {
  w.events.length = 0;
  if (w.lost) return;
  const c = w.cfg;
  const dt = 1 / c.ticksPerSecond;
  w.tick++;
  const t = now(w);
  const tm = w.times;
  if (w.phase === 'calm' && t >= tm.siren) {
    w.phase = 'warning';
    spawnWave(w);
    w.events.push({ type: 'siren', wave: w.wave, arrive: tm.arrive });
  }
  if (w.phase === 'warning' && t >= tm.arrive) {
    w.phase = 'breach';
    resolvePanic(w);
    w.events.push({ type: 'arrive', wave: w.wave, outside: w.stats.outsideAtArrive });
  }
  if (w.phase === 'breach' && t >= lastGateClose(w)) {
    w.phase = 'assault';
    w.events.push({ type: 'gatesClosed', wave: w.wave });
  }
  for (const k of w.workers) stepWorker(w, k, dt);
  stepProduction(w, dt);
  stepUnits(w, dt);
  stepSwarm(w, dt, (k) => die(w, k));
  w.morale = Math.min(c.morale.start, w.morale + c.morale.regenPerSecond * dt);
  if (w.core <= 0) {
    w.lost = true;
    w.events.push({ type: 'lost', wave: w.wave });
    return;
  }
  if (w.phase === 'assault' && (w.swarm.alive === 0 || t >= tm.end)) endWave(w);
}

/** Avança vários ticks juntando os eventos (headless, testes e balanceador). */
export function advance(w: World, ticks: number, onEvents?: (ev: World['events']) => void): void {
  for (let i = 0; i < ticks; i++) {
    step(w);
    if (onEvents && w.events.length) onEvents(w.events);
  }
}
