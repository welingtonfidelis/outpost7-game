/**
 * Malha procedural do inseto (Etapa 12: mais detalhada). Original, de seis patas: abdômen em
 * três gomos com placas, tórax com escudo, cabeça com mandíbulas curvas e antenas, patas em
 * três segmentos. Nada do visual dos insetos do filme.
 *
 * Atributos por vértice: aLeg = (pata 0..5 ou -1 no corpo, peso ao longo da pata) para o
 * shader animar o andar; aShade = tom (-1 junta escura, 0 casco, 1 borda de placa clara).
 * Três níveis de detalhe: 0 perto, 1 meio, 2 longe.
 */
import * as THREE from 'three';

export type BugDetail = 0 | 1 | 2;

export function buildBugGeometry(detail: BugDetail): THREE.BufferGeometry {
  const P: number[] = [];
  const N: number[] = [];
  const L: number[] = [];
  const S: number[] = [];
  const tri = (a: number[], b: number[], c: number[], na: number[], nb: number[], nc: number[], la: number[], lb: number[], lc: number[], shade: number) => {
    P.push(...a, ...b, ...c);
    N.push(...na, ...nb, ...nc);
    L.push(...la, ...lb, ...lc);
    S.push(shade, shade, shade);
  };
  const BODY = [-1, 0];
  const ellipsoid = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, lat: number, lon: number, shade = 0, top = 1) => {
    // `top` < 1 faz só a calota de cima (placa).
    const v = (i: number, j: number): [number[], number[]] => {
      const th = ((Math.PI * i) / lat) * top;
      const ph = (2 * Math.PI * j) / lon;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      const nn = [n[0]! / rx, n[1]! / ry, n[2]! / rz];
      const l = Math.hypot(nn[0]!, nn[1]!, nn[2]!) || 1;
      return [[cx + rx * n[0]!, cy + ry * n[1]!, cz + rz * n[2]!], nn.map((x) => x / l)];
    };
    for (let i = 0; i < lat; i++)
      for (let j = 0; j < lon; j++) {
        const a = v(i, j);
        const b = v(i + 1, j);
        const c = v(i + 1, j + 1);
        const d = v(i, j + 1);
        if (i > 0) tri(a[0], d[0], b[0], a[1], d[1], b[1], BODY, BODY, BODY, shade);
        if (i < lat - 1 || top < 1) tri(b[0], d[0], c[0], b[1], d[1], c[1], BODY, BODY, BODY, shade);
      }
  };
  const box = (p0: number[], p1: number[], r: number, leg: number, w0: number, w1: number, shade = 0) => {
    const d = [p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!];
    let s = [d[2]!, 0, -d[0]!];
    const sl = Math.hypot(...s) || 1;
    s = s.map((x) => (x / sl) * r);
    let u = [d[1]! * s[2]! - d[2]! * s[1]!, d[2]! * s[0]! - d[0]! * s[2]!, d[0]! * s[1]! - d[1]! * s[0]!];
    const ul = Math.hypot(...u) || 1;
    u = u.map((x) => (x / ul) * r);
    const corner = (p: number[], a: number, b: number) => [p[0]! + a * s[0]! + b * u[0]!, p[1]! + a * s[1]! + b * u[1]!, p[2]! + a * s[2]! + b * u[2]!];
    const ring = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    for (let k = 0; k < 4; k++) {
      const [a1, b1] = ring[k]!;
      const [a2, b2] = ring[(k + 1) % 4]!;
      const q0 = corner(p0, a1!, b1!);
      const q1 = corner(p0, a2!, b2!);
      const q2 = corner(p1, a2!, b2!);
      const q3 = corner(p1, a1!, b1!);
      const n = [(a1! + a2!) * s[0]! + (b1! + b2!) * u[0]!, (a1! + a2!) * s[1]! + (b1! + b2!) * u[1]!, (a1! + a2!) * s[2]! + (b1! + b2!) * u[2]!];
      const nl = Math.hypot(...n) || 1;
      const nn = n.map((x) => x / nl);
      const l0 = [leg, w0];
      const l1 = [leg, w1];
      tri(q0, q1, q2, nn, nn, nn, l0, l0, l1, shade);
      tri(q0, q2, q3, nn, nn, nn, l0, l1, l1, shade);
    }
  };
  const lat = [6, 4, 3][detail]!;
  const lon = [10, 7, 5][detail]!;
  // Abdômen em três gomos (do traseiro para a frente).
  ellipsoid(-0.78, 0.36, 0, 0.26, 0.2, 0.24, lat, lon);
  ellipsoid(-0.5, 0.4, 0, 0.3, 0.25, 0.3, lat, lon);
  if (detail < 2) ellipsoid(-0.22, 0.4, 0, 0.24, 0.22, 0.26, lat, lon);
  // Placas no dorso do abdômen e escudo do tórax (só no detalhe alto e médio).
  if (detail < 2) {
    const pl = Math.max(2, lat - 2);
    ellipsoid(-0.78, 0.4, 0, 0.27, 0.19, 0.25, pl, lon, 1, 0.45);
    ellipsoid(-0.5, 0.45, 0, 0.31, 0.24, 0.31, pl, lon, 1, 0.45);
    ellipsoid(0.06, 0.45, 0, 0.21, 0.16, 0.2, pl, lon, 1, 0.5);
  }
  // Tórax e cabeça.
  ellipsoid(0.06, 0.4, 0, 0.2, 0.15, 0.19, lat, lon);
  ellipsoid(0.34, 0.38, 0, 0.15, 0.12, 0.15, lat, lon, -0.3);
  // Mandíbulas curvas (duas partes cada) e antenas.
  for (const side of [1, -1]) {
    if (detail < 2) {
      box([0.44, 0.33, side * 0.07], [0.6, 0.31, side * 0.15], 0.03, -1, 0, 0, -0.5);
      box([0.6, 0.31, side * 0.15], [0.7, 0.3, side * 0.04], 0.025, -1, 0, 0, -0.5);
    } else box([0.44, 0.33, side * 0.07], [0.66, 0.31, side * 0.07], 0.035, -1, 0, 0, -0.5);
    if (detail === 0) {
      box([0.42, 0.45, side * 0.06], [0.58, 0.62, side * 0.16], 0.014, -1, 0, 0, -0.5);
      box([0.58, 0.62, side * 0.16], [0.78, 0.66, side * 0.28], 0.012, -1, 0, 0, -0.5);
    }
  }
  // Patas: três segmentos (coxa, fêmur, tíbia).
  for (let k = 0; k < 6; k++) {
    const side = k < 3 ? 1 : -1;
    const row = k % 3;
    const hx = 0.14 - row * 0.13;
    const hip = [hx, 0.36, side * 0.14];
    const knee = [hx + (row - 1) * 0.1, 0.56, side * 0.42];
    const ankle = [hx + (row - 1) * 0.2, 0.22, side * 0.6];
    const foot = [hx + (row - 1) * 0.24, 0.0, side * 0.66];
    if (detail === 0) {
      box(hip, knee, 0.038, k, 0, 0.45, 0);
      box(knee, ankle, 0.03, k, 0.45, 0.85, -0.4);
      box(ankle, foot, 0.022, k, 0.85, 1, -0.4);
    } else if (detail === 1) {
      box(hip, knee, 0.038, k, 0, 0.5);
      box(knee, foot, 0.03, k, 0.5, 1, -0.4);
    } else box(hip, foot, 0.035, k, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aLeg', new THREE.Float32BufferAttribute(L, 2));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(S, 1));
  return g;
}

export function triangleCount(g: THREE.BufferGeometry): number {
  return g.getAttribute('position').count / 3;
}
