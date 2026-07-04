"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ChatMessage from "@/components/ChatMessage";
import {
  Send, Loader2, MessageSquare, Sparkles, BookOpen,
  RotateCcw, ArrowLeft, Settings, LogOut, User
} from "lucide-react";

const SUGGESTED = [
  "How does our pricing compare to Salesforce?",
  "What results did Meridian Financial see?",
  "Do we offer a free trial? What's included?",
  "What's our Enterprise plan price and features?",
  "Which industries convert best according to our case studies?",
];

export default function ChatPage() {
  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [user,         setUser]         = useState(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const router    = useRouter();

  // Authentication guard
  useEffect(() => {
    const stored = localStorage.getItem("lead_iq_user");
    if (!stored) {
      router.push("/login");
    } else {
      setUser(JSON.parse(stored));
    }
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text = input) => {
    const question = text.trim();
    if (!question || loading || !user) return;

    const userMsg = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    const history = messages.slice(-6);

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          question, 
          history,
          companyName: user.companyName,
          companyId:   user.companyId
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat failed");

      const aiMsg = {
        role:     "assistant",
        content:  data.answer,
        sources:  data.sources  ?? [],
        provider: data.provider ?? "unknown",
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      setError(e.message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  const handleLogout = () => {
    localStorage.removeItem("lead_iq_user");
    router.push("/login");
  };

  const isEmpty = messages.length === 0;

  if (!user) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#d4af37]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col text-slate-100 font-sans">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">

        {/* Dashboard Profile Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              AI SALES <span className="text-[#d4af37] font-mono">ASSISTANT</span>
            </h1>
            <p className="text-slate-400 text-[10px] mt-1 uppercase tracking-widest font-semibold">
              Context-Aware Knowledge Base & Playbook Agent
            </p>
          </div>
          
          {/* User Session Bar */}
          <div className="flex items-center gap-3 bg-surface-800 p-2 rounded-xl border border-white/5 shadow-md">
            <div className="flex items-center gap-2 border-r border-white/5 pr-4 mr-1">
              <div className="w-6 h-6 rounded-lg bg-[#d4af37]/10 flex items-center justify-center border border-[#d4af37]/20">
                <User className="w-3.5 h-3.5 text-[#d4af37]" />
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-white leading-tight">{user.companyName}</p>
                <p className="text-[8px] font-semibold text-slate-500 font-mono leading-none tracking-widest uppercase">{user.companyId}</p>
              </div>
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => router.push("/admin")}
                className="w-6.5 h-6.5 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                title="Admin Upload Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleLogout}
                className="w-6.5 h-6.5 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors"
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 bg-surface-800 border border-white/5 rounded-2xl flex flex-col min-h-[500px] max-h-[60vh] overflow-hidden shadow-2xl relative shadow-black/45">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/15 to-transparent" />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
            {isEmpty ? (
              /* Welcome screen */
              <div className="h-full flex flex-col items-center justify-center gap-6 py-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-600 to-[#d4af37] flex items-center justify-center shadow-lg shadow-amber-600/10">
                  <Sparkles className="w-7 h-7 text-surface-900" />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">Playbook Intelligence</h3>
                  <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                    I am grounded in your playbooks, competitor guides, pricing matrices, and case studies. Ask me anything to prepare for your calls.
                  </p>
                </div>

                {/* Suggested questions */}
                <div className="w-full max-w-lg space-y-2">
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    <BookOpen className="w-3.5 h-3.5" />
                    Quick Reference Prompts
                  </div>
                  {SUGGESTED.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(q)}
                      className="w-full text-left px-4 py-2.5 rounded-xl bg-surface-900/60 hover:bg-surface-900 border border-white/5 hover:border-[#d4af37]/30 text-xs text-slate-400 hover:text-white transition-all duration-150"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <ChatMessage key={i} message={msg} />
              ))
            )}

            {/* Loading bubble */}
            {loading && (
              <div className="flex gap-3 animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-surface-900 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-4 h-4 text-[#d4af37] animate-spin" />
                </div>
                <div className="px-4 py-3 bg-surface-900 rounded-2xl rounded-tl-sm border border-white/5">
                  <div className="flex gap-1.5 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-[#d4af37] rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-[#d4af37] rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-[#d4af37] rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex justify-center animate-fade-in">
                <p className="text-xs font-semibold text-red-400 bg-red-950/20 border border-red-500/25 px-3 py-2 rounded-lg">
                  {error}
                </p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-white/5 p-4 bg-surface-900/40">
            <div className="flex gap-3 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about pricing, competitors, case studies…"
                rows={1}
                className="w-full bg-surface-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-[#d4af37]/60 focus:ring-1 focus:ring-[#d4af37]/25 transition-all duration-150 resize-none min-h-[44px] max-h-32 overflow-y-auto"
                style={{ height: "auto" }}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="w-11 h-11 inline-flex items-center justify-center rounded-xl font-bold bg-gradient-to-r from-amber-600 to-[#d4af37] hover:from-amber-500 hover:to-[#e5c158] text-surface-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-amber-600/10 flex-shrink-0"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin text-surface-900" />
                  : <Send className="w-4 h-4 text-surface-900" />
                }
              </button>
            </div>
            <p className="text-[10px] text-slate-600 mt-2 font-mono">
              Press Enter to send · Shift+Enter for new line · Sources cited dynamically
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
