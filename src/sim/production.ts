/**
 * Etapa 9: prédios de produção e melhorias (pedido do usuário: prédios diferentes geram
 * unidades diferentes, e melhorar o prédio melhora as unidades).
 * Quartel treina soldado e, no nível 3, atirador; fábrica treina robô. A melhoria de um
 * tipo de prédio vale para todas as unidades dele (pelo maior nível entre os prédios iguais).
 * Torre se melhora uma por uma.
 */
import { doorOf, updateEnergy } from './build.ts';
import type { UpgradeLevel } from './config.ts';
import type { Building, BuildingKind, Tower, Unit, UnitKind, World } from './types.ts';

export type ProducerKind = 'quartel' | 'fabrica';

export function producerOf(kind: UnitKind): ProducerKind {
  return kind === 'robo' ? 'fabrica' : 'quartel';
}

/** Maior nível entre os prédios daquele tipo (0: não há nenhum). */
export function buildingLevel(w: Pick<World, 'buildings'>, kind: BuildingKind): number {
  let lv = 0;
  for (const b of w.buildings) if (b.kind === kind && b.buildLeft <= 0 && b.level > lv) lv = b.level;
  return lv;
}

/** Soma dos bônus até o nível (nível 1 = nada). */
export function upgradeSum(levels: UpgradeLevel[], level: number): { dmg: number; hp: number; range: number; splash: number } {
  const out = { dmg: 0, hp: 0, range: 0, splash: 0 };
  for (let i = 0; i < level - 1 && i < levels.length; i++) {
    const l = levels[i]!;
    out.dmg += l.dmg;
    out.hp += l.hp;
    out.range += l.range;
    if (l.splash > 0) out.splash = l.splash;
  }
  return out;
}

export function unitStats(w: Pick<World, 'cfg' | 'buildings'>, kind: UnitKind): { hp: number; dps: number; range: number; splash: number } {
  const uc = w.cfg.units[kind];
  const prod = producerOf(kind);
  const up = upgradeSum(w.cfg.upgrades[prod], Math.max(1, buildingLevel(w, prod)));
  return { hp: uc.hp * (1 + up.hp), dps: uc.dps * (1 + up.dmg), range: uc.range + up.range, splash: up.splash > 0 ? up.splash : uc.splash };
}

/** Vida cheia do prédio (o fortim cresce com a melhoria). */
export function buildingMaxHp(w: Pick<World, 'cfg'>, b: Pick<Building, 'kind' | 'level'>): number {
  const base = w.cfg.build[b.kind].hp;
  if (b.kind !== 'fortim') return base;
  return base * (1 + upgradeSum(w.cfg.upgrades.fortim, b.level).hp);
}

export function towerStats(w: Pick<World, 'cfg'>, t: Tower): { dps: number; range: number; splash: number } {
  const up = upgradeSum(w.cfg.upgrades.torre, t.level);
  return { dps: w.cfg.towers.dps * (1 + up.dmg), range: w.cfg.towers.range + up.range, splash: up.splash };
}

/** Quantas unidades daquele grupo os prédios sustentam (soldado e atirador dividem o quartel). */
export function unitCap(w: Pick<World, 'cfg' | 'buildings'>, kind: UnitKind): number {
  const prod = producerOf(kind);
  const n = w.buildings.filter((b) => b.kind === prod && b.buildLeft <= 0).length;
  return Math.min(w.cfg.units[kind].max, n * w.cfg.build[prod].perBuilding);
}

/** Vivos mais na fila, do mesmo grupo (soldado + atirador contam juntos). */
export function unitLoad(w: Pick<World, 'units' | 'buildings'>, kind: UnitKind): number {
  const prod = producerOf(kind);
  let n = 0;
  for (const u of w.units) if (!u.dead && producerOf(u.kind) === prod) n++;
  for (const b of w.buildings) if (b.kind === prod) n += b.queue.length;
  return n;
}

export function unlocked(w: Pick<World, 'buildings'>, kind: UnitKind): boolean {
  if (kind === 'atirador') return buildingLevel(w, 'quartel') >= 3;
  return buildingLevel(w, producerOf(kind)) >= 1;
}

/** Cria a unidade já pronta em (x, z), com a vida do nível atual. */
export function spawnUnit(w: World, kind: UnitKind, x: number, z: number): Unit {
  const u: Unit = { id: w.nextUnitId++, kind, x, z, px: x, pz: z, hp: unitStats(w, kind).hp, route: [], goal: { x, z }, order: null, inside: -1, enter: -1, dead: false, target: -1, tx: 0, tz: 0 };
  w.units.push(u);
  w.events.push({ type: 'unitReady', kind });
  return u;
}

export { doorOf };

export function canTrain(w: World, b: Building, kind: UnitKind): string {
  if (w.lost) return 'A colônia caiu.';
  if (b.buildLeft > 0) return 'Ainda em obra.';
  if (b.kind !== producerOf(kind)) return 'Este prédio não treina essa unidade.';
  if (kind === 'atirador' && b.level < 3) return 'Atirador precisa do quartel no nível 3.';
  if (b.queue.length >= w.cfg.build[b.kind as ProducerKind].queue) return 'Fila cheia.';
  if (unitLoad(w, kind) >= unitCap(w, kind)) return 'Limite de unidades: construa mais prédios.';
  if (w.ore < w.cfg.units[kind].cost) return 'Falta minério.';
  return '';
}

