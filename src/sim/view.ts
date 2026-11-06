/**
 * Retrato do mundo para a tela: tudo menos as grades e os arrays do enxame, que ficam no
 * worker. Os insetos vão num buffer à parte (6 floats cada) e a muralha num array de HP
 * alinhado com `wallIdx` (a mesma ordem que makeSwarm gera dos dois lados).
 */
import { B_BITE, B_DIG, B_DYING, B_NONE, B_WALK, GATE, WALL, cellAt, repairCost } from './swarm.ts';
import type { World } from './types.ts';

/** px, pz, x, z, direção, estado, altura (pilha e muralha), tipo (0 comum, 1 escavador, 2 grande). Só para desenhar. */
export const BUG_FLOATS = 8;
const WALL_TOP = 3.4;

export type WorldView = Omit<World, 'swarm'> & {
  bugsAlive: number;
  bugCount: number;
  repairCost: number;
  /** Células de muralha/portão (índice na grade), as do posto primeiro. */
  wallCells: Int32Array;
  /** HP, terreno e portão (-1: muralha) de cada uma, na mesma ordem. */
  wallHp: Float32Array;
  wallTerrain: Uint8Array;
  wallGate: Int8Array;
  /** Lado da grade e meio (para converter célula em metro). */
  gridSize: number;
};

/** Monta o retrato. `bugs` é reaproveitado se couber (pingue-pongue com a tela). */
export function makeView(w: World, bugs?: Float32Array): { view: WorldView; bugs: Float32Array } {
  const sw = w.swarm;
  const need = sw.n * BUG_FLOATS;
  const out = bugs && bugs.length >= need ? bugs : new Float32Array(Math.max(need, BUG_FLOATS * 64));
  for (let i = 0; i < sw.n; i++) {
    const o = i * BUG_FLOATS;
    const st = sw.state[i]!;
    out[o] = sw.px[i]!;
    out[o + 1] = sw.pz[i]!;
    out[o + 2] = sw.x[i]!;
    out[o + 3] = sw.z[i]!;
    out[o + 4] = sw.heading[i]!;
    out[o + 5] = st === B_NONE ? -1 : st === B_WALK || st === B_DIG ? 0 : st === B_BITE ? 1 : st === B_DYING ? 2 + Math.min(1, sw.timer[i]! / 1.5) : -1;
    // Altura: em cima da muralha escalável, ou empilhado na frente de uma pilha crescendo.
    let y = 0;
    if (st === B_WALK || st === B_BITE) {
      const c = cellAt(sw, sw.x[i]!, sw.z[i]!);
      if (c >= 0 && sw.climb[c]! > 0 && (sw.terrain[c] === WALL || sw.terrain[c] === GATE)) y = WALL_TOP;
      else if (st === B_BITE) {
        const h = sw.heading[i]!;
        const f = cellAt(sw, sw.x[i]! + Math.cos(h) * 0.9, sw.z[i]! + Math.sin(h) * 0.9);
        if (f >= 0 && sw.pile[f]! > 0) y = sw.pile[f]! * WALL_TOP * (0.35 + 0.65 * ((i % 5) / 4));
      }
    }
    out[o + 6] = y;
    // Tipo de aparência: escavador (com túnel) ou grande (um a cada 12, só visual).
    out[o + 7] = st === B_DIG ? 1 : i % 12 === 0 ? 2 : 0;
  }
  const nW = sw.wallIdx.length;
  const wallCells = Int32Array.from(sw.wallIdx);
  const wallHp = new Float32Array(nW);
  const wallTerrain = new Uint8Array(nW);
  const wallGate = new Int8Array(nW);
  sw.wallIdx.forEach((c, k) => {
    wallHp[k] = sw.wallHp[c]!;
    wallTerrain[k] = sw.terrain[c]!;
    wallGate[k] = sw.gateOf[c]!;
  });
  const { swarm: _omit, ...rest } = w;
  void _omit;
  const view: WorldView = {
    ...rest,
    events: [],
    bugsAlive: sw.alive,
    bugCount: sw.n,
    repairCost: repairCost(w),
    wallCells,
    wallHp,
    wallTerrain,
    wallGate,
    gridSize: sw.size,
  };
  return { view, bugs: out };
}
