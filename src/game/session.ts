/**
 * Ponte entre a tela e a simulação, que roda num Web Worker. Acumula o tempo do quadro em
 * ticks fixos (20/s), manda pedir os ticks e os comandos e guarda o último retrato. Só um
 * pedido por vez; se o worker atrasar, os ticks se acumulam no próximo.
 */
import type { BuildingKind, Config, Ring, SimEvent, UnitKind, Vec, WallKind, WorldView } from '../sim/index.ts';
import type { Cmd, Snap, ToWorker } from './protocol.ts';

export type Speed = 1 | 2 | 4;

export class Session {
  world!: WorldView;
  bugs: Float32Array = new Float32Array(0);
  speed: Speed = 1;
  paused = false;
  /** Custo do último lote no worker (ms por tick). */
  simMsPerTick = 0;
  readonly ready: Promise<void>;
  private acc = 0;
  private inflight = false;
  private cmds: Cmd[] = [];
  private spare: Float32Array | null = null;
  private listeners = new Set<(ev: SimEvent[]) => void>();
  private waiters: (() => void)[] = [];
  private worker: Worker;
  private tps: number;

  private saveWaiters: ((data: string | null) => void)[] = [];

  constructor(cfg: Config, seed: number, startWave = 0, load?: string) {
    this.tps = cfg.ticksPerSecond;
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise((resolve) => {
      this.waiters.push(resolve);
    });
    this.worker.onmessage = (e: MessageEvent<Snap>) => this.receive(e.data);
    this.post({ type: 'init', seed, cfg, startWave, load });
    this.inflight = true;
  }

  private post(m: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(m, transfer);
  }

  private receive(s: Snap): void {
    if (this.bugs.length) this.spare = this.bugs;
    // Suavização: o 3D vai da posição mostrada até a deste retrato ao longo do tempo que
    // ele cobre (ticks × duração do tick), sem voltar atrás quando o retrato atrasa.
    this.prevTick = this.world ? this.world.tick : s.view.tick;
    this.snapAt = performance.now();
    this.snapSpan = Math.max(1, s.ticks) * this.tickMs / Math.max(1, this.speed);
    this.snapId++;
    this.world = s.view;
    this.bugs = s.bugs;
    this.inflight = false;
    if (s.ticks > 0) this.simMsPerTick = s.ms / s.ticks;
    if (s.events.length) for (const fn of this.listeners) fn(s.events);
    if (s.save !== undefined) {
      const ws = this.saveWaiters;
      this.saveWaiters = [];
      for (const fn of ws) fn(s.save);
    }
    const ws = this.waiters;
    this.waiters = [];
    for (const fn of ws) fn();
  }

  private request(ticks: number): void {
    const buf = this.spare;
    this.spare = null;
    const cmds = this.cmds;
    this.cmds = [];
    this.inflight = true;
    this.post({ type: 'advance', ticks, cmds, buf }, buf ? [buf.buffer] : []);
  }

  get tickMs(): number {
    return 1000 / this.tps;
  }

  /** Fração do tick atual (para suavizar o 3D entre ticks). */
  /** Identidade do retrato atual (muda a cada resposta do worker). */
  snapId = 0;
  private snapAt = 0;
  private snapSpan = 50;
  private prevTick = 0;

  /** Quanto do caminho até o retrato atual já foi mostrado (0 a 1), só pelo relógio. */
  get alpha(): number {
    if (this.paused) return 1;
    return Math.min(1, (performance.now() - this.snapAt) / this.snapSpan);
  }

  get frac(): number {
    return Math.min(1, this.acc / this.tickMs);
  }

  /** Tempo de jogo suavizado (s). */
  get time(): number {
    if (!this.world) return 0;
    // Tempo de jogo suave e sempre para a frente: do tick anterior até o atual, pelo alpha.
    return (this.prevTick + (this.world.tick - this.prevTick) * this.alpha) / this.tps;
  }

