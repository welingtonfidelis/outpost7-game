import { describe, expect, it } from 'vitest';
import {
  advance,
  createWorld,
  insideBase,
  recruit,
  setAlarm,
  setFocus,
  stateHash,
  step,
  survivalChance,
  withConfig,
} from '../src/sim/index.ts';
import type { SimEvent, World } from '../src/sim/index.ts';

const TPS = 20;
const sec = (s: number) => Math.round(s * TPS);

/** Roda até um instante de jogo (s), juntando os eventos. */
function runTo(w: World, t: number, out: SimEvent[] = []): SimEvent[] {
  while (w.tick < sec(t) && !w.lost) {
    step(w);
    out.push(...w.events);
  }
  return out;
}

describe('determinismo', () => {
  it('mesma semente e mesmos comandos dão a mesma história', () => {
    const play = () => {
      const w = createWorld(1234);
      runTo(w, 60);
      setFocus(w, 2);
      runTo(w, w.times.siren + 12);
      setAlarm(w, true);
      runTo(w, 600);
      return stateHash(w);
    };
    expect(play()).toBe(play());
  });

  it('sementes diferentes dão mapas diferentes', () => {
    expect(stateHash(createWorld(1))).not.toBe(stateHash(createWorld(2)));
  });
});

describe('ciclo do trabalhador', () => {
  it('trabalhadores saem, coletam e descarregam antes da primeira onda', () => {
    const w = createWorld(7);
    const ev = runTo(w, w.times.siren);
    expect(ev.some((e) => e.type === 'deposit')).toBe(true);
    expect(w.ore).toBeGreaterThan(0);
  });

  it('o alarme geral traz todo mundo de volta antes da horda', () => {
    const w = createWorld(7);
    runTo(w, w.times.siren);
    setAlarm(w, true);
    runTo(w, w.times.arrive - 0.05);
    const fora = w.workers.filter((k) => !insideBase(w.cfg, k.x, k.z));
    expect(fora).toHaveLength(0);
    const ev = runTo(w, w.times.arrive + 1);
    const arrive = ev.find((e) => e.type === 'arrive');
    expect(arrive && arrive.type === 'arrive' && arrive.outside).toBe(0);
  });

  it('longe rende mais por minuto que perto, sem horda no caminho', () => {
    const cfg = withConfig({ calmFirst: 100000, calmMin: 100000 });
    const renda = (ring: 0 | 1 | 2) => {
      const w = createWorld(3, cfg);
      setFocus(w, ring);
      runTo(w, 240);
      return w.oreTotal;
    };
    expect(renda(2)).toBeGreaterThan(renda(1));
    expect(renda(1)).toBeGreaterThan(renda(0));
  });

  it('recrutar custa minério e soma um trabalhador', () => {
    const w = createWorld(7);
    w.ore = 100;
    const antes = w.workers.length;
    expect(recruit(w)).toBe(true);
    expect(w.workers.length).toBe(antes + 1);
    expect(w.ore).toBe(100 - w.cfg.recruitCost);
  });
});

describe('fator pânico', () => {
  it('quem está mais perto do portão tem mais chance', () => {
    const w = createWorld(7);
    const k = w.workers[0]!;
    k.cargo = 0;
    const chanceEm = (x: number) => {
      k.x = x;
      k.z = 0;
      return survivalChance(w, k);
    };
    expect(chanceEm(20)).toBeGreaterThan(chanceEm(40));
    expect(chanceEm(40)).toBeGreaterThan(chanceEm(60));
    expect(chanceEm(95)).toBe(0);
    expect(chanceEm(0)).toBe(1);
  });

  it('quem fica fora rola uma vez, e o resultado se cumpre', () => {
    const w = createWorld(11);
    setFocus(w, 2);
    const ev: SimEvent[] = [];
    // A onda acaba quando o último inseto morre: roda até o waveEnd e usa as estatísticas dele.
    while (!ev.some((e) => e.type === 'waveEnd') && !w.lost) {
      step(w);
      ev.push(...w.events);
    }
    const end = ev.find((e) => e.type === 'waveEnd');
    const stats = end && end.type === 'waveEnd' ? end.stats : w.stats;
    const rolls = ev.filter((e) => e.type === 'panic');
    expect(rolls.length).toBeGreaterThan(0);
    const devorados = rolls.filter((e) => e.type === 'panic' && e.outcome === 'devorado').length;
    const comidos = ev.filter((e) => e.type === 'devoured').length;
    expect(comidos).toBe(devorados);
    const salvos = ev.filter((e) => e.type === 'saved').length;
    expect(salvos + comidos).toBe(rolls.length);
    expect(stats.outsideAtArrive).toBe(rolls.length);
  });

  it('a rolagem não depende da ordem dos trabalhadores', () => {
    const a = createWorld(21);
    const b = createWorld(21);
    setFocus(a, 2);
    setFocus(b, 2);
    runTo(a, a.times.arrive - 0.05);
    runTo(b, b.times.arrive - 0.05);
    b.workers.reverse();
    const ra: SimEvent[] = [];
    const rb: SimEvent[] = [];
    runTo(a, a.times.arrive + 0.1, ra);
    runTo(b, b.times.arrive + 0.1, rb);
    const res = (ev: SimEvent[]) =>
      ev
        .filter((e) => e.type === 'panic')
        .map((e) => (e.type === 'panic' ? `${e.worker}:${e.outcome}` : ''))
        .sort();
    expect(res(rb)).toEqual(res(ra));
  });

  it('uma partida inteira roda até perder ou passar de 10 ondas, sem travar', () => {
    const w = createWorld(99);
    advance(w, sec(2500));
    expect(w.lost || w.history.length >= 10).toBe(true);
  });
});
