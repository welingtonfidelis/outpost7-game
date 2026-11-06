/**
 * Câmera de RTS: um dedo (ou o botão esquerdo) arrasta o mapa, pinça ou roda dá zoom,
 * dois dedos girando (ou o botão direito) giram a vista. Teclado: setas, Shift + setas giram.
 * Segurar parado um instante e arrastar (ou Ctrl/⌘ e arrastar) puxa uma caixa de seleção;
 * um clique direito sem arrastar é a ordem de "ir para lá".
 */
import type * as THREE from 'three';

export class RtsCamera {
  target = { x: 0, z: 0 };
  distance = 105;
  yaw = Math.PI / 4;
  pitch = 0.95;
  minDistance = 22;
  maxDistance = 190;
  bound = 140;
  private pointers = new Map<number, { x: number; y: number }>();
  private keys = new Set<string>();
  private pinch: { d: number; a: number } | null = null;
  private camera: THREE.PerspectiveCamera;
  private el: HTMLElement;
  /** Arrastou de verdade (não é um toque simples). */
  dragged = false;
  /** Toque simples no mapa (sem arrastar), em coordenadas de tela. */
  onTap: ((x: number, y: number, add: boolean) => void) | null = null;
  /** Se definido, um dedo arrastando desenha (traçar muralha) em vez de mover a câmera. */
  dragTool: ((phase: 'start' | 'move' | 'end', x: number, y: number) => void) | null = null;
  private drawing = false;
  private mid: { x: number; y: number } | null = null;
  private multi = false;
  /** Caixa de seleção (desligada no modo construir). */
  onBox: ((phase: 'start' | 'move' | 'end' | 'cancel', x: number, y: number, add?: boolean) => void) | null = null;
  /** Clique direito sem arrastar. */
  onAltTap: ((x: number, y: number) => void) | null = null;
  /** Quanto tempo segurar parado para virar caixa (ms) e quanto pode mexer antes (px). */
  holdMs = 300;
  /** Tremor (mortes marcantes): amplitude que decai. */
  private shakeAmp = 0;
  holdSlop = 8;
  private boxing = false;
  private holdTimer = 0;
  private start = { x: 0, y: 0 };

  constructor(camera: THREE.PerspectiveCamera, el: HTMLElement) {
    this.camera = camera;
    this.el = el;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private worldPerPixel(): number {
    const h = this.el.clientHeight || window.innerHeight;
    return (2 * this.distance * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
  }

  private pan(dx: number, dy: number): void {
    const k = this.worldPerPixel();
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    // O chão acompanha o dedo: direita na tela = (c, -s), frente = (-s, -c) no chão.
    const g = (dy * k) / Math.sin(this.pitch);
    this.target.x += -c * dx * k - s * g;
    this.target.z += s * dx * k - c * g;
    this.clamp();
  }

  private clamp(): void {
    const d = Math.hypot(this.target.x, this.target.z);
    if (d > this.bound) {
      this.target.x *= this.bound / d;
      this.target.z *= this.bound / d;
    }
    this.distance = Math.min(this.maxDistance, Math.max(this.minDistance, this.distance));
  }

  private down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.dragged = false;
      this.multi = false;
      this.start = { x: e.clientX, y: e.clientY };
      if (this.dragTool && e.button === 0) {
        this.drawing = true;
        this.dragTool('start', e.clientX, e.clientY);
      } else if (this.onBox && e.button === 0) {
        if (e.ctrlKey || e.metaKey) this.beginBox(e.clientX, e.clientY);
        else {
          const sx = e.clientX;
          const sy = e.clientY;
          this.holdTimer = window.setTimeout(() => {
            this.holdTimer = 0;
            if (this.pointers.size === 1 && !this.drawing) this.beginBox(sx, sy);
          }, this.holdMs);
        }
      }
    }
    if (this.pointers.size === 2) {
      this.multi = true;
      this.pinch = this.pinchState();
      this.mid = this.midpoint();
      this.cancelHold();
      if (this.boxing) {
        // Segundo dedo: era para mexer na câmera.
        this.boxing = false;
        this.onBox?.('cancel', NaN, NaN);
      }
      if (this.drawing) {
        // Segundo dedo: era para mexer na câmera, não para traçar.
        this.drawing = false;
        this.dragTool?.('end', NaN, NaN);
      }
    }
  };

