/**
 * Enxame instanciado: quatro espécies (Etapa 20) × três níveis de detalhe (perto, meio,
 * longe), cada par com o seu buffer e o seu draw call; quem chama escolhe o nível de cada
 * inseto, e o tipo escolhe a espécie. Cada instância tem 12 floats: (x, z, direção, fase |
 * escala, ritmo, tom, estado | altura, tipo, -, -). Estado: 0 anda, 1 ataca, 2..3 morrendo.
 * Tipo: 0 corredor, 1 escavador (malha do corredor), 2 besouro, 3 saltador, 4 cuspidor.
 * As patas andam no vertex shader, sem esqueleto.
 */
import * as THREE from 'three';
import { buildBugGeometry, triangleCount } from './bugMesh.ts';
import type { BugDetail } from './bugMesh.ts';

const VERT = /* glsl */ `
attribute vec2 aLeg;
attribute float aShade;
attribute vec4 aInst;
attribute vec4 aInst2;
attribute vec4 aInst3;
uniform float uTime;
varying vec3 vN;
varying float vTone;
varying float vFogDepth;
varying float vDying;
varying float vShade;
varying float vKind;
void main() {
  vec3 p = position;
  float state = aInst2.w;
  float attacking = step(0.5, state) * (1.0 - step(1.5, state));
  float dying = step(1.5, state);
  float fade = clamp(state - 2.0, 0.0, 1.0);
  float pace = aInst2.y * mix(1.0, 1.8, attacking) * (1.0 - dying);
  float ph = uTime * 9.0 * pace + aInst.w;
  if (aLeg.x >= 0.0) {
    float s = ph + mod(aLeg.x, 2.0) * 3.14159;
    p.x += sin(s) * 0.18 * aLeg.y;
    p.y += max(0.0, cos(s)) * 0.12 * aLeg.y;
    p.y += dying * aLeg.y * 0.25;
  } else {
    p.y += sin(ph * 2.0) * 0.02;
    // Atacando: o corpo dá botes para a frente e as mandíbulas abrem e fecham.
    p.x += attacking * max(0.0, sin(ph * 0.5)) * 0.18;
    if (p.x > 0.45) p.z *= 1.0 + attacking * 0.35 * max(0.0, sin(ph * 1.5));
  }
  if (dying > 0.5) {
    float a = min(1.0, fade * 3.0) * 3.0;
    float c = cos(a), s2 = sin(a);
    p = vec3(p.x, c * (p.y - 0.3) - s2 * p.z + 0.3, s2 * (p.y - 0.3) + c * p.z);
    p.y -= fade * 0.6;
  }
  // Cuspidor cuspindo: as bolsas acesas pulsam.
  if (aShade > 1.5 && aInst3.y > 3.5) p.y += attacking * 0.05 * sin(ph * 2.0);
  p *= aInst2.x;
  float c = cos(aInst.z), s = sin(aInst.z);
  // Altura negativa é a distância do cuspe (para a tela), não altura.
  vec3 wp = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z) + vec3(aInst.x, max(0.0, aInst3.x), aInst.y);
  vN = vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z);
  vTone = aInst2.z;
  vDying = dying;
  vShade = aShade;
  vKind = aInst3.y;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uLight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec3 vN;
varying float vTone;
varying float vFogDepth;
varying float vDying;
varying float vShade;
varying float vKind;
void main() {
  vec3 n = normalize(vN);
  vec3 base = mix(uColorA, uColorB, vTone);
  // Escavador: marrom de terra; grande: mais escuro, com reflexo arroxeado. (Cores em
  // espaço linear: a saída passa para sRGB no fim.)
  base = mix(base, vec3(0.15, 0.07, 0.025), step(0.5, vKind) * (1.0 - step(1.5, vKind)));
  base = mix(base, vec3(0.022, 0.015, 0.03), step(1.5, vKind));
  // Espécies (Etapa 20): besouro mais escuro e lustroso; saltador mais claro; cuspidor
  // puxado para um oliva doentio.
  float beetle = step(1.5, vKind) * (1.0 - step(2.5, vKind));
  float leaper = step(2.5, vKind) * (1.0 - step(3.5, vKind));
  float spitter = step(3.5, vKind);
  base *= 1.0 - beetle * 0.3;
  base = base * (1.0 + leaper * 0.35) + leaper * vec3(0.012, 0.01, 0.0);
  base = mix(base, vec3(0.09, 0.08, 0.02), spitter * 0.35);
  base *= 1.0 + clamp(vShade, -1.0, 1.0) * 0.28;
  base = mix(base, vec3(0.084, 0.106, 0.04), vDying * 0.5);
  float d = max(dot(n, uLight), 0.0) * 0.85 + 0.28;
  float rim = pow(1.0 - abs(n.y), 3.0) * 0.12;
  // Brilho de casca nas placas.
  float spec = pow(max(dot(reflect(-uLight, n), vec3(0.0, 1.0, 0.0)), 0.0), 12.0) * 0.25 * clamp(vShade, 0.0, 1.0) * (1.0 + beetle * 1.6);
  vec3 col = base * d + rim + spec;
  // Brilho próprio: olhos cor de brasa; bolsas de ácido do cuspidor, verde-amarelo, pulsando.
  if (vShade > 1.5) {
    vec3 glow = mix(vec3(1.0, 0.28, 0.06), vec3(0.55, 1.0, 0.08), spitter);
    col = glow * (0.8 + 0.3 * sin(uTime * 5.0 + vTone * 20.0)) * (1.0 - vDying * 0.85);
  }
  float f = smoothstep(uFogNear, uFogFar, vFogDepth);
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
  // Mesma grade de cor e saída sRGB do resto da cena (Etapa 19).
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const FLOATS_PER_BUG = 12;
/** Malhas por espécie: corredor (e escavador), besouro, saltador, cuspidor. */
const SPECIES = 4;
const SPECIES_CODE = [0, 2, 3, 4];
/** Tipo do inseto → malha da espécie. */
function speciesMesh(kind: number): number {
  return kind >= 4 ? 3 : kind >= 3 ? 2 : kind >= 2 ? 1 : 0;
}

export class BugSwarm {
  readonly max: number;
  readonly material: THREE.ShaderMaterial;
  readonly meshes: THREE.Mesh[] = [];
  readonly triangles: number[] = [];
  private datas: Float32Array[] = [];
  private buffers: THREE.InstancedInterleavedBuffer[] = [];
  private geos: THREE.InstancedBufferGeometry[] = [];
  /** Por malha (espécie × nível): índice = espécie * 3 + nível. */
  private counts: number[] = new Array(SPECIES * 3).fill(0);
  private detail: BugDetail = 1;
  count = 0;

  constructor(scene: THREE.Scene, max: number, fog: { color: THREE.Color; near: number; far: number }) {
    this.max = max;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uLight: { value: new THREE.Vector3(0.45, 0.85, 0.3).normalize() },
        uFogColor: { value: fog.color },
        uFogNear: { value: fog.near },
        uFogFar: { value: fog.far },
        uColorA: { value: new THREE.Color('#2a3323') },
        uColorB: { value: new THREE.Color('#4a5935') },
      },
    });
    for (let sp = 0; sp < SPECIES; sp++)
    for (const d of [0, 1, 2] as BugDetail[]) {
      const base = buildBugGeometry(d, SPECIES_CODE[sp]);
      this.triangles.push(triangleCount(base));
      const data = new Float32Array(max * FLOATS_PER_BUG);
      const buf = new THREE.InstancedInterleavedBuffer(data, FLOATS_PER_BUG);
      buf.setUsage(THREE.DynamicDrawUsage);
      const g = new THREE.InstancedBufferGeometry();
      for (const a of ['position', 'normal', 'aLeg', 'aShade']) g.setAttribute(a, base.getAttribute(a));
      g.setAttribute('aInst', new THREE.InterleavedBufferAttribute(buf, 4, 0));
      g.setAttribute('aInst2', new THREE.InterleavedBufferAttribute(buf, 4, 4));
      g.setAttribute('aInst3', new THREE.InterleavedBufferAttribute(buf, 4, 8));
      g.instanceCount = 0;
      const m = new THREE.Mesh(g, this.material);
      m.frustumCulled = false;
      scene.add(m);
      this.meshes.push(m);
      this.datas.push(data);
      this.buffers.push(buf);
      this.geos.push(g);
    }
  }

  /** Página de medição (Etapa 0): um nível só para todos. */
  setDetail(d: BugDetail): void {
    this.detail = d;
  }

  getDetail(): BugDetail {
    return this.detail;
  }

  /** Buffer do nível único (a medição escreve direto nele; só corredor). */
  get data(): Float32Array {
    return this.datas[this.detail]!;
  }

  private write(arr: Float32Array, i: number, x: number, z: number, heading: number, phase: number, scale: number, pace: number, tone: number, state: number, y: number, kind: number): void {
    const o = i * FLOATS_PER_BUG;
    arr[o] = x;
    arr[o + 1] = z;
    arr[o + 2] = heading;
    arr[o + 3] = phase;
    arr[o + 4] = scale;
    arr[o + 5] = pace;
    arr[o + 6] = tone;
    arr[o + 7] = state;
    arr[o + 8] = y;
    arr[o + 9] = kind;
  }

  /** Modo de um nível só: escreve a instância i. */
  set(i: number, x: number, z: number, heading: number, phase: number, scale: number, pace: number, tone: number, state: number, y = 0, kind = 0): void {
    this.write(this.datas[this.detail]!, i, x, z, heading, phase, scale, pace, tone, state, y, kind);
  }

  /** Modo de um nível só: manda as primeiras n instâncias. */
  upload(n: number, time: number): void {
    this.counts.fill(0);
    this.counts[this.detail] = Math.min(n, this.max);
    this.count = this.counts[this.detail]!;
    this.commitCounts(time);
  }

  /** Modo com LOD: zera os três níveis. */
  begin(): void {
    this.counts.fill(0);
  }

  /** Modo com LOD: põe um inseto no nível escolhido. */
  add(lod: BugDetail, x: number, z: number, heading: number, phase: number, scale: number, pace: number, tone: number, state: number, y = 0, kind = 0): void {
    const m = speciesMesh(kind) * 3 + lod;
    const i = this.counts[m]!;
    if (i >= this.max) return;
    this.write(this.datas[m]!, i, x, z, heading, phase, scale, pace, tone, state, y, kind);
    this.counts[m] = i + 1;
  }

  /** Modo com LOD: manda tudo para a GPU. */
  commit(time: number): void {
    this.count = this.counts.reduce((a, n) => a + n, 0);
    this.commitCounts(time);
  }

  private commitCounts(time: number): void {
    for (let d = 0; d < this.counts.length; d++) {
      const n = this.counts[d]!;
      const buf = this.buffers[d]!;
      if (n > 0) {
        buf.clearUpdateRanges();
        buf.addUpdateRange(0, n * FLOATS_PER_BUG);
        buf.needsUpdate = true;
      }
      this.geos[d]!.instanceCount = n;
      this.meshes[d]!.visible = n > 0;
    }
    this.material.uniforms.uTime!.value = time;
  }

  /** Triângulos desenhados no último quadro (para o medidor). */
  drawnTriangles(): number {
    return this.counts.reduce((a, n, d) => a + n * this.triangles[d]!, 0);
  }
}
