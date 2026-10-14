import "server-only";
import type { SavedMemory } from "./memories";
import { MemoryValidationError, memoryInputFromForm, validateImage, validateMemoryFields, type MemoryInput } from "./memory-validation";

type SupabaseMemoryRow = {
  id: string;
  title: string;
  note: string;
  date: string;
  image_path: string;
  created_at: string;
};

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
  table: string;
  bucket: string;
};

class SupabaseRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function getConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_MEMORIES_TABLE ?? "memories";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "memories";
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return { url, serviceRoleKey, table, bucket };
}

function headers(config: SupabaseConfig, extra?: HeadersInit) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    ...extra,
  };
}

function toSavedMemory(row: SupabaseMemoryRow, config: SupabaseConfig): SavedMemory {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    date: row.date,
    image: `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${row.image_path.split("/").map(encodeURIComponent).join("/")}`,
    createdAt: row.created_at,
  };
}

async function supabaseFetch(config: SupabaseConfig, path: string, init?: RequestInit) {
  const response = await fetch(`${config.url}${path}`, init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new SupabaseRequestError(text || response.statusText, response.status);
  }
  return response;
}

async function findById(config: SupabaseConfig, id: string) {
  const params = new URLSearchParams({ id: `eq.${id}`, select: "*" });
  const response = await supabaseFetch(config, `/rest/v1/${config.table}?${params}`, {
    headers: headers(config, { Accept: "application/json" }),
    cache: "no-store",
  });
  const rows = await response.json() as SupabaseMemoryRow[];
  return rows[0] ?? null;
}

async function removeStorageObject(config: SupabaseConfig, path: string) {
  await fetch(`${config.url}/storage/v1/object/${config.bucket}/${encodeURIComponent(path)}`, {
    method: "DELETE",
    headers: headers(config),
  });
}

export function createSupabaseMemoryStore() {
  return {
    async read(): Promise<SavedMemory[]> {
      const config = getConfig();
      const params = new URLSearchParams({ select: "*", order: "date.asc,created_at.asc,id.asc" });
      const response = await supabaseFetch(config, `/rest/v1/${config.table}?${params}`, {
        headers: headers(config, { Accept: "application/json" }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      return ((await response.json()) as SupabaseMemoryRow[]).map((row) => toSavedMemory(row, config));
    },

    async create(form: FormData): Promise<SavedMemory> {
      const config = getConfig();
      const input = memoryInputFromForm(form);
      validateMemoryFields(input);
      const existing = await findById(config, input.id);
      if (existing) return toSavedMemory(existing, config);
      const image = await validateImage(form.get("image"));
      const imagePath = `${input.id}.${image.extension}`;
      const uploadBody = new Uint8Array(image.bytes).buffer;
      await supabaseFetch(config, `/storage/v1/object/${config.bucket}/${imagePath}`, {
        method: "POST",
        headers: headers(config, { "Content-Type": image.contentType, "x-upsert": "false" }),
        body: uploadBody,
      });
      try {
        const response = await supabaseFetch(config, `/rest/v1/${config.table}`, {
          method: "POST",
          headers: headers(config, { "Content-Type": "application/json", Prefer: "return=representation", Accept: "application/json" }),
          body: JSON.stringify({ id: input.id, title: input.title, note: input.note, date: input.date, image_path: imagePath }),
        });
        return toSavedMemory(((await response.json()) as SupabaseMemoryRow[])[0], config);
      } catch (error) {
        await removeStorageObject(config, imagePath);
        throw error;
      }
    },

    async update(id: string, input: Omit<MemoryInput, "id">): Promise<SavedMemory> {
      const config = getConfig();
      validateMemoryFields({ id, ...input });
      const params = new URLSearchParams({ id: `eq.${id}` });
      const response = await supabaseFetch(config, `/rest/v1/${config.table}?${params}`, {
        method: "PATCH",
        headers: headers(config, { "Content-Type": "application/json", Prefer: "return=representation", Accept: "application/json" }),
        body: JSON.stringify(input),
      });
      const row = ((await response.json()) as SupabaseMemoryRow[])[0];
      if (!row) throw new MemoryValidationError("Không tìm thấy kỷ niệm.");
      return toSavedMemory(row, config);
    },

    async delete(id: string) {
      const config = getConfig();
      validateMemoryFields({ id, title: "deleted", note: "", date: "2000-01-01" });
      const existing = await findById(config, id);
      if (!existing) return;
      const params = new URLSearchParams({ id: `eq.${id}` });
      await supabaseFetch(config, `/rest/v1/${config.table}?${params}`, {
        method: "DELETE",
        headers: headers(config),
      });
      await removeStorageObject(config, existing.image_path);
    },
  };
}

