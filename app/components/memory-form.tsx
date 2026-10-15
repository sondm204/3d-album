"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { cropPhoto, PHOTO_ASPECT, type CropArea } from "./photo-format";
import { saveMemory, updateMemory, deleteMemory, type SavedMemory } from "@/lib/memories";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Props = { memory: SavedMemory | null; onClose: () => void; onSaved: (memory: SavedMemory) => void; onDeleted: (id: string) => void };

export default function MemoryForm({ memory, onClose, onSaved, onDeleted }: Props) {
  const titleInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const id = useRef(memory?.id || "");
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState(memory?.image || "");
  const objectUrl = useRef("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropReady, setCropReady] = useState(false);
  const [editingImage, setEditingImage] = useState(!memory);
  const cropArea = useRef<CropArea | null>(null);

  useEffect(() => {
    return () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;
    const form = new FormData(event.currentTarget);
    const values = { title: String(form.get("title") || "").trim(), note: String(form.get("note") || "").trim(), date: String(form.get("date") || "") };
    if (!values.title) { setError("Hãy đặt tên cho kỷ niệm nhé."); return; }
    if (editingImage && (!preview || !cropArea.current)) { setError("Hãy chọn ảnh và chờ ảnh tải xong để cắt nhé."); return; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      if (!id.current) id.current = crypto.randomUUID();
      const croppedImage = editingImage ? await cropPhoto(preview, cropArea.current!) : undefined;
      const saved = memory ? await updateMemory(memory.id, values, croppedImage) : await saveMemory(croppedImage!, values, id.current);
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
  const errorNotice = error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null;

  return <Dialog open onOpenChange={open => { if (!open && !busyRef.current) onClose(); }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 font-sans [color-scheme:light] sm:max-w-lg data-open:animate-none data-closed:animate-none" showCloseButton={false}
      onOpenAutoFocus={event => { event.preventDefault(); titleInput.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLCanvasElement>(".album-stage canvas")?.focus(); }}
      onInteractOutside={event => { if (busyRef.current) event.preventDefault(); }}
      onEscapeKeyDown={event => { if (busyRef.current) event.preventDefault(); }}>
      <DialogHeader className="pr-8">
        <DialogTitle className="text-xl">{memory ? "Chỉnh sửa kỷ niệm" : "Thêm kỷ niệm"}</DialogTitle>
        <DialogDescription>{memory ? "Cập nhật thông tin của kỷ niệm này." : "Chọn ảnh và ghi lại khoảnh khắc của bạn."}</DialogDescription>
      </DialogHeader>
      <Button type="button" variant="ghost" size="icon-sm" className="absolute right-4 top-4" aria-label="Đóng form" onClick={onClose} disabled={busy}><X/></Button>
      <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <fieldset className="min-w-0 space-y-5" disabled={busy}>
          <div className="space-y-2">
            <Label htmlFor="memory-image">{memory ? "Thay ảnh kỷ niệm" : "Ảnh kỷ niệm"}</Label><Input ref={imageInput} id="memory-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required={!memory} aria-describedby="memory-image-hint" onChange={event => {
              const file = event.target.files?.[0];
              setError("");
              if (!file) return;
              if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { event.target.value = ""; setError("Chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MB."); return; }
              if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
              cropArea.current = null; setCropReady(false); setCrop({ x: 0, y: 0 }); setZoom(1); setEditingImage(true);
              objectUrl.current = URL.createObjectURL(file); setPreview(objectUrl.current);
            }}/><p id="memory-image-hint" className="text-xs text-muted-foreground">JPG, PNG hoặc WebP, tối đa 10 MB.</p>
            {memory && <div className="flex gap-2">
              {!editingImage && <Button type="button" variant="outline" onClick={() => { setEditingImage(true); setCropReady(false); cropArea.current = null; setCrop({ x: 0, y: 0 }); setZoom(1); }}>Cắt lại ảnh hiện tại</Button>}
              {editingImage && <Button type="button" variant="outline" onClick={() => { setEditingImage(false); setPreview(memory.image); setError(""); cropArea.current = null; setCropReady(false); if (imageInput.current) imageInput.current.value = ""; }}>Giữ ảnh cũ</Button>}
            </div>}
            {preview && (!editingImage ? <div className="rounded-lg border bg-muted bg-contain bg-center bg-no-repeat" style={{ aspectRatio: PHOTO_ASPECT, backgroundImage: `url("${preview}")` }} role="img" aria-label={memory?.title || "Ảnh kỷ niệm"}/> : <div className="space-y-3">
              <div className={`relative overflow-hidden rounded-lg bg-black ${busy ? "pointer-events-none" : ""}`} style={{ aspectRatio: PHOTO_ASPECT }} aria-label="Kéo ảnh để chọn vùng cắt">
                <Cropper key={preview} image={preview} crop={crop} zoom={zoom} aspect={PHOTO_ASPECT} onCropChange={setCrop} onZoomChange={setZoom} zoomWithScroll={false} disableAutomaticStylesInjection
                  onCropAreaChange={(_area, pixels) => { cropArea.current = pixels; setCropReady(true); }}
                  onMediaLoaded={() => setError("")}
                  mediaProps={{ crossOrigin: "anonymous", onError: () => { cropArea.current = null; setCropReady(false); setError("Không đọc được ảnh. Vui lòng chọn ảnh khác."); } }}/>
              </div>
              <div className="space-y-2"><Label htmlFor="memory-zoom">Phóng to ảnh</Label><Input id="memory-zoom" type="range" min={1} max={3} step={.01} value={zoom} onChange={event => setZoom(Number(event.target.value))} aria-valuetext={`${Math.round(zoom * 100)}%`} className="h-6 border-0 p-0"/></div>
              <p className="text-xs text-muted-foreground">Kéo để căn ảnh, dùng thanh trượt hoặc chụm hai ngón để thu phóng. Ảnh được cắt đúng khung album khi lưu.</p>
            </div>)}
          </div>
          <div className="space-y-2"><Label htmlFor="memory-title">Tên kỷ niệm</Label><Input ref={titleInput} id="memory-title" name="title" defaultValue={memory?.title || ""} maxLength={120} required placeholder="Nhập tên kỷ niệm"/></div>
          <div className="space-y-2"><Label htmlFor="memory-date">Ngày kỷ niệm</Label><Input id="memory-date" name="date" type="date" defaultValue={memory?.date || localDate} required/></div>
          <div className="space-y-2"><Label htmlFor="memory-note">Lời nhắn</Label><Textarea id="memory-note" name="note" defaultValue={memory?.note || ""} maxLength={1200} rows={4} className="min-h-28 resize-y" placeholder="Viết lời nhắn cho kỷ niệm này…" aria-describedby="memory-note-hint"/><p id="memory-note-hint" className="text-xs text-muted-foreground">Không bắt buộc · tối đa 1.200 ký tự</p></div>
        <DialogFooter className="m-0 rounded-none border-t bg-transparent px-0 pb-0 pt-5">
          {memory && <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => { setError(""); setConfirmDelete(true); }}><Trash2/>Xóa</Button>}
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={editingImage && !cropReady}>{busy && <LoaderCircle className="animate-spin"/>}{busy ? "Đang xử lý…" : memory ? "Lưu thay đổi" : "Lưu kỷ niệm"}</Button>
        </DialogFooter>
      </fieldset>
      {!confirmDelete && errorNotice}
      <span className="sr-only" role="status">{busy ? "Đang xử lý, vui lòng chờ." : ""}</span>
      </form>
      <AlertDialog open={confirmDelete} onOpenChange={open => { if (!busyRef.current) setConfirmDelete(open); }}>
        <AlertDialogContent className="font-sans [color-scheme:light]" onEscapeKeyDown={event => { if (busyRef.current) event.preventDefault(); }}>
          <AlertDialogHeader><AlertDialogTitle>Xóa kỷ niệm này?</AlertDialogTitle><AlertDialogDescription>Kỷ niệm và ảnh sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.</AlertDialogDescription></AlertDialogHeader>
          {errorNotice}
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Giữ lại</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={event => { event.preventDefault(); void remove(); }}>{busy && <LoaderCircle className="animate-spin"/>}{busy ? "Đang xóa…" : "Xóa kỷ niệm"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  </Dialog>;
}
