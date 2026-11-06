import { useEffect, useRef, useState } from 'preact/hooks';
import {
  aliveWorkers,
  buildingMaxHp,
  canSave,
  isSafe,
  shelterUsed,
  projectedChance,
  returnTime,
  riskIds,
  timeLeft,
  fortStats,
  towerStats,
  unitCap,
  unitLoad,
  unitStats,
  unlocked,
} from '../sim/index.ts';
import type { Building, Tower, WorldView } from '../sim/index.ts';
import type { PanicOutcome, SaveMeta, SimEvent, UnitKind, WaveStats } from '../sim/index.ts';
import type { BuildTool, Controls } from '../game/controls.ts';
import { CommandCard, useCardKeys } from './CommandCard.tsx';
import { Icon, Portrait } from './icons.tsx';
import { wallAt } from '../game/ghost.ts';
import { loadAndReload, readSlot, saveTo } from '../game/saves.ts';
import type { Slot } from '../game/saves.ts';
import type { CardProps } from './CommandCard.tsx';
import { Minimap } from './Minimap.tsx';
import type { CamInfo } from './Minimap.tsx';
import { planGhost } from '../game/ghost.ts';
import type { Sound } from '../audio/sound.ts';
import type { Session, Speed } from '../game/session.ts';
import type { Labels } from '../render/labels.ts';

interface Toast {
  id: number;
  text: string;
  kind: '' | 'good' | 'bad';
  until: number;
  /** Tocar leva a câmera até aqui (mortes marcantes). */
  at?: { x: number; z: number };
}

const SAVED_TEXT: Record<Exclude<PanicOutcome, 'devorado'>, string> = {
  limpo: 'se jogou no portão a tempo!',
  'sem-carga': 'largou a carga e escapou por pouco.',
  ferido: 'chegou ferido, mas chegou.',
};

const PILL_TEXT: Record<Exclude<PanicOutcome, 'devorado'>, string> = {
  limpo: 'SALVO',
  'sem-carga': 'SEM CARGA',
  ferido: 'FERIDO',
};

