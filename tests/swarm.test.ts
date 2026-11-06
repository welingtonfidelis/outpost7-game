import { describe, expect, it } from 'vitest';
import {
  autoTower,
  B_WALK,
  BUG_FLOATS,
  cellAt,
  CORE,
  createWorld,
  finishConstruction,
  hordeSize,
  insideBase,
  makeView,
  placeBuilding,
  repair,
  repairCost,
  setAlarm,
  stateHash,
  step,
  WALL,
} from '../src/sim/index.ts';
import type { SimEvent, World } from '../src/sim/index.ts';

const TPS = 20;
function runTo(w: World, t: number, out: SimEvent[] = []): SimEvent[] {
  while (w.tick < Math.round(t * TPS) && !w.lost) {
    step(w);
    out.push(...w.events);
  }
  return out;
}

/** Joga com o alarme na sirene até o fim da onda atual. */
function playWave(w: World, out: SimEvent[] = []): SimEvent[] {
  const wave = w.wave;
  while (w.wave === wave && !w.lost) {
    if (w.phase === 'warning' && !w.alarm) setAlarm(w, true);
    step(w);
    out.push(...w.events);
  }
  return out;
}

describe('enxame', () => {
  it('a primeira onda morre nas torres sem abrir brecha', () => {
    const w = createWorld(5);
    const ev = playWave(w);
    const end = ev.find((e) => e.type === 'waveEnd');
    expect(end && end.type === 'waveEnd' && end.stats.kills).toBe(w.history[0]!.kills);
    expect(w.history[0]!.kills).toBe(hordeSize(w.cfg, 0));
    expect(w.history[0]!.breaches).toBe(0);
    expect(w.core).toBe(w.cfg.swarm.coreHp);
  });

  it('o enxame procura o ponto fraco: a primeira brecha sai no portão enfraquecido', () => {
    const w = createWorld(8);
    runTo(w, w.times.siren + 1);
    const sw = w.swarm;
    // Portão norte quase no chão; os outros inteiros.
    for (const c of sw.wallIdx) if (sw.gateOf[c] === 0) sw.wallHp[c] = 1;
    // Sem torres, para a horda chegar inteira.
    for (const t of w.towers) t.built = false;
    sw.flowDirty = true;
    const ev = runTo(w, w.times.end);
    const first = ev.find((e) => e.type === 'breach');
    expect(first).toBeDefined();
    if (first && first.type === 'breach') {
      expect(Math.abs(first.x)).toBeLessThan(2.5);
      expect(first.z).toBeLessThan(0);
    }
  });

  it('inseto dentro dos muros pega quem está lá dentro', () => {
    const w = createWorld(3);
    runTo(w, w.times.siren + 1);
    // Com a calma longa, todo mundo está fora na sirene: traz um para dentro.
    const k = w.workers[0]!;
    k.x = k.px = 0;
    k.z = k.pz = 6;
    k.state = 'inside';
    k.route = [];
    expect(insideBase(w.cfg, k.x, k.z)).toBe(true);
    const sw = w.swarm;
    sw.x[0] = k.x + 0.3;
    sw.z[0] = k.z;
    sw.state[0] = B_WALK;
    const ev: SimEvent[] = [];
    step(w);
    ev.push(...w.events);
    expect(k.state).toBe('dead');
    expect(ev.some((e) => e.type === 'devoured' && e.worker === k.id)).toBe(true);
    expect(w.stats.insideDeaths).toBe(1);
  });

  it('núcleo no zero é derrota, e o mundo para', () => {
    const w = createWorld(3);
    runTo(w, w.times.siren + 1);
    const sw = w.swarm;
    w.core = 0.05;
    sw.x[0] = 0.5;
    sw.z[0] = 0.5;
    sw.state[0] = B_WALK;
    expect(sw.terrain[cellAt(sw, 0.5, 0.5)]).toBe(CORE);
    step(w);
    expect(w.lost).toBe(true);
    expect(w.events.some((e) => e.type === 'lost')).toBe(true);
    const tick = w.tick;
    step(w);
    expect(w.tick).toBe(tick);
  });

  it('torre nova custa minério e precisa de energia; conserto devolve o HP e cobra', () => {
    const w = createWorld(3);
    w.ore = 500;
    expect(placeBuilding(w, 'torre', -7, -16)).not.toBeNull();
    finishConstruction(w);
    expect(w.towers.filter((t) => t.built)).toHaveLength(5);
    expect(w.ore).toBe(500 - w.cfg.build.torre.cost);
    // A quinta torre passa da energia do núcleo (4): fica sem energia até ter gerador.
    expect(w.towers[4]!.powered).toBe(false);
    expect(autoTower(w)).toBe(true);
    finishConstruction(w);
    expect(w.buildings.some((b) => b.kind === 'gerador')).toBe(true);
    expect(w.towers[4]!.powered).toBe(true);
    const sw = w.swarm;
    const c = [...sw.wallIdx].find((x) => sw.terrain[x] === WALL)!;
    sw.wallHp[c] = 0;
    const cost = repairCost(w);
    expect(cost).toBeGreaterThan(0);
    const before = w.ore;
    expect(repair(w)).toBe(true);
    expect(sw.wallHp[c]).toBe(w.cfg.swarm.wallHp);
    expect(w.ore).toBe(before - cost);
  });

  it('o retrato para a tela leva 6 floats por inseto e o HP da muralha na ordem fixa', () => {
    const w = createWorld(3);
    runTo(w, w.times.siren + 1);
    const { view, bugs } = makeView(w);
    expect(view.bugCount).toBe(w.swarm.n);
    expect(bugs.length).toBeGreaterThanOrEqual(w.swarm.n * BUG_FLOATS);
    expect(view.wallHp.length).toBe(w.swarm.wallIdx.length);
    expect('swarm' in view).toBe(false);
    expect(bugs[2]).toBe(w.swarm.x[0]);
  });

  it('com o enxame, mesma semente continua dando o mesmo hash', () => {
    const play = () => {
      const w = createWorld(77);
      for (let i = 0; i < 2; i++) playWave(w);
      return stateHash(w);
    };
    expect(play()).toBe(play());
  });
});
