import { CONFIG } from './config.ts';
import type { Config } from './config.ts';
import { rand } from './rng.ts';
import { makeSwarm, makeTowers } from './swarm.ts';
import type { Gate, ResourceNode, Ring, Vec, WaveStats, WaveTimes, Worker, World } from './types.ts';

/** Centro da base, onde a carga é descarregada. */
export const DEPOT: Vec = { x: 0, z: 0 };

const NAMES = [
  'Ana', 'Bia', 'Caio', 'Duda', 'Enzo', 'Fabi', 'Gabi', 'Hugo', 'Iara', 'João', 'Lia', 'Malu', 'Nina', 'Otto',
  'Pedro', 'Rafa', 'Sofia', 'Téo', 'Vivi', 'Yara', 'Zeca', 'Lara', 'Davi', 'Tati', 'Beto', 'Cris', 'Nando',
  'Jaque', 'Leo', 'Mila', 'Ravi', 'Dani', 'Rosa', 'Gui', 'Bento', 'Cida',
];

export function now(w: World): number {
  return w.tick / w.cfg.ticksPerSecond;
}

export function insideBase(cfg: Config, x: number, z: number): boolean {
  return Math.abs(x) < cfg.baseHalf && Math.abs(z) < cfg.baseHalf;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Lugar de cada um dentro da base: grade fixa (sem trigonometria, para não depender do motor JS). */
export function idleSpot(id: number): Vec {
  const k = id % 24;
  const col = k % 6;
  const row = Math.floor(k / 6);
  return { x: -6 + col * 2.4, z: [-7.5, -5.5, 5.5, 7.5][row]! };
}

/** Quantos insetos na onda (curva gradual: poucos no começo, acelerando depois). */
export function hordeSize(cfg: Config, wave: number): number {
  const h = cfg.horde;
  return Math.min(h.cap, Math.round(h.base + h.linear * wave + h.quad * wave * wave));
}

/** Quanto mais forte cada inseto fica nesta onda (vida e mordida). */
export function bugScale(cfg: Config, wave: number): { hp: number; bite: number } {
  return { hp: 1 + cfg.horde.hpGrowth * wave, bite: 1 + cfg.horde.biteGrowth * wave };
}

export function waveTimes(cfg: Config, wave: number, start: number): WaveTimes {
  const calm = Math.max(cfg.calmMin, cfg.calmFirst - wave * cfg.calmStep);
  const arrive = start + calm + cfg.warning;
  const gatesClose = arrive + cfg.gateGrace;
  return {
    start,
    siren: arrive - cfg.warning,
    arrive,
    gatesClose,
    end: gatesClose + cfg.assault,
    bugs: hordeSize(cfg, wave),
  };
}

export function emptyStats(wave: number): WaveStats {
  return { wave, delivered: 0, outsideAtArrive: 0, saved: 0, dropped: 0, wounded: 0, devoured: 0, cargoLost: 0, alarmDelay: null, kills: 0, breaches: 0, coreDamage: 0, insideDeaths: 0, unitsLost: 0 };
}

function makeGates(cfg: Config, closeAt: number): Gate[] {
  const h = cfg.baseHalf;
  const sides: Vec[] = [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ];
  return sides.map((s) => ({
    outer: { x: s.x * (h + 2), z: s.z * (h + 2) },
    inner: { x: s.x * (h - 2.5), z: s.z * (h - 2.5) },
    closeAt,
  }));
}

/** Nós de recurso por amostragem com rejeição no anel (só sqrt, nada de seno). */
function makeNodes(w: World): ResourceNode[] {
  const nodes: ResourceNode[] = [];
  w.cfg.rings.forEach((ring, ri) => {
    for (let n = 0; n < ring.count; n++) {
      for (let tries = 0; tries < 600; tries++) {
        const x = (rand(w) * 2 - 1) * ring.r1;
        const z = (rand(w) * 2 - 1) * ring.r1;
        const d = Math.sqrt(x * x + z * z);
        if (d < ring.r0 || d > ring.r1) continue;
        if (nodes.some((o) => dist(o.x, o.z, x, z) < 13)) continue;
        nodes.push({ id: nodes.length, ring: ri as Ring, x, z, stock: ring.stock, load: ring.load, max: ring.stock });
        break;
      }
    }
  });
  return nodes;
}

export function makeWorker(w: World): Worker {
  const id = w.nextId++;
  const spot = idleSpot(id);
  const name = NAMES[(w.names + id) % NAMES.length]!;
  const k: Worker = {
    id,
    name,
    x: DEPOT.x,
    z: DEPOT.z,
    px: DEPOT.x,
    pz: DEPOT.z,
    speed: w.cfg.speedMin + rand(w) * (w.cfg.speedMax - w.cfg.speedMin),
    state: 'inside',
    node: -1,
    route: [spot],
    timer: 0,
    cargo: 0,
    wounded: 0,
    panic: null,
    diedAt: -1,
    hold: false,
    fort: -1,
  };
  return k;
}

export function createWorld(seed: number, cfg: Config = CONFIG): World {
  const times = waveTimes(cfg, 0, 0);
  const w: World = {
    cfg,
    seed: seed >>> 0,
    rng: seed >>> 0,
    tick: 0,
    wave: 0,
    times,
    phase: 'calm',
    alarm: false,
    alarmAt: null,
    focus: 1,
    ore: 0,
    oreTotal: 0,
    morale: cfg.morale.start,
    workers: [],
    nextId: 0,
    names: 0,
    nodes: [],
    gates: makeGates(cfg, times.gatesClose),
    stats: emptyStats(0),
    history: [],
    events: [],
    swarm: makeSwarm(cfg),
    core: cfg.swarm.coreHp,
    towers: makeTowers(cfg),
    lost: false,
    units: [],
    nextUnitId: 0,
    buildings: [],
    nextBuildId: 0,
    tunnels: [],
    energy: { supply: cfg.build.coreEnergy, demand: 4 },
    rally: { soldado: null, atirador: null, robo: null },
  };
  w.names = Math.floor(rand(w) * NAMES.length);
  w.nodes = makeNodes(w);
  for (let i = 0; i < cfg.startWorkers; i++) {
    const k = makeWorker(w);
    // Já começam no lugar deles.
    const s = idleSpot(k.id);
    k.x = k.px = s.x;
    k.z = k.pz = s.z;
    k.route = [];
    w.workers.push(k);
  }
  return w;
}

/** Começa direto numa onda (testes e medição: ?onda=N). */
export function startAtWave(w: World, wave: number, ore = 0): void {
  w.wave = wave;
  w.times = waveTimes(w.cfg, wave, w.tick / w.cfg.ticksPerSecond);
  for (const g of w.gates) g.closeAt = w.times.gatesClose;
  w.stats = emptyStats(wave);
  w.ore += ore;
}

/**
 * Fim de onda: os nós se recuperam um pouco e, de tempos em tempos, surge uma jazida rica
 * mais longe (expandir rende, mas expõe). Determinístico (rand do mundo, só sqrt).
 */
export function renewResources(w: World): void {
  const e = w.cfg.economy;
  for (const n of w.nodes) n.stock = Math.min(n.max, n.stock + Math.round(n.max * e.regrow));
  if ((w.wave + 1) % e.newEvery !== 0) return;
  for (let tries = 0; tries < 400; tries++) {
    const x = (rand(w) * 2 - 1) * e.newMax;
    const z = (rand(w) * 2 - 1) * e.newMax;
    const d = Math.sqrt(x * x + z * z);
    if (d < e.newMin || d > e.newMax) continue;
    if (w.nodes.some((o) => dist(o.x, o.z, x, z) < 13)) continue;
    w.nodes.push({ id: w.nodes.length, ring: 2, x, z, stock: e.newStock, load: e.newLoad, max: e.newStock });
    w.events.push({ type: 'newDeposit', x, z });
    return;
  }
}
