"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { saveMemory, updateMemory, deleteMemory, type SavedMemory } from "@/lib/memories";
import styles from "./memory-form.module.css";

type Props = { memory: SavedMemory | null; onClose: () => void; onSaved: (memory: SavedMemory) => void; onDeleted: (id: string) => void };

export default function MemoryForm({ memory, onClose, onSaved, onDeleted }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useRef(memory?.id || "");
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState(memory?.image || "");
  const objectUrl = useRef("");

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); previousFocus?.focus(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;
    const form = new FormData(event.currentTarget);
    const values = { title: String(form.get("title") || "").trim(), note: String(form.get("note") || "").trim(), date: String(form.get("date") || "") };
    if (!values.title) { setError("Hãy đặt tên cho kỷ niệm nhé."); return; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      if (!id.current) id.current = crypto.randomUUID();
      const saved = memory ? await updateMemory(memory.id, values) : await saveMemory(form.get("image") as File, values, id.current);
      onSaved(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu kỷ niệm."); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const remove = async () => {
    if (!memory || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try { await deleteMemory(memory.id); onDeleted(memory.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xóa kỷ niệm."); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby="memory-form-title" aria-describedby="memory-form-description" onCancel={event => { event.preventDefault(); if (!busyRef.current) onClose(); }}>
    <form className={styles.form} onSubmit={submit}>
      <header className={styles.header}><div><h2 id="memory-form-title" className={styles.title}>{memory ? "Chỉnh sửa kỷ niệm" : "Thêm kỷ niệm"}</h2><p id="memory-form-description" className={styles.description}>{memory ? "Cập nhật thông tin của kỷ niệm này." : "Chọn ảnh và ghi lại khoảnh khắc của bạn."}</p></div><button type="button" className={styles.close} aria-label="Đóng form" onClick={onClose} disabled={busy}>×</button></header>
      <fieldset className={styles.fieldset} disabled={busy}>
        <div className={styles.fields}>
          <div>
            {!memory && <label className={styles.field}>Ảnh kỷ niệm<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required onChange={event => {
              const file = event.target.files?.[0];
              setError("");
              if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = ""; }
              setPreview("");
              if (!file) return;
              if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { event.target.value = ""; setError("Chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MB."); return; }
              objectUrl.current = URL.createObjectURL(file); setPreview(objectUrl.current);
            }}/><small className={styles.hint}>JPG, PNG hoặc WebP, tối đa 10 MB.</small></label>}
            {preview && <div className={styles.preview} role="img" aria-label={memory?.title || "Ảnh xem trước"} style={{ backgroundImage: `url("${preview}")` }}/>}
          </div>
          <label className={styles.field}>Tên kỷ niệm<input name="title" defaultValue={memory?.title || ""} maxLength={120} required placeholder="Nhập tên kỷ niệm" autoFocus/></label>
          <label className={styles.field}>Ngày kỷ niệm<input name="date" type="date" defaultValue={memory?.date || localDate} required/></label>
          <label className={styles.field}>Lời nhắn<textarea name="note" defaultValue={memory?.note || ""} maxLength={1200} rows={4} placeholder="Viết lời nhắn cho kỷ niệm này…"/><small className={styles.hint}>Không bắt buộc · tối đa 1.200 ký tự</small></label>
        </div>
        {confirmDelete && <div className={styles.confirm} role="alert"><p>Xóa kỷ niệm này cùng ảnh? Thao tác này không thể hoàn tác.</p><button type="button" className={styles.danger} onClick={remove}>Xóa kỷ niệm</button><button type="button" onClick={() => setConfirmDelete(false)}>Giữ lại</button></div>}
        <footer className={styles.footer}>{memory && !confirmDelete && <button type="button" className={styles.delete} onClick={() => setConfirmDelete(true)}>Xóa</button>}<button type="button" onClick={onClose}>Hủy</button><button type="submit" className={styles.save}>{busy ? "Đang xử lý…" : memory ? "Lưu thay đổi" : "Lưu kỷ niệm"}</button></footer>
      </fieldset>
      <p className={styles.error} role="alert">{error}</p>
      <span className={styles.srOnly} role="status">{busy ? "Đang xử lý, vui lòng chờ." : ""}</span>
    </form>
  </dialog>, document.body);
}
