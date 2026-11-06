import { describe, expect, it } from 'vitest';
import {
  B_WALK,
  cellAt,
  createWorld,
  dist,
  finishConstruction,
  placeBuilding,
  recruitUnit,
  RUBBLE,
  setAlarm,
  setRally,
  stateHash,
  step,
} from '../src/sim/index.ts';
import type { SimEvent, World } from '../src/sim/index.ts';

const TPS = 20;

/** Robô precisa de fábrica e soldado de quartel (Etapas 7 e 9): põe os dois longe do caminho. */
function factory(w: World): void {
  const ore = w.ore;
  w.ore = Math.max(w.ore, 1000);
  if (!w.buildings.some((b) => b.kind === 'fabrica')) placeBuilding(w, 'fabrica', -24, 24);
  if (!w.buildings.some((b) => b.kind === 'quartel')) placeBuilding(w, 'quartel', 24, 24);
  finishConstruction(w);
  w.ore = ore;
}
function runFor(w: World, s: number, out: SimEvent[] = []): SimEvent[] {
  const end = w.tick + Math.round(s * TPS);
  while (w.tick < end && !w.lost) {
    step(w);
    out.push(...w.events);
  }
  return out;
}

function playWave(w: World, out: SimEvent[] = []): SimEvent[] {
  const wave = w.wave;
  while (w.wave === wave && !w.lost) {
    if (w.phase === 'warning' && !w.alarm) setAlarm(w, true);
    step(w);
    out.push(...w.events);
  }
  return out;
}

/** Abre uma brecha de 3 células no meio da muralha norte (fora do portão). */
function openNorthBreach(w: World): void {
  const sw = w.swarm;
  for (const x of [5.5, 6.5, 7.5])
    for (const z of [-11.5, -12.5]) {
      const c = cellAt(sw, x, z);
      sw.terrain[c] = RUBBLE;
      sw.wallHp[c] = 0;
    }
  sw.flowDirty = true;
}

describe('soldados e robôs', () => {
  it('recrutar custa minério e respeita o limite', () => {
    const w = createWorld(1);
    w.ore = 10000;
    expect(recruitUnit(w, 'robo')).toBe(false);
    expect(recruitUnit(w, 'soldado')).toBe(false);
    factory(w);
    expect(recruitUnit(w, 'soldado')).toBe(true);
    expect(w.ore).toBe(10000 - w.cfg.units.soldado.cost);
    for (let i = 0; i < 30; i++) recruitUnit(w, 'robo');
    expect(w.units.filter((u) => u.kind === 'robo')).toHaveLength(w.cfg.build.fabrica.perBuilding);
  });

  it('soldados vão sozinhos para os portões; com ponto de reunião, vão para lá', () => {
    const w = createWorld(1);
    w.ore = 1000;
    factory(w);
    for (let i = 0; i < 4; i++) recruitUnit(w, 'soldado');
    // Nascem na porta do quartel, fora dos muros: o caminho dá a volta até os portões.
    runFor(w, 30);
    for (const u of w.units) {
      const nearGate = w.gates.some((g) => dist(u.x, u.z, g.inner.x, g.inner.z) < 2);
      expect(nearGate).toBe(true);
    }
    setRally(w, 'soldado', { x: 30, z: 30 });
    runFor(w, 25);
    for (const u of w.units) expect(dist(u.x, u.z, 30, 30)).toBeLessThan(4);
  });

  it('soldados nos portões ajudam: sem torres, matam mais e a base dura mais', () => {
    const play = (soldiers: number) => {
      const w = createWorld(4);
      for (const t of w.towers) t.built = false;
      w.ore = 10000;
      factory(w);
      for (let i = 0; i < soldiers; i++) recruitUnit(w, 'soldado');
      playWave(w);
      return { stats: w.history[0] ?? w.stats, lost: w.lost, tick: w.tick };
    };
    const none = play(0);
    const eight = play(8);
    expect(eight.stats.kills).toBeGreaterThan(none.stats.kills);
    // Sem torres a base pode cair nos dois casos; com soldados ela aguenta mais tempo (ou não cai).
    expect(!eight.lost || eight.tick > none.tick).toBe(true);
  });

  it('robô vai até a brecha e tampa: o enxame desvia e o núcleo dura mais', () => {
    const play = (robot: boolean) => {
      const w = createWorld(6);
      for (const t of w.towers) t.built = false;
      openNorthBreach(w);
      w.ore = 10000;
      if (robot) {
        factory(w);
        recruitUnit(w, 'robo');
      }
      runFor(w, w.times.siren - w.tick / TPS);
      setAlarm(w, true);
      runFor(w, w.times.gatesClose + 45 - w.tick / TPS);
      return w;
    };
    const without = play(false);
    const withRobot = play(true);
    const r = withRobot.units[0]!;
    expect(withRobot.swarm.plugList.length).toBeGreaterThan(0);
    expect(r.route.length).toBe(0);
    expect(withRobot.core).toBeGreaterThan(without.core);
  });

  it('inseto encostado num soldado morde até derrubar', () => {
    const w = createWorld(2);
    w.ore = 100;
    factory(w);
    recruitUnit(w, 'soldado');
    runFor(w, w.times.siren + 1 - w.tick / TPS);
    const u = w.units[0]!;
    u.hp = 0.05;
    const sw = w.swarm;
    sw.x[0] = u.x + 0.5;
    sw.z[0] = u.z;
    sw.vx[0] = -1;
    sw.vz[0] = 0;
    sw.state[0] = B_WALK;
    const ev = runFor(w, 0.2);
    expect(u.dead).toBe(true);
    expect(ev.some((e) => e.type === 'unitDown' && e.kind === 'soldado')).toBe(true);
  });

  it('com unidades, mesma semente e mesmos comandos dão o mesmo hash', () => {
    const play = () => {
      const w = createWorld(13);
      w.ore = 2000;
      factory(w);
      for (let i = 0; i < 6; i++) recruitUnit(w, 'soldado');
      recruitUnit(w, 'robo');
      openNorthBreach(w);
      playWave(w);
      setRally(w, 'soldado', { x: 0, z: -20 });
      playWave(w);
      return stateHash(w);
    };
    expect(play()).toBe(play());
  });
});
