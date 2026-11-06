/** Comandos do jogador. A tela só mexe no mundo por aqui. */
import { repairCost, repairWalls } from './swarm.ts';
import { atRisk } from './panic.ts';
import type { Ring, Worker, World } from './types.ts';
import { routeTo } from './workers.ts';
import { DEPOT, makeWorker, now } from './world.ts';

/** Alarme geral (GDD §2): todo mundo que está fora volta. Desligar libera a saída de novo. */
export function setAlarm(w: World, on: boolean): void {
  if (w.phase === 'breach' || w.phase === 'assault') return;
  if (on === w.alarm) return;
  w.alarm = on;
  if (on) {
    const t = now(w);
    if (w.alarmAt === null) {
      w.alarmAt = t;
      w.stats.alarmDelay = t - w.times.siren;
    }
    for (const k of w.workers) {
      if (k.state === 'toNode' || k.state === 'gathering') {
        k.state = 'returning';
        k.timer = 0;
        k.node = -1;
        k.route = routeTo(w, k.x, k.z, DEPOT);
      }
    }
  }
  // Liberar a saída solta também quem foi chamado pelo "Chamar em risco".
  if (!on) for (const k of w.workers) k.hold = false;
  w.events.push({ type: 'alarm', on });
}

/**
 * Etapa 16: chama de volta só estes trabalhadores. Voltam e ficam dentro até liberar a
 * saída ou a onda acabar; os outros seguem coletando.
 */
export function recallWorkers(w: World, ids: number[]): number {
  if (w.phase !== 'calm' && w.phase !== 'warning') return 0;
  const want = new Set(ids);
  let n = 0;
  for (const k of w.workers) {
    if (!want.has(k.id) || k.state === 'dead' || k.state === 'panic' || k.hold) continue;
    k.hold = true;
    n++;
    if (k.state === 'toNode' || k.state === 'gathering') {
      k.state = 'returning';
      k.timer = 0;
      k.node = -1;
      k.route = routeTo(w, k.x, k.z, DEPOT);
    }
  }
  if (n) w.events.push({ type: 'recall', n });
  return n;
}

/** Solta quem foi chamado (volta a sair sozinho). */
export function releaseWorkers(w: World, ids: number[]): number {
  const want = new Set(ids);
  let n = 0;
  for (const k of w.workers)
    if (want.has(k.id) && k.hold) {
      k.hold = false;
      n++;
    }
  return n;
}

/**
 * Quem está em risco agora: fora, sem ter sido chamado, precisando de mais que o tempo que
 * falta menos a folga. Inclui quem já está voltando: chamado, ele não sai de novo depois de
 * descarregar.
 */
export function riskIds(w: Pick<World, 'workers' | 'cfg' | 'morale' | 'gates' | 'times' | 'tick' | 'phase'>): number[] {
  return w.workers.filter((k) => !k.hold && atRisk(w, k, w.cfg.recallMargin)).map((k) => k.id);
}

/** "Chamar em risco". */
export function recallAtRisk(w: World): number {
  return recallWorkers(w, riskIds(w));
}

export function setFocus(w: World, ring: Ring): void {
  w.focus = ring;
}

export function aliveWorkers(w: { workers: Worker[] }): number {
  return w.workers.filter((k) => k.state !== 'dead').length;
}

export function canRecruit(w: Pick<World, 'ore' | 'cfg' | 'workers'>): boolean {
  return w.ore >= w.cfg.recruitCost && aliveWorkers(w) < w.cfg.maxWorkers;
}

export function recruit(w: World): boolean {
  if (!canRecruit(w)) return false;
  w.ore -= w.cfg.recruitCost;
  const k = makeWorker(w);
  w.workers.push(k);
  w.events.push({ type: 'recruit', worker: k.id, name: k.name });
  return true;
}

/** Conserta a muralha (proporcional ao minério que houver). */
export function repair(w: World): boolean {
  if (w.lost || repairCost(w) <= 0 || w.ore <= 0) return false;
  const paid = repairWalls(w);
  w.events.push({ type: 'repair', cost: paid });
  return paid > 0;
}
