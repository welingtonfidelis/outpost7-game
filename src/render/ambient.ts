/**
 * Partículas no ar do bioma (Etapa 19): poeira soprada no deserto, esporos no ar da floresta,
 * neve caindo no gelo. Tudo na GPU: cada ponto tem uma semente fixa e o shader calcula a
 * posição pelo tempo, dando a volta numa caixa que acompanha a câmera.
 */
import * as THREE from 'three';
import type { Biome } from './biome.ts';
import { FOG } from './stage.ts';

const VERT = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uFall;
uniform float uWind;
uniform float uSize;
uniform float uPixel;
varying float vFog;
varying float vFade;
void main() {
  vec3 p = aSeed * uBox;
  p.y -= uFall * uTime;
  p.x += uWind * uTime + sin(uTime * 0.8 + aSeed.z * 40.0) * 0.8;
  p.z += uWind * 0.3 * uTime + cos(uTime * 0.6 + aSeed.x * 30.0) * 0.8;
  // Preso ao mundo, dando a volta numa caixa em torno do alvo da câmera.
  vec3 hb = vec3(uBox.x * 0.5, 0.0, uBox.z * 0.5);
  vec3 c = vec3(uCenter.x, 0.0, uCenter.z);
  p = mod(p - c + hb, uBox);
  vec3 wp = c + p - hb;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixel / max(1.0, -mv.z);
  vFog = -mv.z;
  // Some perto do chão e do teto da caixa (sem pipocar ao dar a volta).
  vFade = smoothstep(0.0, 2.0, p.y) * smoothstep(uBox.y, uBox.y - 4.0, p.y);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying float vFog;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(c)) * uAlpha * vFade;
  if (a < 0.01) discard;
  float f = smoothstep(uFogNear, uFogFar, vFog);
  gl_FragColor = vec4(mix(uColor, uFogColor, f * 0.8), a * (1.0 - f * 0.6));
  #include <colorspace_fragment>
}`;

export class Ambient {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(b: Biome) {
    const n = b.air.count;
    const seeds = new Float32Array(n * 3);
    let s = 17;
    const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < seeds.length; i++) seeds[i] = r();
    const g = new THREE.BufferGeometry();
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    // Posição falsa só para o three saber quantos pontos há.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(150, 26, 150) },
        uFall: { value: b.air.fall },
        uWind: { value: b.air.wind },
        uSize: { value: b.air.size },
        uPixel: { value: 800 },
        uColor: { value: new THREE.Color(b.air.color) },
        uAlpha: { value: b.air.alpha },
        uFogColor: { value: FOG.color },
        uFogNear: { value: FOG.near },
        uFogFar: { value: FOG.far },
      },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }

  /** `t` em segundos; o centro segue o alvo da câmera; `pixelH` é a altura do canvas. */
  update(t: number, cx: number, cz: number, pixelH: number): void {
    const u = this.mat.uniforms;
    u.uTime!.value = t % 10000;
    u.uCenter!.value.set(cx, 0, cz);
    u.uPixel!.value = pixelH;
  }
}
