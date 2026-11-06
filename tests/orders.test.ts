import { describe, expect, it } from 'vitest';
import { createWorld, dist, finishConstruction, holdUnits, orderUnits, placeBuilding, recruitUnit, setRally, stateHash, step } from '../src/sim/index.ts';
import type { World } from '../src/sim/index.ts';

const TPS = 20;

function army(seed = 2): World {
  const w = createWorld(seed);
  w.ore = 5000;
  placeBuilding(w, 'quartel', 24, 24);
  placeBuilding(w, 'fabrica', -24, 24);
  finishConstruction(w);
  for (let i = 0; i < 6; i++) recruitUnit(w, 'soldado');
  for (let i = 0; i < 2; i++) recruitUnit(w, 'robo');
  return w;
}

function runFor(w: World, s: number): void {
  const end = w.tick + Math.round(s * TPS);
  while (w.tick < end && !w.lost) step(w);
}

describe('ordens por unidade (Etapa 13)', () => {
  it('só as escolhidas vão ao ponto, em formação; as outras seguem no automático', () => {
    const w = army();
    runFor(w, 25);
    const soldiers = w.units.filter((u) => u.kind === 'soldado');
    const picked = soldiers.slice(0, 3).map((u) => u.id);
    expect(orderUnits(w, picked, { x: -30, z: -30 })).toBe(3);
    runFor(w, 25);
    const spots = new Set<string>();
    for (const u of w.units) {
      if (picked.includes(u.id)) {
        expect(dist(u.x, u.z, -30, -30)).toBeLessThan(3.5);
        spots.add(`${Math.round(u.x * 2)},${Math.round(u.z * 2)}`);
      } else if (u.kind === 'soldado') {
        // As outras se redistribuem pelos portões (automático).
        expect(w.gates.some((g) => dist(u.x, u.z, g.inner.x, g.inner.z) < 3)).toBe(true);
      }
    }
    // Cada uma numa casa da formação.
    expect(spots.size).toBe(3);
  });

  it('robôs com infantaria ficam na frente, do lado de fora', () => {
    const w = army();
    runFor(w, 20);
    const ids = w.units.map((u) => u.id);
    orderUnits(w, ids, { x: 0, z: 34 });
    for (const u of w.units) {
      if (u.kind === 'robo') expect(u.order!.z).toBeGreaterThan(36);
      else expect(Math.abs(u.order!.z - 34)).toBeLessThan(3);
    }
  });

  it('auto devolve ao automático, parar fica no lugar, e o ponto do grupo limpa as ordens', () => {
    const w = army();
    runFor(w, 20);
    const ids = w.units.filter((u) => u.kind === 'soldado').map((u) => u.id);
    orderUnits(w, ids, { x: 20, z: -20 });
    orderUnits(w, ids, null);
    expect(w.units.every((u) => u.order === null)).toBe(true);
    runFor(w, 3);
    holdUnits(w, ids);
    const spot = new Map(w.units.map((u) => [u.id, { x: u.x, z: u.z }]));
    runFor(w, 10);
    for (const id of ids) {
      const u = w.units.find((x) => x.id === id)!;
      const s = spot.get(id)!;
      expect(dist(u.x, u.z, s.x, s.z)).toBeLessThan(0.5);
    }
    setRally(w, 'soldado', { x: 10, z: 10 });
    expect(w.units.filter((u) => u.kind !== 'robo').every((u) => u.order === null)).toBe(true);
  });

  it('mesma semente e mesmas ordens dão o mesmo hash', () => {
    const play = () => {
      const w = army(9);
      runFor(w, 15);
      orderUnits(w, w.units.map((u) => u.id), { x: -18, z: 26 });
      runFor(w, 40);
      holdUnits(w, [w.units[0]!.id]);
      runFor(w, 40);
      return stateHash(w);
    };
    expect(play()).toBe(play());
  });
});
