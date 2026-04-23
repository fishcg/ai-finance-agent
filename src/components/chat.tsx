"use client";

import { useChat } from "@ai-sdk/react";
import { Message } from "./message";
import { ToolStatus } from "./tool-status";
import { useState, useRef, useEffect } from "react";

const SUGGESTIONS = [
  "最近 A 股走势如何？",
  "帮我看看 CLS同学最近的投资建议",
  "基金定投有什么策略？",
];

export function Chat() {
  const { messages, sendMessage, setMessages, status } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

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
    <div className="flex flex-col h-screen bg-[var(--bg-page)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="max-w-3xl mx-auto px-5 py-3.5 flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#6366f1] to-[#f0c674]" />
            <span className="relative flex items-center justify-center w-full h-full text-white text-sm font-bold">
              W
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide">
              理财王中王
            </h1>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              知识库 / 联网搜索 / B站视频分析
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 space-y-5">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="mt-16 md:mt-24 space-y-8">
              <div className="text-center space-y-3">
                <div className="relative w-20 h-20 mx-auto rounded-2xl overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#6366f1] via-[#8b5cf6] to-[#f0c674]" />
                  <span className="relative flex items-center justify-center w-full h-full text-white text-3xl font-bold">
                    W
                  </span>
                </div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                  理财王中王
                </h2>
                <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
                  融合知识库检索、实时行情搜索与 B 站投资视频分析的 AI 理财助手
                </p>
              </div>
              {/* Suggestion cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setInput(q)}
                    className="px-4 py-3 text-left text-sm rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-all duration-200"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((m) => {
            if (m.role === "user") {
              const text = m.parts
                ?.filter(
                  (p): p is { type: "text"; text: string } =>
                    p.type === "text"
                )
                .map((p) => p.text)
                .join("");
              if (!text) return null;
              return <Message key={m.id} role="user" content={text} />;
            }
            return (
              <div key={m.id} className="space-y-3">
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
                    const toolPart = part as {
                      state: string;
                      input?: { query?: string };
                      output?: { found?: boolean; content?: string };
                    };
                    return (
                      <ToolStatus
                        key={`${m.id}-tool-${i}`}
                        toolName={part.type.replace("tool-", "")}
                        state={toolPart.state}
                        input={toolPart.input}
                        output={toolPart.output}
                      />
                    );
                  }
                  if (part.type === "step-start") return null;
                  return null;
                })}
              </div>
            );
          })}

          {/* Loading indicator */}
          {isLoading &&
            !messages.some(
              (m) =>
                m.role === "assistant" &&
                m.parts?.some((p) => p.type.startsWith("tool-"))
            ) && (
              <div className="flex items-center gap-2.5 text-[var(--text-muted)] text-sm py-1">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:300ms]" />
                </div>
                <span>思考中</span>
              </div>
            )}
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-[var(--border)] bg-[var(--bg-card)]">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto px-4 py-3 md:px-6"
        >
          <div className="flex gap-2.5 items-center">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入你的理财问题..."
              className="flex-1 px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="relative px-5 py-2.5 rounded-xl text-sm font-medium text-white overflow-hidden disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <span className="relative z-10">发送</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
