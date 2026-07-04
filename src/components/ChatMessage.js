"use client";

import { Bot, User, ExternalLink } from "lucide-react";
import clsx from "clsx";

const SOURCE_LABELS = {
  "competitor-comparison": "Competitor Guide",
  "pricing-faq":           "Pricing FAQ",
  "case-studies":          "Case Studies",
};

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={clsx(
        "flex gap-3 animate-fade-in",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={clsx(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-brand-600 text-white"
            : "bg-surface-600 text-brand-400 border border-white/10"
        )}
      >
        {isUser
          ? <User className="w-4 h-4" />
          : <Bot className="w-4 h-4" />
        }
      </div>

      {/* Bubble */}
      <div className={clsx("flex flex-col gap-1.5 max-w-[80%]", isUser && "items-end")}>
        <div
          className={clsx(
            "px-4 py-3 rounded-2xl text-sm leading-relaxed",
            isUser
              ? "bg-brand-600 text-white rounded-tr-sm"
              : "bg-surface-700 text-slate-200 border border-white/5 rounded-tl-sm"
          )}
        >
          {message.content}
        </div>

        {/* Sources */}
        {!isUser && message.sources?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {message.sources.map((src) => (
              <span
                key={src}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-surface-600 text-slate-400 border border-white/5"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                {SOURCE_LABELS[src] ?? src}
              </span>
            ))}
          </div>
        )}

        {/* Provider tag */}
        {!isUser && message.provider && (
          <span className="text-[10px] text-slate-600 px-1">
            via {message.provider === "nvidia" ? "NVIDIA NIM" : "Groq"}
          </span>
        )}
      </div>
    </div>
  );
}
