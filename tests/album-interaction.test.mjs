import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { attachBookInteractions } from "../app/components/album-interaction.ts";
import { createSheetGeometry } from "../app/components/page-geometry.ts";

// Native-event unit harness: exercises the real controller with Three.js ray projection.
// It does not stand in for a visual WebGL/browser test.
class CanvasTarget extends EventTarget {
  style = {};
  captures = new Set();
  clientHeight = 1000;
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 1000 }; }
  setAttribute() {}
  focus() {}
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) {
    this.captures.delete(id);
    this.send("lostpointercapture", { pointerId: id });
  }
  send(type, values = {}) {
    const event = new Event(type, { cancelable: true });
    const properties = { button: 0, pointerId: 1, clientX: 500, clientY: 500, ...values };
    for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
    this.dispatchEvent(event);
    return event;
  }
}

function setup(spread = 0, spreadCount = 3, callbacks = {}) {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const canvas = new CanvasTarget();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100);
  camera.position.z = 12; camera.updateMatrixWorld();
  const geometry = { left: createSheetGeometry(), right: createSheetGeometry(), turning: createSheetGeometry() };
  const state = {
    canvas, camera, geometry, book: { current: new THREE.Group() }, spreadCount,
    spreadRef: { current: spread }, turn: { current: null }, cover: { current: { progress: 0, closed: false, side: 1 } }, rotation: { current: [0, 0] },
    zoom: { current: 1 }, hover: { current: { side: 0, corner: 0, amount: 0 } },
    setActive(value) { state.active = value; }, ...callbacks,
  };
  const detach = attachBookInteractions(state);
  return {
    ...state,
    close() { detach(); Object.values(geometry).forEach(g => g.dispose()); globalThis.window = previousWindow; },
  };
}

test("grabbing the book body rotates without starting a page turn", () => {
  const s = setup();
  try {
    s.canvas.send("pointerdown", { clientX: 640 });
    s.canvas.send("pointermove", { clientX: 710, clientY: 560 });
    assert.ok(s.rotation.current[0] > 0 && s.rotation.current[1] > 0);
    assert.equal(s.turn.current, null);
    s.canvas.send("pointerup");
    assert.equal(s.canvas.captures.size, 0);
  } finally { s.close(); }
});

test("photo clicks open the editor once, while dragging and cancellation do not", () => {
  const selected = [];
  const s = setup(0, 3, { onPhotoClick: index => selected.push(index) });
  try {
    s.canvas.send("pointerdown", { clientX: 665, clientY: 440 });
    s.canvas.send("pointerup", { clientX: 665, clientY: 440 });
    assert.deepEqual(selected, [1]);
    s.canvas.send("pointerdown", { clientX: 665, clientY: 440 });
    s.canvas.send("pointermove", { clientX: 710, clientY: 440 });
    s.canvas.send("pointerup", { clientX: 710, clientY: 440 });
    s.canvas.send("pointerdown", { clientX: 665, clientY: 440 });
    s.canvas.send("pointercancel", { clientX: 665, clientY: 440 });
    assert.deepEqual(selected, [1]);
  } finally { s.close(); }
});

test("photo hover and keyboard editing respect page turns and closed covers", () => {
  const selected = [], hovered = [];
  const s = setup(1, 3, { onPhotoClick: index => selected.push(index), onPhotoHover: index => hovered.push(index) });
  try {
    s.canvas.send("pointermove", { clientX: 335, clientY: 440 });
    assert.equal(hovered.at(-1), 2);
    assert.equal(s.canvas.style.cursor, "pointer");
    s.canvas.send("keydown", { key: "Enter" });
    s.canvas.send("keydown", { key: "Enter", shiftKey: true });
    assert.deepEqual(selected, [2, 3]);
    s.canvas.send("pointerleave");
    assert.equal(hovered.at(-1), null);
    s.cover.current.closed = true;
    s.canvas.send("keydown", { key: "Enter" });
    assert.deepEqual(selected, [2, 3]);
    s.cover.current.closed = false;
    s.canvas.send("pointerdown", { clientX: 815, clientY: 500 });
    s.canvas.send("keydown", { key: "Enter" });
    assert.deepEqual(selected, [2, 3]);
  } finally { s.close(); }
});

