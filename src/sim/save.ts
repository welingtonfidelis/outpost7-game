/**
 * Etapa 17: salvar e carregar a partida. Só na calma (o enxame está vazio, as pilhas e os
 * túneis foram zerados), então basta o mundo lógico e as grades persistentes do enxame
 * (terreno, HP das células, portões, prédios por célula, muralhas). As grades vão esparsas:
 * só o que difere do padrão. Ao carregar, vale a configuração atual do jogo (os ajustes de
 * equilíbrio chegam às partidas salvas); o campo de caminhos é refeito no primeiro tick.
 */
import type { Config } from './config.ts';
import { makeSwarm } from './swarm.ts';
import type { Swarm } from './swarm.ts';
import type { World } from './types.ts';

export const SAVE_VERSION = 1;

type Typed = Uint8Array | Int8Array | Int32Array | Float32Array;

interface Sparse {
  len: number;
  def: number;
  idx: number[];
  val: number[];
}

function pack(a: Typed, def: number): Sparse {
  const idx: number[] = [];
  const val: number[] = [];
  for (let i = 0; i < a.length; i++)
    if (a[i] !== def) {
      idx.push(i);
      val.push(a[i]!);
    }
  return { len: a.length, def, idx, val };
}

function unpack(s: Sparse, into: Typed): void {
  if (s.len !== into.length) throw new Error('grade com tamanho diferente');
  into.fill(s.def);
  for (let k = 0; k < s.idx.length; k++) into[s.idx[k]!] = s.val[k]!;
}

export interface SaveMeta {
  v: number;
  wave: number;
  ore: number;
  workers: number;
  savedAt: number;
}

export interface SaveFile {
  meta: SaveMeta;
  world: Omit<World, 'swarm' | 'events' | 'cfg'>;
  swarm: {
    terrain: Sparse;
    wallHp: Sparse;
    gateOf: Sparse;
    structOf: Sparse;
    wallFixed: Sparse;
    wallIdx: number[];
    gateOpen: boolean[];
  };
}

/** Dá para salvar agora? (só na calma e com a colônia de pé) */
export function canSave(w: Pick<World, 'phase' | 'lost'>): boolean {
  return w.phase === 'calm' && !w.lost;
}

/** Números não finitos viram texto (o JSON os perderia). */
function replacer(_k: string, v: unknown): unknown {
  return typeof v === 'number' && !Number.isFinite(v) ? { $n: String(v) } : v;
}
function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object' && '$n' in (v as Record<string, unknown>)) return Number((v as { $n: string }).$n);
  return v;
}

export function saveWorld(w: World, now = 0): string {
  if (!canSave(w)) throw new Error('só dá para salvar na calma');
  const { swarm, events, cfg, ...rest } = w;
  void events;
  void cfg;
  const sw = swarm;
  const file: SaveFile = {
    meta: { v: SAVE_VERSION, wave: w.wave, ore: w.ore, workers: w.workers.filter((k) => k.state !== 'dead').length, savedAt: now },
    world: rest,
    swarm: {
      terrain: pack(sw.terrain, 0),
      wallHp: pack(sw.wallHp, 0),
      gateOf: pack(sw.gateOf, -1),
      structOf: pack(sw.structOf, 0),
      wallFixed: pack(sw.wallFixed, 0),
      wallIdx: [...sw.wallIdx],
      gateOpen: [...sw.gateOpen],
    },
  };
  return JSON.stringify(file, replacer);
}

/** Lê só o resumo (para a tela de início). */
export function readMeta(json: string): SaveMeta | null {
  try {
    const f = JSON.parse(json, reviver) as SaveFile;
    return f.meta?.v === SAVE_VERSION ? f.meta : null;
  } catch {
    return null;
  }
}

export function loadWorld(json: string, cfg: Config): World {
  const f = JSON.parse(json, reviver) as SaveFile;
  if (f.meta?.v !== SAVE_VERSION) throw new Error('versão de save diferente');
  const sw: Swarm = makeSwarm(cfg);
  unpack(f.swarm.terrain, sw.terrain);
  unpack(f.swarm.wallHp, sw.wallHp);
  unpack(f.swarm.gateOf, sw.gateOf);
  unpack(f.swarm.structOf, sw.structOf);
  unpack(f.swarm.wallFixed, sw.wallFixed);
  sw.wallIdx = [...f.swarm.wallIdx];
  sw.gateOpen = [...f.swarm.gateOpen];
  sw.flowDirty = true;
  sw.sinceFlow = 1e9;
  const w: World = { ...f.world, cfg, swarm: sw, events: [] };
  return w;
}
