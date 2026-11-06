import { describe, expect, it } from 'vitest';
import {
  buildingMaxHp,
  createWorld,
  damageBuilding,
  dist,
  doorOf,
  finishConstruction,
  fortStats,
  garrison,
  leaveFort,
  occupants,
  orderUnits,
  placeBuilding,
  recruitUnit,
  setAlarm,
  stateHash,
  step,
  upgradeBuilding,
} from '../src/sim/index.ts';
import type { Building, World } from '../src/sim/index.ts';

const TPS = 20;

function runFor(w: World, s: number): void {
  const end = w.tick + Math.round(s * TPS);
  while (w.tick < end && !w.lost) {
    if (w.phase === 'warning' && !w.alarm) setAlarm(w, true);
    step(w);
  }
}

/** Quartel longe, fortim perto do portão leste por dentro e `n` soldados prontos. */
function setup(n: number, seed = 2, at = { x: 6, z: 4 }): { w: World; fort: Building } {
  const w = createWorld(seed);
  w.ore = 5000;
  placeBuilding(w, 'quartel', 24, 24);
  const fort = placeBuilding(w, 'fortim', at.x, at.z)!;
  expect(fort).not.toBeNull();
  finishConstruction(w);
  for (let i = 0; i < n; i++) recruitUnit(w, 'soldado');
  return { w, fort };
}

describe('fortim (Etapa 14)', () => {
  it('entram até lotar; quem sobra fica na porta', () => {
    const { w, fort } = setup(5);
    const ids = w.units.map((u) => u.id);
    expect(garrison(w, ids, fort.id)).toBe(4);
    runFor(w, 35);
    expect(occupants(w, fort.id)).toHaveLength(4);
    const out = w.units.filter((u) => u.inside < 0);
    expect(out).toHaveLength(1);
    // Lá dentro: no centro do prédio, sem rota.
    for (const u of occupants(w, fort.id)) {
      expect(u.x).toBe(fort.x);
      expect(u.route).toHaveLength(0);
    }
    // Ordem de ir ao chão não tira ninguém de dentro.
    orderUnits(w, ids, { x: -20, z: -20 });
    runFor(w, 2);
    expect(occupants(w, fort.id)).toHaveLength(4);
  });

  it('robô não entra e fortim em obra não aceita ninguém', () => {
    const w = createWorld(3);
    w.ore = 5000;
    placeBuilding(w, 'quartel', 24, 24);
    placeBuilding(w, 'fabrica', -24, 24);
    finishConstruction(w);
    recruitUnit(w, 'robo');
    recruitUnit(w, 'soldado');
    const fort = placeBuilding(w, 'fortim', 6, 4)!;
    expect(garrison(w, w.units.map((u) => u.id), fort.id)).toBe(0);
    expect(w.events.some((e) => e.type === 'notice')).toBe(true);
    finishConstruction(w);
    expect(garrison(w, w.units.map((u) => u.id), fort.id)).toBe(1);
    expect(w.units.find((u) => u.kind === 'robo')!.enter).toBe(-1);
  });

  it('Sair: todos na porta, parados ali', () => {
    const { w, fort } = setup(3);
    garrison(w, w.units.map((u) => u.id), fort.id);
    runFor(w, 35);
    expect(occupants(w, fort.id)).toHaveLength(3);
    expect(leaveFort(w, fort.id)).toBe(3);
    runFor(w, 6);
    const d = doorOf(fort);
    for (const u of w.units) {
      expect(u.inside).toBe(-1);
      expect(dist(u.x, u.z, d.x, d.z)).toBeLessThan(3.5);
    }
  });

  it('se o fortim cai, quem estava dentro sai ferido e volta ao automático', () => {
    const { w, fort } = setup(4);
    garrison(w, w.units.map((u) => u.id), fort.id);
    runFor(w, 35);
    const before = w.units.map((u) => u.hp);
    damageBuilding(w, fort.id, 1e9);
    expect(w.buildings.some((b) => b.id === fort.id)).toBe(false);
    w.units.forEach((u, i) => {
      expect(u.dead).toBe(false);
      expect(u.inside).toBe(-1);
      expect(u.order).toBeNull();
      expect(u.hp).toBeCloseTo(before[i]! * (1 - w.cfg.build.fortFall), 5);
    });
  });

  it('melhoria: nível 2 dá mais vagas e mais vida', () => {
    const { w, fort } = setup(0);
    const hp0 = buildingMaxHp(w, fort);
    expect(fortStats(w, fort).slots).toBe(4);
    upgradeBuilding(w, fort.id);
    runFor(w, w.cfg.upgrades.time + 1);
    const b = w.buildings.find((x) => x.id === fort.id)!;
    expect(b.level).toBe(2);
    expect(fortStats(w, b).slots).toBe(6);
    expect(buildingMaxHp(w, b)).toBeCloseTo(hp0 * 1.5, 5);
    expect(b.hp).toBeCloseTo(buildingMaxHp(w, b), 5);
  });

  it('dentro do fortim os 4 soldados matam mais que os mesmos 4 parados na porta', () => {
    const play = (inside: boolean) => {
      const { w, fort } = setup(4, 6, { x: 7, z: 0 });
      for (const t of w.towers) t.built = false;
      const ids = w.units.map((u) => u.id);
      if (inside) garrison(w, ids, fort.id);
      else orderUnits(w, ids, doorOf(fort));
      // Até o fim da primeira onda (ou a queda).
      const wave = w.wave;
      const end = w.tick + 400 * TPS;
      while (w.wave === wave && !w.lost && w.tick < end) {
        if (w.phase === 'warning' && !w.alarm) setAlarm(w, true);
        step(w);
      }
      const st = w.history[0] ?? w.stats;
      return { kills: st.kills, lost: w.units.filter((u) => u.dead).length };
    };
    const a = play(true);
    const b = play(false);
    expect(a.kills).toBeGreaterThan(b.kills);
    expect(a.lost).toBeLessThanOrEqual(b.lost);
  });

  it('mesma semente com fortim dá o mesmo hash', () => {
    const play = () => {
      const { w, fort } = setup(4, 11);
      garrison(w, w.units.map((u) => u.id), fort.id);
      runFor(w, 200);
      return stateHash(w);
    };
    expect(play()).toBe(play());
  });
});
