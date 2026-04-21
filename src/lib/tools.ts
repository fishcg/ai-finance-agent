import { tool } from "ai";
import { z } from "zod";
import { getEmbedding } from "@/lib/embeddings";
import { queryDocuments } from "@/lib/chroma";

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
          ?.map((doc, i) => {
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
      query: z.string().describe("搜索内容"),
    }),
    execute: async ({ query }) => {
      const apiKey = process.env.DASHSCOPE_API_KEY!;
      const baseUrl =
        process.env.DASHSCOPE_BASE_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1";

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen-plus",
          messages: [
            {
              role: "user",
              content: `请搜索并总结以下内容的最新信息：${query}`,
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
};
