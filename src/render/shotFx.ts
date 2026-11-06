/**
 * Tiros (Etapa 21): clarões de cano do pixelfx (MIT, ver LICENSES.md) no lugar das linhas.
 *
 * A folha de quadros é assada uma vez por `tools/bake-fx.ts`. Aqui cada tiro é um quadrado
 * virado para a câmera, com o cano no ponto de saída e girado na tela para o lado do alvo (com
 * o alvo à esquerda ele espelha, para a fumaça continuar subindo). Tudo numa malha instanciada
 * só: uma textura, uma chamada de desenho, e nenhuma alocação por tiro (buffers fixos).
 *
 * - Torres: "SMG burst" em laço, um lugar fixo por torre, enquanto ela atira.
 * - Soldados, atiradores e robôs: "Pistol shot", um por disparo, num anel de lugares.
 *
 * Só desenho: a simulação dá dano contínuo (dps), a cadência dos disparos é enfeite.
 */
import * as THREE from 'three';
import { SHOT_ATLAS, SHOT_SHEETS } from './shotSheet.ts';

const SMG = 0;
const PISTOL = 1;
/** Laço: some em 0,3 s quando a torre para (como o stop() do pixelfx) e entra em 0,08 s. */
const FADE_OUT = 0.3;
const FADE_IN = 0.08;
const NEVER = 1e9;
/**
 * Tamanho mínimo na tela: de longe cada px do efeito ocupa pelo menos 1/560 da altura visível
 * (senão o clarão vira um ponto no zoom padrão), até no máximo 3× o tamanho de perto.
 * Campo de visão de 45° (a câmera de `stage.ts`).
 */
