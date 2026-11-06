/**
 * Grade de comandos 3×3 (convenção de RTS): muda com o contexto e tem atalhos
 * Q W E / A S D / Z X C. Barra de espaço toca o alarme; Esc volta um passo.
 */
import { useEffect } from 'preact/hooks';
import { canRecruit, canRecruitUnit, fortStats, unitCap, unitLoad, unlocked } from '../sim/index.ts';
import type { Building, Ring, Tower, UnitKind, WorldView } from '../sim/index.ts';
import type { BuildTool, Controls } from '../game/controls.ts';
import { Icon } from './icons.tsx';
import type { IconKey } from './icons.tsx';
import { planGhost, wallAt } from '../game/ghost.ts';
import type { GhostPlan } from '../game/ghost.ts';
import type { Session } from '../game/session.ts';

export const KEYS = ['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C'] as const;

export interface Cmd {
  label: string;
  icon?: IconKey;
  sub?: string;
  disabled?: boolean;
  on?: boolean;
  tone?: 'go' | 'stop';
  act: () => void;
}

const RING_NAME = ['Perto', 'Médio', 'Longe'];
const UNIT_LABEL: Record<UnitKind, string> = { soldado: 'Soldado', atirador: 'Atirador', robo: 'Robô' };
const UP_SHORT: Record<string, string[]> = {
  quartel: ['+40% dano, +25% vida', 'libera atirador'],
  fabrica: ['+30% dano e vida', '+30% e respingo'],
  torre: ['+35% dano, +4 m', '+35% e canhão'],
  fortim: ['+2 vagas, +50% vida', '+25% dano, +2 m'],
};

interface Props {
  w: WorldView;
  session: Session;
  controls: Controls;
  plan: GhostPlan | null;
  selBuilding?: Building;
  selTower?: Tower;
  onFocus: (r: Ring) => void;
}

const TOOL_ICON: Record<BuildTool, IconKey> = {
  muralha: 'wall',
  portao: 'gate',
  torre: 'torre',
  gerador: 'gerador',
  refinaria: 'refinaria',
  quartel: 'quartel',
  fabrica: 'fabrica',
  fortim: 'fortim',
  demolir: 'demolish',
};

function buildTools(w: WorldView, tool: BuildTool | null, controls: Controls): (Cmd | null)[] {
  const t = (name: string, k: BuildTool, sub: string): Cmd => ({ label: name, icon: TOOL_ICON[k], sub, on: tool === k, act: () => controls.setTool(tool === k ? null : k) });
  const c = w.cfg.build;
  return [
    // Demolir saiu daqui (Etapa 14): prédio pelo painel dele, muralha tocando nela.
    t('Muralha', 'muralha', `${c.wall.costPerCell}/m`),
    t('Portão', 'portao', `${c.gate.costPerCell}/m`),
    t('Torre', 'torre', `${c.torre.cost}`),
    t('Fortim', 'fortim', `${c.fortim.cost}`),
    t('Gerador', 'gerador', `${c.gerador.cost}`),
    t('Refinaria', 'refinaria', `${c.refinaria.cost}`),
    t('Quartel', 'quartel', `${c.quartel.cost}`),
    t('Fábrica', 'fabrica', `${c.fabrica.cost}`),
    { label: 'Voltar', icon: 'back', sub: 'Esc', act: () => controls.setBuilding(false) },
  ];
}

const INFANTRY: UnitKind[] = ['soldado', 'atirador'];
const ALL_KINDS: UnitKind[] = ['soldado', 'atirador', 'robo'];

/** Ids de todas as tropas vivas destes tipos, no mapa (quem está num fortim fica de fora). */
export function troopIds(w: WorldView, kinds: UnitKind[]): number[] {
  return w.units.filter((u) => !u.dead && u.inside < 0 && kinds.includes(u.kind)).map((u) => u.id);
}

