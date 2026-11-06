import { describe, expect, it } from 'vitest';
import { B_WALK, createWorld, finishConstruction, holdUnits, placeBuilding, recruitUnit, setAlarm, stateHash, step, wave, withConfig } from '../src/sim/index.ts';
import type { World } from '../src/sim/index.ts';

const TPS = 20;

function untilArrivePlus(w: World, s: number): void {
  while (!w.lost && (w.phase === 'calm' || w.phase === 'warning' || w.tick / TPS < w.times.arrive + s)) {
    if (w.phase === 'warning' && !w.alarm) setAlarm(w, true);
    step(w);
  }
}

describe('IA do enxame (Etapa 15)', () => {
  it('a onda periódica fica entre -1 e 1 e tem pico em 1/4', () => {
    expect(wave(0.25)).toBeCloseTo(1, 6);
    expect(wave(0.75)).toBeCloseTo(-1, 6);
    for (let v = -3; v < 3; v += 0.013) {
      expect(wave(v)).toBeLessThanOrEqual(1);
      expect(wave(v)).toBeGreaterThanOrEqual(-1);
    }
  });

  it('a horda vem em levas: a primeira na hora da chegada, as outras depois; há caçadores', () => {
    const cfg = withConfig({});
    cfg.horde.base = 1200;
    const w = createWorld(4, cfg);
    while (w.phase === 'calm') step(w);
    const sw = w.swarm;
    let lo = Infinity;
    let hi = -Infinity;
    let hunters = 0;
    for (let i = 0; i < sw.n; i++) {
      lo = Math.min(lo, sw.wake[i]!);
      hi = Math.max(hi, sw.wake[i]!);
      hunters += sw.role[i]!;
    }
    expect(lo).toBeLessThan(w.times.arrive + 0.5);
    expect(hi - lo).toBeGreaterThan(10);
    // Onda 1: perto de cfg.ai.hunters (20%).
    expect(hunters / sw.n).toBeGreaterThan(0.12);
    expect(hunters / sw.n).toBeLessThan(0.3);
  });

  it('caçadores atacam tudo que está fora da fortaleza, espalhados (Etapa 17)', () => {
    const cfg = withConfig({});
    cfg.horde.base = 900;
    const w = createWorld(2, cfg);
    w.ore = 5000;
    const fort = placeBuilding(w, 'fortim', 17, 2)!;
    const tower = placeBuilding(w, 'torre', -17, -4)!;
    const gen = placeBuilding(w, 'gerador', 4, -20)!;
    // Dentro da fortaleza: não é alvo dos caçadores.
    const inner = placeBuilding(w, 'gerador', -6, 6)!;
    finishConstruction(w);
    untilArrivePlus(w, 35);
    const hp = (id: number) => w.buildings.find((b) => b.id === id)?.hp ?? 0;
    // Os três de fora levaram mordida (nenhum foi poupado por todos irem num só).
    expect(hp(fort.id)).toBeLessThan(2400 * 0.95);
    expect(hp(tower.id)).toBeLessThan(600 * 0.8);
    expect(hp(gen.id)).toBeLessThan(400 * 0.8);
    // O de dentro, sem brecha, ficou inteiro.
    expect(hp(inner.id)).toBe(400);
  });

  it('caçador vai na tropa no mapa; o de assalto segue para o núcleo', () => {
    const cfg = withConfig({});
    cfg.horde.base = 50;
    const w = createWorld(3, cfg);
    w.ore = 5000;
    placeBuilding(w, 'quartel', -24, -24);
    finishConstruction(w);
    recruitUnit(w, 'soldado');
    for (let k = 0; k < 20 * TPS; k++) step(w);
    const u = w.units[0]!;
    u.x = u.px = 40;
    u.z = u.pz = 0;
    u.route = [];
    holdUnits(w, [u.id]);
    while (w.phase === 'calm') step(w);
    // Só dois insetos em cena, os dois a 6 m do soldado, longe de tudo o mais.
    const sw = w.swarm;
    for (let i = 0; i < sw.n; i++) sw.state[i] = 0;
    const put = (i: number, z: number, role: number) => {
      sw.state[i] = B_WALK;
      sw.x[i] = sw.px[i] = 40;
      sw.z[i] = sw.pz[i] = z;
      sw.vx[i] = sw.vz[i] = 0;
      sw.role[i] = role;
      sw.wake[i] = 0;
      sw.speed[i] = 9;
      sw.hp[i] = 1000;
    };
    put(0, 6, 1);
    put(1, -6, 0);
    for (let k = 0; k < 10; k++) step(w);
    const d = (i: number) => Math.hypot(sw.x[i]! - u.x, sw.z[i]! - u.z);
    // Saiu de 6 m e chegou a pouco mais de 3 m em meio segundo (o ritmo oscila).
    expect(d(0)).toBeLessThan(3.5);
    // O de assalto vai para o oeste (núcleo); o caçador, para o soldado (norte-sul).
    expect(sw.x[1]!).toBeLessThan(38.5);
    expect(40 - sw.x[1]!).toBeGreaterThan(40 - sw.x[0]!);
  });

  it('com caçadores, bandos e fortim, a mesma semente dá o mesmo hash', () => {
    const play = () => {
      const cfg = withConfig({});
      cfg.horde.base = 700;
      const w = createWorld(9, cfg);
      w.ore = 5000;
      placeBuilding(w, 'fortim', 17, 2);
      placeBuilding(w, 'torre', -17, 6);
      finishConstruction(w);
      untilArrivePlus(w, 30);
      let walking = 0;
      for (let i = 0; i < w.swarm.n; i++) if (w.swarm.state[i] === B_WALK) walking++;
      return `${stateHash(w)}:${walking}`;
    };
    expect(play()).toBe(play());
  });
});
