import { describe, expect, it } from 'vitest';
import {
  B_WALK,
  buildWall,
  cellAt,
  cellCenter,
  createWorld,
  damageBuilding,
  demolish,
  findPath,
  finishConstruction,
  GATE,
  humanPassable,
  lineCells,
  placeBuilding,
  setAlarm,
  stateHash,
  step,
  STRUCT,
  WALL,
} from '../src/sim/index.ts';
import type { World } from '../src/sim/index.ts';

const TPS = 20;
function runFor(w: World, s: number): void {
  const end = w.tick + Math.round(s * TPS);
  while (w.tick < end && !w.lost) {
    if (w.phase === 'warning' && !w.alarm) setAlarm(w, true);
    step(w);
  }
}

describe('construção', () => {
  it('torre ocupa 2×2, custa minério e gasta energia; gerador liga a que ficou apagada', () => {
    const w = createWorld(1);
    w.ore = 1000;
    const t = placeBuilding(w, 'torre', 20, 20)!;
    finishConstruction(w);
    expect(t.cells).toHaveLength(4);
    for (const c of t.cells) expect(w.swarm.terrain[c]).toBe(STRUCT);
    expect(w.ore).toBe(1000 - w.cfg.build.torre.cost);
    expect(w.energy).toEqual({ supply: 4, demand: 5 });
    expect(w.towers.at(-1)!.powered).toBe(false);
    placeBuilding(w, 'gerador', 24, 20);
    finishConstruction(w);
    expect(w.energy.supply).toBe(7);
    expect(w.towers.at(-1)!.powered).toBe(true);
  });

  it('prédio em obra não funciona: gerador só dá energia e torre só atira depois de pronta', () => {
    const w = createWorld(1);
    w.times.siren = w.times.arrive = w.times.gatesClose = w.times.end = 1e9;
    w.ore = 1000;
    placeBuilding(w, 'gerador', 24, 20);
    const t = placeBuilding(w, 'torre', 20, 20)!;
    expect(w.energy).toEqual({ supply: 4, demand: 4 });
    expect(w.towers.at(-1)!.powered).toBe(false);
    expect(w.buildings.every((b) => b.buildLeft > 0)).toBe(true);
    runFor(w, w.cfg.build.torre.time + 0.2);
    expect(w.buildings.every((b) => b.buildLeft === 0)).toBe(true);
    expect(w.energy).toEqual({ supply: 7, demand: 5 });
    expect(w.towers.at(-1)!.powered).toBe(true);
    void t;
  });

  it('não constrói em cima de muralha, do núcleo, fora do raio ou sem minério', () => {
    const w = createWorld(1);
    w.ore = 1000;
    expect(placeBuilding(w, 'torre', 12, 0)).toBeNull();
    expect(placeBuilding(w, 'torre', 0, 0)).toBeNull();
    expect(placeBuilding(w, 'torre', 80, 0)).toBeNull();
    w.ore = 10;
    expect(placeBuilding(w, 'torre', 20, 20)).toBeNull();
    expect(w.events.filter((e) => e.type === 'buildFail')).toHaveLength(4);
  });

  it('torre sem energia não atira', () => {
    const w = createWorld(1);
    w.ore = 1000;
    for (const t of w.towers) t.built = false;
    placeBuilding(w, 'torre', 30, 30);
    finishConstruction(w);
    const tw = w.towers.at(-1)!;
    tw.powered = false;
    w.energy.supply = 0;
    runFor(w, w.times.siren + 1 - w.tick / TPS);
    const sw = w.swarm;
    sw.x[0] = 34;
    sw.z[0] = 34;
    sw.state[0] = B_WALK;
    // Fixa a energia em zero (núcleo sem nada) e confere que o inseto não leva tiro.
    w.cfg.build.coreEnergy = 0;
    w.towers.forEach((t) => (t.powered = false));
    const hp = sw.hp[0]!;
    step(w);
    expect(tw.target).toBe(-1);
    expect(sw.hp[0]).toBe(hp);
  });

  it('muralha traçada é 4-conectada (sem buraco na diagonal) e o enxame morde', () => {
    const w = createWorld(1);
    const cells = lineCells(w, 20, 15, 35, 27);
    for (let i = 1; i < cells.length; i++) {
      const a = cells[i - 1]!;
      const b = cells[i]!;
      const d = Math.abs((a % w.swarm.size) - (b % w.swarm.size)) + Math.abs(Math.floor(a / w.swarm.size) - Math.floor(b / w.swarm.size));
      expect(d).toBe(1);
    }
    w.ore = 1000;
    const n = buildWall(w, 'muralha', 20, 15, 35, 27);
    expect(n).toBeGreaterThan(15);
    expect(w.ore).toBe(1000 - n * w.cfg.build.wall.costPerCell);
    const c = cellAt(w.swarm, 20.5, 15.5);
    expect(w.swarm.terrain[c]).toBe(WALL);
  });

  it('pessoas contornam a muralha nova e passam pelo portão novo', () => {
    const w = createWorld(1);
    w.ore = 5000;
    // Sem nós de recurso no caminho (a muralha não passa por cima deles e deixaria buraco).
    w.nodes = [];
    // Parede em x = 20 até o limite de construção (raio 50), com portão no meio:
    // contornar a ponta fica mais longe que passar pelo portão.
    buildWall(w, 'muralha', 20, -60, 20, -3);
    buildWall(w, 'portao', 20, -2, 20, 2);
    buildWall(w, 'muralha', 20, 3, 20, 60);
    const path = findPath(w, 15, -20, 30, -20);
    let prev = { x: 15, z: -20 };
    for (const p of path) {
      for (const c of lineCells(w, prev.x, prev.z, p.x, p.z)) expect(humanPassable(w.swarm, c)).toBe(true);
      prev = p;
    }
    // Passou pelo portão (perto de z = 0).
    const crossing = path.some((p) => Math.abs(p.x - 20) < 1.5 && Math.abs(p.z) < 3);
    expect(crossing).toBe(true);
    expect(w.swarm.terrain[cellAt(w.swarm, 20.5, 0.5)]).toBe(GATE);
  });

  it('refinaria rende mais por entrega', () => {
    const play = (refinery: boolean) => {
      const w = createWorld(3);
      w.cfg.calmFirst = 100000;
      w.times.siren = w.times.arrive = 1e9;
      if (refinery) {
        w.ore = 1000;
        placeBuilding(w, 'refinaria', -20, 20);
        finishConstruction(w);
        w.ore = 0;
      }
      runFor(w, 200);
      return w.oreTotal;
    };
    const a = play(false);
    const b = play(true);
    expect(b).toBeGreaterThan(a * 1.15);
  });

  it('demolir devolve metade; a muralha do posto não se demole', () => {
    const w = createWorld(1);
    w.ore = 1000;
    placeBuilding(w, 'gerador', 25, 25);
    const ore = w.ore;
    expect(demolish(w, 25, 25)).toBe(Math.floor(w.cfg.build.gerador.cost / 2));
    expect(w.ore).toBe(ore + 40);
    expect(w.buildings).toHaveLength(0);
    expect(demolish(w, 12, 6)).toBe(0);
    expect(w.swarm.terrain[cellAt(w.swarm, 12.5, 6.5)]).toBe(WALL);
  });

  it('prédio mordido até o fim cai, vira entulho e a torre some', () => {
    const w = createWorld(1);
    w.ore = 1000;
    const b = placeBuilding(w, 'torre', 20, 20)!;
    damageBuilding(w, b.id, 1e6);
    expect(w.buildings).toHaveLength(0);
    expect(w.towers).toHaveLength(4);
    expect(w.events.some((e) => e.type === 'buildingDown')).toBe(true);
    const p = cellCenter(w.swarm, b.cells[0]!);
    expect(humanPassable(w.swarm, cellAt(w.swarm, p.x, p.z))).toBe(true);
  });

  it('com construção, mesma semente e mesmos comandos dão o mesmo hash', () => {
    const play = () => {
      const w = createWorld(21);
      w.ore = 3000;
      placeBuilding(w, 'torre', -7, -16);
      placeBuilding(w, 'gerador', -20, -20);
      buildWall(w, 'muralha', 25, -10, 25, 10);
      runFor(w, 400);
      return stateHash(w);
    };
    expect(play()).toBe(play());
  });
});
