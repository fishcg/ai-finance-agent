import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "理财王中王",
  description: "AI 驱动的理财分析 Agent",
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
