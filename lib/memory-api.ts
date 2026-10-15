import { MemoryValidationError, validateMemoryFields } from "./memory-validation.ts";
import type { MemoryInput } from "./memory-validation.ts";
import type { SavedMemory } from "./memories.ts";

type MemoryStore = {
  create(form: FormData): Promise<SavedMemory>;
  update(id: string, input: Omit<MemoryInput, "id">, image?: File): Promise<SavedMemory>;
  delete(id: string): Promise<void>;
};

const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const invalid = error instanceof MemoryValidationError;
  return Response.json({ error: invalid ? error.message : "Không thể lưu thay đổi. Vui lòng thử lại." }, { status: invalid ? 400 : 503, headers });
}

// PUT accepts JSON for text-only changes or multipart with a replacement photo.
export function memoryMutationHandlers(store: MemoryStore) {
  return {
    async POST(request: Request) {
      try {
        if (Number(request.headers.get("content-length")) > 11 * 1024 * 1024) {
          throw new MemoryValidationError("Chọn ảnh tối đa 10 MB.");
        }
        const form = await request.formData().catch(() => { throw new MemoryValidationError("Dữ liệu tải lên không hợp lệ."); });
        return Response.json(await store.create(form), { status: 201, headers });
      } catch (error) { return failure(error); }
    },
    async PUT(request: Request, id: string) {
      try {
        if (Number(request.headers.get("content-length")) > 11 * 1024 * 1024) throw new MemoryValidationError("Chọn ảnh tối đa 10 MB.");
        const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
        const form = multipart ? await request.formData().catch(() => { throw new MemoryValidationError("Dữ liệu tải lên không hợp lệ."); }) : null;
        const body: unknown = form ? Object.fromEntries(form) : await request.json().catch(() => null);
        const image = form?.get("image");
        if (image !== undefined && image !== null && !(image instanceof File)) throw new MemoryValidationError("Ảnh không hợp lệ.");
        if (!body || typeof body !== "object" || !["title", "note", "date"].every(key => typeof (body as Record<string, unknown>)[key] === "string")) {
          throw new MemoryValidationError("Thông tin kỷ niệm không hợp lệ.");
        }
        const { title, note, date } = body as Omit<MemoryInput, "id">;
        const input = { title: title.trim(), note: note.trim(), date };
        validateMemoryFields({ id, ...input });
        return Response.json(await store.update(id, input, image instanceof File ? image : undefined), { headers });
      } catch (error) { return failure(error); }
    },
    async DELETE(_request: Request, id: string) {
      try {
        validateMemoryFields({ id, title: "deleted", note: "", date: "2000-01-01" });
        await store.delete(id);
        return new Response(null, { status: 204, headers });
      } catch (error) { return failure(error); }
    },
  };
}
