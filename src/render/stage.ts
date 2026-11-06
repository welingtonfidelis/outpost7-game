/**
 * Renderer, cena, luz, chão e névoa. Sem shadow map: sombras são manchas instanciadas.
 * O bioma da partida (Etapa 19) troca chão, luz e névoa em `applyBiome`.
 */
import * as THREE from 'three';
import type { Biome } from './biome.ts';
import { BIOMES } from './biome.ts';

/** Névoa da cena; o enxame usa a mesma cor (o objeto é compartilhado). */
export const FOG = { color: new THREE.Color('#d9c4a3'), near: 140, far: 330 };

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  ground: THREE.Mesh;
  resize(): void;
}

function groundTexture(b: Biome): THREE.CanvasTexture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = b.ground.base;
  g.fillRect(0, 0, size, size);
  // Grão e pedrisco, pseudoaleatório fixo (só visual).
  let s = 7;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() < 0.5 ? b.ground.dark : b.ground.light;
    const w = 1 + r() * 3;
    g.fillRect(r() * size, r() * size, w, w);
  }
  if (b.id === 'floresta') {
    // Folhas mortas e fiapos de capim.
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = r() < 0.5 ? 'rgba(30,40,18,0.35)' : 'rgba(120,110,60,0.3)';
      g.lineWidth = 1;
      const x = r() * size;
      const y = r() * size;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 4, y - 2 - r() * 4);
      g.stroke();
    }
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = b.ground.pebble;
    g.beginPath();
    g.arc(r() * size, r() * size, 1 + r() * 2.5, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Relevo só no sombreado (Etapa 18): o chão do jogo continua plano (a horda, as tropas e os
 * trabalhadores andam em y = 0), mas a luz desenha dunas, morros ou montes de neve, ondinhas
 * de vento e manchas de cor. Perto da base tudo some: o forte fica num platô liso.
 */
function groundMaterial(b: Biome): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map: groundTexture(b) });
  const low = new THREE.Color(b.shade.low);
  const high = new THREE.Color(b.shade.high);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAmp = { value: b.shade.amp };
    sh.uniforms.uRipple = { value: b.shade.ripple };
    sh.uniforms.uRippleFreq = { value: b.shade.rippleFreq };
    sh.uniforms.uLow = { value: low };
    sh.uniforms.uHigh = { value: high };
    sh.uniforms.uPatch = { value: b.shade.patch };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vGround;
uniform float uAmp;
uniform float uRipple;
uniform float uRippleFreq;
uniform vec3 uLow;
uniform vec3 uHigh;
uniform float uPatch;
// Uma crista assimétrica numa direção: altura e inclinação (x, z).
vec3 ridge(vec2 p, vec2 dir, float freq, float amp, float ph) {
  float x = dot(p, dir) * freq + ph;
  float h = amp * (sin(x) + 0.3 * sin(2.0 * x));
  float d = amp * freq * (cos(x) + 0.6 * cos(2.0 * x));
  return vec3(h, d * dir);
}
vec3 dunes(vec2 p) {
  vec2 q = p + vec2(sin(p.y * 0.031) * 9.0, sin(p.x * 0.027) * 9.0);
  vec3 a = ridge(q, normalize(vec2(1.0, 0.35)), 0.085, 3.2, 0.0);
  a += ridge(q, normalize(vec2(-0.4, 1.0)), 0.055, 2.5, 1.7);
  a += ridge(q, normalize(vec2(0.8, -0.6)), 0.16, 0.55, 4.1);
  float k = smoothstep(17.0, 36.0, length(p));
  return a * k * uAmp;
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
vec3 dn = dunes(vGround);
// Manchas grandes de cor (terra, musgo, neve suja) e vales mais escuros.
float pn = vnoise(vGround * 0.045) * 0.65 + vnoise(vGround * 0.13 + 7.0) * 0.35;
vec3 tint = mix(uLow, uHigh, clamp(pn + dn.x * 0.06, 0.0, 1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * tint / max(0.001, dot(uHigh, vec3(0.333))) , uPatch);
diffuseColor.rgb *= 0.95 + 0.035 * dn.x;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec2 g = dn.yz;
  // Ondinhas de vento: só de perto (de longe viram chiado).
  float near = smoothstep(75.0, 28.0, length(vViewPosition)) * smoothstep(15.0, 30.0, length(vGround));
  vec2 rd = normalize(vec2(1.0, 0.3));
  float rx = dot(vGround, rd) * uRippleFreq + sin(vGround.y * 0.7 + vGround.x * 0.2) * 1.8;
  g += rd * cos(rx) * uRipple * near;
  vec3 nw = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
}`,
      );
  };
  return mat;
}

/** Troca chão, luz e névoa para o bioma da partida. */
export function applyBiome(stage: Stage, b: Biome): void {
  FOG.color.set(b.fog.color);
  FOG.near = b.fog.near;
  FOG.far = b.fog.far;
  stage.scene.background = FOG.color.clone();
  stage.scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
  stage.hemi.color.set(b.hemi.sky);
  stage.hemi.groundColor.set(b.hemi.ground);
  stage.hemi.intensity = b.hemi.intensity;
  stage.sun.color.set(b.sun.color);
  stage.sun.intensity = b.sun.intensity;
  stage.sun.position.set(...b.sun.dir).multiplyScalar(140);
  const old = stage.ground.material as THREE.MeshLambertMaterial;
  old.map?.dispose();
  old.dispose();
  stage.ground.material = groundMaterial(b);
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = FOG.color.clone();
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 900);

  const hemi = new THREE.HemisphereLight('#fff4e0', '#7a5a3a', 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.position.set(60, 120, 40);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMaterial(BIOMES.deserto));
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground';
  scene.add(ground);

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  return { renderer, scene, camera, hemi, sun, ground, resize };
}
