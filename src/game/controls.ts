/** Estado de interface compartilhado entre o HUD e o toque no mapa. */
import type { BuildingKind, Vec, WallKind } from '../sim/index.ts';

export type BuildTool = BuildingKind | WallKind | 'demolir';

export interface Pending {
  tool: BuildTool;
  a: Vec;
  /** Fim da linha (muralha e portão). */
  b: Vec | null;
  /** Ainda arrastando (a linha não está pronta para confirmar). */
  dragging: boolean;
}

export type Selection =
  | { type: 'building'; id: number }
  | { type: 'tower'; slot: number }
  | { type: 'units'; ids: number[] }
  | { type: 'wall'; x: number; z: number }
  | { type: 'worker'; id: number }
  | null;

export class Controls {
  /** Prédio, torre ou tropas escolhidas (painel aberto). Com tropas, tocar no chão manda ir. */
  selected: Selection = null;
  /** Modo construir aberto. */
  building = false;
  tool: BuildTool | null = null;
  pending: Pending | null = null;
  private listeners = new Set<() => void>();
  /** Marcador de ordem no chão (o 3D registra quem desenha). */
  onPing: ((p: Vec, kind: 'move' | 'build') => void) | null = null;

  ping(p: Vec, kind: 'move' | 'build'): void {
    this.onPing?.(p, kind);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  select(s: Selection): void {
    if (s?.type === 'units' && !s.ids.length) s = null;
    this.selected = s;
    if (s) {
      this.building = false;
      this.tool = null;
      this.pending = null;
    }
    this.emit();
  }

  /** Ids das tropas escolhidas (vazio se a escolha é outra coisa). */
  unitIds(): number[] {
    return this.selected?.type === 'units' ? this.selected.ids : [];
  }

  setBuilding(on: boolean): void {
    this.building = on;
    this.tool = null;
    this.pending = null;
    if (on) this.selected = null;
    this.emit();
  }

  setTool(tool: BuildTool | null): void {
    this.tool = tool;
    this.pending = null;
    this.emit();
  }

  setPending(p: Pending | null): void {
    this.pending = p;
    this.emit();
  }

  isLineTool(): boolean {
    return this.tool === 'muralha' || this.tool === 'portao';
  }

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
