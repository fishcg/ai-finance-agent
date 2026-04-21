"use client";

import { useChat } from "@ai-sdk/react";
import { Message } from "./message";
import { ToolStatus } from "./tool-status";
import { useState } from "react";

export function Chat() {
  const { messages, sendMessage, setMessages, status } = useChat();
  const [input, setInput] = useState("");

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (input.trim() === "/new") {
      setMessages([]);
      setInput("");
      return;
    }
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto">
      <header className="px-4 py-3 md:px-8 md:py-4 border-b">
        <h1 className="text-xl font-semibold">理财 Agent</h1>
        <p className="text-sm text-gray-500">
          可搜索知识库、联网查询的智能理财助手
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-lg">👋 你好！我是理财 Agent</p>
            <p className="text-sm mt-2">
              我可以搜索知识库、联网查询最新资讯来回答你的理财问题
            </p>
          </div>
        )}
        {messages.map((m) => {
          if (m.role === "user") {
            const text = m.parts
              ?.filter(
                (p): p is { type: "text"; text: string } => p.type === "text"
              )
              .map((p) => p.text)
              .join("");
            if (!text) return null;
            return <Message key={m.id} role="user" content={text} />;
          }

          // Assistant message: render parts sequentially
          return (
            <div key={m.id} className="space-y-2">
              {m.parts?.map((part, i) => {
                if (part.type === "text" && part.text) {
                  return (
                    <Message
                      key={`${m.id}-text-${i}`}
                      role="assistant"
                      content={part.text}
                    />
                  );
                }
                if (part.type.startsWith("tool-")) {
                  return (
                    <ToolStatus
                      key={`${m.id}-tool-${i}`}
                      toolName={part.type.replace("tool-", "")}
                      state={(part as { state: string }).state}
                      input={(part as { input?: { query?: string } }).input}
                    />
                  );
                }
                if (part.type === "step-start") {
                  return null; // don't render step boundaries visually
                }
                return null;
              })}
            </div>
          );
        })}
        {isLoading &&
          !messages.some(
            (m) =>
              m.role === "assistant" &&
              m.parts?.some((p) => p.type.startsWith("tool-"))
          ) && (
            <div className="text-gray-400 text-sm animate-pulse">
              思考中...
            </div>
          )}
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-3 md:px-8 md:py-4 border-t">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的理财问题..."
            className="flex-1 px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  );
}
