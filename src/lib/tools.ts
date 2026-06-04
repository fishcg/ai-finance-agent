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
import { fetchQuote, searchSymbols } from "@/lib/stock-sources";

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
      // Use a faster model for search (configurable separately)
      const searchModel = process.env.SEARCH_MODEL || "qwen-plus";

      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: searchModel,
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
            stream: true,
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!res.ok) {
          return {
            found: false,
            content: `搜索失败: ${res.status}`,
          };
        }

        // Read SSE stream and collect content
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let content = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) content += delta;
            } catch {
              // skip malformed chunks
            }
          }
        }

        return { found: true, content: content || "未获取到搜索结果" };
      } catch (e: any) {
        console.error("[tool:webSearch] error:", e.message);
        if (e.name === "TimeoutError" || e.message?.includes("abort")) {
          return { found: false, content: "联网搜索超时，请稍后重试" };
        }
        return { found: false, content: `搜索失败: ${e.message}` };
      }
    },
  }),

  stockQuery: tool({
    description:
      "查询股票（A股/港股/美股）、基金、ETF 的实时行情数据（价格、涨跌幅、成交量等）。用户提到具体证券代码或想查看某只标的的实时行情时调用。",
    inputSchema: z.object({
      symbols: z
        .array(
          z.object({
            code: z
              .string()
              .describe(
                "证券代码：A股/ETF 用纯数字（600519、000895、510300），可带前缀（sh600519/sz000895）；港股 5 位数字（00700）；美股 ticker（AAPL）；场外基金 6 位数字（001938）"
              ),
            market: z
              .enum(["sh", "sz", "hk", "us", "fund"])
              .optional()
              .describe(
                "市场（可选）：sh=沪市股票/ETF，sz=深市股票/ETF，hk=港股，us=美股，fund=场外基金。A 股可省略，工具会按代码前缀自动判断；港股/美股/基金建议显式传"
              ),
          })
        )
        .describe("要查询的证券列表"),
    }),
    execute: async ({ symbols }) => {
      console.log("[tool:stockQuery] symbols:", symbols);
      const results: string[] = [];

      const settled = await Promise.allSettled(
        symbols.map(({ code, market }) => fetchQuote(code, market))
      );

      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        const { code } = symbols[i];

        if (r.status === "rejected") {
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          results.push(`${code}: 查询失败 (${reason})`);
          continue;
        }

        const q = r.value;
        if (q.kind === "fund") {
          results.push(
            `${q.name}(${q.code}) [场外基金]\n` +
              `  单位净值: ${q.nav.toFixed(4)} | 累计净值: ${q.accNav.toFixed(4)}\n` +
              `  净值日期: ${q.navDate}`
          );
        } else {
          const currency = q.currency || "";
          const vol = q.volume > 10000 ? `${(q.volume / 10000).toFixed(0)}万手` : `${q.volume}手`;
          const amt = q.amount > 100000000
            ? `${(q.amount / 100000000).toFixed(2)}亿`
            : q.amount > 10000
            ? `${(q.amount / 10000).toFixed(2)}万`
            : `${q.amount}`;
          const marketLabel =
            q.market === "hk" ? "港股" : q.market === "us" ? "美股" : q.market === "sh" ? "沪市" : "深市";
          results.push(
            `${q.name}(${q.code}) [${marketLabel}${currency ? ` ${currency}` : ""}]\n` +
              `  最新价: ${q.current.toFixed(2)} | 涨跌幅: ${q.changePct.toFixed(2)}%\n` +
              `  今开: ${q.open.toFixed(2)} | 昨收: ${q.prevClose.toFixed(2)}\n` +
              `  最高: ${q.high.toFixed(2)} | 最低: ${q.low.toFixed(2)}\n` +
              `  成交量: ${vol} | 成交额: ${amt}\n` +
              `  时间: ${q.date} ${q.time}`
          );
        }
      }

      const content = results.join("\n\n");
      console.log("[tool:stockQuery] done, length:", content.length);
      return { found: true, content };
    },
  }),

  searchByKeyword: tool({
    description:
      "按关键词模糊搜索股票/基金/ETF/指数的代码与名称。适合用户问主题/板块/赛道相关标的（例如「锡」「光伏」「半导体」「红利」）但没给具体代码时——先用此工具拿到候选代码列表，再用 stockQuery 取实时行情。也可用名字/拼音/代码片段反查（「茅台」「pingan」「600」）。",
    inputSchema: z.object({
      keyword: z.string().describe("关键词：可以是名称、拼音、代码片段、主题词"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("返回前 N 条，默认 20"),
    }),
    execute: async ({ keyword, limit }) => {
      console.log("[tool:searchByKeyword] keyword:", keyword, "limit:", limit);
      try {
        const hits = await searchSymbols(keyword, limit);
        if (!hits.length) {
          return { found: false, content: `未搜到与「${keyword}」相关的标的` };
        }
        const lines = hits.map((h, i) => {
          const market = h.market.toLowerCase();
          const cat = h.category || h.type;
          return `${i + 1}. ${h.code} ${h.name} [${market}/${cat}]`;
        });
        const content = `关键词「${keyword}」共找到 ${hits.length} 条候选：\n${lines.join("\n")}`;
        console.log("[tool:searchByKeyword] done, hits:", hits.length);
        return { found: true, content };
      } catch (e: any) {
        console.error("[tool:searchByKeyword] error:", e.message);
        return { found: false, content: `搜索失败: ${e.message}` };
      }
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