test("dragging the right edge across the spine completes a turn and survives lost capture", () => {
  const s = setup();
  try {
    s.canvas.send("pointerdown", { clientX: 815, clientY: 680, timeStamp: 0 });
    assert.equal(s.turn.current.direction, 1);
    s.canvas.send("pointermove", { clientX: 250, clientY: 620, timeStamp: 500 });
    assert.ok(s.turn.current.desired > .6);
    assert.deepEqual(s.rotation.current, [0, 0]);
    s.canvas.send("pointerup", { timeStamp: 800 });
    assert.equal(s.turn.current.target, 1);
    assert.equal(s.turn.current.released, true);
    assert.equal(s.canvas.captures.size, 0);
  } finally { s.close(); }
});

test("left edge supports backward turning and a short drag returns the page", () => {
  const s = setup(1);
  try {
    s.canvas.send("pointerdown", { clientX: 185, timeStamp: 0 });
    assert.equal(s.turn.current.direction, -1);
    s.canvas.send("pointermove", { clientX: 225, timeStamp: 500 });
    s.canvas.send("pointerup", { timeStamp: 800 });
    assert.equal(s.turn.current.target, 0);
    s.turn.current = null;
    s.canvas.send("pointerdown", { clientX: 185, timeStamp: 1000 });
    s.canvas.send("pointermove", { clientX: 800, timeStamp: 1500 });
    s.canvas.send("pointerup", { timeStamp: 1800 });
    assert.equal(s.turn.current.target, 1);
  } finally { s.close(); }
});

test("pointer cancellation and losing window focus return a held page", () => {
  const s = setup();
  try {
    s.canvas.send("pointerdown", { clientX: 815 });
    s.canvas.send("pointermove", { clientX: 300 });
    s.canvas.send("pointercancel");
    assert.equal(s.turn.current.target, 0);
    assert.equal(s.turn.current.released, true);
    s.turn.current = null;
    s.canvas.send("pointerdown", { clientX: 815 });
    globalThis.window.dispatchEvent(new Event("blur"));
    assert.equal(s.turn.current.target, 0);
    assert.equal(s.turn.current.released, true);
  } finally { s.close(); }
});

test("pinching cancels a held page and changes zoom within its limits", () => {
  const s = setup();
  try {
    s.canvas.send("pointerdown", { pointerId: 1, clientX: 815 });
    s.canvas.send("pointerdown", { pointerId: 2, clientX: 400 });
    assert.equal(s.turn.current.target, 0);
    assert.equal(s.turn.current.released, true);
    s.canvas.send("pointermove", { pointerId: 2, clientX: 200 });
    assert.ok(s.zoom.current > 1);
    s.canvas.send("pointermove", { pointerId: 2, clientX: -3000 });
    assert.equal(s.zoom.current, 2.3);
    s.canvas.send("pointerup", { pointerId: 2 });
    s.canvas.send("pointerup", { pointerId: 1 });
  } finally { s.close(); }
});

test("wheel zoom only reacts over the book and normalizes wheel units", () => {
  const s = setup();
  try {
    const outside = s.canvas.send("wheel", { clientX: 990, deltaY: -200, deltaMode: 0 });
    assert.equal(s.zoom.current, 1);
    assert.equal(outside.defaultPrevented, false);
    const inside = s.canvas.send("wheel", { deltaY: -5, deltaMode: 1 });
    assert.ok(s.zoom.current > 1);
    assert.equal(inside.defaultPrevented, true);
    s.canvas.send("wheel", { deltaY: 1e5, deltaMode: 0 });
    assert.equal(s.zoom.current, .55);
  } finally { s.close(); }
});

