import { describe, expect, it } from 'vitest';
import { B_NONE, B_UNDER, GATE, WALL, cellAt, createWorld, insideBase, setAlarm, stateHash, step, withConfig } from '../src/sim/index.ts';
import type { SimEvent, World } from '../src/sim/index.ts';

const TPS = 20;
function runUntil(w: World, stop: (ev: SimEvent[]) => boolean, maxS = 600): SimEvent[] {
  const all: SimEvent[] = [];
  const end = w.tick + maxS * TPS;
  while (w.tick < end && !w.lost) {
    if (w.phase === 'warning' && !w.alarm) setAlarm(w, true);
    step(w);
    all.push(...w.events);
    if (stop(w.events)) break;
  }
  return all;
}

/** Horda grande, sem túnel e sem torres: a multidão se amontoa nos portões. */
function crowdWorld(seed = 3): World {
  const cfg = withConfig({});
  cfg.horde.base = 1400;
  cfg.tunnel.fromWave = 99;
  const w = createWorld(seed, cfg);
  for (const t of w.towers) t.built = false;
  return w;
}

describe('escalar (pilha)', () => {
  it('multidão parada numa muralha escala por cima sem derrubar a célula', () => {
    const w = crowdWorld();
    const ev = runUntil(w, (e) => e.some((x) => x.type === 'climb'));
    const climb = ev.find((e) => e.type === 'climb');
    expect(climb).toBeDefined();
    if (climb && climb.type === 'climb') {
      const c = cellAt(w.swarm, climb.x, climb.z);
      expect([WALL, GATE]).toContain(w.swarm.terrain[c]);
      expect(w.swarm.climb[c]).toBeGreaterThan(0);
    }
    // Pouco depois, alguém já passou por cima e está dentro dos muros.
    runUntil(w, () => false, 15);
    const sw = w.swarm;
    let inside = 0;
    for (let i = 0; i < sw.n; i++) if (sw.state[i] !== B_NONE && insideBase(w.cfg, sw.x[i]!, sw.z[i]!)) inside++;
    expect(inside).toBeGreaterThan(0);
  });

  it('sem multidão a pilha desce e a passagem fecha', () => {
    const w = crowdWorld();
    runUntil(w, (e) => e.some((x) => x.type === 'climb'));
    expect(w.swarm.climbOrigins.length).toBeGreaterThan(0);
    // Some com todo mundo: ninguém empurra mais.
    const sw = w.swarm;
    for (let i = 0; i < sw.n; i++) sw.state[i] = B_NONE;
    sw.alive = 1;
    for (let k = 0; k < 6 * TPS; k++) step(w);
    expect(sw.climbOrigins).toHaveLength(0);
    expect(sw.climb.every((x) => x === 0)).toBe(true);
  });
});

describe('cavar (túnel)', () => {
  it('escavadores avisam, ficam embaixo sem aparecer e saem dentro da base', () => {
    const cfg = withConfig({});
    cfg.tunnel.fromWave = 0;
    const w = createWorld(5, cfg);
    const ev = runUntil(w, (e) => e.some((x) => x.type === 'tunnel'));
    const tunnel = ev.find((e) => e.type === 'tunnel');
    expect(tunnel).toBeDefined();
    const sw = w.swarm;
    const under = [];
    for (let i = 0; i < sw.n; i++) if (sw.state[i] === B_UNDER) under.push(i);
    expect(under.length).toBeGreaterThan(0);
    const hp = under.map((i) => sw.hp[i]!);
    const ev2 = runUntil(w, (e) => e.some((x) => x.type === 'emerge'), 40);
    const emerge = ev2.find((e) => e.type === 'emerge');
    expect(emerge).toBeDefined();
    if (emerge && emerge.type === 'emerge') expect(insideBase(w.cfg, emerge.x, emerge.z)).toBe(true);
    // Embaixo ninguém levou tiro.
    under.forEach((i, k) => {
      if (sw.state[i] === B_UNDER) expect(sw.hp[i]).toBe(hp[k]);
    });
  });

  it('com pilhas e túneis, mesma semente dá o mesmo hash', () => {
    const play = () => {
      const cfg = withConfig({});
      cfg.tunnel.fromWave = 0;
      cfg.horde.base = 900;
      const w = createWorld(17, cfg);
      for (const t of w.towers) t.built = false;
      runUntil(w, () => false, 260);
      return stateHash(w);
    };
    expect(play()).toBe(play());
  });
});
