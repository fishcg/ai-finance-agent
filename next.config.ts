import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// dev 模式下允许通过本机所有局域网 IPv4 访问（解决 Next.js 16 的跨源拦截）
function localIPv4s(): string[] {
  const ips: string[] = [];
  const ifaces = networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const info of list ?? []) {
      if (info.family === "IPv4" && !info.internal) ips.push(info.address);
    }
  }
  return ips;
}

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: localIPv4s(),
};

export default nextConfig;
