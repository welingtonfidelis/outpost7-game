import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Recebe o relatório do medidor de desempenho (?perf) mandado pelo celular e grava em
 * reports/perf.jsonl. Só existe no servidor de desenvolvimento.
 */
function perfReceiver(): Plugin {
  return {
    name: 'perf-receiver',
    configureServer(server) {
      server.middlewares.use('/__perf', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        let body = '';
        req.on('data', (c: Buffer) => {
          body += c.toString('utf8');
          if (body.length > 20000) req.destroy();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            mkdirSync('reports', { recursive: true });
            appendFileSync('reports/perf.jsonl', JSON.stringify({ at: new Date().toISOString(), ua: req.headers['user-agent'], ...data }) + '\n');
            console.log(`[perf] ${data.label ?? ''} ${data.fps?.toFixed?.(1)} fps, p95 ${data.p95?.toFixed?.(1)} ms, ${data.calls} chamadas, ${data.triangles} triângulos`);
          } catch {
            // corpo inválido: ignora
          }
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

/**
 * Recebe capturas do canvas (data URL de PNG) e grava em reports/snap-<nome>.png. Serve para
 * fotografar o jogo com o painel do navegador oculto. Só no servidor de desenvolvimento.
 */
function snapReceiver(): Plugin {
  return {
    name: 'snap-receiver',
    configureServer(server) {
      server.middlewares.use('/__snap', (req, res) => {
        const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'snap').replace(/[^a-z0-9-]/gi, '');
        if (req.method !== 'POST' || !name) {
          res.statusCode = 400;
          return res.end();
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > 12 * 1024 * 1024) req.destroy();
          else chunks.push(c);
        });
        req.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(text);
          if (!m) {
            res.statusCode = 400;
            return res.end();
          }
          mkdirSync('reports', { recursive: true });
          writeFileSync(`reports/snap-${name}.png`, Buffer.from(m[1]!, 'base64'));
          console.log(`[snap] reports/snap-${name}.png`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [perfReceiver(), snapReceiver()],
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
});
