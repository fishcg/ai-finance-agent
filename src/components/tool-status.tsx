"use client";

const TOOL_LABELS: Record<string, string> = {
  searchKnowledgeBase: "搜索知识库",
  webSearch: "联网搜索",
};

interface ToolStatusProps {
  toolName: string;
  state: string;
  input?: { query?: string };
}

export function ToolStatus({ toolName, state, input }: ToolStatusProps) {
  const label = TOOL_LABELS[toolName] || toolName;
  const query = input?.query;

  const isRunning =
    state === "input-streaming" || state === "input-available";
  const isDone = state === "output-available";
  const isError = state === "output-error";

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 px-3 py-1.5 bg-gray-50 rounded-lg w-fit">
      <span
        className={`inline-block w-2 h-2 rounded-full ${
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
    </div>
  );
}
