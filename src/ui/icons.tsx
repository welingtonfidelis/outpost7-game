/**
 * Ícones da grade e da seleção (Etapa 13). Tropas e prédios usam o retrato tirado dos
 * modelos do KayKit na carga (`src/render/portraits.ts`); as ações usam desenhos de traço
 * próprios. Sem a arte (`?semarte`), tropas e prédios também caem no desenho de traço.
 */
import type { JSX } from 'preact';

export type PortraitKey = 'worker' | 'soldado' | 'atirador' | 'robo' | 'torre' | 'gerador' | 'refinaria' | 'quartel' | 'fabrica' | 'fortim';
export type IconKey =
  | PortraitKey
  | 'build'
  | 'repair'
  | 'recruit'
  | 'confirm'
  | 'cancel'
  | 'back'
  | 'close'
  | 'upgrade'
  | 'max'
  | 'auto'
  | 'hold'
  | 'all'
  | 'wall'
  | 'gate'
  | 'demolish'
  | 'ore'
  | 'enter'
  | 'exit'
  | 'save';

let portraits: Partial<Record<PortraitKey, string>> = {};

/** Retratos prontos (data URL), um por tropa e prédio. */
export function setPortraits(p: Partial<Record<PortraitKey, string>>): void {
  portraits = p;
}

export function portraitOf(k: PortraitKey): string | undefined {
  return portraits[k];
}

const P = (d: string) => <path d={d} />;

const GLYPHS: Record<IconKey, JSX.Element> = {
  build: (
    <>
      {P('M13.5 4.5l6 6-3 3-6-6z')}
      {P('M10.5 9.5L4 16l3.5 3.5L14 13')}
    </>
  ),
  repair: P('M14.5 4a4.5 4.5 0 0 0-4.2 6.1L4 16.4 7.6 20l6.3-6.3A4.5 4.5 0 0 0 20 9.2l-2.8 2.8-2.9-.5-.5-2.9L16.6 5.8A4.5 4.5 0 0 0 14.5 4z'),
  recruit: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      {P('M3 20c0-3.6 2.7-6.2 6-6.2s6 2.6 6 6.2')}
      {P('M18.5 7.5v6M15.5 10.5h6')}
    </>
  ),
  confirm: P('M5 12.5l4.5 4.5L19 7'),
  cancel: P('M6.5 6.5l11 11M17.5 6.5l-11 11'),
  close: P('M6.5 6.5l11 11M17.5 6.5l-11 11'),
  back: P('M10 6l-6 6 6 6M4 12h16'),
  upgrade: P('M6 12.5l6-6 6 6M6 18.5l6-6 6 6'),
  max: P('M12 3.5l2.5 5.3 5.8.6-4.3 3.9 1.2 5.7L12 16.1 6.8 19l1.2-5.7-4.3-3.9 5.8-.6z'),
  auto: (
    <>
      {P('M19.5 12a7.5 7.5 0 1 1-2.2-5.3')}
      {P('M19.5 4v4h-4')}
    </>
  ),
  hold: (
    <>
      {P('M12 3.5l7 2.8v5.4c0 4.2-3 7.4-7 8.8-4-1.4-7-4.6-7-8.8V6.3z')}
      {P('M9.5 9.5v5M14.5 9.5v5')}
    </>
  ),
  all: P('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'),
  wall: (
    <>
      {P('M3 6.5h18v11H3z')}
      {P('M3 12h18M9 6.5V12M15 6.5V12M6 12v5.5M12 12v5.5M18 12v5.5')}
    </>
  ),
  gate: (
    <>
      {P('M4 20V8.5l8-4.5 8 4.5V20')}
      {P('M8.5 20v-7.5h7V20M12 12.5V20')}
    </>
  ),
  demolish: (
    <>
      {P('M5 7h14M9.5 7V4.5h5V7')}
      {P('M7 7l1 13h8l1-13M10.5 10.5v6M13.5 10.5v6')}
    </>
  ),
  ore: (
    <>
      {P('M12 3.5l7 6.5-7 10.5L5 10z')}
      {P('M5 10h14M9 10l3 10.5 3-10.5')}
    </>
  ),
  worker: (
    <>
      {P('M5 19.5l9-9')}
      {P('M8.5 5c4.2-1.4 8.4.4 11 4.6-3.2-1.8-7-2-10.4-.6z')}
    </>
  ),
  soldado: (
    <>
      {P('M4 15a8 8 0 0 1 16 0z')}
      {P('M2.5 15h19M8 15v3.5h8V15')}
    </>
  ),
  atirador: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      {P('M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5')}
    </>
  ),
  robo: (
    <>
      <rect x="5" y="7.5" width="14" height="11" rx="2" />
      <circle cx="9.5" cy="12.8" r="1.4" />
      <circle cx="14.5" cy="12.8" r="1.4" />
      {P('M12 7.5V4.5M10 4.5h4')}
    </>
  ),
  torre: (
    <>
      {P('M8 20.5V11h8v9.5M5 20.5h14')}
      {P('M6.5 11h11V7.5h-11zM17.5 9h4')}
    </>
  ),
  gerador: P('M13.5 3L6 13.5h5.2L10 21l8-11h-5.3z'),
  refinaria: (
    <>
      {P('M12 3.5c3 4 5.2 7.1 5.2 9.8a5.2 5.2 0 0 1-10.4 0c0-2.7 2.2-5.8 5.2-9.8z')}
      {P('M10 14.5a2.2 2.2 0 0 0 2 2')}
    </>
  ),
  quartel: P('M6 21V3.5M6 4h11.5l-2.2 3.6 2.2 3.6H6'),
  fabrica: (
    <>
      {P('M3 20.5V10l5 3v-3l5 3V5.5h3.5v15z')}
      {P('M2.5 20.5h19')}
    </>
  ),
  fortim: (
    <>
      {P('M3.5 19.5l1.5-8.5h14l1.5 8.5z')}
      {P('M7 14.5h10M9 8.5h6l1 2.5H8z')}
      {P('M2.5 19.5h19')}
    </>
  ),
  save: (
    <>
      {P('M5 4h11.5L20 7.5V20H5z')}
      {P('M8 4v5h7V4M8 20v-6.5h8V20')}
    </>
  ),
  enter: (
    <>
      {P('M13 4.5h5.5v15H13')}
      {P('M3.5 12h10M10 8.5l3.5 3.5-3.5 3.5')}
    </>
  ),
  exit: (
    <>
      {P('M11 4.5H5.5v15H11')}
      {P('M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5')}
    </>
  ),
};

const PORTRAIT_KEYS = new Set<string>(['worker', 'soldado', 'atirador', 'robo', 'torre', 'gerador', 'refinaria', 'quartel', 'fabrica', 'fortim']);

/** Ícone: o retrato, se houver e for tropa ou prédio; senão o desenho de traço. */
export function Icon({ k, cls = '' }: { k: IconKey; cls?: string }) {
  const url = PORTRAIT_KEYS.has(k) ? portraits[k as PortraitKey] : undefined;
  if (url) return <img class={`icon portrait ${cls}`} src={url} alt="" draggable={false} />;
  return (
    <svg class={`icon glyph ${cls}`} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      {GLYPHS[k]}
    </svg>
  );
}

/** Retrato grande do painel da seleção (com moldura, cai no desenho se não houver arte). */
export function Portrait({ k }: { k: IconKey }) {
  const url = PORTRAIT_KEYS.has(k) ? portraits[k as PortraitKey] : undefined;
  return (
    <div class="sel-portrait" aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : <Icon k={k} />}
    </div>
  );
}