test("turning stays within album boundaries and cannot restart during a turn", () => {
  const s = setup();
  try {
    s.canvas.send("keydown", { key: "ArrowLeft" });
    assert.equal(s.turn.current.kind, "close");
    assert.equal(s.cover.current.side, -1);
    assert.equal(s.spreadRef.current, 0);
    s.turn.current = null;
    s.canvas.send("keydown", { key: "ArrowRight" });
    const first = s.turn.current;
    s.canvas.send("keydown", { key: "ArrowRight" });
    assert.equal(s.turn.current, first);
    s.turn.current = null; s.spreadRef.current = 2;
    s.canvas.send("keydown", { key: "ArrowRight" });
    assert.equal(s.turn.current.kind, "close");
    assert.equal(s.spreadRef.current, 2);
  } finally { s.close(); }
});

test("dragging the final right edge closes the cover instead of reading beyond the album", () => {
  const s = setup(2);
  try {
    s.canvas.send("pointerdown", { clientX: 815, timeStamp: 0 });
    assert.equal(s.turn.current.kind, "close");
    s.canvas.send("pointermove", { clientX: 225, timeStamp: 500 });
    assert.ok(s.turn.current.desired > .7);
    s.canvas.send("pointerup", { timeStamp: 800 });
    assert.equal(s.turn.current.target, 1);
    assert.equal(s.turn.current.from, 2);
    assert.equal(s.spreadRef.current, 2);
  } finally { s.close(); }
});

test("a partial closing drag or pointer cancellation leaves the album open", () => {
  const s = setup(2);
  try {
    s.canvas.send("pointerdown", { clientX: 815, timeStamp: 0 });
    s.canvas.send("pointermove", { clientX: 785, timeStamp: 500 });
    s.canvas.send("pointerup", { timeStamp: 800 });
    assert.equal(s.turn.current.target, 0);
    assert.equal(s.cover.current.closed, false);
    s.turn.current = null;
    s.canvas.send("pointerdown", { clientX: 815, timeStamp: 1000 });
    s.canvas.send("pointermove", { clientX: 225, timeStamp: 1500 });
    s.canvas.send("pointercancel", { timeStamp: 1800 });
    assert.equal(s.turn.current.target, 0);
  } finally { s.close(); }
});

test("a closed album opens from its left cover and keeps the final spread", () => {
  const s = setup(2);
  try {
    s.cover.current = { progress: 1, closed: true, side: 1 };
    s.canvas.send("pointerdown", { clientX: 185, timeStamp: 0 });
    assert.equal(s.turn.current.kind, "open");
    s.canvas.send("pointermove", { clientX: 800, timeStamp: 500 });
    s.canvas.send("pointerup", { timeStamp: 800 });
    assert.equal(s.turn.current.target, 1);
    assert.equal(s.turn.current.from, 2);
    s.turn.current = null;
    s.canvas.send("keydown", { key: "ArrowRight" });
    assert.equal(s.turn.current, null);
    s.canvas.send("keydown", { key: "ArrowLeft" });
    assert.equal(s.turn.current.kind, "open");
  } finally { s.close(); }
});

test("the empty half of a closed album cannot intercept rotation or wheel input", () => {
  const s = setup(2);
  try {
    s.cover.current = { progress: 1, closed: true, side: 1 };
    s.canvas.send("pointerdown", { clientX: 800 });
    assert.equal(s.canvas.captures.size, 0);
    const wheel = s.canvas.send("wheel", { clientX: 800, deltaY: -100, deltaMode: 0 });
    assert.equal(wheel.defaultPrevented, false);
    assert.equal(s.zoom.current, 1);
    s.canvas.send("pointerdown", { clientX: 325 });
    s.canvas.send("pointermove", { clientX: 365, clientY: 550 });
    assert.ok(s.rotation.current[1] > 0);
    assert.equal(s.turn.current, null);
  } finally { s.close(); }
});

test("a rotated album uses its own coordinates for picking", () => {
  const s = setup();
  try {
    s.book.current.rotation.z = Math.PI / 2;
    // The right page's outer edge is now at the top of the screen.
    s.canvas.send("pointerdown", { clientX: 500, clientY: 185 });
    assert.equal(s.turn.current.direction, 1);
    s.canvas.send("pointermove", { clientX: 500, clientY: 790, timeStamp: 500 });
    assert.ok(s.turn.current.desired > .6);
  } finally { s.close(); }
});

