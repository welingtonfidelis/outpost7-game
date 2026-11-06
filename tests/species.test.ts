import { describe, expect, it } from 'vitest';
import {
  B_BITE,
  B_NONE,
  SP_BEETLE,
  SP_LEAPER,
  SP_RUN,
  SP_SPITTER,
  createWorld,
  insideBase,
  setAlarm,
  spawnWave,
  speciesShare,
  step,
  waveTimes,
  wallMissing,
  withConfig,
} from '../src/sim/index.ts';
import type { SimEvent, World } from '../src/sim/index.ts';

const TPS = 20;
function runUntil(w: World, stop: (w: World, ev: SimEvent[]) => boolean, maxS = 600): SimEvent[] {
  const all: SimEvent[] = [];
  const end = w.tick + maxS * TPS;
  while (w.tick < end && !w.lost) {
    if (w.phase === 'warning' && !w.alarm) setAlarm(w, true);
    step(w);
    all.push(...w.events);
    if (stop(w, w.events)) break;
  }
  return all;
}

describe('espécies do enxame (Etapa 20)', () => {
  it('a onda 10 traz as quatro, nas frações da configuração, e o escavador é corredor', () => {
    const w = createWorld(11, withConfig({}));
    w.wave = 10;
    w.times = waveTimes(w.cfg, 10, 0);
    spawnWave(w);
    const sw = w.swarm;
    const n = sw.n;
    const count = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) count[sw.sp[i]!]!++;
    const S = w.cfg.species;
    for (const [sp, cfg] of [
      [SP_BEETLE, S.besouro],
      [SP_LEAPER, S.saltador],
      [SP_SPITTER, S.cuspidor],
    ] as const) {
      const want = speciesShare(cfg, 10) * n;
      expect(count[sp]).toBeGreaterThan(want * 0.6);
      expect(count[sp]).toBeLessThan(want * 1.4 + 3);
    }
    expect(count[SP_RUN]).toBeGreaterThan(n * 0.5);
    for (let i = 0; i < sw.n; i++) if (sw.dig[i]! >= 0) expect(sw.sp[i]).toBe(SP_RUN);
  });

  it('o besouro tem cinco vezes a vida do corredor', () => {
    const w = createWorld(5, withConfig({}));
    w.wave = 8;
    w.times = waveTimes(w.cfg, 8, 0);
    spawnWave(w);
    const sw = w.swarm;
    let run = -1;
    let beetle = -1;
    for (let i = 0; i < sw.n; i++) {
      if (sw.dig[i]! >= 0) continue;
      if (sw.sp[i] === SP_RUN && run < 0) run = i;
      if (sw.sp[i] === SP_BEETLE && beetle < 0) beetle = i;
    }
    expect(run).toBeGreaterThanOrEqual(0);
    expect(beetle).toBeGreaterThanOrEqual(0);
    expect(sw.hp[beetle]! / sw.hp[run]!).toBeCloseTo(w.cfg.species.besouro.hp, 5);
  });

  it('o cuspidor para longe da muralha fechada e a derruba de longe', () => {
    const cfg = withConfig({});
    cfg.horde.base = 120;
    cfg.tunnel.fromWave = 99;
    cfg.species.cuspidor = { ...cfg.species.cuspidor, from: 0, share: 1, max: 1 };
    const w = createWorld(7, cfg);
    for (const t of w.towers) t.built = false;
    let far = false;
    runUntil(w, (ww) => {
      const sw = ww.swarm;
      for (let i = 0; i < sw.n; i++) if (sw.state[i] === B_BITE && sw.sp[i] === SP_SPITTER && sw.aim[i]! >= 2) far = true;
      return far && wallMissing(ww) > 50;
    });
    expect(far).toBe(true);
    expect(wallMissing(w)).toBeGreaterThan(50);
  });

  it('o saltador pula a muralha pela pilha antes de ela virar rampa ou cair', () => {
    const cfg = withConfig({});
    cfg.horde.base = 1400;
    cfg.tunnel.fromWave = 99;
    cfg.species.saltador = { ...cfg.species.saltador, from: 0, share: 0.25, max: 0.25 };
    const w = createWorld(3, cfg);
    for (const t of w.towers) t.built = false;
    let climbed = false;
    let breached = false;
    let jumped = false;
    runUntil(w, (ww, ev) => {
      if (ev.some((e) => e.type === 'climb')) climbed = true;
      if (ev.some((e) => e.type === 'breach')) breached = true;
      const sw = ww.swarm;
      for (let i = 0; i < sw.n; i++)
        if (sw.state[i] !== B_NONE && sw.sp[i] === SP_LEAPER && insideBase(ww.cfg, sw.x[i]!, sw.z[i]!)) jumped = true;
      return jumped || climbed || breached;
    });
    expect(jumped).toBe(true);
    expect(climbed).toBe(false);
    expect(breached).toBe(false);
  });
});
