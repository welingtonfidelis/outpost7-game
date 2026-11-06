import { describe, expect, it } from 'vitest';
import { createWorld, insideBase, projectedChance, recallWorkers, returnTime, riskIds, setAlarm, setFocus, step, survivalChance, timeLeft } from '../src/sim/index.ts';
import type { World } from '../src/sim/index.ts';

const TPS = 20;

/** Mundo com coleta longe e um trabalhador já coletando lá fora. */
function farWorld(seed = 2): World {
  const w = createWorld(seed);
  setFocus(w, 2);
  for (let k = 0; k < 60 * TPS; k++) {
    step(w);
    if (w.workers.some((x) => x.state === 'gathering' && Math.hypot(x.x, x.z) > 60)) break;
  }
  return w;
}

describe('recolher com informação (Etapa 16)', () => {
  it('o tempo de volta bate com o tempo real andando até passar o portão', () => {
    const w = farWorld();
    const k = w.workers.find((x) => x.state === 'gathering' && Math.hypot(x.x, x.z) > 60)!;
    expect(k).toBeDefined();
    const est = returnTime(w, k);
    expect(est).toBeGreaterThan(5);
    recallWorkers(w, [k.id]);
    let t = 0;
    while (!insideBase(w.cfg, k.x, k.z) && t < 200) {
      step(w);
      t += 1 / TPS;
    }
    // O caminho de verdade contorna obstáculos: até 30% a mais que a estimativa em linha reta.
    expect(t).toBeGreaterThan(est * 0.9);
    expect(t).toBeLessThan(est * 1.3);
  });

  it('quem é chamado volta e fica dentro; os outros seguem; liberar solta', () => {
    const w = farWorld(3);
    const out = w.workers.filter((x) => x.state === 'toNode' || x.state === 'gathering');
    expect(out.length).toBeGreaterThan(1);
    const called = out[0]!;
    expect(recallWorkers(w, [called.id])).toBe(1);
    for (let k = 0; k < 50 * TPS; k++) step(w);
    expect(called.state).toBe('inside');
    expect(called.hold).toBe(true);
    // Alguém mais continuou trabalhando lá fora nesse tempo.
    expect(w.workers.some((x) => x.id !== called.id && (x.state === 'toNode' || x.state === 'gathering'))).toBe(true);
    setAlarm(w, true);
    setAlarm(w, false);
    expect(called.hold).toBe(false);
    for (let k = 0; k < 3 * TPS; k++) step(w);
    expect(called.state).toBe('toNode');
  });

  it('em risco: ninguém no começo da calma; os de longe perto da chegada', () => {
    const w = createWorld(4);
    setFocus(w, 2);
    step(w);
    expect(riskIds(w)).toHaveLength(0);
    while (timeLeft(w) > 12) step(w);
    const risk = riskIds(w);
    expect(risk.length).toBeGreaterThan(0);
    for (const id of risk) {
      const k = w.workers.find((x) => x.id === id)!;
      expect(returnTime(w, k)).toBeGreaterThan(timeLeft(w) - w.cfg.recallMargin);
    }
  });

  it('a chance projetada (chamado agora) fica entre a de agora e 1', () => {
    const w = createWorld(5);
    setFocus(w, 2);
    while (w.phase === 'calm') step(w);
    for (let k = 0; k < 10 * TPS; k++) step(w);
    const outside = w.workers.filter((k) => !insideBase(w.cfg, k.x, k.z) && k.state !== 'dead');
    expect(outside.length).toBeGreaterThan(0);
    for (const k of outside) {
      const p = projectedChance(w, k);
      expect(p).toBeLessThanOrEqual(1);
      expect(p).toBeGreaterThanOrEqual(survivalChance(w, k) - 1e-9);
    }
  });

  it('o fim da onda solta quem foi chamado', () => {
    const w = farWorld(6);
    const k = w.workers.find((x) => x.state === 'gathering' || x.state === 'toNode')!;
    recallWorkers(w, [k.id]);
    const wave = w.wave;
    while (w.wave === wave && !w.lost) {
      if (w.phase === 'warning' && !w.alarm) setAlarm(w, true);
      step(w);
    }
    expect(w.workers.every((x) => !x.hold)).toBe(true);
  });
});
