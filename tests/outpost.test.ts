import { describe, expect, it } from 'vitest';
import { createWorld, damageBuilding, finishConstruction, fortStats, placeBuilding, stateHash, step, withConfig } from '../src/sim/index.ts';
import type { Building, World } from '../src/sim/index.ts';

const TPS = 20;

/** Fortim longe, a leste, e `n` trabalhadores coletando perto dele (sem alarme). */
function outpost(n: number, seed = 2): { w: World; fort: Building } {
  const cfg = withConfig({});
  cfg.horde.base = 60;
  const w = createWorld(seed, cfg);
  w.ore = 5000;
  const fort = placeBuilding(w, 'fortim', 40, 0)!;
  finishConstruction(w);
  w.workers.slice(0, n).forEach((k, i) => {
    k.state = 'gathering';
    k.node = 0;
    k.timer = 1e6;
    k.cargo = 10;
    k.x = k.px = 45 + (i % 3);
    k.z = k.pz = -3 + i * 1.5;
    k.route = [];
  });
  return { w, fort };
}

function until(w: World, ok: () => boolean, maxS = 400): void {
  const end = w.tick + maxS * TPS;
  while (!ok() && w.tick < end && !w.lost) step(w);
}

describe('fortim como posto avançado (Etapa 17)', () => {
  it('fora da fortaleza: mais alcance e blindagem', () => {
    const w = createWorld(1);
    w.ore = 5000;
    const out = placeBuilding(w, 'fortim', 30, 0)!;
    const inn = placeBuilding(w, 'fortim', 6, 6)!;
    finishConstruction(w);
    expect(fortStats(w, out).range - fortStats(w, inn).range).toBe(w.cfg.build.fortim.outpostRange);
    damageBuilding(w, out.id, 100);
    damageBuilding(w, inn.id, 100);
    expect(2400 - out.hp).toBeCloseTo(100 * (1 - w.cfg.build.fortim.armor), 5);
    expect(2400 - inn.hp).toBeCloseTo(100, 5);
  });

  it('na hora do pânico, quem está perto se abriga no fortim e volta com a carga no fim da onda', () => {
    const { w, fort } = outpost(2);
    const ids = w.workers.slice(0, 2).map((k) => k.id);
    until(w, () => w.phase === 'breach');
    until(w, () => ids.every((id) => w.workers.find((k) => k.id === id)!.state !== 'panic'), 20);
    const sheltered = w.workers.filter((k) => ids.includes(k.id) && k.state === 'sheltered');
    const dead = w.workers.filter((k) => ids.includes(k.id) && k.state === 'dead');
    expect(sheltered.length + dead.length).toBe(2);
    expect(sheltered.length).toBeGreaterThan(0);
    for (const k of sheltered) expect(k.fort).toBe(fort.id);
    const ore0 = w.ore;
    const wave = w.wave;
    until(w, () => w.wave > wave);
    for (const k of sheltered) expect(['returning', 'inside']).toContain(k.state);
    until(w, () => sheltered.every((k) => k.state === 'inside'), 60);
    expect(w.ore).toBeGreaterThan(ore0);
  });

  it('o abrigo tem 4 vagas: o quinto corre para o portão', () => {
    const { w } = outpost(5, 3);
    const five = new Set(w.workers.slice(0, 5).map((k) => k.id));
    until(w, () => w.phase === 'breach');
    const mine = w.workers.filter((k) => five.has(k.id) && k.panic);
    const toFort = mine.filter((k) => k.panic!.fort >= 0).length;
    const toGate = mine.filter((k) => k.panic!.fort < 0).length;
    expect(toFort).toBe(w.cfg.build.fortim.shelter);
    expect(toGate).toBe(1);
  });

  it('se o fortim cair com gente abrigada, o enxame os pega', () => {
    const { w, fort } = outpost(2, 4);
    until(w, () => w.phase === 'breach');
    until(w, () => w.workers.some((k) => k.state === 'sheltered'), 20);
    const inside = w.workers.filter((k) => k.state === 'sheltered');
    expect(inside.length).toBeGreaterThan(0);
    damageBuilding(w, fort.id, 1e9);
    for (let k = 0; k < 3; k++) step(w);
    for (const k of inside) expect(k.state).toBe('dead');
  });

  it('com abrigo, a mesma semente dá o mesmo hash', () => {
    const play = () => {
      const { w } = outpost(3, 6);
      until(w, () => w.wave >= 1);
      return stateHash(w);
    };
    expect(play()).toBe(play());
  });
});
