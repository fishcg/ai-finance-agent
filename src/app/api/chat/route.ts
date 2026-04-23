import { createOpenAI } from "@ai-sdk/openai";
import { streamText, UIMessage, convertToModelMessages, stepCountIs } from "ai";
import { getAgentSystemPrompt } from "@/lib/prompts";
import { tools } from "@/lib/tools";

const dashscope = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY!,
  baseURL:
    process.env.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  fetch: async (url, options) => {
    // Log the request body to see what's being sent to DashScope
    if (options?.body) {
      try {
        const body = JSON.parse(options.body as string);
        console.log("[dashscope] request messages count:", body.messages?.length);
        // Log tool role messages specifically
        body.messages?.forEach((m: { role: string; content?: unknown }, i: number) => {
          if (m.role === "tool") {
            console.log(`[dashscope] message[${i}] role=tool:`, JSON.stringify(m).substring(0, 500));
          }
        });
      } catch {}
    }
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.text();
      console.error("[dashscope] HTTP error:", res.status, body);
      return new Response(body, { status: res.status, headers: res.headers });
    }
    // Tee the stream to log all SSE events
    const [stream1, stream2] = res.body!.tee();
    const reader = stream2.getReader();
    const decoder = new TextDecoder();
    (async () => {
      let chunks = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks += decoder.decode(value, { stream: true });
        }
        // Log all responses for the second call (which has tool results)
        if (chunks.length < 2000) {
          console.log("[dashscope] full response:", chunks);
        } else {
          console.log("[dashscope] response length:", chunks.length);
        }
      } catch {}
    })();
    return new Response(stream1, { status: res.status, headers: res.headers });
  },
});

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: dashscope.chat(process.env.CHAT_MODEL || "qwen-plus"),
    system: getAgentSystemPrompt(),
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
    onStepFinish({ finishReason, text, toolCalls, toolResults, response }) {
      console.log("[agent] step finish", {
        finishReason,
        textLength: text?.length ?? 0,
        toolCalls: toolCalls?.map((tc: { toolName: string }) => tc.toolName),
        toolResultsCount: toolResults?.length ?? 0,
      });
      if (finishReason === "error") {
        console.error("[agent] step error details:", JSON.stringify(response, null, 2));
      }
    },
    onError({ error }) {
      console.error("[agent] error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    },
  });

  return result.toUIMessageStreamResponse();
}
