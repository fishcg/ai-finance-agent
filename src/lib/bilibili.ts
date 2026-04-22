import { execFile } from "child_process";
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import { homedir } from "os";
import path from "path";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

// Use curl to avoid Bilibili 412 anti-bot detection
function curlGet(
  url: string,
  cookie?: string,
  referer?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-s", "-H", `User-Agent: ${UA}`];
    if (referer) args.push("-H", `Referer: ${referer}`);
    if (cookie) args.push("-b", cookie);
    args.push(url);
    execFile("curl", args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

async function curlGetJSON(
  url: string,
  cookie?: string,
  referer?: string
): Promise<any> {
  const raw = await curlGet(url, cookie, referer);
  return JSON.parse(raw);
}

export async function readSessdata(): Promise<string> {
  // 优先从环境变量读取
  if (process.env.BILIBILI_SESSDATA) {
    return process.env.BILIBILI_SESSDATA;
  }
  // fallback 到配置文件
  const cookiePath = path.join(homedir(), ".config", "bilibili-cookie");
  try {
    const content = await readFile(cookiePath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.trim().match(/BILIBILI_SESSDATA=['"']?([^'"\\n]+)/);
      if (m) return m[1];
    }
  } catch {}
  throw new Error(
    "BILIBILI_SESSDATA 未配置。请在 .env.local 中设置 BILIBILI_SESSDATA，或在 ~/.config/bilibili-cookie 中配置"
  );
}

export async function getBuvid(): Promise<{ buvid3: string; buvid4: string }> {
  const data = await curlGetJSON(
    "https://api.bilibili.com/x/frontend/finger/spi"
  );
  return { buvid3: data.data.b_3, buvid4: data.data.b_4 };
}

function getMixinKey(raw: string): string {
  return MIXIN_KEY_ENC_TAB.reduce((s, i) => s + raw[i], "").slice(0, 32);
}

export async function getWbiKeys(
  cookie: string
): Promise<{ imgKey: string; subKey: string }> {
  const data = await curlGetJSON(
    "https://api.bilibili.com/x/web-interface/nav",
    cookie
  );
  const wbi = data.data.wbi_img;
  const imgKey = wbi.img_url.split("/").pop()!.split(".")[0];
  const subKey = wbi.sub_url.split("/").pop()!.split(".")[0];
  return { imgKey, subKey };
}

export function wbiSign(
  params: Record<string, string | number>,
  imgKey: string,
  subKey: string
): Record<string, string | number> {
  const mk = getMixinKey(imgKey + subKey);
  const signed: Record<string, string | number> = { ...params, wts: Math.floor(Date.now() / 1000) };
  const sorted = Object.keys(signed)
    .sort()
    .reduce(
      (acc, k) => {
        acc[k] = signed[k];
        return acc;
      },
      {} as Record<string, string | number>
    );
  const query = new URLSearchParams(
    Object.entries(sorted).map(([k, v]) => [k, String(v)])
  ).toString();
  const wRid = createHash("md5")
    .update(query + mk)
    .digest("hex");
  return { ...sorted, w_rid: wRid };
}

export async function getVideoInfo(
  bvid: string,
  cookie: string
): Promise<{ title: string; cid: number; upMid: number }> {
  const data = await curlGetJSON(
    `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    cookie
  );
  if (data.code !== 0) throw new Error(`getVideoInfo failed: ${data.message}`);
  return {
    title: data.data.title,
    cid: data.data.cid,
    upMid: data.data.owner.mid,
  };
}

export async function getAiSummary(
  bvid: string,
  cid: number,
  upMid: number,
  cookie: string,
  imgKey: string,
  subKey: string
): Promise<{ summary: string; outline: any[] } | null> {
  const params = wbiSign({ bvid, cid, up_mid: upMid }, imgKey, subKey);
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const data = await curlGetJSON(
    `https://api.bilibili.com/x/web-interface/view/conclusion/get?${qs}`,
    cookie
  );
  if (data.code !== 0) return null;
  const d = data.data;
  if (d.code !== 0) return null;
  const mr = d.model_result;
  return {
    summary: mr?.summary || "",
    outline: mr?.outline || [],
  };
}

export async function getSubtitles(
  bvid: string,
  cid: number,
  cookie: string
): Promise<string | null> {
  const data = await curlGetJSON(
    `https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${cid}`,
    cookie
  );
  const subs = data?.data?.subtitle?.subtitles;
  if (!subs || subs.length === 0) return null;

  // Prefer Chinese subtitles
  let target = subs.find((s: any) => s.lan?.includes("zh")) || subs[0];
  let subUrl: string = target.subtitle_url;
  if (subUrl.startsWith("//")) subUrl = "https:" + subUrl;

  const subData = await curlGetJSON(subUrl);
  const body = subData?.body;
  if (!body || body.length === 0) return null;

  return body.map((item: any) => item.content).join(" ");
}

export async function getUpRecentVideos(
  mid: number,
  days: number,
  cookie: string,
  imgKey: string,
  subKey: string
): Promise<Array<{ bvid: string; title: string; created: number }>> {
  const params = wbiSign(
    { mid, order: "pubdate", pn: 1, ps: 30 },
    imgKey,
    subKey
  );
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
  const data = await curlGetJSON(
    `https://api.bilibili.com/x/space/wbi/arc/search?${qs}`,
    cookie,
    `https://space.bilibili.com/${mid}/video`
  );
  if (data.code !== 0)
    throw new Error(`getUpRecentVideos failed: ${data.message}`);

  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const vlist = data.data?.list?.vlist || [];
  return vlist
    .filter((v: any) => v.created >= cutoff)
    .map((v: any) => ({
      bvid: v.bvid,
      title: v.title,
      created: v.created,
    }));
}
