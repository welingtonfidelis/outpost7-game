/** Mensagens entre a tela e o worker da simulação. */
import type { BuildingKind, Config, Ring, SimEvent, UnitKind, Vec, WallKind, WorldView } from '../sim/index.ts';

export type Cmd =
  | { c: 'alarm'; on: boolean }
  | { c: 'recallRisk' }
  | { c: 'recall'; ids: number[] }
  | { c: 'release'; ids: number[] }
  | { c: 'save' }
  | { c: 'focus'; ring: Ring }
  | { c: 'recruit' }
  | { c: 'build'; kind: BuildingKind; x: number; z: number }
  | { c: 'wall'; kind: WallKind; ax: number; az: number; bx: number; bz: number }
  | { c: 'demolish'; x: number; z: number }
  | { c: 'train'; building: number; kind: UnitKind }
  | { c: 'trainAny'; kind: UnitKind }
  | { c: 'upgrade'; building: number }
  | { c: 'upgradeTower'; slot: number }
  | { c: 'repair' }
  | { c: 'unit'; kind: UnitKind }
  | { c: 'rally'; kind: UnitKind; p: Vec | null }
  | { c: 'order'; ids: number[]; p: Vec | null }
  | { c: 'hold'; ids: number[] }
  | { c: 'garrison'; ids: number[]; fort: number }
  | { c: 'callFort'; fort: number }
  | { c: 'leaveFort'; fort: number };

export type ToWorker =
  | { type: 'init'; seed: number; cfg: Config; startWave: number; load?: string }
  | { type: 'advance'; ticks: number; cmds: Cmd[]; buf: Float32Array | null };

export interface Snap {
  type: 'snap';
  view: WorldView;
  bugs: Float32Array;
  events: SimEvent[];
  /** Tempo gasto pelo worker nesses ticks (ms) e quantos ticks foram. */
  ms: number;
  ticks: number;
  /** Resposta a um pedido de salvar: o JSON, ou null se não deu (fora da calma). */
  save?: string | null;
}
