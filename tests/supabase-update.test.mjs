import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Compile the real server-only store for Node tests; all HTTP calls are mocked.
const source = await readFile(new URL("../lib/supabase-memories.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  .replace('import "server-only";', "")
  .replace('"./memory-validation"', JSON.stringify(new URL("../lib/memory-validation.ts", import.meta.url).href));
const { createSupabaseMemoryStore } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

for (const mode of ["replace", "patch-fails", "text-only"]) {
  test(`store update: ${mode}`, async () => {
    const originalFetch = globalThis.fetch;
    const previousUrl = process.env.SUPABASE_URL, previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = "https://storage.example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
    const id = "835b013e-a289-4e86-b905-23b39dc4b2db";
    const row = { id, title: "Title", note: "Note", date: "2026-10-15", image_path: `${id}.jpg`, created_at: "2026-10-15T00:00:00Z" };
    const calls = [];
    let newPath;
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, method: init.method || "GET" });
      if (!init.method) return Response.json([row]);
      if (init.method === "POST") { newPath = url.split("/").at(-1); return new Response(null, { status: 200 }); }
      if (init.method === "PATCH") {
        if (mode === "patch-fails") return new Response("upstream failed", { status: 500 });
        return Response.json([{ ...row, ...JSON.parse(init.body) }]);
      }
      if (init.method === "DELETE") return new Response(null, { status: 200 });
      throw new Error("Unexpected request");
    };
    try {
      const file = new File([new Uint8Array([255, 216, 255, 1])], "new.jpg", { type: "image/jpeg" });
      const action = createSupabaseMemoryStore().update(id, { title: "Edited", note: "Note", date: row.date }, mode === "text-only" ? undefined : file);
      if (mode === "patch-fails") {
        await assert.rejects(action);
        assert.ok(calls.at(-1).url.endsWith(newPath));
        assert.ok(!calls.some(call => call.method === "DELETE" && call.url.endsWith(`${id}.jpg`)));
      } else {
        const saved = await action;
        assert.equal(saved.title, "Edited");
        if (mode === "replace") {
          assert.notEqual(newPath, row.image_path);
          assert.ok(saved.image.endsWith(newPath));
          assert.deepEqual(calls.map(call => call.method), ["GET", "POST", "PATCH", "DELETE"]);
          assert.ok(calls.at(-1).url.endsWith(`${id}.jpg`));
        } else {
          assert.ok(saved.image.endsWith(`${id}.jpg`));
          assert.deepEqual(calls.map(call => call.method), ["GET", "PATCH"]);
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
      if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });
}
