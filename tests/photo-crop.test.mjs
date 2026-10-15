import assert from "node:assert/strict";
import { test } from "node:test";
import { cropPhoto, PHOTO_ASPECT } from "../app/components/photo-format.ts";

test("exports only the selected region as a bounded JPEG matching the album frame", async () => {
  const previousImage = globalThis.Image, previousDocument = globalThis.document;
  let drawArgs, encoding;
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage(...args) { drawArgs = args; } }),
    toBlob(callback, type, quality) { encoding = { type, quality }; callback(new Blob(["cropped"], { type })); },
  };
  globalThis.Image = class { async decode() {} };
  globalThis.document = { createElement: () => canvas };
  try {
    const file = await cropPhoto("blob:original", { x: 300, y: 80, width: 1884, height: 1548 });
    assert.deepEqual(drawArgs.slice(1), [300, 80, 1884, 1548, 0, 0, 1256, 1032]);
    assert.equal(canvas.width / canvas.height, PHOTO_ASPECT);
    assert.equal(file.type, "image/jpeg");
    assert.equal(encoding.type, "image/jpeg");
    assert.ok(file.size > 0);
    await assert.rejects(cropPhoto("blob:original", { x: 0, y: 0, width: 0, height: 2 }), /Vùng cắt ảnh/);
    canvas.toBlob = callback => callback(null);
    await assert.rejects(cropPhoto("blob:original", { x: 0, y: 0, width: 628, height: 516 }), /Không thể cắt ảnh/);
  } finally { globalThis.Image = previousImage; globalThis.document = previousDocument; }
});
