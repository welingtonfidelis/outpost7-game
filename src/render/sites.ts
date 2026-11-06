/**
 * Canteiro de obra (Etapa 13): enquanto um prédio (ou torre) está em obra, um guindaste
 * pequeno gira e sobe a carga no canto, faíscas de solda saltam da borda que está subindo,
 * poeira levanta em volta e uma barra de progresso flutua em cima. Quando a obra termina,
 * uma nuvem de poeira e faíscas e um "pulo" do prédio marcam a entrega.
 *
 * Só visual: lê o retrato, sorteia com Math.random (não toca na simulação). As partículas
 * são dois THREE.Points com buffer fixo (sem alocar por quadro).
 */
import * as THREE from 'three';
import type { Building, WorldView } from '../sim/index.ts';

const P_VERT = /* glsl */ `
attribute float aAge;
attribute float aSize;
uniform float uScale;
varying float vAge;
void main() {
  vAge = aAge;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aAge >= 1.0 ? 0.0 : aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const P_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColorEnd;
uniform float uAlpha;
uniform float uSoft;
varying float vAge;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = (1.0 - smoothstep(1.0 - uSoft, 1.0, r)) * (1.0 - vAge) * uAlpha;
  gl_FragColor = vec4(mix(uColor, uColorEnd, vAge), a);
}`;

/** Partículas com vida curta, gravidade e crescimento (também usadas nas mortes). */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private grow: Float32Array;
  private next = 0;
  private live = 0;
  private gravity: number;
  private drag: number;
  readonly material: THREE.ShaderMaterial;

  constructor(cap: number, opts: { color: string; end: string; alpha: number; soft: number; additive: boolean; gravity: number; drag: number }) {
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.age = new Float32Array(cap).fill(1);
    this.life = new Float32Array(cap).fill(1);
    this.size = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.gravity = opts.gravity;
    this.drag = opts.drag;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: P_VERT,
      fragmentShader: P_FRAG,
      uniforms: {
        uScale: { value: 600 },
        uColor: { value: new THREE.Color(opts.color) },
        uColorEnd: { value: new THREE.Color(opts.end) },
        uAlpha: { value: opts.alpha },
        uSoft: { value: opts.soft },
      },
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % this.age.length;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
    this.live = Math.max(this.live, 1);
  }

  update(dt: number): void {
    if (!this.live) return;
    let any = 0;
    const k = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.age.length; i++) {
      if (this.age[i]! >= 1) continue;
      any++;
      const o = i * 3;
      this.vel[o + 1]! -= this.gravity * dt;
      this.vel[o]! *= k;
      this.vel[o + 1]! *= k;
      this.vel[o + 2]! *= k;
      this.pos[o]! += this.vel[o]! * dt;
      this.pos[o + 1] = Math.max(0.05, this.pos[o + 1]! + this.vel[o + 1]! * dt);
      this.pos[o + 2]! += this.vel[o + 2]! * dt;
      this.size[i]! += this.grow[i]! * dt;
      this.age[i] = Math.min(1, this.age[i]! + dt / this.life[i]!);
    }
    this.live = any;
    const g = this.points.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('aAge').needsUpdate = true;
    g.getAttribute('aSize').needsUpdate = true;
  }

  /** Quantas estão vivas (para o medidor). */
  get alive(): number {
    return this.live;
  }
}

interface Site {
  group: THREE.Group;
  jib: THREE.Group;
  trolley: THREE.Group;
  cable: THREE.Mesh;
  hook: THREE.Mesh;
  bar: THREE.Group;
  fill: THREE.Mesh;
  /** Altura final do prédio (m) e o lado da planta. */
  h: number;
  size: number;
  /** Fase própria (cada guindaste num ritmo) e o ângulo que aponta para o meio da obra. */
  phase: number;
  home: number;
  sparkAcc: number;
  dustAcc: number;
}

/** Altura aproximada de cada prédio pronto (para o guindaste e as faíscas). */
const HEIGHT: Record<string, number> = { torre: 4.2, gerador: 3.2, refinaria: 4.4, quartel: 2.6, fabrica: 4, fortim: 1.6 };

