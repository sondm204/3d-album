export class MemoryValidationError extends Error {}

export type MemoryInput = {
  id: string;
  title: string;
  note: string;
  date: string;
};

export type ValidatedImage = {
  bytes: Buffer;
  extension: "jpg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

export function validateMemoryFields(input: MemoryInput) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) {
    throw new MemoryValidationError("Mã kỷ niệm không hợp lệ.");
  }
  if (!input.title || input.title.length > 120 || input.note.length > 1200) {
    throw new MemoryValidationError("Tiêu đề tối đa 120 ký tự, ghi chú tối đa 1200 ký tự.");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !Number.isFinite(Date.parse(input.date)) ||
    new Date(input.date).toISOString().slice(0, 10) !== input.date
  ) {
    throw new MemoryValidationError("Ngày kỷ niệm không hợp lệ.");
  }
}

export async function validateImage(image: FormDataEntryValue | null): Promise<ValidatedImage> {
  if (!(image instanceof File) || image.size < 1 || image.size > 10 * 1024 * 1024) {
    throw new MemoryValidationError("Chọn ảnh tối đa 10 MB.");
  }
  const bytes = Buffer.from(await image.arrayBuffer());
  const extension = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "jpg"
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png"
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "webp" : null;
  if (!extension) throw new MemoryValidationError("Chỉ nhận ảnh JPG, PNG hoặc WebP.");
  const contentType = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[extension] as ValidatedImage["contentType"];
  if (image.type !== contentType) throw new MemoryValidationError("Chỉ nhận ảnh JPG, PNG hoặc WebP.");
  return { bytes, extension, contentType };
}

export function memoryInputFromForm(form: FormData): MemoryInput {
  return {
    id: String(form.get("id") ?? ""),
    title: String(form.get("title") ?? "").trim(),
    note: String(form.get("note") ?? "").trim(),
    date: String(form.get("date") ?? ""),
  };
}
