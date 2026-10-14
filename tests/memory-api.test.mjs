import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryMutationHandlers } from "../lib/memory-api.ts";
import { MemoryValidationError } from "../lib/memory-validation.ts";
import { albumSpreadCount, photoPageAt } from "../app/components/album-pages.ts";

const id = "835b013e-a289-4e86-b905-23b39dc4b2db";
const values = { title: "Kỷ niệm", note: "Lời nhắn", date: "2026-10-14" };
const record = { id, ...values, image: "/photo.jpg", createdAt: "2026-10-14T00:00:00Z" };
const request = (method, body) => new Request("http://localhost/api/memories", { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
const allow = async () => null;

test("mutations fail closed before reaching storage without authorization", async () => {
  let calls = 0;
  const mutate = async () => { calls++; };
  const api = memoryMutationHandlers({ create: mutate, update: mutate, delete: mutate });
  for (const method of ["POST", "PUT", "DELETE"]) assert.equal((await api[method](request(method, method === "PUT" ? values : undefined), id)).status, 403);
  assert.equal(calls, 0);
});

test("authorized multipart create returns the saved record and validation errors safely", async () => {
  const form = new FormData(); form.set("id", id); form.set("title", values.title);
  form.set("image", new File(["photo"], "photo.png", { type: "image/png" }));
  const api = memoryMutationHandlers({ create: async data => { assert.equal(data.get("id"), id); assert.equal(data.get("image").name, "photo.png"); return record; } }, allow);
  const result = await api.POST(new Request("http://localhost/api/memories", { method: "POST", body: form }));
  assert.equal(result.status, 201); assert.deepEqual(await result.json(), record);
  const invalid = memoryMutationHandlers({ create: async () => { throw new MemoryValidationError("Chọn ảnh tối đa 10 MB."); } }, allow);
  const result2 = await invalid.POST(new Request("http://localhost/api/memories", { method: "POST", body: form }));
  assert.equal(result2.status, 400);
});

test("updates reject invalid JSON, dates, IDs and types before storage", async () => {
  let calls = 0;
  const api = memoryMutationHandlers({ update: async () => { calls++; return record; } }, allow);
  for (const body of [null, [], {}, { ...values, note: 3 }, { ...values, title: " " }, { ...values, date: "2026-02-30" }]) {
    assert.equal((await api.PUT(request("PUT", body), id)).status, 400);
  }
  assert.equal((await api.PUT(request("PUT", values), "invalid")).status, 400);
  assert.equal(calls, 0);
  assert.equal((await api.PUT(request("PUT", values), id)).status, 200);
  assert.equal(calls, 1);
});

test("deletion validates IDs and returns 204 only when the store succeeds", async () => {
  let deleted;
  const api = memoryMutationHandlers({ delete: async key => { deleted = key; } }, allow);
  assert.equal((await api.DELETE(request("DELETE"), "bad")).status, 400);
  assert.equal(deleted, undefined);
  const response = await api.DELETE(request("DELETE"), id);
  assert.equal(response.status, 204); assert.equal(await response.text(), ""); assert.equal(deleted, id);
  const failing = memoryMutationHandlers({ delete: async () => { throw new Error("sensitive upstream error"); } }, allow);
  const failed = await failing.DELETE(request("DELETE"), id);
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /sensitive/);
});

test("empty, odd and even albums always reserve a page for the next memory", () => {
  for (const count of [0, 1, 2, 3, 4, 20]) {
    assert.ok(albumSpreadCount(count) * 2 > count);
    assert.ok(albumSpreadCount(count) * 2 <= count + 2);
  }
  assert.equal(photoPageAt(-1.675, .55, 2), 4);
  assert.equal(photoPageAt(1.675, .55, 2), 5);
  assert.equal(photoPageAt(0, -2, 2), null);
});
