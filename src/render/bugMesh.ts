/**
 * Malhas procedurais do enxame, todas de desenho nosso (nada do visual dos insetos do filme
 * nem de outros jogos), de seis patas, inspiradas em insetos de verdade:
 *  - corredor (Etapa 12, código 0): formiga comprida, abdômen em três gomos, mandíbulas curvas;
 *  - besouro couraçado (Etapa 20, código 2): casco largo em domo, escudo e chifre na frente;
 *  - saltador (3): fino, asas dobradas, antenas longas e as pernas de trás enormes;
 *  - cuspidor (4): abdômen inchado e erguido, bolsas de ácido que brilham e um bico atrás.
 *
 * Atributos por vértice: aLeg = (pata 0..5 ou -1 no corpo, peso ao longo da pata) para o
 * shader animar o andar; aShade = tom (-1 junta escura, 0 casco, 1 borda de placa clara,
 * 2 brilho próprio: olhos e bolsas). Três níveis de detalhe: 0 perto, 1 meio, 2 longe.
 */
import * as THREE from 'three';

export type BugDetail = 0 | 1 | 2;

export function buildBugGeometry(detail: BugDetail, species = 0): THREE.BufferGeometry {
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
  const pl = Math.max(2, lat - 2);
  /** Olhos acesos (só perto e no meio). */
  const eyes = (x: number, y: number, z: number, r: number) => {
    if (detail === 2) return;
    for (const side of [1, -1]) ellipsoid(x, y, side * z, r, r, r * 0.9, 3, 5, 2);
  };
  /** Seis patas andando, em três segmentos (ou menos de longe). */
  const legs = (rows: number[], hipX: (row: number) => number, hipY: number, hipZ: number, kneeY: number, reach: number, th: number) => {
    for (const row of rows)
      for (const side of [1, -1]) {
        const k = (side > 0 ? 0 : 3) + row;
        const hx = hipX(row);
        const hip = [hx, hipY, side * hipZ];
        const knee = [hx + (row - 1) * 0.1, kneeY, side * (hipZ + reach * 0.45)];
        const ankle = [hx + (row - 1) * 0.2, hipY * 0.55, side * (hipZ + reach * 0.75)];
        const foot = [hx + (row - 1) * 0.24, 0.0, side * (hipZ + reach * 0.85)];
        if (detail === 0) {
          box(hip, knee, th, k, 0, 0.45, 0);
          box(knee, ankle, th * 0.8, k, 0.45, 0.85, -0.4);
          box(ankle, foot, th * 0.6, k, 0.85, 1, -0.4);
        } else if (detail === 1) {
          box(hip, knee, th, k, 0, 0.5);
          box(knee, foot, th * 0.8, k, 0.5, 1, -0.4);
        } else box(hip, foot, th * 0.95, k, 0, 1);
      }
  };

  if (species === 2) {
    // Besouro couraçado: casco em domo com costura escura, escudo, chifre e pernas grossas.
    ellipsoid(-0.3, 0.5, 0, 0.62, 0.36, 0.48, lat, lon);
    ellipsoid(0.32, 0.5, 0, 0.26, 0.24, 0.38, lat, lon);
    if (detail < 2) {
      ellipsoid(-0.32, 0.55, 0, 0.64, 0.34, 0.5, pl, lon, 1, 0.5);
      ellipsoid(0.33, 0.54, 0, 0.27, 0.22, 0.39, pl, lon, 1, 0.5);
      box([-0.9, 0.87, 0], [0.12, 0.87, 0], 0.022, -1, 0, 0, -1);
    }
    ellipsoid(0.58, 0.38, 0, 0.14, 0.12, 0.17, lat, lon, -0.3);
    if (detail < 2) {
      box([0.6, 0.45, 0], [0.9, 0.72, 0], 0.06, -1, 0, 0, 0);
      box([0.9, 0.72, 0], [0.98, 0.95, 0], 0.04, -1, 0, 0, 1);
    } else box([0.6, 0.45, 0], [0.95, 0.85, 0], 0.06, -1, 0, 0, 0);
    if (detail === 0) {
      for (const side of [1, -1]) {
        box([0.42, 0.68, side * 0.22], [0.56, 0.84, side * 0.3], 0.03, -1, 0, 0, 1);
        // Espinhos na borda do casco.
        for (let k = 0; k < 4; k++) {
          const x = -0.75 + k * 0.28;
          box([x, 0.5, side * 0.46], [x - 0.06, 0.62, side * 0.6], 0.025, -1, 0, 0, -0.5);
        }
      }
    }
    eyes(0.66, 0.42, 0.11, 0.035);
    legs([0, 1, 2], (row) => 0.25 - row * 0.33, 0.35, 0.3, 0.52, 0.42, 0.06);
  } else if (species === 3) {
    // Saltador: corpo fino em gomos, sela no tórax, asas dobradas, antenas longas e as pernas
    // de trás (paradas, sem o andar do shader) dobradas bem acima do corpo.
    ellipsoid(-0.55, 0.45, 0, 0.45, 0.14, 0.13, lat, lon);
    ellipsoid(0.0, 0.5, 0, 0.2, 0.17, 0.15, lat, lon);
    ellipsoid(0.26, 0.55, 0, 0.12, 0.14, 0.11, lat, lon, -0.3);
    if (detail < 2) {
      for (const x of [-0.78, -0.56, -0.34]) ellipsoid(x, 0.47, 0, 0.08, 0.14, 0.135, 2, lon, 1, 0.6);
      ellipsoid(0.02, 0.56, 0, 0.21, 0.14, 0.16, pl, lon, 1, 0.5);
      ellipsoid(-0.42, 0.61, 0, 0.5, 0.035, 0.15, 3, lon, 1);
    }
    eyes(0.3, 0.6, 0.08, 0.042);
    for (const side of [1, -1]) {
      if (detail === 0) {
        box([0.32, 0.66, side * 0.04], [0.6, 0.95, side * 0.12], 0.012, -1, 0, 0, -0.5);
        box([0.6, 0.95, side * 0.12], [0.88, 1.05, side * 0.22], 0.01, -1, 0, 0, -0.5);
      } else if (detail === 1) box([0.32, 0.66, side * 0.04], [0.8, 1.0, side * 0.18], 0.012, -1, 0, 0, -0.5);
      const hip = [-0.12, 0.45, side * 0.14];
      const knee = [-0.48, 1.02, side * 0.32];
      const foot = [-0.98, 0.02, side * 0.36];
      box(hip, knee, detail === 2 ? 0.07 : 0.06, -1, 0, 0, 0);
      box(knee, foot, 0.028, -1, 0, 0, -0.4);
      if (detail === 0)
        for (let k = 1; k < 4; k++) {
          const t = k / 4;
          const p = [knee[0]! + (foot[0]! - knee[0]!) * t, knee[1]! + (foot[1]! - knee[1]!) * t, side * 0.34];
          box(p, [p[0]! + 0.06, p[1]! + 0.05, side * 0.4], 0.01, -1, 0, 0, -0.5);
        }
    }
    legs([0, 1], (row) => 0.12 - row * 0.13, 0.45, 0.12, 0.6, 0.36, 0.03);
  } else if (species === 4) {
    // Cuspidor: abdômen grande e erguido com bolsas de ácido acesas, bico atrás, cabeça baixa.
    ellipsoid(-0.62, 0.62, 0, 0.46, 0.4, 0.4, lat, lon);
    if (detail < 2) ellipsoid(-0.6, 0.68, 0, 0.44, 0.36, 0.38, pl, lon, 1, 0.35);
    for (const side of [1, -1]) {
      ellipsoid(-0.72, 0.88, side * 0.18, 0.12, 0.1, 0.1, 3, 6, 2);
      if (detail < 2) ellipsoid(-0.45, 0.83, side * 0.25, 0.1, 0.08, 0.09, 3, 6, 2);
    }
    box([-1.0, 0.75, 0], [-1.2, 1.02, 0], 0.07, -1, 0, 0, -1);
    if (detail < 2) ellipsoid(-1.22, 1.04, 0, 0.06, 0.06, 0.06, 3, 5, 2);
    ellipsoid(-0.08, 0.42, 0, 0.2, 0.15, 0.18, lat, lon);
    ellipsoid(0.2, 0.36, 0, 0.14, 0.12, 0.15, lat, lon, -0.3);
    for (const side of [1, -1]) box([0.3, 0.32, side * 0.07], [0.44, 0.28, side * 0.1], 0.03, -1, 0, 0, -0.5);
    eyes(0.28, 0.42, 0.09, 0.032);
    legs([0, 1, 2], (row) => 0.0 - row * 0.15, 0.36, 0.14, 0.54, 0.52, 0.036);
  } else {
    // Corredor (Etapa 12), agora com olhos acesos e espinhos no dorso de perto.
    ellipsoid(-0.78, 0.36, 0, 0.26, 0.2, 0.24, lat, lon);
    ellipsoid(-0.5, 0.4, 0, 0.3, 0.25, 0.3, lat, lon);
    if (detail < 2) ellipsoid(-0.22, 0.4, 0, 0.24, 0.22, 0.26, lat, lon);
    if (detail < 2) {
      ellipsoid(-0.78, 0.4, 0, 0.27, 0.19, 0.25, pl, lon, 1, 0.45);
      ellipsoid(-0.5, 0.45, 0, 0.31, 0.24, 0.31, pl, lon, 1, 0.45);
      ellipsoid(0.06, 0.45, 0, 0.21, 0.16, 0.2, pl, lon, 1, 0.5);
    }
    if (detail === 0) for (const x of [-0.62, -0.42, -0.24]) box([x, 0.62, 0], [x - 0.08, 0.76, 0], 0.025, -1, 0, 0, -0.5);
    ellipsoid(0.06, 0.4, 0, 0.2, 0.15, 0.19, lat, lon);
    ellipsoid(0.34, 0.38, 0, 0.15, 0.12, 0.15, lat, lon, -0.3);
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
    eyes(0.42, 0.42, 0.08, 0.03);
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
