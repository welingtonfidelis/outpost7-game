/**
 * Etapa 19: o bioma do planeta muda a cada partida nova (deserto, floresta ou gelo), num tom
 * sombrio mas legível (decisão do usuário em 2026-11-06: nada de noite escura, o enxame tem
 * que aparecer). O peso vem da paleta: cores dessaturadas, névoa carregada, sol baixo ou luz
 * nublada. Sai da semente do mundo, então uma partida salva volta no mesmo bioma. Só muda a
 * tela. Teste: ?bioma=deserto|floresta|gelo.
 */
export type BiomeId = 'deserto' | 'floresta' | 'gelo';

export const BIOME_IDS: BiomeId[] = ['deserto', 'floresta', 'gelo'];

export interface Biome {
  id: BiomeId;
  /** Nome para a tela de início. */
  name: string;
  /** Uma linha de clima para a tela de início. */
  blurb: string;
  /** Textura do chão: cor de fundo, grãos (escuro, claro) e pedrinhas. */
  ground: { base: string; dark: string; light: string; pebble: string };
  /** Sombreado do chão: altura das dunas/morros, ondinhas, manchas de cor (vale, crista). */
  shade: { amp: number; ripple: number; rippleFreq: number; low: string; high: string; patch: number };
  fog: { color: string; near: number; far: number };
  hemi: { sky: string; ground: string; intensity: number };
  sun: { color: string; intensity: number; dir: [number, number, number] };
  /** Grade de cor da tela inteira: saturação, tom e exposição. */
  grade: { sat: number; tint: [number, number, number]; exposure: number };
  /** Poeira no pé da muralha (r,g,b). */
  dust: string;
  /** Piso do pátio. */
  yard: { base: string; dark: string; light: string; track: string; edge: string; side: string };
  /** Casco do inseto: junta escura e placa. */
  bug: [string, string];
  /** Partículas no ar. */
  air: { color: string; count: number; size: number; fall: number; wind: number; alpha: number };
}

export const BIOMES: Record<BiomeId, Biome> = {
  deserto: {
    id: 'deserto',
    name: 'Deserto',
    blurb: 'Fim de tarde sujo de poeira.',
    ground: { base: '#a48d6c', dark: 'rgba(100,72,46,0.2)', light: 'rgba(225,198,150,0.14)', pebble: 'rgba(70,52,36,0.2)' },
    shade: { amp: 1, ripple: 0.07, rippleFreq: 6.5, low: '#8c6c48', high: '#c4a070', patch: 0.12 },
    fog: { color: '#8e7a62', near: 85, far: 290 },
    hemi: { sky: '#d6c7b0', ground: '#3a2e24', intensity: 1.3 },
    sun: { color: '#ffd2a6', intensity: 2.3, dir: [0.75, 0.42, 0.5] },
    grade: { sat: 0.66, tint: [1.02, 0.98, 0.93], exposure: 0.95 },
    dust: '160,128,90',
    yard: { base: '#97805e', dark: '80,60,40', light: '220,198,160', track: 'rgba(60,44,30,0.2)', edge: '80,62,42', side: '#7a654a' },
    bug: ['#140d09', '#6a4128'],
    air: { color: '#d9bf90', count: 500, size: 0.16, fall: -0.15, wind: 7, alpha: 0.4 },
  },
  floresta: {
    id: 'floresta',
    name: 'Floresta',
    blurb: 'Mata fechada, úmida e cinzenta.',
    ground: { base: '#66704a', dark: 'rgba(36,42,22,0.22)', light: 'rgba(170,180,120,0.14)', pebble: 'rgba(70,54,36,0.3)' },
    shade: { amp: 0.5, ripple: 0, rippleFreq: 1, low: '#4c5232', high: '#8a865a', patch: 0.35 },
    fog: { color: '#66705f', near: 70, far: 260 },
    hemi: { sky: '#b5c2b0', ground: '#1e2418', intensity: 1.35 },
    sun: { color: '#e4ead8', intensity: 1.7, dir: [0.35, 0.85, 0.4] },
    grade: { sat: 0.62, tint: [0.95, 1.0, 0.95], exposure: 1.0 },
    dust: '70,62,44',
    yard: { base: '#5f523e', dark: '40,32,24', light: '140,124,96', track: 'rgba(30,24,16,0.25)', edge: '40,36,26', side: '#4c4032' },
    bug: ['#0d0b08', '#8a6838'],
    air: { color: '#dfe8b8', count: 320, size: 0.12, fall: 0.05, wind: 0.8, alpha: 0.7 },
  },
  gelo: {
    id: 'gelo',
    name: 'Gelo',
    blurb: 'Nevasca cinza e vento cortante.',
    ground: { base: '#d3dbe2', dark: 'rgba(110,128,150,0.16)', light: 'rgba(255,255,255,0.3)', pebble: 'rgba(90,104,120,0.25)' },
    shade: { amp: 0.8, ripple: 0.1, rippleFreq: 9, low: '#a3b4c6', high: '#eef3f7', patch: 0.12 },
    fog: { color: '#9aa6b2', near: 60, far: 240 },
    hemi: { sky: '#d2dce8', ground: '#4a5666', intensity: 1.3 },
    sun: { color: '#e9effa', intensity: 1.7, dir: [-0.45, 0.6, 0.55] },
    grade: { sat: 0.6, tint: [0.94, 0.98, 1.05], exposure: 0.86 },
    dust: '228,236,244',
    yard: { base: '#b9c3cb', dark: '100,110,120', light: '245,248,252', track: 'rgba(70,80,90,0.25)', edge: '238,243,248', side: '#97a3ad' },
    bug: ['#0e1016', '#46506a'],
    air: { color: '#ffffff', count: 1600, size: 0.2, fall: 2.6, wind: 2.2, alpha: 0.85 },
  },
};

/** O bioma da partida: o da URL (teste) ou o que a semente escolhe. */
export function biomeFor(seed: number, url?: URLSearchParams): Biome {
  const q = url?.get('bioma') as BiomeId | null;
  if (q && BIOMES[q]) return BIOMES[q];
  return BIOMES[BIOME_IDS[(seed >>> 0) % BIOME_IDS.length]!];
}
