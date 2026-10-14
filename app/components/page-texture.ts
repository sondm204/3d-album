import * as THREE from "three";
import { displayDate, type Memory } from "./memories";

function wrap(ctx: CanvasRenderingContext2D, text: string, y: number, maxWidth: number, lineHeight: number, maxLines = 4) {
  let lineY = y;
  let count = 0;
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        count++;
        if (count === maxLines) { ctx.fillText(line + "…", 450, lineY, maxWidth); return; }
        ctx.fillText(line, 450, lineY, maxWidth); lineY += lineHeight; line = word;
      }
      else line = candidate;
    }
    count++;
    ctx.fillText(line, 450, lineY, maxWidth); lineY += lineHeight;
    if (count >= maxLines) return;
  }
}

export type PageTexture = THREE.CanvasTexture & { setHover: (amount: number) => void };

export function makePage(memory: Memory | undefined, index: number, status = "", canAdd = false): PageTexture {
  const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 1170;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f2eddf"; ctx.fillRect(0, 0, 900, 1170);
  // Deterministic paper grain, generated once per page.
  for (let i = 0; i < 22000; i++) { const x = (i * 127.13) % 900; const y = (i * 53.71) % 1170; ctx.fillStyle = i % 2 ? "#bcae9110" : "#ffffff45"; ctx.fillRect(x, y, 1.3, 1.3); }
  const shadow = ctx.createLinearGradient(index % 2 ? 0 : 900, 0, index % 2 ? 95 : 805, 0);
  shadow.addColorStop(0, "#6e624c35"); shadow.addColorStop(.25, "#84735a12"); shadow.addColorStop(1, "#84735a00");
  ctx.fillStyle = shadow; ctx.fillRect(0, 0, 900, 1170);
  ctx.textAlign = "center"; ctx.fillStyle = "#424c3f"; ctx.font = "19px Arial";
  ctx.fillText(memory ? (memory.place || "NHỮNG ĐIỀU MÌNH MUỐN GIỮ") : "CÒN NHIỀU ĐIỀU ĐẸP ĐẼ PHÍA TRƯỚC", 450, 83);
  ctx.fillStyle = "#515342"; ctx.font = "20px Georgia"; ctx.fillText(String(index + 1).padStart(2, "0"), 450, 1120);
  const paper = document.createElement("canvas"); paper.width = 900; paper.height = 1170;
  paper.getContext("2d")!.drawImage(canvas, 0, 0);
  const texture = new THREE.CanvasTexture(canvas) as PageTexture; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  let hover = 0;
  let loaded: HTMLImageElement | undefined;
  let failed = false;
  const draw = () => {
    ctx.clearRect(0, 0, 900, 1170); ctx.drawImage(paper, 0, 0);
    if (!memory && !canAdd) {
      ctx.fillStyle = "#354538"; ctx.font = "italic 30px Georgia";
      wrap(ctx, status && index === 0 ? status : "Chờ một kỷ niệm mới…", 540, 720, 46);
      texture.needsUpdate = true; return;
    }
    ctx.save(); ctx.translate(450, 435 - hover * 9); ctx.rotate((index % 2 ? .033 : -.045) * (1 - hover * .5));
    ctx.scale(1 + hover * .025, 1 + hover * .025);
    if (!memory) {
      ctx.fillStyle = `rgba(216, 226, 207, ${.3 + hover * .4})`; ctx.fillRect(-340, -285, 680, 642);
      ctx.strokeStyle = hover > .3 ? "#3a6449" : "#68755b"; ctx.lineWidth = 3; ctx.setLineDash([15, 12]);
      ctx.strokeRect(-340, -285, 680, 642); ctx.setLineDash([]);
      ctx.fillStyle = "#354c39"; ctx.font = "56px Georgia"; ctx.fillText("+", 0, 0);
      ctx.font = "italic 32px Georgia"; ctx.fillText("Thêm một kỷ niệm", 0, 65);
      ctx.font = "22px Arial"; ctx.fillText("Bấm để chọn ảnh và viết lời nhắn", 0, 112);
      ctx.restore(); texture.needsUpdate = true; return;
    }
    ctx.shadowColor = "#3a302d55"; ctx.shadowBlur = 20 + hover * 18; ctx.shadowOffsetY = 9 + hover * 8;
    ctx.fillStyle = "#fffcf5"; ctx.fillRect(-340, -285, 680, 642); ctx.shadowColor = "transparent";
    const img = loaded;
    if (img) {
      const ratio = Math.max(628 / img.width, 516 / img.height); const sw = 628 / ratio; const sh = 516 / ratio;
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, -314, -258, 628, 516);
    } else { ctx.fillStyle = "#53684f"; ctx.fillRect(-314, -258, 628, 516); ctx.fillStyle = "#fff"; ctx.font = "24px Arial"; ctx.fillText(failed ? "Ảnh chưa tải được" : "Đang tải ảnh…", 0, 0); }
    if (hover > .01) {
      ctx.fillStyle = `rgba(25, 48, 34, ${hover * .88})`; ctx.fillRect(-314, 204, 628, 54);
      ctx.fillStyle = `rgba(255, 252, 240, ${hover})`; ctx.font = "22px Arial"; ctx.fillText("Bấm để xem / chỉnh sửa", 0, 239);
    }
    ctx.fillStyle = "#303e30"; ctx.font = "italic 34px Georgia"; ctx.fillText(memory.title, 0, 313, 610);
    ctx.fillStyle = "#d0bd9080"; ctx.rotate(-.06); ctx.fillRect(-81, -305, 162, 48);
    ctx.restore();
    ctx.fillStyle = "#30392d"; ctx.font = "italic 30px Georgia"; wrap(ctx, memory.note, 855, 710, 40);
    ctx.fillStyle = "#414c3d"; ctx.font = "22px Arial"; ctx.fillText(displayDate(memory.date), 450, 1045);
    texture.needsUpdate = true;
  };
  texture.setHover = (amount: number) => { if (Math.abs(hover - amount) < .008) return; hover = amount; draw(); };
  draw();
  if (!memory) return texture;
  const img = new Image();
  // Keep storage images origin-clean so their canvas can be uploaded to WebGL.
  img.crossOrigin = "anonymous";
  img.onload = () => { loaded = img; draw(); }; img.onerror = () => { failed = true; draw(); }; img.src = memory.image;
  texture.addEventListener("dispose", () => { img.onload = null; img.onerror = null; });
  return texture;
}