/** Tropas escolhidas: parar, voltar ao automático, escolher todas ou só um tipo. */
function unitCommands(w: WorldView, session: Session, controls: Controls, ids: number[], close: Cmd): (Cmd | null)[] {
  const sel = w.units.filter((u) => !u.dead && ids.includes(u.id));
  const kinds = ALL_KINDS.filter((k) => sel.some((u) => u.kind === k));
  const robots = kinds.includes('robo');
  const infantry = kinds.some((k) => k !== 'robo');
  const out: (Cmd | null)[] = [
    { label: 'Parar', icon: 'hold', sub: 'ficam aqui', act: () => session.hold(ids) },
    {
      label: 'Auto',
      icon: 'auto',
      sub: robots && infantry ? 'portão e brecha' : robots ? 'brechas' : 'portões',
      on: sel.length > 0 && sel.every((u) => !u.order),
      act: () => session.order(ids, null),
    },
    { label: 'Todas', icon: 'all', sub: `${troopIds(w, ALL_KINDS).length} tropas`, act: () => controls.select({ type: 'units', ids: troopIds(w, ALL_KINDS) }) },
    null,
    null,
    null,
    null,
    null,
    close,
  ];
  // Escolha mista: "só este tipo" em A, S, D.
  if (kinds.length > 1)
    kinds.forEach((k, i) => {
      const n = sel.filter((u) => u.kind === k).length;
      out[3 + i] = { label: UNIT_PLURAL[k], icon: k, sub: `só eles · ${n}`, act: () => controls.select({ type: 'units', ids: sel.filter((u) => u.kind === k).map((u) => u.id) }) };
    });
  return out;
}

const UNIT_PLURAL: Record<UnitKind, string> = { soldado: 'Soldados', atirador: 'Atiradores', robo: 'Robôs' };

