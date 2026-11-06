/**
 * Assa os tiros do pixelfx (MIT, github.com/patch-gg/pixelfx) numa folha de quadros (Etapa 21).
 *
 *   node tools/bake-fx.ts <pasta com o pixelfx baixado>
 *
 * O código do pixelfx roda só aqui, uma vez, no Mac; o jogo leva a imagem
 * `public/assets/fx/tiros.png` e as medidas em `src/render/shotSheet.ts` (gerado, não editar).
 * Da pasta baixada basta: src/core/, src/fx/projectiles/{_lib,muzzle-smg,muzzle-pistol}.js.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const src = resolve(process.argv[2] ?? '.');
if (!existsSync(join(src, 'src/core/index.js'))) throw new Error('uso: node tools/bake-fx.ts <pasta do pixelfx>');
const load = (p: string) => import(pathToFileURL(join(src, p)).href);
const core = await load('src/core/index.js');
const commit = existsSync(join(src, 'COMMIT')) ? readFileSync(join(src, 'COMMIT'), 'utf8').trim() : 'desconhecido';

/**
 * Até quantos px abaixo do cano a folha vai. Os efeitos têm um chão 26 px abaixo do cano (cápsula
 * quicando, faíscas rolando, brilho no piso); no jogo o cano está no ar, então isso fica de fora.
 */
const CUT = 12;
const MAX_W = 1024;
const SHEETS = [
  { key: 'smg', file: 'src/fx/projectiles/muzzle-smg.js' },
  { key: 'pistol', file: 'src/fx/projectiles/muzzle-pistol.js' },
];

interface Baked {
  key: string;
  name: string;
  frames: Uint8ClampedArray[];
  w: number;
  fps: number;
  loop: boolean;
  /** Recorte (px da tela do efeito) e o cano dentro dele. */
  x0: number;
  y0: number;
  cw: number;
  ch: number;
  mx: number;
  my: number;
}

const baked: Baked[] = [];
for (const s of SHEETS) {
  const mod = await load(s.file);
  const meta = mod.meta;
  const [W, H] = meta.size as [number, number];
  const [ox, oy] = meta.origin as [number, number];
  const fps = meta.fps as number;
  const loop = !!meta.loop;
  const n = loop ? Math.round(meta.duration * fps) : Math.floor(meta.duration * fps) + 1;
  const frame = core.createFrame(W, H);
  const fx = core.createFx(mod, { x: ox, y: oy });
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < n; i++) {
    core.clearFrame(frame);
    fx.draw(frame);
    const rgba = new Uint8ClampedArray(W * H * 4);
    core.composite(frame, rgba, null);
    frames.push(rgba);
    fx.update(1 / fps);
  }
  const muzzleY = oy - (meta.options.height as number);
  const cut = muzzleY + CUT;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const alive: boolean[] = [];
  for (const f of frames) {
    let any = false;
    for (let y = 0; y < Math.min(H, cut); y++)
      for (let x = 0; x < W; x++) {
        if (f[(y * W + x) * 4 + 3]! < 8) continue;
        any = true;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    alive.push(any);
  }
  // Um tiro avulso acaba no último quadro com alguma coisa (o fim da fumaça).
  let last = frames.length;
  if (!loop) while (last > 1 && !alive[last - 1]) last--;
  // 1 px vazio em volta de cada quadro: a amostragem nunca pega o vizinho.
  baked.push({ key: s.key, name: meta.name, frames: frames.slice(0, last), w: W, fps, loop, x0, y0, cw: x1 - x0 + 3, ch: y1 - y0 + 3, mx: ox - x0 + 1, my: muzzleY - y0 + 1 });
}

// Uma folha só (uma textura, uma chamada de desenho): cada efeito numa faixa de linhas.
let AW = 0, AH = 0;
const place: { cols: number; ay: number }[] = [];
for (const b of baked) {
  const cols = Math.min(b.frames.length, Math.floor(MAX_W / b.cw));
  const rows = Math.ceil(b.frames.length / cols);
  place.push({ cols, ay: AH });
  AW = Math.max(AW, cols * b.cw);
  AH += rows * b.ch;
}
const atlas = new Uint8ClampedArray(AW * AH * 4);
baked.forEach((b, k) => {
  const { cols, ay } = place[k]!;
  b.frames.forEach((f, i) => {
    const cx = (i % cols) * b.cw + 1, cy = ay + Math.floor(i / cols) * b.ch + 1;
    for (let y = 0; y < b.ch - 2; y++)
      for (let x = 0; x < b.cw - 2; x++) {
        const s = ((b.y0 + y) * b.w + b.x0 + x) * 4, d = ((cy + y) * AW + cx + x) * 4;
        atlas[d] = f[s]!;
        atlas[d + 1] = f[s + 1]!;
        atlas[d + 2] = f[s + 2]!;
        atlas[d + 3] = f[s + 3]!;
      }
  });
});

function png(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const crcT = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcT[n] = c;
  }
  const crc = (b: Buffer) => {
    let c = -1;
    for (const x of b) c = crcT[(c ^ x) & 255]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/assets/fx', { recursive: true });
const file = png(AW, AH, atlas);
writeFileSync('public/assets/fx/tiros.png', file);

const sheets = baked
  .map((b, k) => {
    const { cols, ay } = place[k]!;
    return `  /** ${b.name} (pixelfx). */\n  ${b.key}: { y: ${ay}, cols: ${cols}, cw: ${b.cw}, ch: ${b.ch}, frames: ${b.frames.length}, fps: ${b.fps}, loop: ${b.loop}, mx: ${b.mx}, my: ${b.my} },`;
  })
  .join('\n');
writeFileSync(
  'src/render/shotSheet.ts',
  `// Gerado por tools/bake-fx.ts a partir do pixelfx (commit ${commit}). Não editar à mão.
/**
 * Folha dos tiros (\`public/assets/fx/tiros.png\`): quadros do pixelfx, MIT (Patch e Hugo Duprez),
 * ver LICENSES.md. Cada efeito ocupa uma faixa a partir da linha \`y\`, em \`cols\` colunas de quadros
 * \`cw\` x \`ch\` px (com 1 px vazio em volta). \`mx\`, \`my\`: o cano dentro do quadro (px, y para baixo).
 */
export const SHOT_ATLAS = { file: 'tiros.png', w: ${AW}, h: ${AH} } as const;

export const SHOT_SHEETS = {
${sheets}
} as const;

export type ShotSheetKey = keyof typeof SHOT_SHEETS;
`,
);
console.log(`tiros.png ${AW}x${AH}, ${(file.length / 1024).toFixed(1)} KB; ${baked.map((b) => `${b.key} ${b.frames.length} quadros ${b.cw}x${b.ch}`).join(', ')}`);
