/** Renderer, cena, luz, chão e névoa. Sem shadow map: sombras são manchas instanciadas. */
import * as THREE from 'three';

export const FOG = { color: new THREE.Color('#d9c4a3'), near: 140, far: 330 };

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize(): void;
}

function groundTexture(): THREE.CanvasTexture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#b89568';
  g.fillRect(0, 0, size, size);
  // Grão de areia e pedrisco, pseudoaleatório fixo (só visual).
  let s = 7;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? 'rgba(120,90,60,0.18)' : 'rgba(235,210,170,0.16)';
    const w = 1 + r() * 3;
    g.fillRect(r() * size, r() * size, w, w);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(90,70,50,0.35)';
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

export function createStage(canvas: HTMLCanvasElement): Stage {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = FOG.color.clone();
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 900);

  scene.add(new THREE.HemisphereLight('#fff4e0', '#7a5a3a', 1.6));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.position.set(60, 120, 40);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ map: groundTexture() }));
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
  return { renderer, scene, camera, resize };
}