test("the first left edge folds the left cover without moving before the first spread", () => {
  const s = setup();
  try {
    s.canvas.send("pointerdown", { clientX: 185, timeStamp: 0 });
    assert.equal(s.turn.current.kind, "close");
    assert.equal(s.cover.current.side, -1);
    s.canvas.send("pointermove", { clientX: 800, timeStamp: 500 });
    assert.ok(s.turn.current.desired > .7);
    s.canvas.send("pointerup", { timeStamp: 800 });
    assert.equal(s.turn.current.target, 1);
    assert.equal(s.turn.current.from, 0);
    assert.equal(s.spreadRef.current, 0);
  } finally { s.close(); }
});

test("closing from the first page can be cancelled by a short drag or lost capture", () => {
  const s = setup();
  try {
    s.canvas.send("pointerdown", { clientX: 185, timeStamp: 0 });
    s.canvas.send("pointermove", { clientX: 225, timeStamp: 500 });
    s.canvas.send("pointerup", { timeStamp: 800 });
    assert.equal(s.turn.current.target, 0);
    assert.equal(s.cover.current.closed, false);
    s.turn.current = null;
    s.canvas.send("pointerdown", { clientX: 185, timeStamp: 1000 });
    s.canvas.send("pointermove", { clientX: 800, timeStamp: 1500 });
    s.canvas.send("lostpointercapture", { timeStamp: 1800 });
    assert.equal(s.turn.current.target, 0);
    assert.equal(s.spreadRef.current, 0);
  } finally { s.close(); }
});

test("a front-closed album opens from the right and retains the first spread", () => {
  const s = setup();
  try {
    s.cover.current = { progress: 1, closed: true, side: -1 };
    s.canvas.send("keydown", { key: "ArrowLeft" });
    assert.equal(s.turn.current, null);
    s.canvas.send("pointerdown", { clientX: 815, timeStamp: 0 });
    assert.equal(s.turn.current.kind, "open");
    assert.equal(s.turn.current.direction, 1);
    s.canvas.send("pointermove", { clientX: 200, timeStamp: 500 });
    s.canvas.send("pointerup", { timeStamp: 800 });
    assert.equal(s.turn.current.target, 1);
    assert.equal(s.turn.current.from, 0);
    s.turn.current = null;
    s.canvas.send("keydown", { key: "ArrowRight" });
    assert.equal(s.turn.current.kind, "open");
  } finally { s.close(); }
});

test("front-closed picking excludes the empty left half but keeps the cover interactive", () => {
  const s = setup();
  try {
    s.cover.current = { progress: 1, closed: true, side: -1 };
    s.canvas.send("pointerdown", { clientX: 185 });
    assert.equal(s.canvas.captures.size, 0);
    const outside = s.canvas.send("wheel", { clientX: 185, deltaY: -100, deltaMode: 0 });
    assert.equal(outside.defaultPrevented, false);
    s.canvas.send("pointerdown", { clientX: 650 });
    s.canvas.send("pointermove", { clientX: 710, clientY: 550 });
    assert.ok(s.rotation.current[1] > 0);
    assert.equal(s.turn.current, null);
    s.canvas.send("pointerup");
    const inside = s.canvas.send("wheel", { clientX: 650, deltaY: -100, deltaMode: 0 });
    assert.equal(inside.defaultPrevented, true);
    assert.ok(s.zoom.current > 1);
  } finally { s.close(); }
});

test("an album with one spread can fold either cover", () => {
  const s = setup(0, 1);
  try {
    s.canvas.send("keydown", { key: "ArrowLeft" });
    assert.equal(s.turn.current.kind, "close");
    assert.equal(s.cover.current.side, -1);
    s.turn.current = null;
    s.canvas.send("keydown", { key: "ArrowRight" });
    assert.equal(s.turn.current.kind, "close");
    assert.equal(s.cover.current.side, 1);
    assert.equal(s.spreadRef.current, 0);
  } finally { s.close(); }
});
