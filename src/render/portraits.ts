/**
 * Retratos para a interface (Etapa 13): cada tropa e prédio do KayKit é desenhado uma vez,
 * na carga, num canto do próprio canvas do jogo (sem um segundo contexto WebGL, que pesa no
 * iPhone) e copiado para uma imagem pequena. Personagens: cabeça e peito, de três quartos,
 * na pose de mira. Prédios: inteiros, de cima em diagonal.
 *
 * A cópia acontece logo depois do desenho, na mesma tarefa, então funciona sem
 * `preserveDrawingBuffer`.
 */
import * as THREE from 'three';
import type { PortraitKey } from '../ui/icons.tsx';
import { cloneProp } from './assets.ts';
import type { Art, CharKind, PropKind } from './assets.ts';
import { CharView } from './chars.ts';
import { makeFortModel } from './fortModel.ts';
import { makeTowerModel } from './fortress.ts';
import type { Anim } from './chars.ts';

const OUT = 128;
const VIEW = 96;

const CHARS: { key: PortraitKey; kind: CharKind; height: number; anim: Anim }[] = [
  { key: 'worker', kind: 'worker', height: 1.7, anim: 'Idle_A' },
  { key: 'soldado', kind: 'soldier', height: 1.75, anim: 'Ranged_2H_Aiming' },
  { key: 'atirador', kind: 'sniper', height: 1.75, anim: 'Ranged_2H_Aiming' },
  { key: 'robo', kind: 'robot', height: 2.7, anim: 'Ranged_2H_Aiming' },
];
const PROPS: { key: PortraitKey; kind: PropKind }[] = [
  { key: 'quartel', kind: 'quartel' },
  { key: 'fabrica', kind: 'fabrica' },
  { key: 'refinaria', kind: 'refinaria' },
  { key: 'gerador', kind: 'gerador' },
];

/** A casamata das torres construídas (a mesma do mapa), com o canhão em diagonal. */
function towerModel(): THREE.Object3D {
  const m = makeTowerModel(1, false);
  m.head.rotation.y = -Math.PI / 4;
  return m.root;
}

/**
 * Desenha os retratos. Devolve vazio se o canvas ainda não tem tamanho (aba oculta) ou se
 * algo falhar: a interface cai nos desenhos de traço.
 */
export function makePortraits(renderer: THREE.WebGLRenderer, art: Art): Partial<Record<PortraitKey, string>> {
  const out: Partial<Record<PortraitKey, string>> = {};
  const canvas = renderer.domElement;
  const pr = renderer.getPixelRatio();
  const px = Math.round(VIEW * pr);
  if (canvas.width < px || canvas.height < px) return out;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1c2a33');
  scene.add(new THREE.HemisphereLight('#fff4e0', '#5a4a3a', 1.7));
  const key = new THREE.DirectionalLight('#fff1d6', 2.4);
  key.position.set(2, 4, 3);
  scene.add(key);
  // Luz de recorte fria por trás (estilo de retrato de RTS).
  const rim = new THREE.DirectionalLight('#7fc6ff', 1.4);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  const cv = document.createElement('canvas');
  cv.width = cv.height = OUT;
  const g2 = cv.getContext('2d');
  if (!g2) return out;
  const size = renderer.getSize(new THREE.Vector2());
  const shoot = (k: PortraitKey) => {
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, VIEW, VIEW);
    renderer.setScissor(0, 0, VIEW, VIEW);
    renderer.render(scene, cam);
    g2.clearRect(0, 0, OUT, OUT);
    g2.drawImage(canvas, 0, canvas.height - px, px, px, 0, 0, OUT, OUT);
    out[k] = cv.toDataURL('image/png');
  };
  try {
    for (const c of CHARS) {
      const v = new CharView(art, c.kind);
      v.play(c.anim);
      v.update(0.4);
      // O personagem olha para +z; câmera de três quartos na altura do peito.
      // Os do KayKit têm cabeça grande: a cabeça e o peito ocupam o terço de cima e um pouco mais.
      const h = c.height;
      const look = new THREE.Vector3(0, h * 0.68, 0);
      const span = h * 0.8;
      const dist = span / 2 / Math.tan((cam.fov * Math.PI) / 360);
      const dir = new THREE.Vector3(0.55, 0.12, 1).normalize();
      cam.position.copy(look).addScaledVector(dir, dist);
      cam.lookAt(look);
      scene.add(v.root);
      shoot(c.key);
      scene.remove(v.root);
      v.dispose();
    }
    const fitProp = (o: THREE.Object3D, k: PortraitKey) => {
      scene.add(o);
      o.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(o);
      const sph = box.getBoundingSphere(new THREE.Sphere());
      const dist = (sph.radius / Math.sin((cam.fov * Math.PI) / 360)) * 0.8;
      const dir = new THREE.Vector3(1, 0.8, 1.25).normalize();
      cam.position.copy(sph.center).addScaledVector(dir, dist);
      cam.lookAt(sph.center);
      shoot(k);
      scene.remove(o);
    };
    for (const p of PROPS) fitProp(cloneProp(art, p.kind, 3), p.key);
    fitProp(towerModel(), 'torre');
    fitProp(makeFortModel(3, 4).root, 'fortim');
  } catch (e) {
    console.warn('retratos não saíram; a grade usa os desenhos', e);
  } finally {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
  }
  return out;
}
