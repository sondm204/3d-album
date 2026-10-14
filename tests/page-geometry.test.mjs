import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAGE_WIDTH, PAGE_HEIGHT, createSheetGeometry, deformSheet,
  pageEdgeX, progressAtPointer, shouldCompleteTurn, advanceTurn,
} from "../app/components/page-geometry.ts";

const columns = 48;
const rows = 16;
const count = (columns + 1) * (rows + 1);

function center(position, index) {
  return [0, 1, 2].map(axis => (position.array[index * 3 + axis] + position.array[(index + count) * 3 + axis]) / 2);
}

test("paper keeps the spine fixed and its width while curling from either corner", () => {
  const geometry = createSheetGeometry();
  try {
    for (const corner of [-PAGE_HEIGHT / 2, 0, PAGE_HEIGHT / 2]) {
      for (const progress of [0, .01, .15, .35, .5, .75, .95, 1]) {
        deformSheet(geometry, progress, corner, .6);
        const position = geometry.attributes.position;
        assert.ok([...position.array].every(Number.isFinite));
        for (let row = 0; row <= rows; row++) {
          const root = center(position, row * (columns + 1));
          assert.ok(Math.abs(root[0]) < 1e-6 && Math.abs(root[2]) < 1e-6, "spine must stay anchored");
          let length = 0;
          for (let col = 1; col <= columns; col++) {
            const a = center(position, row * (columns + 1) + col - 1);
            const b = center(position, row * (columns + 1) + col);
            length += Math.hypot(...a.map((value, axis) => value - b[axis]));
            assert.ok(b[2] >= -.001, "paper must not pass through the underlying spread");
          }
          assert.ok(Math.abs(length - PAGE_WIDTH) < .035, `paper stretched: ${length}`);
        }
        assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
      }
    }
  } finally { geometry.dispose(); }
});

test("the sheet has two correctly oriented photo faces and closed thickness", () => {
  const geometry = createSheetGeometry();
  try {
    assert.equal(geometry.groups.length, 3);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < count; i++) {
      assert.ok(Math.abs(uv.getX(i) + uv.getX(i + count) - 1) < 1e-6);
      assert.equal(uv.getY(i), uv.getY(i + count));
    }
    for (const progress of [0, .5, 1]) {
      deformSheet(geometry, progress, 0, 0);
      const p = geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        const thickness = Math.hypot(p.getX(i) - p.getX(i + count), p.getY(i) - p.getY(i + count), p.getZ(i) - p.getZ(i + count));
        assert.ok(Math.abs(thickness - .009) < .000001);
      }
    }
  } finally { geometry.dispose(); }
});

test("pointer projection tracks the curved edge in both directions", () => {
  for (const direction of [-1, 1]) {
    for (const twist of [-.8, 0, .8]) {
      for (const p of [0, .02, .2, .5, .8, .99, 1]) {
        const x = direction * pageEdgeX(direction === 1 ? p : 1 - p, -PAGE_HEIGHT / 2, twist);
        assert.ok(Math.abs(progressAtPointer(x, direction, -PAGE_HEIGHT / 2, twist) - p) < .0001);
      }
    }
  }
});

test("release supports click, incomplete drag, reversal, flick and pointer cancellation", () => {
  assert.equal(shouldCompleteTurn(0, 0, 0), true);
  assert.equal(shouldCompleteTurn(.2, 0, 60), false);
  assert.equal(shouldCompleteTurn(.6, 0, 100), true);
  assert.equal(shouldCompleteTurn(.7, -1, 90), false);
  assert.equal(shouldCompleteTurn(.2, 1, 90), true);
  assert.equal(shouldCompleteTurn(.7, 1, 90, true), false);
});

test("release spring completes and cancels without instability across frame rates", () => {
  for (const target of [0, 1]) {
    for (const delta of [1 / 144, 1 / 60, 1 / 20, .8]) {
      let progress = .3, velocity = target ? 2 : -2, settled = false;
      for (let i = 0; i < 1000 && !settled; i++) {
        ({ progress, velocity, settled } = advanceTurn(progress, velocity, target, delta));
        assert.ok(progress >= 0 && progress <= 1 && Number.isFinite(velocity));
      }
      assert.ok(settled);
      assert.ok(Math.abs(progress - target) < .001);
    }
  }
});
