import assert from "node:assert/strict";
import { test } from "node:test";
import { loadMemories } from "../lib/memories.ts";

const record = {
  id: "835b013e-a289-4e86-b905-23b39dc4b2db", title: "Một ngày đẹp", note: "Kỷ niệm thật",
  date: "2026-10-14", image: "https://storage.example/photo.jpg", createdAt: "2026-10-14T01:00:00Z",
};

test("loads the real API contract in server order and bypasses browser cache", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = async (path, options) => {
      assert.equal(path, "/api/memories");
      assert.equal(options.cache, "no-store");
      assert.equal(options.signal, controller.signal);
      return Response.json([record, { ...record, id: "next", date: "2026-10-15" }]);
    };
    const data = await loadMemories(controller.signal);
    assert.deepEqual(data.map(row => row.id), [record.id, "next"]);
    assert.equal(data[0].image, record.image);
    assert.equal(data[0].note, record.note);
  } finally { globalThis.fetch = original; }
});

test("an empty database stays empty instead of substituting sample memories", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json([]);
    assert.deepEqual(await loadMemories(), []);
  } finally { globalThis.fetch = original; }
});

test("an upstream failure produces a safe error rather than exposing its response", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ error: "internal database details" }, { status: 503 });
    await assert.rejects(loadMemories(), { message: "Không thể tải kỷ niệm." });
  } finally { globalThis.fetch = original; }
});

test("malformed or partial API records fail before reaching the texture renderer", async () => {
  const original = globalThis.fetch;
  try {
    for (const data of [null, {}, [null], [{ ...record, image: null }], [{ ...record, note: 123 }]]) {
      globalThis.fetch = async () => Response.json(data);
      await assert.rejects(loadMemories(), { message: "Dữ liệu kỷ niệm không hợp lệ." });
    }
  } finally { globalThis.fetch = original; }
});

test("unmount cancellation propagates to the pending request", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = (_path, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const pending = loadMemories(controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
  } finally { globalThis.fetch = original; }
});
