"use client";

import { useState } from "react";

const TOOL_LABELS: Record<string, string> = {
  searchKnowledgeBase: "搜索知识库",
  webSearch: "联网搜索",
  bilibiliInvestmentDigest: "获取B站视频内容",
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

  return (
    <div className="w-fit">
      <button
        type="button"
        onClick={() => hasOutput && setExpanded(!expanded)}
        className={`flex items-center gap-2 text-sm text-gray-500 px-3 py-1.5 bg-gray-50 rounded-lg w-fit ${
          hasOutput ? "cursor-pointer hover:bg-gray-100 transition-colors" : "cursor-default"
        }`}
      >
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${
            isRunning
              ? "bg-blue-400 animate-pulse"
              : isDone
                ? "bg-green-400"
                : isError
                  ? "bg-red-400"
                  : "bg-gray-300"
          }`}
        />
        <span>
          {isRunning ? `正在${label}` : isDone ? `${label}完成` : label}
          {query && (
            <span className="text-gray-400 ml-1">&quot;{query}&quot;</span>
          )}
        </span>
        {hasOutput && (
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
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
        <div className="mt-1.5 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-600 max-h-80 overflow-y-auto whitespace-pre-wrap break-words border border-gray-100">
          {output.content}
        </div>
      )}
    </div>
  );
}
