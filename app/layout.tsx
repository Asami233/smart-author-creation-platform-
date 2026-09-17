import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "智能作者创作平台",
  description: "面向中国网文作者的本地优先写作工作台。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
