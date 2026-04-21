import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "理财问答助手",
  description: "基于理财高手经验文档的 AI 问答机器人",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
