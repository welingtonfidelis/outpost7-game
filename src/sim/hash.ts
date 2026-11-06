import type { World } from './types.ts';

const STATE_CODE = { inside: 1, toNode: 2, gathering: 3, returning: 4, panic: 5, dead: 6, sheltered: 7 } as const;

/** Impressão digital do estado: a mesma semente e os mesmos comandos dão o mesmo hash. */
export function stateHash(w: World): string {
  const view = new DataView(new ArrayBuffer(8));
  let h = 2166136261;
  const mix = (x: number) => {
    view.setFloat64(0, x);
    for (let i = 0; i < 8; i++) h = Math.imul(h ^ view.getUint8(i), 16777619);
  };
  mix(w.tick);
  mix(w.wave);
  mix(w.ore);
  mix(w.oreTotal);
  mix(w.morale);
  for (const k of w.workers) {
    mix(k.id);
    mix(k.x);
    mix(k.z);
    mix(STATE_CODE[k.state]);
    mix(k.cargo);
    mix(k.wounded);
    mix(k.speed);
  }
  for (const u of w.units) {
    mix(u.id);
    mix(u.x);
    mix(u.z);
    mix(u.hp);
    mix(u.dead ? 1 : 0);
    mix(u.inside);
  }
  const sw = w.swarm;
  mix(w.core);
  mix(sw.n);
  mix(sw.alive);
  for (let i = 0; i < sw.n; i++) {
    mix(sw.x[i]!);
    mix(sw.z[i]!);
    mix(sw.hp[i]!);
    mix(sw.state[i]!);
  }
  for (const c of sw.wallIdx) {
    mix(c);
    mix(sw.wallHp[c]!);
  }
  for (const b of w.buildings) {
    mix(b.id);
    mix(b.hp);
    mix(b.cells[0]!);
    mix(b.level);
    mix(b.upgradeLeft);
    mix(b.queue.length);
    mix(b.trainLeft);
    mix(b.buildLeft);
  }
  for (const t of w.towers) {
    mix(t.slot);
    mix(t.level);
  }
  mix(w.energy.supply);
  for (const n of w.nodes) {
    mix(n.x);
    mix(n.z);
    mix(n.stock);
    mix(n.max);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
