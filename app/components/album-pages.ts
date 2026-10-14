import { PAGE_WIDTH as W, PAGE_HEIGHT as H } from "./page-geometry.ts";

export const albumSpreadCount = (count: number) => Math.ceil((count + 1) / 2);

/** Match the photo rectangle drawn on each 900 × 1170 page. */
export function photoPageAt(x: number, y: number, spread: number) {
  const index = spread * 2 + (x < 0 ? 0 : 1);
  const px = (x < 0 ? x + W : x) / W * 900 - 450;
  const py = (.5 - y / H) * 1170 - 435;
  const angle = index % 2 ? .033 : -.045;
  const localX = px * Math.cos(angle) + py * Math.sin(angle);
  const localY = -px * Math.sin(angle) + py * Math.cos(angle);
  return Math.abs(localX) <= 340 && localY >= -285 && localY <= 357 ? index : null;
}
