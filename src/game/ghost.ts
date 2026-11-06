/**
 * O fantasma do modo construir, calculado na tela com o que o retrato tem (muralhas, prédios,
 * nós). O worker confere de novo ao construir; se discordar, avisa com 'buildFail'.
 */
import { PLAYER_GATE, RUBBLE, buildReach, gridFootprint, gridLine, viewBuildable, viewOccupied, wallLayout } from '../sim/index.ts';
import type { BuildingKind, WorldView } from '../sim/index.ts';
import type { Pending } from './controls.ts';

export interface GhostPlan {
  cells: { cell: number; ok: boolean; height: number }[];
  /** Custo (construir) ou devolução (demolir). */
  cost: number;
  /** Quantas células valem (muralha) ou se cabe (prédio). */
  valid: number;
  ok: boolean;
  label: string;
}

const NAMES: Record<BuildingKind, string> = { torre: 'Torre', gerador: 'Gerador', refinaria: 'Refinaria', fabrica: 'Fábrica', quartel: 'Quartel', fortim: 'Fortim' };
let fixedCount = -1;

/** Um pedaço de muralha ou portão no ponto (para escolher e demolir fora do modo construir). */
export interface WallInfo {
  cell: number;
  kind: 'muralha' | 'portao' | 'entulho';
  /** Do posto (não dá para demolir). */
  fixed: boolean;
  hp: number;
  full: number;
}

export function wallAt(v: WorldView, x: number, z: number): WallInfo | null {
  const size = v.gridSize;
  const half = size / 2;
  const c = Math.floor(z + half) * size + Math.floor(x + half);
  const k = v.wallCells.indexOf(c);
  if (k < 0) return null;
  if (fixedCount < 0) fixedCount = wallLayout(v.cfg).length;
  const gate = v.wallGate[k]!;
  const rubble = v.wallTerrain[k] === RUBBLE;
  const full = gate >= 0 ? (gate === PLAYER_GATE ? v.cfg.build.gate.hp : v.cfg.swarm.gateHp) : v.cfg.swarm.wallHp;
  return { cell: c, kind: rubble ? 'entulho' : gate >= 0 ? 'portao' : 'muralha', fixed: k < fixedCount, hp: v.wallHp[k]!, full };
}

export function planGhost(v: WorldView, p: Pending): GhostPlan {
  const occ = viewOccupied(v);
  const bv = { gridSize: v.gridSize, cfg: v.cfg, wallCells: v.wallCells, buildings: v.buildings, nodes: v.nodes };
  const size = v.gridSize;
  if (p.tool === 'muralha' || p.tool === 'portao') {
    const gate = p.tool === 'portao';
    let line = gridLine(size, p.a.x, p.a.z, (p.b ?? p.a).x, (p.b ?? p.a).z);
    const cells = line.map((cell) => ({ cell, ok: viewBuildable(bv, occ, cell), height: gate ? 3.1 : 3.4 }));
    let good = cells.filter((c) => c.ok);
    if (gate && good.length > v.cfg.build.gate.maxLen) {
      const keep = new Set(good.slice(0, v.cfg.build.gate.maxLen).map((c) => c.cell));
      line = line.filter((c) => keep.has(c) || !cells.find((x) => x.cell === c)?.ok);
      good = good.slice(0, v.cfg.build.gate.maxLen);
      cells.forEach((c) => {
        if (c.ok && !keep.has(c.cell)) c.ok = false;
      });
    }
    const per = gate ? v.cfg.build.gate.costPerCell : v.cfg.build.wall.costPerCell;
    const cost = good.length * per;
    return {
      cells,
      cost,
      valid: good.length,
      ok: good.length > 0 && v.ore >= cost,
      label: `${gate ? 'Portão' : 'Muralha'} de ${good.length} m${good.length < cells.length ? ` (${cells.length - good.length} m não cabem)` : ''}`,
    };
  }
  if (p.tool === 'demolir') {
    const half = size / 2;
    const ci = Math.floor(p.a.x + half);
    const cj = Math.floor(p.a.z + half);
    const c = cj * size + ci;
    const b = v.buildings.find((x) => x.cells.includes(c));
    if (b) {
      const refund = Math.floor(v.cfg.build[b.kind].cost * v.cfg.build.refund);
      return { cells: b.cells.map((cell) => ({ cell, ok: false, height: 3.6 })), cost: refund, valid: 1, ok: true, label: `Demolir ${NAMES[b.kind].toLowerCase()}` };
    }
    if (fixedCount < 0) fixedCount = wallLayout(v.cfg).length;
    const mine = new Map<number, number>();
    for (let k = fixedCount; k < v.wallCells.length; k++) mine.set(v.wallCells[k]!, v.wallGate[k]!);
    const cells: GhostPlan['cells'] = [];
    let refund = 0;
    for (let oz = -1; oz <= 1; oz++)
      for (let ox = -1; ox <= 1; ox++) {
        const n = c + oz * size + ox;
        if (!mine.has(n)) continue;
        cells.push({ cell: n, ok: false, height: 3.6 });
        refund += (mine.get(n)! >= 0 ? v.cfg.build.gate.costPerCell : v.cfg.build.wall.costPerCell) * v.cfg.build.refund;
      }
    return { cells, cost: Math.floor(refund), valid: cells.length, ok: cells.length > 0, label: cells.length ? `Demolir ${cells.length} m de muralha` : 'Nada para demolir aí' };
  }
  const kind = p.tool;
  const bc = v.cfg.build[kind];
  const fp = gridFootprint(size, bc.size, p.a.x, p.a.z);
  const fits = fp.length > 0 && fp.every((c) => viewBuildable(bv, occ, c, buildReach(v.cfg, kind)));
  const many = kind === 'refinaria' && v.buildings.filter((b) => b.kind === 'refinaria').length >= v.cfg.build.refinaria.max;
  return {
    cells: fp.map((cell) => ({ cell, ok: fits && !many, height: kind === 'torre' ? 3.2 : 2 })),
    cost: bc.cost,
    valid: fits ? 1 : 0,
    ok: fits && !many && v.ore >= bc.cost,
    label: many ? `No máximo ${v.cfg.build.refinaria.max} refinarias` : fits ? NAMES[kind] : `${NAMES[kind]} não cabe aí`,
  };
}
