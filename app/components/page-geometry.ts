import * as THREE from "three";

export const PAGE_WIDTH = 3.35;
export const PAGE_HEIGHT = 4.35;
const COLUMNS = 48;
const ROWS = 16;
const VERTICES = (COLUMNS + 1) * (ROWS + 1);
const THICKNESS = .009;

/** Integrating unit tangents preserves each paper strip's length while it bends. */
function tangent(progress: number, u: number, y: number, corner: number, twist: number) {
  const lift = Math.sin(Math.PI * progress);
  const cornerBias = (y - corner) / PAGE_HEIGHT;
  return Math.PI * progress + lift * (
    -.46 + 1.12 * u * u + .48 * cornerBias * u * u + twist * .12 * u
  );
}

export function createSheetGeometry() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(VERTICES * 2 * 3);
  const uv = new Float32Array(VERTICES * 2 * 2);
  const indices: number[] = [];
  for (let row = 0; row <= ROWS; row++) {
    for (let col = 0; col <= COLUMNS; col++) {
      const id = row * (COLUMNS + 1) + col;
      uv.set([col / COLUMNS, 1 - row / ROWS], id * 2);
      // The underside becomes the next left page; mirror its UVs, not its text.
      uv.set([1 - col / COLUMNS, 1 - row / ROWS], (id + VERTICES) * 2);
    }
  }
  for (let side = 0; side < 2; side++) {
    const start = indices.length;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLUMNS; col++) {
        const a = side * VERTICES + row * (COLUMNS + 1) + col;
        const b = a + 1, c = a + COLUMNS + 1, d = c + 1;
        indices.push(...(side === 0 ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
      }
    }
    geometry.addGroup(start, indices.length - start, side);
  }
  const perimeter: number[] = [];
  for (let col = 0; col <= COLUMNS; col++) perimeter.push(col);
  for (let row = 1; row <= ROWS; row++) perimeter.push(row * (COLUMNS + 1) + COLUMNS);
  for (let col = COLUMNS - 1; col >= 0; col--) perimeter.push(ROWS * (COLUMNS + 1) + col);
  for (let row = ROWS - 1; row > 0; row--) perimeter.push(row * (COLUMNS + 1));
  const start = indices.length;
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    indices.push(a, b, a + VERTICES, b, b + VERTICES, a + VERTICES);
  }
  geometry.addGroup(start, indices.length - start, 2);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  deformSheet(geometry, 0, 0, 0);
  return geometry;
}

export function deformSheet(geometry: THREE.BufferGeometry, progress: number, corner: number, twist: number) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  const lift = Math.sin(Math.PI * p);
  const positions = geometry.attributes.position;
  const segment = PAGE_WIDTH / COLUMNS;
  for (let row = 0; row <= ROWS; row++) {
    const y = PAGE_HEIGHT * (.5 - row / ROWS);
    let x = 0, z = 0;
    for (let col = 0; col <= COLUMNS; col++) {
      const u = col / COLUMNS;
      if (col > 0) {
        const angle = tangent(p, (col - .5) / COLUMNS, y, corner, twist);
        x += Math.cos(angle) * segment;
        z += Math.sin(angle) * segment;
      }
      const angle = tangent(p, u, y, corner, twist);
      const arch = Math.sin(Math.PI * u) * .042 * (1 - lift);
      const curledY = y + twist * lift * u * u * .065;
      const nx = -Math.sin(angle) * THICKNESS / 2;
      const nz = Math.cos(angle) * THICKNESS / 2;
      const id = row * (COLUMNS + 1) + col;
      positions.setXYZ(id, x + nx, curledY, z + arch + nz);
      positions.setXYZ(id + VERTICES, x - nx, curledY, z + arch - nz);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

export function pageEdgeX(progress: number, corner: number, twist = 0) {
  let x = 0;
  for (let col = 0; col < COLUMNS; col++) {
    x += Math.cos(tangent(progress, (col + .5) / COLUMNS, corner, corner, twist)) * PAGE_WIDTH / COLUMNS;
  }
  return x;
}

/** Invert the curved sheet's position so the grabbed edge follows the pointer. */
export function progressAtPointer(sourceX: number, direction: 1 | -1, corner: number, twist = 0) {
  let low = 0, high = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    const x = direction * pageEdgeX(direction === 1 ? mid : 1 - mid, corner, twist);
    if (x > sourceX) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function shouldCompleteTurn(progress: number, velocity: number, moved: number, cancelled = false) {
  if (cancelled) return false;
  if (moved < 6) return true;
  if (velocity < -.65) return false;
  return progress > .46 || (progress > .09 && velocity > .65);
}

export function advanceTurn(progress: number, velocity: number, target: number, delta: number) {
  // Substeps keep the spring stable on slow devices and after a hidden tab resumes.
  let remaining = Math.min(delta, .08);
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 120);
    velocity += ((target - progress) * 155 - velocity * 23) * step;
    progress = THREE.MathUtils.clamp(progress + velocity * step, 0, 1);
    remaining -= step;
  }
  return { progress, velocity, settled: Math.abs(target - progress) < .001 && Math.abs(velocity) < .015 };
}
