export const PHOTO_WIDTH = 628;
export const PHOTO_HEIGHT = 516;
export const PHOTO_ASPECT = PHOTO_WIDTH / PHOTO_HEIGHT;
export type CropArea = { x: number; y: number; width: number; height: number };

export async function cropPhoto(source: string, area: CropArea): Promise<File> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = source;
  await image.decode().catch(() => { throw new Error("Không đọc được ảnh. Vui lòng chọn ảnh khác."); });
  if (![area.x, area.y, area.width, area.height].every(Number.isFinite) || area.width <= 0 || area.height <= 0) {
    throw new Error("Vùng cắt ảnh không hợp lệ.");
  }
  const canvas = document.createElement("canvas");
  const scale = Math.min(2, area.width / PHOTO_WIDTH, area.height / PHOTO_HEIGHT);
  canvas.width = Math.max(1, Math.round(PHOTO_WIDTH * scale));
  canvas.height = Math.max(1, Math.round(PHOTO_HEIGHT * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Thiết bị không hỗ trợ cắt ảnh.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error("Không thể cắt ảnh. Vui lòng thử lại.")), "image/jpeg", .94);
  });
  return new File([blob], "memory-cropped.jpg", { type: "image/jpeg" });
}
