"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageProps {
  role: "user" | "assistant" | "system";
  content: string;
}

export function Message({ role, content }: MessageProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] md:max-w-[70%] px-4 py-2.5 rounded-2xl rounded-br-sm text-white text-sm leading-relaxed shadow-lg shadow-indigo-500/10"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
        >
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-[var(--bg-assistant)] border border-[var(--border)]">
        <div className="prose prose-sm md:prose-base prose-invert max-w-none prose-p:text-[var(--text-primary)] prose-p:leading-relaxed prose-headings:text-[var(--text-primary)] prose-headings:font-semibold prose-a:text-[var(--accent)] prose-a:no-underline hover:prose-a:underline prose-strong:text-[var(--gold)] prose-strong:font-semibold prose-code:text-[var(--accent)] prose-code:bg-[var(--accent-dim)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[#13141f] prose-pre:border prose-pre:border-[var(--border)] prose-pre:rounded-xl prose-table:border-collapse prose-th:border prose-th:border-[var(--border-light)] prose-th:px-3 prose-th:py-2 prose-th:bg-[var(--bg-card-alt)] prose-th:text-left prose-th:text-sm prose-th:font-medium prose-th:text-[var(--text-secondary)] prose-td:border prose-td:border-[var(--border)] prose-td:px-3 prose-td:py-2 prose-td:text-sm prose-table:w-full prose-hr:border-[var(--border)] prose-li:text-[var(--text-primary)] prose-li:marker:text-[var(--text-muted)] prose-blockquote:border-l-[var(--accent)] prose-blockquote:text-[var(--text-secondary)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
