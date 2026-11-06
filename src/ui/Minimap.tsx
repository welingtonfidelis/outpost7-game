/**
 * Minimapa (convenção de RTS): base, muralhas, prédios, nós de recurso, pessoas, tropas,
 * insetos e o retângulo da câmera. Tocar ou clicar leva a câmera para lá.
 */
import { useEffect, useRef } from 'preact/hooks';
import { BUG_FLOATS, RUBBLE, insideBase, returnTime, timeLeft } from '../sim/index.ts';
import type { Session } from '../game/session.ts';

/** Raio do mundo mostrado (m). */
const R = 135;

export interface CamInfo {
  x: number;
  z: number;
  yaw: number;
  /** Meia largura e meia profundidade da área vista no chão (m). */
  halfW: number;
  halfD: number;
}

export function Minimap({ session, cam, jump }: { session: Session; cam: () => CamInfo; jump: (x: number, z: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const cv = ref.current;
      if (!cv) return;
      const css = cv.clientWidth || 140;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(css * dpr)) {
        cv.width = cv.height = Math.round(css * dpr);
      }
      const g = cv.getContext('2d')!;
      const S = cv.width;
      const k = S / (2 * R);
      const px = (x: number) => (x + R) * k;
      const pz = (z: number) => (z + R) * k;
      const w = session.world;
      g.fillStyle = '#5b4632';
      g.fillRect(0, 0, S, S);
      // Perímetro e raio de construção.
      g.lineWidth = Math.max(1, S / 140);
      g.strokeStyle = 'rgba(229,64,42,0.7)';
      g.beginPath();
      g.arc(px(0), pz(0), w.cfg.dangerRadius * k, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.15)';
      g.beginPath();
      g.arc(px(0), pz(0), w.cfg.build.radius * k, 0, Math.PI * 2);
      g.stroke();
      // Nós.
      const ringCol = ['#9aa6b4', '#c8703f', '#e8c547'];
      for (const n of w.nodes) {
        if (n.stock <= 0) continue;
        g.fillStyle = ringCol[n.ring]!;
        g.fillRect(px(n.x) - 1.5 * dpr, pz(n.z) - 1.5 * dpr, 3 * dpr, 3 * dpr);
      }
      // Muralhas.
      const size = w.gridSize;
      const half = size / 2;
      const cell = Math.max(1, k);
      for (let i = 0; i < w.wallCells.length; i++) {
        const c = w.wallCells[i]!;
        g.fillStyle = w.wallTerrain[i] === RUBBLE ? '#3a2f25' : w.wallGate[i]! >= 0 ? '#e8b21c' : '#c9c4b8';
        g.fillRect(px((c % size) - half), pz(Math.floor(c / size) - half), cell, cell);
      }
      // Prédios.
      for (const b of w.buildings) {
        g.fillStyle = b.buildLeft > 0 ? '#8a8f94' : '#d0d6dc';
        g.fillRect(px(b.x - b.size / 2), pz(b.z - b.size / 2), b.size * k, b.size * k);
      }
      // Insetos (amostra, para não pesar).
      const bugs = session.bugs;
      const count = Math.min(w.bugCount, Math.floor(bugs.length / BUG_FLOATS));
      const step = count > 3000 ? 3 : count > 1500 ? 2 : 1;
      g.fillStyle = '#ff4b3a';
      for (let i = 0; i < count; i += step) {
        const o = i * BUG_FLOATS;
        if (bugs[o + 5]! < 0 || bugs[o + 5]! >= 2) continue;
        g.fillRect(px(bugs[o + 2]!), pz(bugs[o + 3]!), dpr, dpr);
      }
      // Túnel ativo: linha da boca até a saída.
      for (const tn of w.tunnels) {
        if (tn.started < 0 || tn.under <= 0) continue;
        g.strokeStyle = 'rgba(255,75,58,0.95)';
        g.setLineDash([3 * dpr, 2 * dpr]);
        g.beginPath();
        g.moveTo(px(tn.ex), pz(tn.ez));
        g.lineTo(px(tn.ix), pz(tn.iz));
        g.stroke();
        g.setLineDash([]);
      }
      // Pessoas e tropas. Etapa 16: quem não chega a tempo fica vermelho e maior; em risco, âmbar.
      const left = timeLeft(w);
      const risky = w.phase === 'calm' || w.phase === 'warning';
      for (const p of w.workers) {
        if (p.state === 'dead' || p.state === 'sheltered') continue;
        let col = '#ff9a3c';
        let s = 1;
        if (risky && p.state !== 'panic' && !insideBase(w.cfg, p.x, p.z)) {
          const rt = returnTime(w, p);
          if (rt > left) {
            col = '#ff3b2a';
            s = 2;
          } else if (rt > left - w.cfg.recallMargin && !p.hold) {
            col = '#ffd23a';
            s = 1.5;
          }
        }
        g.fillStyle = col;
        g.fillRect(px(p.x) - s * dpr, pz(p.z) - s * dpr, 2 * s * dpr, 2 * s * dpr);
      }
      g.fillStyle = '#8fd16a';
      for (const u of w.units) if (!u.dead) g.fillRect(px(u.x) - dpr, pz(u.z) - dpr, 2 * dpr, 2 * dpr);
      // Câmera.
      const c = cam();
      const cs = Math.cos(c.yaw);
      const sn = Math.sin(c.yaw);
      // Direita no chão = (c, -s); frente = (-s, -c) (igual à câmera de RTS).
      const corner = (a: number, d: number) => [px(c.x + a * cs - d * sn), pz(c.z - a * sn - d * cs)] as const;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = Math.max(1, dpr);
      g.beginPath();
      const pts = [corner(-c.halfW, -c.halfD), corner(c.halfW, -c.halfD), corner(c.halfW, c.halfD), corner(-c.halfW, c.halfD)];
      g.moveTo(pts[0]![0], pts[0]![1]);
      for (const q of pts.slice(1)) g.lineTo(q[0], q[1]);
      g.closePath();
      g.stroke();
    };
    draw();
    const id = setInterval(draw, 250);
    return () => clearInterval(id);
  }, [session, cam]);

  const onPointer = (e: PointerEvent) => {
    const cv = ref.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 * R - R;
    const z = ((e.clientY - r.top) / r.height) * 2 * R - R;
    jump(x, z);
  };

  return (
    <div class="panel minimap">
      <canvas
        ref={ref}
        aria-label="Minimapa: toque para levar a câmera"
        onPointerDown={(e) => {
          try {
            (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          } catch {
            // ponteiro já solto (ou sintético): segue sem captura
          }
          onPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) onPointer(e);
        }}
      />
    </div>
  );
}