  frame(dtMs: number): void {
    if (!this.world) return;
    if (!this.paused && !this.world.lost) this.acc += Math.min(dtMs, 250) * this.speed;
    if (this.inflight) return;
    let n = Math.floor(this.acc / this.tickMs);
    if (n > 0 || this.cmds.length) {
      n = Math.min(n, 40);
      this.acc -= n * this.tickMs;
      if (this.acc > this.tickMs * 2) this.acc = this.tickMs * 2;
      this.request(n);
    }
  }

  /** Pula `seconds` de jogo de uma vez (testes no navegador). */
  async simulate(seconds: number): Promise<void> {
    while (this.inflight) await new Promise<void>((r) => this.waiters.push(r));
    const done = new Promise<void>((r) => this.waiters.push(r));
    this.request(Math.round(seconds * this.tps));
    await done;
  }

  on(fn: (ev: SimEvent[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private cmd(c: Cmd): void {
    this.cmds.push(c);
  }

  alarm(on: boolean): void {
    this.cmd({ c: 'alarm', on });
  }

  focus(ring: Ring): void {
    this.cmd({ c: 'focus', ring });
  }

  recruit(): void {
    this.cmd({ c: 'recruit' });
  }

  build(kind: BuildingKind, x: number, z: number): void {
    this.cmd({ c: 'build', kind, x, z });
  }

  wall(kind: WallKind, a: Vec, b: Vec): void {
    this.cmd({ c: 'wall', kind, ax: a.x, az: a.z, bx: b.x, bz: b.z });
  }

  demolish(x: number, z: number): void {
    this.cmd({ c: 'demolish', x, z });
  }

  /** Pede o mundo salvo ao worker (só na calma; null se não deu). */
  snapshotSave(): Promise<string | null> {
    return new Promise((resolve) => {
      this.saveWaiters.push(resolve);
      this.cmd({ c: 'save' });
    });
  }

  /** Chama estes trabalhadores de volta (ficam dentro até liberar). */
  recall(ids: number[]): void {
    this.cmd({ c: 'recall', ids: [...ids] });
  }

  /** Solta quem foi chamado. */
  release(ids: number[]): void {
    this.cmd({ c: 'release', ids: [...ids] });
  }

  /** Chama de volta só quem está em risco (os outros seguem coletando). */
  recallRisk(): void {
    this.cmd({ c: 'recallRisk' });
  }

  repair(): void {
    this.cmd({ c: 'repair' });
  }

  unit(kind: UnitKind): void {
    this.cmd({ c: 'unit', kind });
  }

  train(building: number, kind: UnitKind): void {
    this.cmd({ c: 'train', building, kind });
  }

  upgrade(building: number): void {
    this.cmd({ c: 'upgrade', building });
  }

  upgradeTower(slot: number): void {
    this.cmd({ c: 'upgradeTower', slot });
  }

  rally(kind: UnitKind, p: Vec | null): void {
    this.cmd({ c: 'rally', kind, p });
  }

  /** Leva as unidades escolhidas para `p` em formação (null: voltam ao automático). */
  order(ids: number[], p: Vec | null): void {
    if (ids.length) this.cmd({ c: 'order', ids: [...ids], p });
  }

  /** Manda as escolhidas entrarem no fortim (até as vagas). */
  garrison(ids: number[], fort: number): void {
    if (ids.length) this.cmd({ c: 'garrison', ids: [...ids], fort });
  }

  /** As tropas livres mais perto vêm encher o fortim. */
  callFort(fort: number): void {
    this.cmd({ c: 'callFort', fort });
  }

  /** Todos saem do fortim e ficam na porta. */
  leaveFort(fort: number): void {
    this.cmd({ c: 'leaveFort', fort });
  }

  /** As unidades escolhidas ficam onde estão. */
  hold(ids: number[]): void {
    if (ids.length) this.cmd({ c: 'hold', ids: [...ids] });
  }

  dispose(): void {
    this.worker.terminate();
  }
}