export class BuildSites {
  readonly root = new THREE.Group();
  private sites = new Map<number, Site>();
  private sparks = new Particles(384, { color: '#fff6c8', end: '#ff7a1a', alpha: 1, soft: 0.5, additive: true, gravity: 9, drag: 0.6 });
  private dust = new Particles(256, { color: '#efe0c4', end: '#c9ad85', alpha: 0.6, soft: 0.9, additive: false, gravity: -0.15, drag: 1.4 });
  /** Prédios que acabaram de ficar prontos: id → segundos desde a entrega. */
  private pops = new Map<number, number>();
  private wasBuilding = new Map<number, Building>();
  private lastT = -1;
  private mats = {
    crane: new THREE.MeshLambertMaterial({ color: '#e8b21c' }),
    dark: new THREE.MeshLambertMaterial({ color: '#2b2a28' }),
    cable: new THREE.MeshBasicMaterial({ color: '#1b1a18' }),
    barBack: new THREE.MeshBasicMaterial({ color: '#1b1612', transparent: true, opacity: 0.85, depthTest: false }),
    // Transparente também: senão o opaco é desenhado antes e o fundo (transparente) o cobre.
    barFill: new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 1, depthTest: false }),
  };
  private geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    barBack: new THREE.PlaneGeometry(1, 1),
    barFill: new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0),
  };

  constructor() {
    this.root.add(this.sparks.points, this.dust.points);
  }

  private makeSite(b: Building): Site {
    const group = new THREE.Group();
    group.position.set(b.x, 0, b.z);
    const s = b.size;
    const h = HEIGHT[b.kind] ?? 3;
    const H = h + 2.4;
    // Guindaste no canto (+x, -z), fora da planta.
    const cx = s / 2 + 0.5;
    const cz = -s / 2 - 0.5;
    const mk = (w: number, hh: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(this.geo.box, mat);
      m.scale.set(w, hh, d);
      m.position.set(x, y, z);
      return m;
    };
    const crane = new THREE.Group();
    crane.position.set(cx, 0, cz);
    crane.add(mk(0.9, 0.3, 0.9, this.mats.dark, 0, 0.15, 0));
    crane.add(mk(0.26, H, 0.26, this.mats.crane, 0, H / 2, 0));
    // Treliça do mastro: listras escuras de tanto em tanto.
    for (let y = 1; y < H - 0.3; y += 0.9) crane.add(mk(0.3, 0.06, 0.3, this.mats.dark, 0, y, 0));
    const jib = new THREE.Group();
    jib.position.y = H;
    const reach = Math.hypot(cx, cz) + s * 0.25;
    jib.add(mk(reach + 0.4, 0.2, 0.22, this.mats.crane, (reach - 0.4) / 2, 0, 0));
    jib.add(mk(1.4, 0.2, 0.22, this.mats.crane, -0.9, 0, 0));
    jib.add(mk(0.6, 0.5, 0.5, this.mats.dark, -1.4, -0.2, 0));
    jib.add(mk(0.32, 0.5, 0.32, this.mats.crane, 0, 0.35, 0));
    const trolley = new THREE.Group();
    trolley.position.x = reach * 0.6;
    const cable = mk(0.035, 1, 0.035, this.mats.cable, 0, -0.5, 0);
    const hook = mk(0.42, 0.3, 0.42, this.mats.dark, 0, -1, 0);
    trolley.add(mk(0.36, 0.14, 0.3, this.mats.dark, 0, -0.14, 0), cable, hook);
    jib.add(trolley);
    crane.add(jib);
    group.add(crane);
    // Barra de progresso em cima.
    const bar = new THREE.Group();
    // Acima do braço do guindaste (que fica a h + 2,4 m).
    bar.position.set(0, h + 3.7, 0);
    const back = new THREE.Mesh(this.geo.barBack, this.mats.barBack);
    back.scale.set(2.3, 0.44, 1);
    const fill = new THREE.Mesh(this.geo.barFill, this.mats.barFill);
    fill.scale.set(0.01, 0.28, 1);
    fill.position.set(-1.07, 0, 0.01);
    back.renderOrder = 20;
    fill.renderOrder = 21;
    bar.add(back, fill);
    group.add(bar);
    this.root.add(group);
    return {
      group,
      jib,
      trolley,
      cable,
      hook,
      bar,
      fill,
      h,
      size: s,
      phase: Math.random() * 10,
      // Ângulo (em torno de y) que leva o braço, que nasce em +x, até o meio da obra.
      home: Math.atan2(cz, -cx),
      sparkAcc: 0,
      dustAcc: 0,
    };
  }

  /** O pulo do prédio recém-entregue (multiplica a escala y). */
  popScale(id: number): number {
    const t = this.pops.get(id);
    if (t === undefined) return 1;
    const k = t / 0.45;
    return 1 + 0.12 * Math.sin(Math.PI * k) * (1 - k);
  }

  /** Para o medidor: quantos canteiros e partículas vivas. */
  stats(): { sites: number; particles: number } {
    return { sites: this.sites.size, particles: this.sparks.alive + this.dust.alive };
  }

  /**
   * `pixelH`: altura do canvas em pixels (o tamanho das partículas acompanha a tela).
   * `cam`: posição da câmera (a barra vira para ela e cresce de longe).
   */
  update(view: WorldView, t: number, cam: THREE.Vector3, pixelH: number): void {
    // Passo pelo tempo do jogo: parado na pausa, mais rápido no 2× e 4× (com teto).
    const dt = this.lastT < 0 ? 0 : Math.max(0, Math.min(0.1, t - this.lastT));
    this.lastT = t;
    const scale = pixelH * 0.9;
    this.sparks.material.uniforms.uScale!.value = scale;
    this.dust.material.uniforms.uScale!.value = scale;
    const seen = new Set<number>();
    for (const b of view.buildings) {
      if (b.buildLeft <= 0) {
        // Acabou de ficar pronto?
        if (this.wasBuilding.has(b.id)) {
          this.wasBuilding.delete(b.id);
          this.finish(b);
        }
        continue;
      }
      seen.add(b.id);
      this.wasBuilding.set(b.id, b);
      let st = this.sites.get(b.id);
      if (!st) {
        st = this.makeSite(b);
        this.sites.set(b.id, st);
      }
      const total = view.cfg.build[b.kind].time;
      const prog = Math.max(0, Math.min(1, 1 - b.buildLeft / total));
      this.animate(st, b, prog, dt, t, cam);
    }
    // Demolido ou destruído em obra: tira o canteiro sem festa.
    for (const [id, st] of this.sites)
      if (!seen.has(id)) {
        this.root.remove(st.group);
        this.sites.delete(id);
      }
    for (const id of [...this.wasBuilding.keys()]) if (!view.buildings.some((b) => b.id === id)) this.wasBuilding.delete(id);
    for (const [id, a] of this.pops) {
      if (a + dt > 0.45) this.pops.delete(id);
      else this.pops.set(id, a + dt);
    }
    this.sparks.update(dt);
    this.dust.update(dt);
  }

  private animate(st: Site, b: Building, prog: number, dt: number, t: number, cam: THREE.Vector3): void {
    const p = st.phase;
    // Braço do guindaste: vai e volta em volta da obra; o carrinho corre e o gancho sobe e desce.
    st.jib.rotation.y = st.home + Math.sin(t * 0.45 + p) * 0.7;
    const reach = Math.hypot(st.size / 2 + 0.5, st.size / 2 + 0.5) + st.size * 0.25;
    st.trolley.position.x = reach * (0.45 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.7 + p * 1.3)));
    const H = st.h + 2.4;
    const drop = 0.8 + (H - 1.2 - st.h * prog) * (0.5 + 0.5 * Math.sin(t * 0.9 + p * 0.7)) * 0.8;
    st.cable.scale.y = drop;
    st.cable.position.y = -drop / 2 - 0.1;
    st.hook.position.y = -drop - 0.25;
    // Barra: vira para a câmera e cresce de longe para continuar legível.
    const d = cam.distanceTo(st.group.position);
    st.bar.scale.setScalar(Math.max(1, Math.min(2.6, d / 40)));
    st.bar.lookAt(cam);
    st.fill.scale.x = Math.max(0.01, 2.14 * prog);
    // Faíscas de solda em rajadas, na borda de cima do que já subiu.
    const top = Math.max(0.3, st.h * (0.12 + 0.88 * prog));
    const hs = st.size / 2;
    const welding = Math.sin(t * 2.6 + p) > 0.15;
    st.sparkAcc += dt * (welding ? 70 : 4);
    while (st.sparkAcc >= 1) {
      st.sparkAcc -= 1;
      const side = Math.random() < 0.5;
      const sx = side ? (Math.random() < 0.5 ? -hs : hs) : (Math.random() * 2 - 1) * hs;
      const sz = side ? (Math.random() * 2 - 1) * hs : Math.random() < 0.5 ? -hs : hs;
      const out = 1.2 + Math.random() * 1.8;
      this.sparks.emit(b.x + sx, top, b.z + sz, Math.sign(sx || 1) * out * Math.random(), 1 + Math.random() * 2.6, Math.sign(sz || 1) * out * Math.random(), 0.3 + Math.random() * 0.35, 0.22 + Math.random() * 0.16);
    }
    // Poeira baixa em volta da planta.
    st.dustAcc += dt * 5;
    while (st.dustAcc >= 1) {
      st.dustAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = hs + 0.3 + Math.random() * 0.6;
      this.dust.emit(b.x + Math.cos(a) * r, 0.25, b.z + Math.sin(a) * r, Math.cos(a) * 0.5, 0.25, Math.sin(a) * 0.5, 1.4 + Math.random() * 0.8, 0.9 + Math.random() * 0.5, 0.9);
    }
  }

  /** Entrega: nuvem de poeira, chuva de faíscas e o pulo do prédio. */
  private finish(b: Building): void {
    const hs = b.size / 2;
    const h = HEIGHT[b.kind] ?? 3;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + Math.random() * 0.2;
      const r = hs + 0.2;
      const v = 1.6 + Math.random() * 1.6;
      this.dust.emit(b.x + Math.cos(a) * r, 0.3, b.z + Math.sin(a) * r, Math.cos(a) * v, 0.5 + Math.random() * 0.6, Math.sin(a) * v, 1.3 + Math.random() * 0.7, 1.2 + Math.random() * 0.6, 1.4);
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 3;
      this.sparks.emit(b.x, h, b.z, Math.cos(a) * v, 2.5 + Math.random() * 3, Math.sin(a) * v, 0.45 + Math.random() * 0.4, 0.26 + Math.random() * 0.16);
    }
    this.pops.set(b.id, 0);
  }
}