  private beginBox(x: number, y: number): void {
    this.boxing = true;
    this.dragged = true;
    // Retorno no Android (o iPhone ignora): a caixa começou.
    navigator.vibrate?.(12);
    this.onBox?.('start', x, y);
  }

  /** Treme a câmera de leve (0 a 1). */
  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  private cancelHold(): void {
    if (this.holdTimer) window.clearTimeout(this.holdTimer);
    this.holdTimer = 0;
  }

  private midpoint(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
  }

  private pinchState(): { d: number; a: number } {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(b!.x - a!.x, b!.y - a!.y), a: Math.atan2(b!.y - a!.y, b!.x - a!.x) };
  }

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 3) this.dragged = true;
    if (this.holdTimer && Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > this.holdSlop) this.cancelHold();
    if (this.pointers.size === 1) {
      if (this.boxing) this.onBox?.('move', e.clientX, e.clientY);
      else if (this.drawing) this.dragTool?.('move', e.clientX, e.clientY);
      else if (e.buttons === 2 || e.shiftKey) this.yaw -= dx * 0.006;
      else this.pan(dx, dy);
    } else if (this.pointers.size === 2 && this.pinch) {
      const now = this.pinchState();
      this.distance *= this.pinch.d / Math.max(1, now.d);
      this.yaw -= now.a - this.pinch.a;
      this.pinch = now;
      // Dois dedos também arrastam o mapa (pelo ponto do meio).
      const m = this.midpoint();
      if (this.mid) this.pan(m.x - this.mid.x, m.y - this.mid.y);
      this.mid = m;
      this.clamp();
    }
  };

  private up = (e: PointerEvent) => {
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.cancelHold();
    if (this.pointers.size < 2) {
      this.pinch = null;
      this.mid = null;
    }
    if (had && this.boxing && this.pointers.size === 0) {
      this.boxing = false;
      // Segurou e soltou sem puxar: vale como um toque.
      if (Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) < 10 && !this.multi) {
        this.onBox?.('cancel', NaN, NaN);
        this.onTap?.(e.clientX, e.clientY, e.shiftKey);
      } else this.onBox?.('end', e.clientX, e.clientY, e.shiftKey);
      return;
    }
    if (had && this.drawing && this.pointers.size === 0) {
      this.drawing = false;
      this.dragTool?.('end', e.clientX, e.clientY);
      return;
    }
    if (had && this.pointers.size === 0 && !this.dragged && !this.multi && e.button === 0) this.onTap?.(e.clientX, e.clientY, e.shiftKey);
    if (had && this.pointers.size === 0 && !this.dragged && !this.multi && e.button === 2) this.onAltTap?.(e.clientX, e.clientY);
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance *= Math.exp(e.deltaY * 0.0012);
    this.clamp();
  };

  update(dt: number): void {
    const k = this.keys;
    const sp = this.distance * 0.9 * dt;
    let fx = 0;
    let fz = 0;
    // Setas movem (WASD é da grade de comandos); Shift + setas giram.
    const rot = k.has('shift');
    if (k.has('arrowup')) fz -= 1;
    if (k.has('arrowdown')) fz += 1;
    if (!rot && k.has('arrowleft')) fx -= 1;
    if (!rot && k.has('arrowright')) fx += 1;
    if (fx || fz) {
      const c = Math.cos(this.yaw);
      const s = Math.sin(this.yaw);
      this.target.x += (fx * c + fz * s) * sp;
      this.target.z += (-fx * s + fz * c) * sp;
      this.clamp();
    }
    if (rot && k.has('arrowleft')) this.yaw += 1.6 * dt;
    if (rot && k.has('arrowright')) this.yaw -= 1.6 * dt;
    const cam = this.camera;
    const h = this.distance * Math.sin(this.pitch);
    const r = this.distance * Math.cos(this.pitch);
    cam.position.set(this.target.x + Math.sin(this.yaw) * r, h, this.target.z + Math.cos(this.yaw) * r);
    cam.lookAt(this.target.x, 0, this.target.z);
    if (this.shakeAmp > 0.002) {
      const a = this.shakeAmp * this.distance * 0.006;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      cam.position.z += (Math.random() - 0.5) * a;
      this.shakeAmp *= Math.exp(-dt * 7);
    } else this.shakeAmp = 0;
  }
}
