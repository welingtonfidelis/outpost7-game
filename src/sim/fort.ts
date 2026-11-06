/**
 * Etapa 14: o fortim. Soldados e atiradores entram (até as vagas), somem do mapa, ficam fora
 * do alcance do enxame e atiram do centro do prédio com bônus de dano e alcance. O enxame
 * morde o fortim como qualquer prédio; se ele cair, quem estava dentro sai ferido
 * (`ejectFort`, em build.ts). Movimento e escolha só com + - * / e sqrt.
 */
import { doorOf, ejectFort } from './build.ts';
import { upgradeSum } from './production.ts';
import type { Building, Unit, World } from './types.ts';
import { dist, insideBase } from './world.ts';

/** Fora da fortaleza (muralha do posto), o fortim é posto avançado. */
export function isOutpost(w: Pick<World, 'cfg'>, b: Pick<Building, 'x' | 'z'>): boolean {
  return !insideBase(w.cfg, b.x, b.z);
}

export function fortStats(w: Pick<World, 'cfg'>, b: Pick<Building, 'level' | 'x' | 'z'>): { slots: number; dmg: number; range: number; outpost: boolean } {
  const fc = w.cfg.build.fortim;
  const lv = w.cfg.upgrades.fortim;
  const up = upgradeSum(lv, b.level);
  let slots = fc.slots;
  for (let i = 0; i < b.level - 1 && i < lv.length; i++) slots += lv[i]!.slots ?? 0;
  const outpost = isOutpost(w, b);
  return { slots, dmg: fc.dmg + up.dmg, range: fc.range + up.range + (outpost ? fc.outpostRange : 0), outpost };
}

/** Trabalhadores abrigados (ou a caminho do abrigo) neste fortim. */
export function shelterUsed(w: Pick<World, 'workers'>, id: number): number {
  let n = 0;
  for (const k of w.workers) if (k.fort === id && k.state === 'sheltered') n++;
  return n;
}

export function occupants(w: Pick<World, 'units'>, id: number): Unit[] {
  return w.units.filter((u) => !u.dead && u.inside === id);
}

/** Quem está indo para o fortim (vaga reservada). */
export function incoming(w: Pick<World, 'units'>, id: number): Unit[] {
  return w.units.filter((u) => !u.dead && u.enter === id && u.inside < 0);
}

function fortById(w: World, id: number): Building | undefined {
  const b = w.buildings.find((x) => x.id === id);
  return b && b.kind === 'fortim' ? b : undefined;
}

/**
 * Manda as unidades escolhidas entrarem no fortim, até as vagas livres (as mais perto da
 * porta primeiro). Robôs não entram. Devolve quantas foram.
 */
export function garrison(w: World, ids: number[], fortId: number): number {
  const b = fortById(w, fortId);
  if (!b || w.lost) return 0;
  if (b.buildLeft > 0) {
    w.events.push({ type: 'notice', text: 'O fortim ainda está em obra.' });
    return 0;
  }
  const want = new Set(ids);
  const cand = w.units.filter((u) => want.has(u.id) && !u.dead && u.kind !== 'robo' && u.inside !== b.id && u.enter !== b.id);
  if (!cand.length) {
    if (w.units.some((u) => want.has(u.id) && u.kind === 'robo'))
      w.events.push({ type: 'notice', text: 'Só soldados e atiradores entram no fortim.' });
    return 0;
  }
  const free = fortStats(w, b).slots - occupants(w, b.id).length - incoming(w, b.id).length;
  if (free <= 0) {
    w.events.push({ type: 'notice', text: 'O fortim está cheio.' });
    return 0;
  }
  const d = doorOf(b);
  cand.sort((a, c) => dist(a.x, a.z, d.x, d.z) - dist(c.x, c.z, d.x, d.z) || a.id - c.id);
  const go = cand.slice(0, free);
  const left = cand.length - go.length;
  if (left > 0) w.events.push({ type: 'notice', text: `${left === 1 ? '1 ficou' : `${left} ficaram`} de fora: o fortim tem ${fortStats(w, b).slots} vagas.` });
  for (const u of go) {
    // Saindo de outro fortim: primeiro sai pela porta de lá.
    if (u.inside >= 0) {
      const other = fortById(w, u.inside);
      u.inside = -1;
      if (other) {
        const od = doorOf(other);
        u.x = u.px = od.x;
        u.z = u.pz = od.z;
      }
    }
    u.enter = b.id;
    u.order = { x: d.x, z: d.z };
    u.route = [];
  }
  return go.length;
}

/** "Chamar": as tropas livres mais perto vêm até encher o fortim. */
export function callToFort(w: World, fortId: number): number {
  const b = fortById(w, fortId);
  if (!b) return 0;
  const ids = w.units.filter((u) => !u.dead && u.kind !== 'robo' && u.inside < 0 && u.enter < 0).map((u) => u.id);
  if (!ids.length) {
    w.events.push({ type: 'notice', text: 'Não há soldados livres.' });
    return 0;
  }
  return garrison(w, ids, fortId);
}

/** "Sair": todo mundo na porta, parado ali. */
export function leaveFort(w: World, fortId: number): number {
  const b = fortById(w, fortId);
  return b ? ejectFort(w, b, false) : 0;
}

/** Quem chegou à porta entra (se ainda houver vaga e o fortim estiver de pé e pronto). */
export function stepForts(w: World): void {
  for (const u of w.units) {
    if (u.enter < 0 || u.dead) continue;
    const b = fortById(w, u.enter);
    if (!b || b.buildLeft > 0) {
      u.enter = -1;
      continue;
    }
    const d = doorOf(b);
    if (dist(u.x, u.z, d.x, d.z) > 1.3) continue;
    u.enter = -1;
    if (occupants(w, b.id).length >= fortStats(w, b).slots) continue;
    u.inside = b.id;
    u.order = null;
    u.route = [];
    u.x = u.px = b.x;
    u.z = u.pz = b.z;
    u.goal = { x: b.x, z: b.z };
    u.target = -1;
  }
}
