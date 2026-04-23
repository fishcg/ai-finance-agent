"use client";

import { useState } from "react";

const TOOL_LABELS: Record<string, string> = {
  searchKnowledgeBase: "知识库检索",
  webSearch: "联网搜索",
  bilibiliInvestmentDigest: "B站视频分析",
};

interface ToolStatusProps {
  toolName: string;
  state: string;
  input?: { query?: string; mid?: number; days?: number };
  output?: { found?: boolean; content?: string };
}

export function ToolStatus({ toolName, state, input, output }: ToolStatusProps) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolName] || toolName;
  const query = input?.query;

  const isRunning =
    state === "input-streaming" || state === "input-available";
  const isDone = state === "output-available";
  const isError = state === "output-error";
  const hasOutput = isDone && output?.content;

  const stateStyles = isRunning
    ? "border-blue-500/30 bg-[var(--blue-dim)] text-[var(--blue)]"
    : isDone
      ? "border-emerald-500/30 bg-[var(--green-dim)] text-[var(--green)]"
      : isError
        ? "border-red-500/30 bg-[var(--red-dim)] text-[var(--red)]"
        : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]";

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={() => hasOutput && setExpanded(!expanded)}
        className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 ${stateStyles} ${
          hasOutput ? "cursor-pointer hover:brightness-110" : "cursor-default"
        }`}
      >
        {/* Dot indicator */}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isRunning
              ? "bg-[var(--blue)] animate-pulse"
              : isDone
                ? "bg-[var(--green)]"
                : isError
                  ? "bg-[var(--red)]"
                  : "bg-[var(--text-muted)]"
          }`}
        />
        <span className="font-medium">
          {isRunning ? `${label}...` : isDone ? `${label}` : label}
        </span>
        {query && (
          <span className="opacity-60 truncate max-w-52">{query}</span>
        )}
        {hasOutput && (
          <svg
            className={`w-3 h-3 opacity-40 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {expanded && hasOutput && (
        <div className="mt-2 px-3.5 py-3 rounded-xl text-xs leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border)] max-h-72 overflow-y-auto whitespace-pre-wrap break-words">
          {output.content}
        </div>
      )}
    </div>
  );
}