const MIN_K = (2 * Math.tan((45 * Math.PI) / 360)) / 560;
const MAX_GROW = 3;

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aDir;
attribute vec4 aAnim; // início (s), folha (0 smg, 1 pistola), tamanho do px (m), fim do laço (s)
uniform float uTime;
uniform vec4 uCell[2];   // y da faixa na folha, colunas, largura e altura do quadro (px)
uniform vec4 uInfo[2];   // quadros, fps, laço (0/1), -
uniform vec2 uMuzzle[2]; // cano dentro do quadro (px, y para baixo)
uniform vec2 uAtlas;
varying vec2 vUv;
varying float vAlpha;
void main() {
  bool pistol = aAnim.y > 0.5;
  vec4 cell = pistol ? uCell[1] : uCell[0];
  vec4 info = pistol ? uInfo[1] : uInfo[0];
  vec2 mz = pistol ? uMuzzle[1] : uMuzzle[0];
  float age = uTime - aAnim.x;
  float f = floor(age * info.y);
  float alpha = 1.0;
  if (info.z > 0.5) {
    alpha = clamp(1.0 - (uTime - aAnim.w) / ${FADE_OUT.toFixed(2)}, 0.0, 1.0) * clamp(age / ${FADE_IN.toFixed(2)}, 0.0, 1.0);
    f = mod(f, info.x);
  }
  if (aAnim.z <= 0.0 || age < 0.0 || alpha <= 0.0 || f >= info.x) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // fora da tela: o quadrado some sem custo de pixel
    return;
  }
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  vec3 d = mat3(modelViewMatrix) * aDir;
  // Direção do tiro na tela: derivada da projeção (x/-z, y/-z) ao longo de aDir.
  vec2 sd = vec2(-mv.z * d.x + mv.x * d.z, -mv.z * d.y + mv.y * d.z);
  vec2 u = dot(sd, sd) > 1e-10 ? normalize(sd) : vec2(1.0, 0.0);
  vec2 v = vec2(-u.y, u.x);
  if (u.x < 0.0) v = -v;
  vec2 px = position.xy * cell.zw;
  vec2 local = vec2(px.x - mz.x, mz.y - px.y);
  float size = clamp(${MIN_K.toFixed(6)} * -mv.z, aAnim.z, aAnim.z * ${MAX_GROW.toFixed(1)});
  mv.xy += (u * local.x + v * local.y) * size;
  gl_Position = projectionMatrix * mv;
  vec2 a = vec2(mod(f, cell.y), cell.x / cell.w + floor(f / cell.y)) * cell.zw + px;
  vUv = vec2(a.x / uAtlas.x, 1.0 - a.y / uAtlas.y);
  vAlpha = alpha;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 c = texture2D(uMap, vUv);
  c.a *= vAlpha;
  if (c.a < 0.03) discard;
  gl_FragColor = c;
}`;

export class ShotFx {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private pos: THREE.InstancedBufferAttribute;
  private dir: THREE.InstancedBufferAttribute;
  private anim: THREE.InstancedBufferAttribute;
  private loops: number;
  private next: number;
  private dirty = false;

  /** `loops` lugares fixos (um por torre) e `shots` lugares no anel dos disparos avulsos. */
  constructor(loops: number, shots: number) {
    this.loops = loops;
    this.next = loops;
    const n = loops + shots;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.dir = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const anim = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      anim[i * 4] = -NEVER;
      anim[i * 4 + 1] = i < loops ? SMG : PISTOL;
      anim[i * 4 + 3] = -NEVER;
    }
    this.anim = new THREE.InstancedBufferAttribute(anim, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.pos);
    g.setAttribute('aDir', this.dir);
    g.setAttribute('aAnim', this.anim);
    g.instanceCount = n;

    const s = SHOT_SHEETS;
    const tex = new THREE.Texture();
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: tex },
        uAtlas: { value: new THREE.Vector2(SHOT_ATLAS.w, SHOT_ATLAS.h) },
        uCell: { value: [s.smg, s.pistol].map((q) => new THREE.Vector4(q.y, q.cols, q.cw, q.ch)) },
        uInfo: { value: [s.smg, s.pistol].map((q) => new THREE.Vector4(q.frames, q.fps, q.loop ? 1 : 0, 0)) },
        uMuzzle: { value: [s.smg, s.pistol].map((q) => new THREE.Vector2(q.mx, q.my)) },
      },
      transparent: true,
      depthWrite: false,
      // Espelhado (alvo à esquerda) o quadrado vira de costas.
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    // Até a folha chegar não desenha nada (textura vazia sairia preta).
    this.mesh.visible = false;
    new THREE.ImageLoader().load(`${import.meta.env.BASE_URL}assets/fx/${SHOT_ATLAS.file}`, (img) => {
      tex.image = img;
      tex.needsUpdate = true;
      this.mesh.visible = true;
    });
  }

  /**
   * Laço da torre `i` (0 a loops - 1): ligado enquanto atira; ao parar, some aos poucos no
   * último lugar. Religar durante o sumiço continua o mesmo laço (sem piscar entre alvos).
   */
  loop(i: number, on: boolean, x: number, y: number, z: number, dx: number, dy: number, dz: number, size: number, t: number): void {
    if (i < 0 || i >= this.loops) return;
    const a = this.anim.array as Float32Array;
    const o = i * 4;
    if (on) {
      if (a[o + 3]! < NEVER) {
        if (t - a[o + 3]! >= FADE_OUT) a[o] = t;
        a[o + 3] = NEVER;
      }
      a[o + 2] = size;
      this.place(i, x, y, z, dx, dy, dz);
    } else if (a[o + 3]! >= NEVER) {
      a[o + 3] = t;
      this.dirty = true;
    }
  }

  /** Um disparo avulso (pistola); toma o lugar mais antigo do anel. */
  shot(x: number, y: number, z: number, dx: number, dy: number, dz: number, size: number, t: number): void {
    const i = this.next;
    this.next = i + 1 >= this.anim.count ? this.loops : i + 1;
    const a = this.anim.array as Float32Array;
    a[i * 4] = t;
    a[i * 4 + 2] = size;
    this.place(i, x, y, z, dx, dy, dz);
  }

  /** Desliga o laço `i` na hora (a torre sumiu). */
  clearLoop(i: number): void {
    if (i < 0 || i >= this.loops) return;
    const a = this.anim.array as Float32Array;
    a[i * 4] = -NEVER;
    a[i * 4 + 3] = -NEVER;
    this.dirty = true;
  }

  update(t: number): void {
    this.material.uniforms.uTime!.value = t;
    if (!this.dirty) return;
    this.dirty = false;
    this.pos.needsUpdate = true;
    this.dir.needsUpdate = true;
    this.anim.needsUpdate = true;
  }

  private place(i: number, x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    const p = this.pos.array as Float32Array;
    const d = this.dir.array as Float32Array;
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z;
    d[i * 3] = dx;
    d[i * 3 + 1] = dy;
    d[i * 3 + 2] = dz;
    this.dirty = true;
  }
}
