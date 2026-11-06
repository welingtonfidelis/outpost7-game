/**
 * Copia da coleção KayKit só o que o manifesto lista, validando extensão, tamanho e que não
 * é ponteiro do Git LFS (o arquivo de verdade tem que ter sido baixado com git lfs pull).
 * Os .gltf são conferidos: só podem apontar para arquivos vizinhos (sem caminhos nem URLs).
 */
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ART, KAYKIT_ROOT } from './art-manifest.ts';

const OK_EXT = /\.(gltf|bin|glb|png)$/i;
const root = resolve(KAYKIT_ROOT);
const out = resolve('public/assets/kaykit');
let n = 0;
let bytes = 0;
for (const [src, dst] of ART) {
  if (!OK_EXT.test(src) || !OK_EXT.test(dst) || dst.includes('..')) throw new Error(`extensão ou destino recusado: ${src} -> ${dst}`);
  const from = join(root, src);
  const st = statSync(from);
  if (st.size < 200) throw new Error(`parece ponteiro do Git LFS (baixe com git lfs pull): ${src}`);
  if (st.size > 8 * 1024 * 1024) throw new Error(`grande demais: ${src}`);
  if (src.endsWith('.gltf')) {
    const j = JSON.parse(readFileSync(from, 'utf8'));
    const uris = [...(j.buffers ?? []), ...(j.images ?? [])].map((x: { uri?: string }) => x.uri).filter(Boolean) as string[];
    for (const u of uris) if (/[/\\:]/.test(u)) throw new Error(`URI estranha em ${src}: ${u}`);
  }
  const to = join(out, dst);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  n++;
  bytes += st.size;
}
console.log(`${n} arquivos copiados (${(bytes / 1024 / 1024).toFixed(1)} MB) para public/assets/kaykit`);
