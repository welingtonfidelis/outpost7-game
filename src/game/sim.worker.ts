/**
 * O mundo inteiro mora aqui. A tela manda "avance N ticks com estes comandos" e recebe um
 * retrato com o buffer dos insetos transferido (sem cópia). O buffer volta no pedido
 * seguinte (pingue-pongue), então não há alocação por tick.
 */
import {
  buildWall,
  callToFort,
  createWorld,
  garrison,
  leaveFort,
  canSave,
  loadWorld,
  saveWorld,
  demolish,
  holdUnits,
  makeView,
  orderUnits,
  placeBuilding,
  recallAtRisk,
  recallWorkers,
  releaseWorkers,
  recruit,
  repair,
  setAlarm,
  setFocus,
  setRally,
  startAtWave,
  step,
  trainAnywhere,
  trainUnit,
  upgradeBuilding,
  upgradeTower,
} from '../sim/index.ts';
import type { SimEvent, World } from '../sim/index.ts';
import type { Cmd, Snap, ToWorker } from './protocol.ts';

let w: World | null = null;
let spare: Float32Array | null = null;
/** Resposta ao pedido de salvar deste lote (undefined: ninguém pediu). */
let pendingSave: string | null | undefined;

function apply(world: World, cmd: Cmd): void {
  if (cmd.c === 'alarm') setAlarm(world, cmd.on);
  else if (cmd.c === 'recallRisk') recallAtRisk(world);
  else if (cmd.c === 'recall') recallWorkers(world, cmd.ids);
  else if (cmd.c === 'release') releaseWorkers(world, cmd.ids);
  else if (cmd.c === 'save') pendingSave = canSave(world) ? saveWorld(world, Date.now()) : null;
  else if (cmd.c === 'focus') setFocus(world, cmd.ring);
  else if (cmd.c === 'recruit') recruit(world);
  else if (cmd.c === 'build') placeBuilding(world, cmd.kind, cmd.x, cmd.z);
  else if (cmd.c === 'wall') buildWall(world, cmd.kind, cmd.ax, cmd.az, cmd.bx, cmd.bz);
  else if (cmd.c === 'demolish') demolish(world, cmd.x, cmd.z);
  else if (cmd.c === 'repair') repair(world);
  else if (cmd.c === 'unit' || cmd.c === 'trainAny') trainAnywhere(world, cmd.kind);
  else if (cmd.c === 'train') trainUnit(world, cmd.building, cmd.kind);
  else if (cmd.c === 'upgrade') upgradeBuilding(world, cmd.building);
  else if (cmd.c === 'upgradeTower') upgradeTower(world, cmd.slot);
  else if (cmd.c === 'rally') setRally(world, cmd.kind, cmd.p);
  else if (cmd.c === 'order') orderUnits(world, cmd.ids, cmd.p);
  else if (cmd.c === 'hold') holdUnits(world, cmd.ids);
  else if (cmd.c === 'garrison') garrison(world, cmd.ids, cmd.fort);
  else if (cmd.c === 'callFort') callToFort(world, cmd.fort);
  else if (cmd.c === 'leaveFort') leaveFort(world, cmd.fort);
}

function reply(events: SimEvent[], ms: number, ticks: number): void {
  const { view, bugs } = makeView(w!, spare ?? undefined);
  spare = null;
  const msg: Snap = { type: 'snap', view, bugs, events, ms, ticks };
  if (pendingSave !== undefined) {
    msg.save = pendingSave;
    pendingSave = undefined;
  }
  (self as unknown as Worker).postMessage(msg, [bugs.buffer]);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'init') {
    if (m.load) {
      try {
        w = loadWorld(m.load, m.cfg);
      } catch (err) {
        console.warn('save não carregou; começando do zero', err);
        w = createWorld(m.seed, m.cfg);
      }
    } else {
      w = createWorld(m.seed, m.cfg);
      if (m.startWave > 0) startAtWave(w, m.startWave, 60 * m.startWave);
    }
    reply([], 0, 0);
    return;
  }
  if (!w) return;
  if (m.buf) spare = m.buf;
  const events: SimEvent[] = [];
  // Os eventos do último tick do lote anterior já foram enviados: limpa antes dos comandos
  // (senão voltavam duplicados, e um aviso aparecia duas vezes).
  w.events.length = 0;
  for (const cmd of m.cmds) apply(w, cmd);
  events.push(...w.events);
  w.events.length = 0;
  const t0 = performance.now();
  for (let i = 0; i < m.ticks; i++) {
    step(w);
    if (w.events.length) events.push(...w.events);
  }
  reply(events, performance.now() - t0, m.ticks);
};