export function commandsFor(p: Props): (Cmd | null)[] {
  const { w, session, controls, plan, selBuilding: b, selTower: t } = p;
  const close: Cmd = { label: 'Fechar', icon: 'close', sub: 'Esc', act: () => controls.select(null) };
  // Construindo.
  if (controls.building) {
    const pend = controls.pending;
    if (pend && !pend.dragging && plan) {
      const demolish = pend.tool === 'demolir';
      return [
        {
          label: demolish ? 'Demolir' : 'Confirmar',
          icon: demolish ? 'demolish' : 'confirm',
          sub: demolish ? (plan.ok ? `+${plan.cost}` : '—') : `${plan.cost}`,
          disabled: !plan.ok,
          tone: 'go',
          act: () => {
            if (pend.tool === 'demolir') session.demolish(pend.a.x, pend.a.z);
            else if (pend.tool === 'muralha' || pend.tool === 'portao') session.wall(pend.tool, pend.a, pend.b ?? pend.a);
            else session.build(pend.tool, pend.a.x, pend.a.z);
            controls.ping(pend.b ?? pend.a, 'build');
            controls.setPending(null);
          },
        },
        { label: 'Cancelar', icon: 'cancel', sub: 'Esc', tone: 'stop', act: () => controls.setPending(null) },
        null,
        null,
        null,
        null,
        null,
        null,
        { label: 'Voltar', icon: 'back', act: () => controls.setBuilding(false) },
      ];
    }
    return buildTools(w, controls.tool, controls);
  }
  // Tropas escolhidas.
  if (controls.selected?.type === 'units') return unitCommands(w, session, controls, controls.selected.ids, close);
  // Trabalhador escolhido: chamar só ele, ou soltar.
  if (controls.selected?.type === 'worker') {
    const id = controls.selected.id;
    const k = w.workers.find((x) => x.id === id);
    const live = w.phase === 'calm' || w.phase === 'warning';
    return [
      {
        label: 'Voltar',
        icon: 'enter',
        sub: k?.hold ? 'já chamado' : 'só ele',
        disabled: !k || k.state === 'dead' || k.hold || !live || w.alarm,
        tone: 'go',
        act: () => session.recall([id]),
      },
      { label: 'Liberar', icon: 'exit', sub: 'volta a sair', disabled: !k || !k.hold || w.alarm, act: () => session.release([id]) },
      null,
      null,
      null,
      null,
      null,
      null,
      close,
    ];
  }
  // Muralha escolhida: consertar (tudo) ou demolir o pedaço.
  if (controls.selected?.type === 'wall') {
    const s = controls.selected;
    const info = wallAt(w, s.x, s.z);
    const dem = planGhost(w, { tool: 'demolir', a: { x: s.x, z: s.z }, b: null, dragging: false });
    return [
      { label: 'Consertar', icon: 'repair', sub: `${w.repairCost}`, disabled: w.repairCost <= 0 || w.ore <= 0 || w.lost, act: () => session.repair() },
      null,
      null,
      null,
      null,
      null,
      null,
      {
        label: 'Demolir',
        icon: 'demolish',
        sub: info?.fixed ? 'é do posto' : dem.ok ? `volta ${dem.cost}` : '—',
        tone: 'stop',
        disabled: !info || info.fixed || !dem.ok || w.lost,
        act: () => {
          session.demolish(s.x, s.z);
          controls.select(null);
        },
      },
      close,
    ];
  }
  // Torre escolhida.
  if (t) {
    const lv = w.cfg.upgrades.torre;
    const next = t.level <= lv.length ? lv[t.level - 1]! : null;
    return [
      null,
      null,
      null,
      next
        ? { label: 'Melhorar', icon: 'upgrade', sub: `${next.cost} · ${UP_SHORT.torre![t.level - 1]}`, disabled: t.upgradeLeft > 0 || w.ore < next.cost, act: () => session.upgradeTower(t.slot) }
        : { label: 'Máximo', icon: 'max', sub: `nível ${t.level}`, disabled: true, act: () => {} },
      null,
      null,
      null,
      null,
      close,
    ];
  }
  // Prédio escolhido.
  if (b) {
    const out: (Cmd | null)[] = [null, null, null, null, null, null, null, null, close];
    if (b.kind === 'quartel' || b.kind === 'fabrica') {
      const pk = b.kind;
      const kinds: UnitKind[] = pk === 'quartel' ? ['soldado', 'atirador'] : ['robo'];
      const q = w.cfg.build[pk].queue;
      kinds.forEach((k, i) => {
        const locked = k === 'atirador' && b.level < 3;
        out[i] = {
          label: UNIT_LABEL[k],
          icon: k,
          sub: locked ? 'nível 3' : `${w.cfg.units[k].cost} · ${w.cfg.units[k].train} s`,
          disabled: b.buildLeft > 0 || b.upgradeLeft > 0 || locked || w.ore < w.cfg.units[k].cost || b.queue.length >= q || unitLoad(w, k) >= unitCap(w, k),
          act: () => session.train(b.id, k),
        };
      });
      const lv = w.cfg.upgrades[pk];
      const next = b.level <= lv.length ? lv[b.level - 1]! : null;
      out[3] = next
        ? { label: 'Melhorar', icon: 'upgrade', sub: `${next.cost} · ${UP_SHORT[pk]![b.level - 1]}`, disabled: b.buildLeft > 0 || b.upgradeLeft > 0 || w.ore < next.cost, act: () => session.upgrade(b.id) }
        : { label: 'Máximo', icon: 'max', sub: `nível ${b.level}`, disabled: true, act: () => {} };
    }
    if (b.kind === 'fortim') {
      const st = fortStats(w, b);
      const inside = w.units.filter((u) => !u.dead && u.inside === b.id).length;
      const coming = w.units.filter((u) => !u.dead && u.enter === b.id && u.inside < 0).length;
      const free = w.units.some((u) => !u.dead && u.kind !== 'robo' && u.inside < 0 && u.enter < 0);
      out[0] = {
        label: 'Chamar',
        icon: 'enter',
        sub: `${inside}/${st.slots}${coming ? ` · +${coming} vindo` : ''}`,
        disabled: b.buildLeft > 0 || inside + coming >= st.slots || !free,
        act: () => session.callFort(b.id),
      };
      out[1] = { label: 'Sair', icon: 'exit', sub: inside ? `${inside} dentro` : 'vazio', disabled: !inside, act: () => session.leaveFort(b.id) };
      const lv = w.cfg.upgrades.fortim;
      const next = b.level <= lv.length ? lv[b.level - 1]! : null;
      out[3] = next
        ? { label: 'Melhorar', icon: 'upgrade', sub: `${next.cost} · ${UP_SHORT.fortim![b.level - 1]}`, disabled: b.buildLeft > 0 || b.upgradeLeft > 0 || w.ore < next.cost, act: () => session.upgrade(b.id) }
        : { label: 'Máximo', icon: 'max', sub: `nível ${b.level}`, disabled: true, act: () => {} };
    }
    out[7] = {
      label: 'Demolir',
      icon: 'demolish',
      sub: `volta ${Math.floor(w.cfg.build[b.kind].cost * w.cfg.build.refund)}`,
      tone: 'stop',
      act: () => {
        session.demolish(b.x, b.z);
        controls.select(null);
      },
    };
    return out;
  }
  // Padrão.
  const soldiers = unitLoad(w, 'soldado');
  const inf = troopIds(w, INFANTRY);
  const bots = troopIds(w, ['robo']);
  const ordered = (ids: number[]) => w.units.some((u) => ids.includes(u.id) && u.order);
  return [
    { label: 'Construir', icon: 'build', sub: `energia ${w.energy.demand}/${w.energy.supply}`, disabled: w.lost, act: () => controls.setBuilding(true) },
    { label: 'Consertar', icon: 'repair', sub: `${w.repairCost}`, disabled: w.repairCost <= 0 || w.ore <= 0 || w.lost, act: () => session.repair() },
    { label: 'Recrutar', icon: 'worker', sub: `trabalhador · ${w.cfg.recruitCost}`, disabled: !canRecruit(w), act: () => session.recruit() },
    {
      label: '+ Soldado',
      icon: 'soldado',
      sub: unlocked(w, 'soldado') ? `${w.cfg.units.soldado.cost} · ${soldiers}/${unitCap(w, 'soldado')}` : 'sem quartel',
      disabled: !canRecruitUnit(w, 'soldado'),
      act: () => session.unit('soldado'),
    },
    {
      label: '+ Atirador',
      icon: 'atirador',
      sub: unlocked(w, 'atirador') ? `${w.cfg.units.atirador.cost}` : 'quartel nv 3',
      disabled: !canRecruitUnit(w, 'atirador'),
      act: () => session.unit('atirador'),
    },
    {
      label: '+ Robô',
      icon: 'robo',
      sub: unlocked(w, 'robo') ? `${w.cfg.units.robo.cost} · ${unitLoad(w, 'robo')}/${unitCap(w, 'robo')}` : 'sem fábrica',
      disabled: !canRecruitUnit(w, 'robo'),
      act: () => session.unit('robo'),
    },
    {
      label: 'Soldados',
      icon: 'all',
      sub: inf.length ? `${inf.length} · ${ordered(inf) ? 'com ordem' : 'auto'}` : 'nenhum',
      disabled: !inf.length,
      act: () => controls.select({ type: 'units', ids: inf }),
    },
    {
      label: 'Robôs',
      icon: 'all',
      sub: bots.length ? `${bots.length} · ${ordered(bots) ? 'com ordem' : 'auto'}` : 'nenhum',
      disabled: !bots.length,
      act: () => controls.select({ type: 'units', ids: bots }),
    },
    {
      label: 'Coleta',
      icon: 'ore',
      sub: `${RING_NAME[w.focus]!.toLowerCase()} · ${w.cfg.rings[w.focus]!.load}/viagem`,
      act: () => p.onFocus(((w.focus + 1) % 3) as Ring),
    },
  ];
}

