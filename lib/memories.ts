export type SavedMemory = { id: string; title: string; note: string; date: string; image: string; createdAt: string };

export async function loadMemories(signal?: AbortSignal): Promise<SavedMemory[]> {
  const response = await fetch("/api/memories", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Không thể tải kỷ niệm.");
  const result: unknown = await response.json();
  if (!Array.isArray(result) || !result.every(memory =>
    memory && ["id", "title", "note", "date", "image", "createdAt"].every(field => typeof memory[field] === "string")
  )) throw new Error("Dữ liệu kỷ niệm không hợp lệ.");
  return result as SavedMemory[];
}

export async function saveMemory(file: File, values: { title: string; note: string; date: string }, id: string): Promise<SavedMemory> {
  const form = new FormData();
  form.set("image", file);
  form.set("id", id);
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  const response = await fetch("/api/memories", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Không thể lưu kỷ niệm.");
  return result;
}

export async function updateMemory(id: string, values: { title: string; note: string; date: string }): Promise<SavedMemory> {
  const response = await fetch(`/api/memories/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Không thể cập nhật kỷ niệm.");
  return result;
}

export async function deleteMemory(id: string): Promise<void> {
  const response = await fetch(`/api/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error ?? "Không thể xoá kỷ niệm.");
  }
}
