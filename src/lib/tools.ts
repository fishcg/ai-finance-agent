import { tool } from "ai";
import { z } from "zod";
import { getEmbedding } from "@/lib/embeddings";
import { queryDocuments } from "@/lib/chroma";
import {
  readSessdata,
  getBuvid,
  getWbiKeys,
  getUpRecentVideos,
  getVideoInfo,
  getAiSummary,
  getSubtitles,
} from "@/lib/bilibili";

export const tools = {
  searchKnowledgeBase: tool({
    description:
      "从理财知识库中检索相关文档片段，适用于理财投资基础知识、资产配置、投资策略等问题",
    inputSchema: z.object({
      query: z.string().describe("搜索关键词或问题"),
    }),
    execute: async ({ query }) => {
      console.log("[tool:searchKnowledgeBase] query:", query);
      const embedding = await getEmbedding(query);
      console.log("[tool:searchKnowledgeBase] embedding length:", embedding.length);
      const results = await queryDocuments(embedding, 5);
      console.log("[tool:searchKnowledgeBase] results docs count:", results.documents?.[0]?.length);

      const docs =
        results.documents?.[0]
          ?.map((doc: string | null, i: number) => {
            const source =
              results.metadatas?.[0]?.[i]?.source || "未知来源";
            return `[来源: ${source}]\n${doc}`;
          })
          .join("\n\n---\n\n") || "";

      if (!docs) {
        console.log("[tool:searchKnowledgeBase] no docs found");
        return { found: false, content: "未找到相关文档" };
      }
      console.log("[tool:searchKnowledgeBase] returning docs, length:", docs.length);
      return { found: true, content: docs };
    },
  }),

  webSearch: tool({
    description:
      "搜索互联网获取最新资讯、新闻、实时行情数据。适用于用户询问最新市场动态、今日行情、近期新闻等需要实时信息的问题",
    inputSchema: z.object({
      query: z.string().describe("搜索内容，应包含具体的标的名称、代码、时间范围等关键词"),
    }),
    execute: async ({ query }) => {
      const apiKey = process.env.DASHSCOPE_API_KEY!;
      const baseUrl =
        process.env.DASHSCOPE_BASE_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1";

      const today = new Date().toISOString().slice(0, 10);

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.CHAT_MODEL || "qwen-plus",
          messages: [
            {
              role: "system",
              content: `你是一个金融数据搜索助手。今天是 ${today}。你必须严格基于搜索结果回答，禁止使用自身知识补充任何数据。如果搜索结果中没有找到某项数据，直接说明"未搜索到"。回答时必须注明数据来源和日期。`,
            },
            {
              role: "user",
              content: query,
            },
          ],
          enable_search: true,
        }),
      });

      if (!res.ok) {
        return {
          found: false,
          content: `搜索失败: ${res.status}`,
        };
      }

      const data = await res.json();
      const content =
        data.choices?.[0]?.message?.content || "未获取到搜索结果";
      return { found: true, content };
    },
  }),

  bilibiliInvestmentDigest: tool({
    description:
      '获取 B 站 UP 主最近发布视频的 AI 总结和字幕内容，用于分析投资建议。用户提到"投资总结"、"视频分析"、"CLS同学"、"B站UP主"等关键词时调用。',
    inputSchema: z.object({
      mid: z
        .number()
        .optional()
        .default(1575688490)
        .describe("UP 主的 mid，默认 1575688490（CLS同学）"),
      days: z
        .number()
        .optional()
        .default(7)
        .describe("获取最近几天的视频，默认 7"),
    }),
    execute: async ({ mid, days }) => {
      console.log("[tool:bilibiliInvestmentDigest] mid:", mid, "days:", days);
      try {
        const sessdata = await readSessdata();
        const { buvid3, buvid4 } = await getBuvid();
        const cookie = `buvid3=${buvid3}; buvid4=${buvid4}; SESSDATA=${sessdata}`;
        const { imgKey, subKey } = await getWbiKeys(cookie);

        const videos = await getUpRecentVideos(
          mid,
          days,
          cookie,
          imgKey,
          subKey
        );
        console.log(
          "[tool:bilibiliInvestmentDigest] found videos:",
          videos.length
        );

        if (videos.length === 0) {
          return {
            found: false,
            content: `该 UP 主最近 ${days} 天没有发布视频`,
          };
        }

        const results: string[] = [];
        for (const v of videos) {
          const date = new Date(v.created * 1000).toLocaleDateString("zh-CN");
          let videoContent = `## ${v.title}\n发布日期: ${date}\nBV号: ${v.bvid}\n`;

          try {
            const info = await getVideoInfo(v.bvid, cookie);
            const aiResult = await getAiSummary(
              v.bvid,
              info.cid,
              info.upMid,
              cookie,
              imgKey,
              subKey
            );

            if (aiResult?.summary) {
              videoContent += `\nAI 摘要:\n${aiResult.summary}\n`;
              if (aiResult.outline?.length) {
                videoContent += "\n分段提纲:\n";
                for (const seg of aiResult.outline) {
                  const m = Math.floor(seg.timestamp / 60);
                  const s = seg.timestamp % 60;
                  videoContent += `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}] ${seg.title}\n`;
                  for (const pt of seg.part_outline || []) {
                    const pm = Math.floor(pt.timestamp / 60);
                    const ps = pt.timestamp % 60;
                    videoContent += `  [${String(pm).padStart(2, "0")}:${String(ps).padStart(2, "0")}] ${pt.content}\n`;
                  }
                }
              }
            }

            // Always try subtitles for fuller content
            const subtitleText = await getSubtitles(v.bvid, info.cid, cookie);
            if (subtitleText) {
              videoContent += `\n字幕内容:\n${subtitleText}\n`;
            } else if (!aiResult?.summary) {
              videoContent += "\n（该视频无可用 AI 总结和字幕）\n";
            }
          } catch (e: any) {
            console.error(
              `[tool:bilibiliInvestmentDigest] error processing ${v.bvid}:`,
              e.message
            );
            videoContent += `\n（获取内容失败: ${e.message}）\n`;
          }

          results.push(videoContent);
        }

        const content = results.join("\n---\n\n");
        console.log(
          "[tool:bilibiliInvestmentDigest] total content length:",
          content.length
        );
        return { found: true, content };
      } catch (e: any) {
        console.error("[tool:bilibiliInvestmentDigest] error:", e.message);
        if (e.message.includes("SESSDATA")) {
          return {
            found: false,
            content:
              "未找到 B 站凭据。请在 ~/.config/bilibili-cookie 中配置 BILIBILI_SESSDATA",
          };
        }
        return { found: false, content: `获取 B 站视频失败: ${e.message}` };
      }
    },
  }),
};