export type CardProps = Props & { onAlarm: () => void; onEscape: () => void; onRecall: () => void };

/**
 * Atalhos de teclado da grade. Fica num lugar que não remonta (o App), lendo sempre as
 * props mais novas por uma referência.
 */
export function useCardKeys(latest: { current: CardProps }): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const p = latest.current;
      if (e.code === 'Space') {
        e.preventDefault();
        p.onAlarm();
        return;
      }
      if (e.key === 'Escape') {
        p.onEscape();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        p.onRecall();
        return;
      }
      const i = KEYS.indexOf(e.key.toUpperCase() as (typeof KEYS)[number]);
      if (i < 0) return;
      const c = commandsFor(p)[i];
      if (c && !c.disabled) {
        e.preventDefault();
        c.act();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [latest]);
}

export function CommandCard(props: CardProps) {
  const cmds = commandsFor(props);
  return (
    <div class="panel card" role="group" aria-label="Comandos">
      {cmds.map((c, i) =>
        c ? (
          <button
            key={i}
            class={`cmd${c.on ? ' on' : ''}${c.tone ? ` ${c.tone}` : ''}`}
            disabled={c.disabled}
            onClick={c.act}
            aria-label={`${c.label}${c.sub ? `, ${c.sub}` : ''} (${KEYS[i]})`}
          >
            {c.icon && <Icon k={c.icon} />}
            <span class="cmd-txt">
              <span class="cmd-label">{c.label}</span>
              {c.sub && <small>{c.sub}</small>}
            </span>
            <kbd>{KEYS[i]}</kbd>
          </button>
        ) : (
          <div key={i} class="cmd empty" aria-hidden="true" />
        ),
      )}
    </div>
  );
}
