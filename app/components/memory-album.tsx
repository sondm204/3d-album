"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { loadMemories, type SavedMemory } from "@/lib/memories";
import MemoryForm from "./memory-form";
import { albumSpreadCount } from "./album-pages";

const AlbumScene = dynamic(() => import("./album-scene"), { ssr: false });

export default function MemoryAlbum() {
  const [memories, setMemories] = useState<SavedMemory[]>([]);
  const [status, setStatus] = useState("Đang mở những kỷ niệm…");
  const [selected, setSelected] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [initialSpread, setInitialSpread] = useState(0);
  const selectPhoto = useCallback((index: number) => setSelected(index), []);

  useEffect(() => {
    const controller = new AbortController();
    loadMemories(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setMemories(data);
      setStatus("");
    }).catch(() => {
      if (!controller.signal.aborted) setStatus("Chưa tải được kỷ niệm.\nTải lại trang để thử lại nhé.");
    });
    return () => controller.abort();
  }, []);

  return <main className="album-stage" aria-label="Album kỷ niệm" aria-describedby="album-gestures">
    <p id="album-gestures" className="sr-only">
      Cuộn chuột trên album để thu phóng. Kéo phần giữa để xoay.
      Kéo mép hoặc góc ngoài của trang để lật; thả trước giữa chừng để trả trang lại.
      Ở trang đầu, kéo mép trái sang phải để đóng. Ở trang cuối, kéo mép phải sang trái để đóng.
      Kéo mép ngoài của bìa theo chiều ngược lúc đóng để mở lại đúng trang.
      Hai ngón tay để thu phóng trên màn hình cảm ứng.
      Dùng phím mũi tên trái, phải để lật, dấu cộng và trừ để thu phóng, phím Home để đặt lại góc nhìn.
      Bấm ảnh để xem, sửa hoặc xóa. Bấm khung nét đứt để thêm kỷ niệm.
      Enter mở ảnh bên trái, Shift và Enter mở ảnh bên phải.
    </p>
    <AlbumScene key={`${status}:${revision}`} memories={memories} status={status} initialSpread={initialSpread} onSelect={selectPhoto}/>
    {selected !== null && <MemoryForm memory={memories[selected] || null} onClose={() => setSelected(null)} onSaved={saved => {
      const next = [...memories.filter(item => item.id !== saved.id), saved].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      setMemories(next); setInitialSpread(Math.floor(next.findIndex(item => item.id === saved.id) / 2)); setRevision(value => value + 1); setSelected(null);
    }} onDeleted={id => {
      const next = memories.filter(item => item.id !== id);
      setMemories(next); setInitialSpread(Math.min(Math.floor(selected / 2), albumSpreadCount(next.length) - 1)); setRevision(value => value + 1); setSelected(null);
    }}/>} 
  </main>;
}
