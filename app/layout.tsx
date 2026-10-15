import type { Metadata } from "next";
import "./globals.css";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";

export const metadata: Metadata = {
  title: "Lưu · Những điều mình muốn giữ",
  description: "Một cuốn album 3D, lưu lại những khoảnh khắc, những câu chuyện và những ngày đáng nhớ của bạn.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