export function trainUnit(w: World, buildingId: number, kind: UnitKind): boolean {
  const b = w.buildings.find((x) => x.id === buildingId);
  if (!b) return false;
  const why = canTrain(w, b, kind);
  if (why) {
    w.events.push({ type: 'buildFail', reason: why });
    return false;
  }
  w.ore -= w.cfg.units[kind].cost;
  if (!b.queue.length) b.trainLeft = w.cfg.units[kind].train;
  b.queue.push(kind);
  return true;
}

/** Atalho do HUD: põe na fila do prédio certo que estiver mais livre. */
export function trainAnywhere(w: World, kind: UnitKind): boolean {
  const prod = producerOf(kind);
  const list = w.buildings.filter((b) => b.kind === prod && b.buildLeft <= 0 && (kind !== 'atirador' || b.level >= 3)).sort((a, b) => a.queue.length - b.queue.length || a.id - b.id);
  if (!list.length) {
    w.events.push({ type: 'buildFail', reason: kind === 'robo' ? 'Construa uma fábrica.' : kind === 'atirador' ? 'Melhore um quartel até o nível 3.' : 'Construa um quartel.' });
    return false;
  }
  return trainUnit(w, list[0]!.id, kind);
}

export function upgradeLevels(w: Pick<World, 'cfg'>, kind: BuildingKind): UpgradeLevel[] | null {
  return kind === 'quartel' || kind === 'fabrica' || kind === 'torre' || kind === 'fortim' ? w.cfg.upgrades[kind] : null;
}

export function canUpgrade(w: World, b: Building): string {
  const lv = upgradeLevels(w, b.kind);
  if (!lv || b.kind === 'torre') return 'Este prédio não tem melhoria.';
  if (b.buildLeft > 0) return 'Ainda em obra.';
  if (b.level > lv.length) return 'Já está no nível máximo.';
  if (b.upgradeLeft > 0) return 'Já está melhorando.';
  if (w.ore < lv[b.level - 1]!.cost) return 'Falta minério.';
  return '';
}

export function upgradeBuilding(w: World, buildingId: number): boolean {
  const b = w.buildings.find((x) => x.id === buildingId);
  if (!b) return false;
  const why = canUpgrade(w, b);
  if (why) {
    w.events.push({ type: 'buildFail', reason: why });
    return false;
  }
  w.ore -= w.cfg.upgrades[b.kind as ProducerKind | 'fortim'][b.level - 1]!.cost;
  b.upgradeLeft = w.cfg.upgrades.time;
  return true;
}

export function canUpgradeTower(w: World, t: Tower): string {
  const lv = w.cfg.upgrades.torre;
  if (t.buildingId >= 0 && (w.buildings.find((b) => b.id === t.buildingId)?.buildLeft ?? 0) > 0) return 'Ainda em obra.';
  if (t.level > lv.length) return 'Já está no nível máximo.';
  if (t.upgradeLeft > 0) return 'Já está melhorando.';
  if (w.ore < lv[t.level - 1]!.cost) return 'Falta minério.';
  return '';
}

export function upgradeTower(w: World, slot: number): boolean {
  const t = w.towers.find((x) => x.slot === slot);
  if (!t) return false;
  const why = canUpgradeTower(w, t);
  if (why) {
    w.events.push({ type: 'buildFail', reason: why });
    return false;
  }
  w.ore -= w.cfg.upgrades.torre[t.level - 1]!.cost;
  t.upgradeLeft = w.cfg.upgrades.towerTime;
  return true;
}

/** Fila de treino e melhorias em andamento. */
export function stepProduction(w: World, dt: number): void {
  for (const t of w.towers) {
    if (t.upgradeLeft <= 0) continue;
    t.upgradeLeft -= dt;
    if (t.upgradeLeft <= 0) {
      t.upgradeLeft = 0;
      t.level++;
      w.events.push({ type: 'upgraded', kind: 'torre', level: t.level });
    }
  }
  let finished = false;
  for (const b of w.buildings) {
    if (b.buildLeft > 0) {
      b.buildLeft -= dt;
      if (b.buildLeft <= 0) {
        b.buildLeft = 0;
        finished = true;
        w.events.push({ type: 'finished', kind: b.kind, x: b.x, z: b.z });
      }
      continue;
    }
    if (b.upgradeLeft > 0) {
      // Melhorando: a fila espera.
      b.upgradeLeft -= dt;
      if (b.upgradeLeft <= 0) {
        b.upgradeLeft = 0;
        if (b.kind === 'fortim') {
          // Fortim: a vida do prédio cresce na mesma proporção.
          const before = buildingMaxHp(w, b);
          b.level++;
          b.hp *= buildingMaxHp(w, b) / before;
          for (const c of b.cells) w.swarm.wallHp[c] = b.hp;
          w.events.push({ type: 'upgraded', kind: b.kind, level: b.level });
          continue;
        }
        const kinds: UnitKind[] = b.kind === 'fabrica' ? ['robo'] : ['soldado', 'atirador'];
        const before = kinds.map((k) => unitStats(w, k).hp);
        b.level++;
        // Quem já existe ganha a vida nova na mesma proporção.
        kinds.forEach((k, i) => {
          const ratio = unitStats(w, k).hp / before[i]!;
          if (ratio !== 1) for (const u of w.units) if (u.kind === k && !u.dead) u.hp *= ratio;
        });
        w.events.push({ type: 'upgraded', kind: b.kind, level: b.level });
      }
      continue;
    }
    if (!b.queue.length) continue;
    b.trainLeft -= dt;
    if (b.trainLeft <= 0) {
      const kind = b.queue.shift()!;
      const d = doorOf(b);
      spawnUnit(w, kind, d.x, d.z);
      if (b.queue.length) b.trainLeft = w.cfg.units[b.queue[0]!].train;
    }
  }
  if (finished) updateEnergy(w);
}
