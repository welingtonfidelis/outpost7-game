import { describe, expect, it } from 'vitest';
import {
  bugScale,
  createWorld,
  finishConstruction,
  hordeSize,
  placeBuilding,
  stateHash,
  step,
  towerStats,
  trainAnywhere,
  trainUnit,
  unitCap,
  unitStats,
  upgradeBuilding,
  upgradeTower,
} from '../src/sim/index.ts';
import type { World } from '../src/sim/index.ts';

const TPS = 20;
function runFor(w: World, s: number): void {
  const end = w.tick + Math.round(s * TPS);
  while (w.tick < end && !w.lost) step(w);
}

/** Mundo calmo (sem horda) com minério para testar produção. */
function calmWorld(seed = 1): World {
  const w = createWorld(seed);
  w.times.siren = w.times.arrive = w.times.gatesClose = w.times.end = 1e9;
  w.ore = 5000;
  return w;
}

describe('curva gradual (etapa 8)', () => {
  it('poucos insetos no começo, acelerando depois, cada um mais forte', () => {
    const w = createWorld(1);
    const sizes = [0, 1, 5, 10, 20].map((n) => hordeSize(w.cfg, n));
    expect(sizes).toEqual([160, 204, 460, 960, 2560]);
    expect(bugScale(w.cfg, 10).hp).toBeCloseTo(1.5);
    expect(bugScale(w.cfg, 10).bite).toBeCloseTo(1.4);
  });
});

describe('produção e melhorias (etapa 9)', () => {
  it('quartel treina com tempo, cobra na hora e respeita fila e limite', () => {
    const w = calmWorld();
    const q = placeBuilding(w, 'quartel', 24, 24)!;
    finishConstruction(w);
    const ore = w.ore;
    expect(trainUnit(w, q.id, 'soldado')).toBe(true);
    expect(w.ore).toBe(ore - w.cfg.units.soldado.cost);
    expect(w.units).toHaveLength(0);
    runFor(w, w.cfg.units.soldado.train - 0.2);
    expect(w.units).toHaveLength(0);
    runFor(w, 0.4);
    expect(w.units).toHaveLength(1);
    // Fila de 5 e limite de 8 por quartel.
    for (let i = 0; i < 10; i++) trainUnit(w, q.id, 'soldado');
    expect(q.queue).toHaveLength(w.cfg.build.quartel.queue);
    runFor(w, 60);
    for (let i = 0; i < 10; i++) trainUnit(w, q.id, 'soldado');
    runFor(w, 60);
    expect(w.units.filter((u) => u.kind === 'soldado')).toHaveLength(unitCap(w, 'soldado'));
    expect(unitCap(w, 'soldado')).toBe(8);
  });

  it('atirador só com o quartel no nível 3; melhoria leva tempo e pausa a fila', () => {
    const w = calmWorld();
    const q = placeBuilding(w, 'quartel', 24, 24)!;
    finishConstruction(w);
    expect(trainUnit(w, q.id, 'atirador')).toBe(false);
    expect(upgradeBuilding(w, q.id)).toBe(true);
    trainUnit(w, q.id, 'soldado');
    runFor(w, w.cfg.upgrades.time - 1);
    expect(q.level).toBe(1);
    expect(w.units).toHaveLength(0);
    runFor(w, 1.2);
    expect(q.level).toBe(2);
    upgradeBuilding(w, q.id);
    runFor(w, w.cfg.upgrades.time + 1);
    expect(q.level).toBe(3);
    expect(trainUnit(w, q.id, 'atirador')).toBe(true);
    runFor(w, 30);
    expect(w.units.some((u) => u.kind === 'atirador')).toBe(true);
  });

  it('melhorar o quartel melhora quem já existe e quem vai nascer', () => {
    const w = calmWorld();
    const q = placeBuilding(w, 'quartel', 24, 24)!;
    finishConstruction(w);
    trainAnywhere(w, 'soldado');
    runFor(w, 7);
    const s0 = unitStats(w, 'soldado');
    const u = w.units[0]!;
    expect(u.hp).toBeCloseTo(s0.hp);
    upgradeBuilding(w, q.id);
    runFor(w, w.cfg.upgrades.time + 0.5);
    const s1 = unitStats(w, 'soldado');
    expect(s1.dps).toBeCloseTo(s0.dps * 1.4);
    expect(s1.hp).toBeCloseTo(s0.hp * 1.25);
    expect(u.hp).toBeCloseTo(s1.hp);
  });

  it('fábrica treina robô e sustenta 2 por fábrica', () => {
    const w = calmWorld();
    placeBuilding(w, 'fabrica', -24, 24);
    finishConstruction(w);
    for (let i = 0; i < 5; i++) trainAnywhere(w, 'robo');
    runFor(w, 60);
    expect(w.units.filter((u) => u.kind === 'robo')).toHaveLength(2);
  });

  it('torre melhorada atira mais forte e mais longe; no nível 3 tem respingo', () => {
    const w = calmWorld();
    const t = w.towers[0]!;
    const t1 = towerStats(w, t);
    expect(upgradeTower(w, t.slot)).toBe(true);
    runFor(w, w.cfg.upgrades.towerTime + 0.2);
    const t2 = towerStats(w, t);
    expect(t2.dps).toBeCloseTo(t1.dps * 1.35);
    expect(t2.range).toBe(t1.range + 4);
    upgradeTower(w, t.slot);
    runFor(w, w.cfg.upgrades.towerTime + 0.2);
    expect(towerStats(w, t).splash).toBe(1.5);
    expect(upgradeTower(w, t.slot)).toBe(false);
  });

  it('com produção, mesma semente e mesmos comandos dão o mesmo hash', () => {
    const play = () => {
      const w = createWorld(31);
      w.ore = 3000;
      const q = placeBuilding(w, 'quartel', 24, 24)!;
      finishConstruction(w);
      upgradeBuilding(w, q.id);
      for (let i = 0; i < 4; i++) trainUnit(w, q.id, 'soldado');
      upgradeTower(w, 0);
      runFor(w, 300);
      return stateHash(w);
    };
    expect(play()).toBe(play());
  });
});