function clock(s: number): string {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

let toastId = 0;

/** "há 3 min", "há 2 h", "há 1 dia". */
function ago(at: number): string {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

const UNIT_NAME: Record<UnitKind, [string, string]> = { soldado: ['soldado', 'soldados'], atirador: ['atirador', 'atiradores'], robo: ['robô', 'robôs'] };
const KIND_LIST: UnitKind[] = ['soldado', 'atirador', 'robo'];

const BUILD_NAME: Record<string, string> = { torre: 'Torre', gerador: 'Gerador', refinaria: 'Refinaria', fabrica: 'Fábrica', quartel: 'Quartel', fortim: 'Fortim' };
/** Masculinos (para "pronto", "destruído"). */
const MASC = new Set(['gerador', 'quartel', 'fortim']);
const ag = (kind: string, fem: string, masc: string) => (MASC.has(kind) ? masc : fem);

const UNIT_LABEL: Record<UnitKind, string> = { soldado: 'Soldado', atirador: 'Atirador', robo: 'Robô' };

const ABOUT: Record<string, string> = {
  fortim: 'Soldados e atiradores entram, ficam fora do alcance do enxame e atiram mais forte. Fora da muralha vira posto avançado: blindado, alcança mais e abriga até 4 trabalhadores no pânico.',
  gerador: 'Dá +3 de energia para as torres.',
  refinaria: '+25% em cada entrega de minério.',
};

function hpClass(f: number): string {
  return f > 0.6 ? 'hp-ok' : f > 0.3 ? 'hp-mid' : 'hp-low';
}

/** Tropas escolhidas: uma com retrato e números; várias com uma grade de retratos. */
function UnitsPanel({ w, ids, onPick }: { w: WorldView; ids: number[]; onPick: (id: number) => void }) {
  const sel = w.units.filter((u) => !u.dead && ids.includes(u.id));
  if (!sel.length) return null;
  if (sel.length === 1) {
    const u = sel[0]!;
    const st = unitStats(w, u.kind);
    const f = u.hp / st.hp;
    const doing = u.enter >= 0 ? 'indo para o fortim' : u.target >= 0 ? 'atirando' : u.route.length ? 'a caminho' : 'parado';
    return (
      <div class="panel selection">
        <div class="sel-row">
          <Portrait k={u.kind} />
          <div class="sel-body">
            <div class="sel-head">
              <b>{UNIT_LABEL[u.kind]}</b>
              <div class={`morale-bar ${hpClass(f)}`} title={`${Math.round(u.hp)}/${Math.round(st.hp)}`}>
                <i style={{ width: `${f * 100}%` }} />
              </div>
            </div>
            <p class="sel-sub">
              {Math.round(u.hp)}/{Math.round(st.hp)} de vida · {Math.round(st.dps)} de dano/s · alcance {st.range} m{st.splash ? ` · respingo ${st.splash} m` : ''}
            </p>
            <p class="sel-sub">
              {u.order ? 'Com ordem sua' : u.kind === 'robo' ? 'Automático: tampa brechas' : 'Automático: guarda os portões'} · {doing}
            </p>
            <p class="sel-sub sel-tip">Toque no chão para mandar{u.kind !== 'robo' ? ' ou num fortim para entrar' : ''}.</p>
          </div>
        </div>
      </div>
    );
  }
  const MAX = 12;
  const counts = KIND_LIST.map((k) => [k, sel.filter((u) => u.kind === k).length] as const).filter(([, n]) => n > 0);
  return (
    <div class="panel selection">
      <div class="sel-head">
        <b>{sel.length} tropas</b>
        <span class="sel-sub">{counts.map(([k, n]) => `${n} ${UNIT_NAME[k][n > 1 ? 1 : 0]}`).join(' · ')}</span>
      </div>
      <div class="unit-tiles">
        {sel.slice(0, MAX).map((u) => {
          const f = u.hp / unitStats(w, u.kind).hp;
          return (
            <button key={u.id} class="unit-tile" onClick={() => onPick(u.id)} aria-label={`${UNIT_LABEL[u.kind]}, ${Math.round(f * 100)}% de vida`}>
              <Icon k={u.kind} />
              <i class={`tile-hp ${hpClass(f)}`} style={{ width: `${f * 100}%` }} />
            </button>
          );
        })}
        {sel.length > MAX && <span class="unit-more">+{sel.length - MAX}</span>}
      </div>
      <p class="sel-sub sel-tip">Toque no chão para mandar, ou num fortim para entrar. Toque num retrato para ficar só com ele.</p>
    </div>
  );
}

/** Quem está no fortim (retratos com a vida), vagas e o bônus. */
function FortInfo({ w, b }: { w: WorldView; b: Building }) {
  const st = fortStats(w, b);
  const inside = w.units.filter((u) => !u.dead && u.inside === b.id);
  const coming = w.units.filter((u) => !u.dead && u.enter === b.id && u.inside < 0).length;
  return (
    <>
      <p class="sel-sub">
        Dentro: {inside.length}/{st.slots}
        {coming ? ` (+${coming} a caminho)` : ''} · +{Math.round(st.dmg * 100)}% de dano, +{st.range} m de alcance
      </p>
      {st.outpost ? (
        <p class="sel-sub">
          Posto avançado: blindado (−{Math.round(w.cfg.build.fortim.armor * 100)}% de mordida) · abrigo {shelterUsed(w, b.id)}/{w.cfg.build.fortim.shelter} trabalhadores
        </p>
      ) : null}
      <div class="unit-tiles">
        {Array.from({ length: st.slots }, (_, i) => {
          const u = inside[i];
          if (!u) return <span key={i} class="unit-tile slot-empty" aria-hidden="true" />;
          const f = u.hp / unitStats(w, u.kind).hp;
          return (
            <span key={i} class="unit-tile" aria-label={`${UNIT_LABEL[u.kind]}, ${Math.round(f * 100)}% de vida`}>
              <Icon k={u.kind} />
              <i class={`tile-hp ${hpClass(f)}`} style={{ width: `${f * 100}%` }} />
            </span>
          );
        })}
      </div>
    </>
  );
}

const DOING: Record<string, string> = {
  inside: 'dentro da base',
  toNode: 'indo coletar',
  gathering: 'coletando',
  returning: 'voltando para a base',
  panic: 'correndo do enxame',
  sheltered: 'abrigado no fortim',
};

/** Trabalhador escolhido: o que faz, a carga, o tempo de volta e a chance. */
function WorkerPanel({ w, id }: { w: WorldView; id: number }) {
  const k = w.workers.find((x) => x.id === id);
  if (!k || k.state === 'dead') return null;
  const out = !isSafe(w.cfg, k) && k.state !== 'panic';
  const live = w.phase === 'calm' || w.phase === 'warning';
  const left = timeLeft(w);
  const rt = returnTime(w, k);
  const late = live && out && rt > left;
  return (
    <div class="panel selection">
      <div class="sel-row">
        <Portrait k="worker" />
        <div class="sel-body">
          <div class="sel-head">
            <b>{k.name}</b>
            <span class={late ? 'bad' : 'ok'}>{DOING[k.state] ?? ''}</span>
          </div>
          <p class="sel-sub">
            Carga {k.cargo} · {k.speed.toFixed(1)} m/s{k.wounded > 0 ? ` · ferido (${Math.ceil(k.wounded)} s)` : ''}
            {k.hold ? ' · chamado: fica dentro' : ''}
          </p>
          {live && out && (
            <p class={`sel-sub${late ? ' sel-late' : ''}`}>
              Volta em {Math.ceil(rt)} s · a horda chega em {Math.ceil(left)} s
              {late ? ` · não chega (${Math.round(projectedChance(w, k) * 100)}% se chamar agora)` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pedaço de muralha ou portão escolhido. */
function WallPanel({ w, x, z }: { w: WorldView; x: number; z: number }) {
  const info = wallAt(w, x, z);
  if (!info) return null;
  const f = info.kind === 'entulho' ? 0 : Math.max(0, Math.min(1, info.hp / info.full));
  const name = info.kind === 'portao' ? 'Portão' : info.kind === 'entulho' ? 'Brecha' : 'Muralha';
  return (
    <div class="panel selection">
      <div class="sel-row">
        <Portrait k={info.kind === 'portao' ? 'gate' : 'wall'} />
        <div class="sel-body">
          <div class="sel-head">
            <b>
              {name}
              {info.fixed ? ' do posto' : ''}
            </b>
            <div class={`morale-bar ${hpClass(f)}`} title={`${Math.round(info.hp)}/${info.full}`}>
              <i style={{ width: `${f * 100}%` }} />
            </div>
          </div>
          <p class="sel-sub">
            {info.kind === 'entulho' ? 'Derrubada: o enxame passa por aqui. "Consertar" levanta de novo.' : `${Math.round(info.hp)}/${info.full} de vida`}
            {info.fixed ? ' · o que é do posto não dá para demolir.' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

function SelectionPanel({ w, b, t }: { w: WorldView; b?: Building; t?: Tower }) {
  if (t) {
    const st = towerStats(w, t);
    const site = t.buildingId >= 0 ? w.buildings.find((x) => x.id === t.buildingId) : undefined;
    return (
      <div class="panel selection">
        <div class="sel-row">
          <Portrait k="torre" />
          <div class="sel-body">
            <div class="sel-head">
              <b>Torre · nível {t.level}</b>
              <span class={t.powered ? 'ok' : 'bad'}>{site && site.buildLeft > 0 ? 'em obra' : t.powered ? 'com energia' : 'sem energia'}</span>
            </div>
            <p class="sel-sub">
              {Math.round(st.dps)} de dano/s · alcance {st.range} m{st.splash ? ` · respingo ${st.splash} m` : ''}
              {t.buildingId < 0 ? ' · torre do posto' : ''}
            </p>
            {site && site.buildLeft > 0 && <Progress label="Obra" left={site.buildLeft} total={w.cfg.build.torre.time} />}
            {t.upgradeLeft > 0 && <Progress label="Melhorando" left={t.upgradeLeft} total={w.cfg.upgrades.towerTime} />}
          </div>
        </div>
      </div>
    );
  }
  if (!b) return null;
  const full = buildingMaxHp(w, b);
  const producer = b.kind === 'quartel' || b.kind === 'fabrica';
  const kinds: UnitKind[] = b.kind === 'quartel' ? ['soldado', 'atirador'] : b.kind === 'fabrica' ? ['robo'] : [];
  const first = b.queue[0];
  return (
    <div class="panel selection">
      <div class="sel-row">
        <Portrait k={b.kind} />
        <div class="sel-body">
          <div class="sel-head">
            <b>
              {BUILD_NAME[b.kind]}
              {producer || b.kind === 'fortim' ? ` · nível ${b.level}` : ''}
            </b>
            <div class="morale-bar" title={`${Math.round(b.hp)}/${full}`}>
              <i style={{ width: `${(b.hp / full) * 100}%` }} />
            </div>
          </div>
          {ABOUT[b.kind] && <p class="sel-sub">{ABOUT[b.kind]}</p>}
          {b.buildLeft > 0 && <Progress label="Obra" left={b.buildLeft} total={w.cfg.build[b.kind].time} />}
          {b.upgradeLeft > 0 && <Progress label="Melhorando (a fila espera)" left={b.upgradeLeft} total={w.cfg.upgrades.time} />}
          {first && b.upgradeLeft <= 0 && (
            <Progress label={`Treinando ${UNIT_LABEL[first].toLowerCase()}${b.queue.length > 1 ? ` (+${b.queue.length - 1} na fila)` : ''}`} left={b.trainLeft} total={w.cfg.units[first].train} />
          )}
          {producer && b.buildLeft <= 0 && (
            <p class="sel-sub">
              {kinds
                .filter((k) => k !== 'atirador' || unlocked(w, k))
                .map((k) => {
                  const st = unitStats(w, k);
                  return `${UNIT_LABEL[k]}: ${Math.round(st.hp)} de vida, ${Math.round(st.dps)}/s`;
                })
                .join(' · ')}
              {' · '}
              {unitLoad(w, kinds[0]!)}/{unitCap(w, kinds[0]!)} no limite
            </p>
          )}
          {b.kind === 'fortim' && b.buildLeft <= 0 && <FortInfo w={w} b={b} />}
        </div>
      </div>
    </div>
  );
}

function Progress({ label, left, total }: { label: string; left: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (1 - left / total) * 100));
  return (
    <div class="progress" aria-label={`${label}: ${Math.round(pct)}%`}>
      <span>
        {label} · {Math.ceil(left)} s
      </span>
      <div class="bar">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Sem nada escolhido: um resumo do posto. */
function PostSummary({ w }: { w: WorldView }) {
  const out = w.workers.filter((k) => k.state !== 'dead' && !isSafe(w.cfg, k)).length;
  const troops = w.units.filter((u) => !u.dead);
  const by = (k: UnitKind) => troops.filter((u) => u.kind === k).length;
  const works = w.buildings.filter((b) => b.buildLeft > 0).length;
  return (
    <div class="panel selection summary-box">
      <div class="sel-head">
        <b>Posto · onda {w.wave + 1}</b>
        <span class="sel-sub">{w.towers.length} torres</span>
      </div>
      <p class="sel-sub">
        {aliveWorkers(w)} trabalhadores ({out} fora) · {by('soldado')} soldados · {by('atirador')} atiradores · {by('robo')} robôs
        {works ? ` · ${works} em obra` : ''}
      </p>
      <p class="sel-sub">Toque num prédio, numa torre ou numa tropa. Segure e arraste para escolher várias tropas.</p>
    </div>
  );
}

const TOOLS: { tool: BuildTool; name: string; hint: string }[] = [
  { tool: 'muralha', name: 'Muralha', hint: 'Arraste um dedo do começo ao fim da muralha. Dois dedos movem a câmera.' },
  { tool: 'portao', name: 'Portão', hint: 'Arraste até 5 m numa linha livre. Pessoas passam; o enxame não, depois da sirene.' },
  { tool: 'torre', name: 'Torre', hint: 'Toque no chão onde vai a torre. Cada torre gasta 1 de energia.' },
  { tool: 'gerador', name: 'Gerador', hint: 'Toque no chão. Cada gerador dá +3 de energia.' },
  { tool: 'refinaria', name: 'Refinaria', hint: 'Toque no chão. +25% em cada entrega de minério (até 2).' },
  { tool: 'quartel', name: 'Quartel', hint: 'Toque no chão. Treina soldados e, melhorado, atiradores.' },
  { tool: 'fabrica', name: 'Fábrica', hint: 'Toque no chão. Treina robôs.' },
  { tool: 'fortim', name: 'Fortim', hint: 'Toque no chão (até 95 m do centro, perto do minério longe). Fora da muralha é posto avançado: blindado, alcança mais e abriga 4 trabalhadores no pânico.' },
  { tool: 'demolir', name: 'Demolir', hint: 'Toque num prédio ou numa muralha sua. Volta metade do custo.' },
];

export function App({
  session,
  sound,
  labels,
  controls,
  camInfo,
  jump,
}: {
  session: Session;
  sound: Sound;
  labels: Labels;
  controls: Controls;
  camInfo: () => CamInfo;
  jump: (x: number, z: number) => void;
}) {
  const [, force] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (text: string, kind: Toast['kind'] = '', secs = 4) => {
    const until = performance.now() + secs * 1000;
    setToasts((list) => [...list.filter((t) => t.until > performance.now()).slice(-5), { id: ++toastId, text, kind, until }]);
  };
  const [summary, setSummary] = useState<{ stats: WaveStats; until: number } | null>(null);
  const [started, setStarted] = useState(false);
  // Saves para a tela de início; se a página nasceu de um save, o botão principal é "Continuar".
  const [saves] = useState(() =>
    (['manual', 'auto'] as Slot[]).map((slot) => ({ slot, meta: readSlot(slot)?.meta })).filter((x): x is { slot: Slot; meta: SaveMeta } => !!x.meta),
  );
  const loaded = (session.world?.tick ?? 0) > 0;
  const [muted, setMuted] = useState(false);
  const cardLatest = useRef<CardProps | null>(null);
  useCardKeys(cardLatest as { current: CardProps });

  useEffect(() => {
    const id = setInterval(() => {
      force((x) => x + 1);
      // Ambiente de combate a partir do retrato atual.
      const w = session.world;
      if (!w || session.paused) return;
      const towers = w.towers.filter((t) => t.built && t.powered && t.target >= 0).length;
      const troops = w.units.filter((u) => !u.dead && u.target >= 0 && u.kind !== 'robo').length;
      const robots = w.units.filter((u) => !u.dead && u.target >= 0 && u.kind === 'robo').length;
      sound.combat(towers + troops, robots, w.bugsAlive);
      // Obra: uma batida metálica baixa de vez em quando (mais obras, mais batidas, com teto).
      const works = w.buildings.filter((b) => b.buildLeft > 0).length;
      if (works && Math.random() < Math.min(0.6, 0.22 * works)) sound.clank();
    }, 200);
    const off = controls.on(() => force((x) => x + 1));
    return () => {
      clearInterval(id);
      off();
    };
  }, [controls]);

  useEffect(() => {
    let lastBreach = 0;
    let lastClimb = 0;
    const w0 = session.world;
    const push = (text: string, kind: Toast['kind'] = '', secs = 5, at?: { x: number; z: number }) => {
      const until = performance.now() + secs * 1000;
      setToasts((list) => [...list.filter((t) => t.until > performance.now()).slice(-5), { id: ++toastId, text, kind, until, at }]);
    };
    // Quem já não chega a tempo: avisa uma vez por trabalhador por onda.
    const warned = new Set<number>();
    let warnedWave = -1;
    const checkLate = () => {
      const w = session.world;
      if (!w || (w.phase !== 'calm' && w.phase !== 'warning')) return;
      if (warnedWave !== w.wave) {
        warned.clear();
        warnedWave = w.wave;
      }
      const left = timeLeft(w);
      if (left < 3) return;
      const fresh = w.workers.filter((k) => k.state !== 'dead' && k.state !== 'panic' && !warned.has(k.id) && !isSafe(w.cfg, k) && returnTime(w, k) > left);
      for (const k of fresh) warned.add(k.id);
      if (fresh.length === 1) {
        const k = fresh[0]!;
        push(`${k.name} já não chega a tempo (precisa de ${Math.ceil(returnTime(w, k))} s, faltam ${Math.ceil(left)} s).`, 'bad', 5);
      } else if (fresh.length > 1) push(`${fresh.length} trabalhadores já não chegam a tempo.`, 'bad', 5);
    };
    return session.on((events: SimEvent[]) => {
      const t = session.time;
      checkLate();
      for (const e of events) {
        switch (e.type) {
          case 'recall':
            push(`${e.n === 1 ? '1 chamado' : `${e.n} chamados`} de volta; os outros seguem coletando.`, 'good', 3);
            break;
          case 'siren':
            push(`SIRENE! A horda cruza o perímetro em ${clock(e.arrive - t)}.`, 'bad', 7);
            sound.siren();
            break;
          case 'alarm':
            push(e.on ? 'Alarme geral: todos de volta para a base!' : 'Saída liberada.', e.on ? 'good' : '');
            if (e.on) sound.horn();
            break;
          case 'arrive':
            push(e.outside ? `A horda invadiu o perímetro! ${e.outside} fora dos muros.` : 'Perímetro invadido. Todos dentro dos muros.', e.outside ? 'bad' : 'good', 6);
            break;
          case 'saved':
            if (e.outcome !== 'devorado') {
              push(e.fort ? `${e.name} se abrigou no fortim!${e.outcome === 'ferido' ? ' (ferido)' : ''}` : `${e.name} ${SAVED_TEXT[e.outcome]}`, e.outcome === 'limpo' ? 'good' : '');
              labels.outcome(e.worker, PILL_TEXT[e.outcome], false, t + 3);
              sound.chime();
            }
            break;
          case 'devoured':
            push(`Os insetos pegaram ${e.name}${e.cargo ? ` (e ${e.cargo} de minério)` : ''}. Toque para ver.`, 'bad', 6, { x: e.x, z: e.z });
            labels.outcome(e.worker, `✝ ${e.name}`, true, t + 3);
            sound.scream();
            sound.crunch();
            break;
          case 'gatesClosed':
            push('Portões fechados.');
            sound.slam();
            break;
          case 'waveEnd':
            setSummary({ stats: e.stats, until: performance.now() + 7000 });
            // Salva sozinho no começo de cada calma (vaga automática).
            void saveTo(session, 'auto').then((r) => {
              if (r.ok) push(`Salvo automaticamente (onda ${r.wave + 1}).`, '', 2);
            });
            break;
          case 'recruit':
            push(`${e.name} entrou para a colônia.`, 'good', 3);
            break;
          case 'depleted':
            push('Um nó de recurso se esgotou (volta a encher aos poucos entre as ondas).', '', 3);
            break;
          case 'newDeposit':
            push(`Nova jazida rica a ${Math.round(Math.hypot(e.x, e.z))} m da base.`, 'good', 5);
            break;
          case 'breach':
            if (performance.now() - lastBreach > 4000) {
              lastBreach = performance.now();
              push('Brecha na muralha!', 'bad', 4);
              sound.slam();
            }
            break;
          case 'tower':
            push('Torre nova na muralha.', 'good', 3);
            break;
          case 'repair':
            push(`Muralhas e prédios consertados (${e.cost} de minério).`, 'good', 3);
            break;
          case 'lost':
            sound.slam();
            break;
          case 'built':
            push(
              e.kind === 'muralha' ? `Muralha de ${e.cells} m erguida.` : e.kind === 'portao' ? `Portão de ${e.cells} m pronto.` : `Obra começou: ${BUILD_NAME[e.kind]!.toLowerCase()}.`,
              'good',
              3,
            );
            break;
          case 'climb':
            if (performance.now() - lastClimb > 6000) {
              lastClimb = performance.now();
              push('Os insetos estão escalando a muralha!', 'bad', 5);
            }
            break;
          case 'tunnel':
            push(`Tremor! Túnel vindo do ${e.side}: saem dentro da base em ${w0.cfg.tunnel.time} s.`, 'bad', 7);
            sound.rumble();
            break;
          case 'emerge':
            push('Insetos saindo do túnel dentro da base!', 'bad', 5);
            sound.slam();
            break;
          case 'finished':
            push(`${BUILD_NAME[e.kind]} ${ag(e.kind, 'pronta', 'pronto')}.`, 'good', 3);
            sound.done();
            break;
          case 'buildFail':
            push(`Não deu para construir: ${e.reason}`, 'bad', 4);
            break;
          case 'notice':
            push(e.text, 'bad', 3);
            break;
          case 'buildingHurt':
            push(`${BUILD_NAME[e.kind]} sob ataque: metade da vida!`, 'bad', 4);
            break;
          case 'demolished':
            push(`Demolido (+${e.refund} de minério).`, '', 3);
            break;
          case 'buildingDown':
            push(`${BUILD_NAME[e.kind]} ${ag(e.kind, 'destruída', 'destruído')}!${e.inside ? ` ${e.inside === 1 ? 'Quem estava dentro saiu ferido' : `Os ${e.inside} que estavam dentro saíram feridos`}.` : ''}`, 'bad', 5);
            sound.slam();
            break;
          case 'upgraded':
            push(`${BUILD_NAME[e.kind]} chegou ao nível ${e.level}.`, 'good', 4);
            break;
          case 'unitReady':
            push(e.kind === 'robo' ? 'Robô de combate pronto.' : e.kind === 'atirador' ? 'Atirador pronto.' : 'Soldado alistado.', 'good', 3);
            break;
          case 'unitDown':
            push(e.kind === 'robo' ? 'Um robô caiu!' : 'Um soldado caiu.', 'bad', 4);
            sound.crunch();
            break;
        }
      }
    });
  }, [session, sound, labels]);

  const w = session.world;
  const t = session.time;
  const tm = w.times;
  const nowMs = performance.now();
  const alive = aliveWorkers(w);
  const outside = w.workers.filter((k) => k.state !== 'dead' && !isSafe(w.cfg, k)).length;
  const lowMorale = w.morale < w.cfg.morale.lowAt;
  const corePct = (w.core / w.cfg.swarm.coreHp) * 100;
  const building = controls.building;
  const tool = controls.tool;
  const pend = controls.pending;
  const plan = building && pend && !pend.dragging ? planGhost(w, pend) : null;
  const sel = controls.selected;
  const selBuilding = sel?.type === 'building' ? w.buildings.find((x) => x.id === sel.id) : undefined;
  const selTower = sel?.type === 'tower' ? w.towers.find((x) => x.slot === sel.slot) : undefined;
  const selIds = controls.unitIds();
  // Etapa 16: quem não chega a tempo e quem está em risco (o botão "Chamar em risco").
  const left = timeLeft(w);
  const cant = w.workers.filter((k) => k.state !== 'dead' && k.state !== 'panic' && !isSafe(w.cfg, k) && returnTime(w, k) > left).length;
  const risk = w.phase === 'calm' || w.phase === 'warning' ? riskIds(w).length : 0;
  const locked = w.phase === 'breach' || w.phase === 'assault';

  let timer;
  if (w.phase === 'calm')
    timer = (
      <div class="panel timer">
        <div class="label">Onda {w.wave + 1} · horda em</div>
        <div class="big num">{clock(tm.arrive - t)}</div>
        <div class="sub">
          sirene em {clock(tm.siren - t)} · {tm.bugs} insetos{risk ? <b class="risk"> · {risk} em risco</b> : null}
        </div>
        {risk ? <div class="tally">{risk} em risco</div> : null}
      </div>
    );
  else if (w.phase === 'warning')
    timer = (
      <div class="panel timer warning" role="alert">
        <div class="label">Sirene · horda em</div>
        <div class="big num">{clock(tm.arrive - t)}</div>
        <div class="sub">
          {outside ? `${outside} trabalhador${outside > 1 ? 'es' : ''} fora dos muros` : 'todos dentro dos muros'}
          {cant ? <b class="risk"> · {cant} não {cant > 1 ? 'chegam' : 'chega'}</b> : null}
        </div>
        {cant ? (
          <div class="tally">
            {cant} não {cant > 1 ? 'chegam' : 'chega'}
          </div>
        ) : null}
      </div>
    );
  else if (w.phase === 'breach')
    timer = (
      <div class="panel timer breach">
        <div class="label">Perímetro invadido</div>
        <div class="big">Portões fechando</div>
        <div class="sub">corram!</div>
      </div>
    );
  else
    timer = (
      <div class="panel timer assault">
        <div class="label">Ataque à muralha</div>
        <div class="big num">{clock(tm.end - t)}</div>
        <div class="sub">{w.bugsAlive} insetos</div>
      </div>
    );

  const setSpeed = (s: Speed) => {
    session.speed = s;
    force((x) => x + 1);
  };

  const cardProps: CardProps = {
    w,
    session,
    controls,
    plan,
    selBuilding: !building ? selBuilding : undefined,
    selTower: !building ? selTower : undefined,
    onFocus: (r) => (session.focus(r), force((x) => x + 1)),
    onAlarm: () => !locked && session.alarm(!w.alarm),
    onRecall: () => !locked && risk > 0 && session.recallRisk(),
    onEscape: () => escape(),
  };
  cardLatest.current = cardProps;
  const escape = () => {
    if (controls.building) {
      if (controls.pending) controls.setPending(null);
      else if (controls.tool) controls.setTool(null);
      else controls.setBuilding(false);
    } else controls.select(null);
  };
  const workersOut = outside;
  const troopsUsed = unitLoad(w, 'soldado') + unitLoad(w, 'robo');
  const troopsCap = unitCap(w, 'soldado') + unitCap(w, 'robo');
  const hint = building ? (plan ? plan.label : tool ? TOOLS.find((x) => x.tool === tool)!.hint : 'Escolha o que construir na grade.') : '';

  return (
    <>
      <div class="hud-top">
        <div class="side-tools">
          {([1, 2, 4] as Speed[]).map((s) => (
            <button class={session.speed === s ? 'on' : ''} onClick={() => setSpeed(s)} aria-label={`Velocidade ${s}×`}>
              {s}×
            </button>
          ))}
          <button
            class={session.paused ? 'on' : ''}
            onClick={() => {
              session.paused = !session.paused;
              force((x) => x + 1);
            }}
            aria-label={session.paused ? 'Continuar' : 'Pausar'}
          >
            {session.paused ? '▶' : '❚❚'}
          </button>
          <button
            onClick={() => {
              sound.setMuted(!muted);
              setMuted(!muted);
            }}
            aria-label={muted ? 'Ligar som' : 'Desligar som'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            class="save-btn"
            disabled={!canSave(w)}
            onClick={async () => {
              const r = await saveTo(session, 'manual');
              pushToast(r.ok ? `Partida salva (onda ${r.wave + 1}).` : `Não deu para salvar: ${r.why}.`, r.ok ? 'good' : 'bad');
            }}
            aria-label="Salvar a partida (só na calma)"
            title="Salvar a partida (só na calma)"
          >
            <Icon k="save" />
          </button>
        </div>
        {timer}
        <div class="panel res" aria-label="Recursos">
          <div class="res-item" title="Minério">
            <i class="ico ore" />
            <span class="num">{w.ore}</span>
          </div>
          <div class={`res-item${w.energy.demand > w.energy.supply ? ' bad' : ''}`} title="Energia usada/total">
            <i class="ico energy" />
            <span class="num">
              {w.energy.demand}/{w.energy.supply}
            </span>
          </div>
          <div class="res-item" title="Trabalhadores (fora)">
            <i class="ico worker" />
            <span class="num">
              {alive}
              <small> ({workersOut})</small>
            </span>
          </div>
          <div class="res-item" title="Tropas/limite">
            <i class="ico troop" />
            <span class="num">
              {troopsUsed}/{troopsCap}
            </span>
          </div>
          <div class="res-bars">
            <div class={`morale-bar${lowMorale ? ' low' : ''}`} title={`Moral ${Math.round(w.morale)}`}>
              <i style={{ width: `${w.morale}%` }} />
            </div>
            <div class={`morale-bar core${corePct < 40 ? ' low' : ''}`} title={`Núcleo ${Math.round(w.core)}`}>
              <i style={{ width: `${corePct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div class="toasts">
        {toasts
          .filter((x) => x.until > nowMs)
          .map((x) => (
            x.at ? (
              <button key={x.id} class={`toast ${x.kind} jump`} onClick={() => jump(x.at!.x, x.at!.z)}>
                {x.text}
              </button>
            ) : (
              <div key={x.id} class={`toast ${x.kind}`}>
                {x.text}
              </div>
            )
          ))}
      </div>

      {summary && summary.until > nowMs && (
        <div class="panel summary">
          <h2>Onda {summary.stats.wave + 1} encerrada</h2>
          <p>+{summary.stats.delivered} de minério entregue</p>
          {summary.stats.outsideAtArrive > 0 ? (
            <p>
              {summary.stats.outsideAtArrive} ficaram fora: {summary.stats.saved} salvos, {summary.stats.dropped} sem carga, {summary.stats.wounded} feridos,{' '}
              {summary.stats.devoured} devorados
            </p>
          ) : (
            <p>Ninguém ficou fora dos muros.</p>
          )}
        </div>
      )}

      {hint && (
        <div class="panel move-hint build-hint" role="status">
          <span>
            {hint}
            {plan && pend ? (pend.tool === 'demolir' ? (plan.ok ? ` · +${plan.cost}` : '') : ` · ${plan.cost}${w.ore < plan.cost ? ' (falta minério)' : ''}`) : ''}
          </span>
        </div>
      )}

      <div class="hud-bottom">
        <Minimap session={session} cam={camInfo} jump={jump} />
        {!building && selIds.length ? (
          <UnitsPanel w={w} ids={selIds} onPick={(id) => controls.select({ type: 'units', ids: [id] })} />
        ) : !building && sel?.type === 'worker' ? (
          <WorkerPanel w={w} id={sel.id} />
        ) : !building && sel?.type === 'wall' ? (
          <WallPanel w={w} x={sel.x} z={sel.z} />
        ) : !building && (selBuilding || selTower) ? (
          <SelectionPanel w={w} b={selBuilding} t={selTower} />
        ) : (
          <PostSummary w={w} />
        )}
        <div class="command-col">
          <div class="alarm-row">
            <button
              class="recall"
              disabled={locked || !risk || w.alarm}
              onClick={() => session.recallRisk()}
              aria-label={`${risk ? `Chamar em risco: ${risk}` : 'Ninguém em risco'} (R)`}
            >
              <span>{risk ? 'Chamar em risco' : 'Ninguém em risco'}</span>
              {risk ? <small>{risk} {risk > 1 ? 'trabalhadores' : 'trabalhador'}</small> : null}
              <kbd>R</kbd>
            </button>
            <button
              class={`alarm${w.alarm ? ' on' : ''}${w.phase === 'warning' && !w.alarm && outside > 0 ? ' pulse' : ''}`}
              disabled={locked}
              onClick={() => session.alarm(!w.alarm)}
              aria-label={`${w.alarm ? 'Liberar saída' : 'Alarme geral'} (espaço)`}
            >
              {w.alarm ? 'Liberar saída' : 'Alarme geral'}
              <kbd>espaço</kbd>
            </button>
          </div>
          <CommandCard {...cardProps} />
        </div>
      </div>

      {w.lost && (
        <div class="panel help" role="alert">
          <h2>O núcleo caiu</h2>
          <p>
            A colônia aguentou {w.wave} onda{w.wave === 1 ? '' : 's'} e juntou {w.oreTotal} de minério.
          </p>
          <button class="alarm" onClick={() => location.reload()}>
            Recomeçar
          </button>
        </div>
      )}

      {!started && (
        <div class="panel help start">
          {/* O texto rola; o "Começar" fica sempre à vista embaixo (no celular o texto passa da tela). */}
          <div class="help-body">
          <h2>Outpost 7</h2>
          <p>Os trabalhadores saem sozinhos para buscar minério. Quanto mais longe, mais rende, e mais arriscado é.</p>
          <ul>
            <li>Quando a sirene tocar, a horda cruza o perímetro vermelho em poucos segundos.</li>
            <li>Toque em <b>Alarme geral</b> para chamar todo mundo de volta, ou em <b>Chamar em risco</b> para chamar só quem não voltaria a tempo (os outros seguem coletando).</li>
            <li>Sobre a cabeça de quem está fora: o tempo para voltar. Verde chega com folga, âmbar no limite, vermelho não chega (com a chance que teria se fosse chamado agora).</li>
            <li>Quem ficar fora quando a horda chegar rola o dado: a % é a chance de chegar ao portão.</li>
            <li>"Construir" põe muralhas, portões, torres, geradores, refinaria e fábrica onde você quiser.</li>
            <li>Torres, soldados e robôs defendem a muralha. Sozinhos, soldados vão para os portões e robôs tampam brechas. Toque numa tropa (ou segure e arraste uma caixa) e depois no chão para mandar; "Auto" devolve ao automático.</li>
            <li>O fortim guarda até 4 soldados: com eles escolhidos, toque no fortim. Lá dentro o enxame não os alcança e o tiro rende mais, mas o fortim pode cair. Construído fora da muralha (até 95 m), vira posto avançado: blindado e abrigo de 4 trabalhadores na hora do pânico.</li>
            <li>Tudo que você constrói fora da muralha chama a atenção da horda. "Consertar" conserta muralhas e prédios.</li>
            <li>Toque num trabalhador para ver o tempo de volta e chamar só ele.</li>
            <li>O botão de disquete (no alto) salva a partida na calma; ela também é salva sozinha a cada onda. "Continuar" volta de onde parou.</li>
            <li>Tocar numa muralha mostra a vida dela e deixa demolir o pedaço.</li>
            <li>A grade de comandos (embaixo, à direita) muda com o que você escolhe. No teclado: Q W E / A S D / Z X C, espaço para o alarme e Esc para voltar.</li>
            <li>Arraste para mover a câmera (ou as setas), use a pinça ou a roda para o zoom e dois dedos (ou o botão direito) para girar. O minimapa leva a câmera.</li>
          </ul>
          </div>
          <div class="help-actions">
            {saves.map(({ slot, meta }) => (
              <button key={slot} class="continue" onClick={() => loadAndReload(slot)}>
                Continuar · onda {meta.wave + 1}
                <small>
                  {slot === 'manual' ? 'salva à mão' : 'salva sozinha'} · {meta.workers} trabalhadores · {meta.ore} de minério{meta.savedAt ? ` · ${ago(meta.savedAt)}` : ''}
                </small>
              </button>
            ))}
            <button
              class="alarm"
              onClick={() => {
                sound.unlock();
                session.paused = false;
                setStarted(true);
              }}
            >
              {loaded ? 'Continuar' : saves.length ? 'Novo jogo' : 'Começar'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
