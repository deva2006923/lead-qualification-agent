"use client";

import { useState, useCallback } from "react";
import {
  ChevronDown, ChevronRight, Zap, Loader2,
  CheckCircle2, XCircle, Brain, Lightbulb, Mail,
  ExternalLink, TrendingUp, Copy, Check,
} from "lucide-react";
import clsx from "clsx";

// -----------------------------------------------------------
// Render simple markdown: **bold** and • bullets to HTML spans
// -----------------------------------------------------------
function RenderMarkdown({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-slate-300">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        // Bold via **text**
        const rendered = trimmed.replace(
          /\*\*(.+?)\*\*/g,
          (_, m) => `<strong class="text-slate-100 font-bold">${m}</strong>`
        );
        const isBullet = trimmed.startsWith("•") || trimmed.startsWith("-");
        return (
          <p
            key={i}
            className={clsx(isBullet && "pl-3 border-l border-white/10")}
            dangerouslySetInnerHTML={{ __html: rendered }}
          />
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------
// Copy button helper
// -----------------------------------------------------------
function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-surface-800 border border-white/10 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

// -----------------------------------------------------------
// Priority badge
// -----------------------------------------------------------
function PriorityBadge({ priority }) {
  const cfg = {
    hot:  { cls: "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest bg-amber-500/10 text-[#d4af37] border border-[#d4af37]/35 shadow-sm shadow-[#d4af37]/5", label: "Hot" },
    warm: { cls: "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-700/30 text-slate-400 border border-slate-700/50", label: "Warm" },
    cold: { cls: "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-sky-950/15 text-sky-500 border border-sky-900/20", label: "Cold" },
  }[priority] ?? { cls: "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-500", label: "—" };

  return (
    <span className={cfg.cls}>
      {cfg.label}
    </span>
  );
}

// -----------------------------------------------------------
// Score bar
// -----------------------------------------------------------
function ScoreBar({ value }) {
  const pct   = Math.round(value * 100);
  const color = pct >= 70 ? "bg-[#d4af37]" : pct >= 40 ? "bg-slate-400" : "bg-sky-700";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1 bg-surface-900 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono font-bold text-slate-400">{pct}%</span>
    </div>
  );
}

// -----------------------------------------------------------
// Skeleton loader
// -----------------------------------------------------------
function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="shimmer h-3 w-3/4 rounded" />
      <div className="shimmer h-3 w-full rounded" />
      <div className="shimmer h-3 w-5/6 rounded" />
    </div>
  );
}

// -----------------------------------------------------------
// AI Explanation panel
// -----------------------------------------------------------
function ExplanationPanel({ lead }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [fetched, setFetched] = useState(false);

  const fetchExplanation = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/explain-lead", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadData:    lead,
          probability: lead.conversion_probability,
          factors:     lead.top_3_contributing_factors,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setFetched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [lead, fetched]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-brand-400" />
        <h4 className="text-sm font-semibold text-slate-200">AI Priority Explanation</h4>
        {!fetched && !loading && (
          <button
            onClick={fetchExplanation}
            className="ml-auto text-xs text-brand-400 hover:text-brand-300 underline underline-offset-2"
          >
            Generate
          </button>
        )}
      </div>

      {loading && <Skeleton />}
      {error   && <p className="text-xs text-red-400">{error}</p>}
      {data && (
        <div className="space-y-2">
          <RenderMarkdown text={data.explanation} />
          <p className="text-[10px] text-slate-600">
            via {data.provider === "nvidia" ? "NVIDIA NIM" : "Groq"}
          </p>
        </div>
      )}
      {!loading && !data && !error && (
        <p className="text-xs text-slate-500 italic">Click "Generate" to get the AI explanation.</p>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// Recommended Action panel
// -----------------------------------------------------------
function RecommendPanel({ lead }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [fetched, setFetched] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const fetchRecommendation = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    setError(null);
    try {
      // Read logged-in user details from localStorage
      let salesPersonName = "";
      if (typeof window !== "undefined") {
        const storedUser = localStorage.getItem("lead_iq_user");
        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            salesPersonName = parsed.repName || "";
          } catch (_) {}
        }
      }

      const res = await fetch("/api/recommend-action", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          leadProfile: lead, 
          industry: lead.industry,
          salesPersonName
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setFetched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [lead, fetched]);

  const SOURCE_LABELS = {
    "competitor-comparison": "Competitor Guide",
    "pricing-faq":           "Pricing FAQ",
    "case-studies":          "Case Studies",
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-amber-400" />
        <h4 className="text-sm font-semibold text-slate-200">Recommended Action</h4>
        {!fetched && !loading && (
          <button
            onClick={fetchRecommendation}
            className="ml-auto text-xs text-brand-400 hover:text-brand-300 underline underline-offset-2"
          >
            Generate
          </button>
        )}
      </div>

      {loading && <Skeleton />}
      {error   && <p className="text-xs text-red-400">{error}</p>}
      {data && (
        <div className="space-y-3">
          <RenderMarkdown text={data.action} />

          {/* Sources */}
          {data.sources?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.sources.map((src) => (
                <span key={src} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-surface-600 text-slate-400 border border-white/5">
                  <ExternalLink className="w-2.5 h-2.5" />
                  {SOURCE_LABELS[src] ?? src}
                </span>
              ))}
            </div>
          )}
          {!data.contextFound && (
            <p className="text-[11px] text-amber-500/80 italic">
              ⚠ No knowledge base context found — answer based on general knowledge only.
            </p>
          )}

          {/* Draft email — always visible with Copy button */}
          {data.draftEmail && (
            <div className="pt-2 border-t border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <Mail className="w-3.5 h-3.5" />
                  Draft Outreach Email
                </div>
                <CopyButton text={data.draftEmail} label="Copy Email" />
              </div>
              <div className="p-3.5 bg-surface-900 rounded-xl border border-white/5 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed shadow-inner">
                {data.draftEmail}
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-600">
            via {data.provider === "nvidia" ? "NVIDIA NIM" : "Groq"}
          </p>
        </div>
      )}
      {!loading && !data && !error && (
        <p className="text-xs text-slate-500 italic">Click "Generate" to get recommendations.</p>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// Feedback buttons
// -----------------------------------------------------------
function FeedbackButtons({ leadId }) {
  const [status,  setStatus]  = useState(null); // null | "loading" | "Converted" | "Not Converted" | "error"
  const [message, setMessage] = useState("");

  const submit = async (outcome) => {
    setStatus("loading");
    try {
      const res = await fetch("/api/feedback", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, outcome }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus(outcome);
      setMessage(data.message);
    } catch (e) {
      setStatus("error");
      setMessage(e.message);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Saving feedback...
      </div>
    );
  }

  if (status === "Converted" || status === "Not Converted") {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {message}
      </div>
    );
  }

  if (status === "error") {
    return <p className="text-xs text-red-400">{message}</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 mr-1">Mark outcome:</span>
      <button
        onClick={() => submit("Converted")}
        className="btn-success"
      >
        <CheckCircle2 className="w-3 h-3" />
        Converted
      </button>
      <button
        onClick={() => submit("Not Converted")}
        className="btn-danger"
      >
        <XCircle className="w-3 h-3" />
        Not Converted
      </button>
    </div>
  );
}

// -----------------------------------------------------------
// Main LeadRow
// -----------------------------------------------------------
export default function LeadRow({ lead, index }) {
  const [expanded, setExpanded] = useState(false);
  const [agentData, setAgentData] = useState(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState(null);
  const [showEmail, setShowEmail] = useState(false);

  const runAgent = async () => {
    setAgentLoading(true);
    setAgentError(null);
    try {
      let salesPersonName = "";
      if (typeof window !== "undefined") {
        const storedUser = localStorage.getItem("lead_iq_user");
        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            salesPersonName = parsed.repName || "";
          } catch (_) {}
        }
      }

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, salesPersonName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Agent execution failed");
      setAgentData(data);
    } catch (e) {
      setAgentError(e.message);
    } finally {
      setAgentLoading(false);
    }
  };

  const factors = (lead.top_3_contributing_factors ?? "")
    .split("|")
    .map((f) => f.trim())
    .filter(Boolean);

  const SOURCE_LABELS = {
    "competitor-comparison": "Competitor Guide",
    "pricing-faq":           "Pricing FAQ",
    "case-studies":          "Case Studies",
  };

  return (
    <>
      {/* Main row */}
      <tr
        onClick={() => setExpanded((v) => !v)}
        className={clsx(
          "cursor-pointer transition-colors duration-150 group relative border-l-2",
          lead.priority === "hot" ? "border-[#d4af37] bg-[#d4af37]/[0.015]" : "border-transparent",
          expanded
            ? "bg-surface-700/60"
            : "hover:bg-surface-700/30"
        )}
      >
        {/* Expand icon */}
        <td className="table-cell w-8 text-slate-500">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-[#d4af37]" />
            : <ChevronRight className="w-4 h-4 group-hover:text-slate-300 transition-colors" />
          }
        </td>

        {/* Lead ID */}
        <td className="table-cell font-mono text-xs text-slate-500">#{lead.lead_id}</td>

        {/* Company Name */}
        <td className="table-cell">
          <span className="text-xs font-semibold text-slate-200 truncate max-w-[140px] block" title={lead.company_name}>
            {lead.company_name || "N/A"}
          </span>
        </td>

        {/* Company Size */}
        <td className="table-cell">
          <span className="text-slate-300 text-xs font-medium">{lead.company_size}</span>
        </td>

        {/* Industry */}
        <td className="table-cell text-slate-400 text-xs">{lead.industry}</td>

        {/* Score */}
        <td className="table-cell">
          <ScoreBar value={lead.conversion_probability} />
        </td>

        {/* Priority */}
        <td className="table-cell">
          <PriorityBadge priority={lead.priority} />
        </td>

        {/* Visits + spike */}
        <td className="table-cell text-xs">
          <div className="flex items-center gap-1.5 font-mono font-bold text-slate-400">
            <span>{lead.website_visits}</span>
            {lead.engagement_spike && (
              <span title="Engagement spike — unusually high visits" className="text-[#d4af37] animate-pulse-slow">
                <Zap className="w-3.5 h-3.5 fill-[#d4af37]/20" />
              </span>
            )}
          </div>
        </td>

        {/* Demo */}
        <td className="table-cell">
          {lead.demo_requested === "Yes" ? (
            <span className="text-emerald-400 font-bold text-xs">✓ Yes</span>
          ) : (
            <span className="text-slate-600 text-xs">No</span>
          )}
        </td>

        {/* Source */}
        <td className="table-cell">
          <span className="text-[10px] font-semibold text-slate-500 bg-surface-900 border border-white/5 px-2.5 py-0.5 rounded-full font-mono uppercase tracking-wider">
            {lead.source}
          </span>
        </td>

        {/* Trend icon */}
        <td className="table-cell">
          <TrendingUp
            className={clsx("w-4 h-4", lead.conversion_probability >= 0.5 ? "text-emerald-400" : "text-slate-600")}
          />
        </td>
      </tr>

      {/* Expanded panel */}
      {expanded && (
        <tr className="bg-surface-800/80">
          <td colSpan={11} className="px-6 py-5">
            <div className="animate-slide-down space-y-5">
              
              {/* Company Profile Header */}
              <div className="border-b border-white/5 pb-4">
                <h3 className="text-lg font-black text-white tracking-tight uppercase">
                  {lead.company_name}
                </h3>
                <p className="text-[9px] text-[#d4af37] font-mono tracking-widest uppercase mt-0.5 font-bold">
                  Corporate Profile · Company ID: {lead.company_id} · Lead ID: #{lead.lead_id}
                </p>
              </div>

              {/* Prior factor indicators */}
              {factors.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 font-mono">
                    Top Contributing Factors
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {factors.map((f, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-1 rounded-lg bg-surface-900 text-slate-400 border border-white/5 font-medium"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent execution controls */}
              {!agentData && !agentLoading && (
                <div className="flex flex-col items-center justify-center p-8 rounded-xl bg-surface-900/40 border border-dashed border-white/10 text-center space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Autonomous Playbook Agent</p>
                    <p className="text-[11px] text-slate-500 max-w-sm leading-relaxed">
                      Deploy the agent to dynamically inspect statistics, search sales playbooks, flag urgency, or draft recommendations.
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); runAgent(); }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-600 to-[#d4af37] hover:from-amber-500 hover:to-[#e5c158] text-surface-900 transition-all duration-150 shadow-md shadow-amber-600/10"
                  >
                    <Brain className="w-4 h-4 text-surface-900" />
                    Run Lead Agent
                  </button>
                </div>
              )}

              {agentLoading && (
                <div className="flex flex-col items-center justify-center p-12 space-y-3 bg-surface-900/20 rounded-xl border border-white/5">
                  <Loader2 className="w-5 h-5 animate-spin text-[#d4af37]" />
                  <p className="text-[10px] font-bold tracking-widest font-mono text-slate-500 uppercase">Agent Reasoning...</p>
                </div>
              )}

              {agentError && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/20 border border-red-500/20 text-xs text-red-400">
                  <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="font-medium leading-relaxed">Agent failed: {agentError}</p>
                  <button onClick={runAgent} className="ml-auto text-[#d4af37] underline font-bold">Retry</button>
                </div>
              )}

              {/* Agent Execution Outputs */}
              {agentData && (
                <div className="space-y-5">
                  
                  {/* Urgency Alert Badge */}
                  {agentData.urgent?.flagged && (
                    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-[#d4af37]/30 text-[#d4af37] animate-pulse-slow">
                      <Zap className="w-4 h-4 flex-shrink-0 mt-0.5 fill-[#d4af37]/10" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider">Urgent Attention Flagged</p>
                        <p className="text-xs mt-1 text-slate-300 font-medium leading-relaxed">{agentData.urgent.reason}</p>
                      </div>
                    </div>
                  )}

                  {/* Muted No-Action Alert Badge */}
                  {agentData.noAction?.needed && (
                    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-surface-900 border border-white/5 text-slate-400">
                      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider">No Follow-up Scheduled</p>
                        <p className="text-xs mt-1 text-slate-500 font-medium leading-relaxed">{agentData.noAction.reason}</p>
                      </div>
                    </div>
                  )}

                  {/* Generated Explanations & Action Recommendations */}
                  {(agentData.explanation || agentData.recommendation) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      
                      {/* Agent Analysis — markdown rendered */}
                      {agentData.explanation && (
                        <div className="p-5 rounded-2xl bg-surface-900 border border-white/5 space-y-3">
                          <h4 className="text-xs font-black uppercase tracking-wider text-[#d4af37] flex items-center gap-1.5">
                            <Brain className="w-4 h-4" />
                            Agent Analysis
                          </h4>
                          <RenderMarkdown text={agentData.explanation} />
                        </div>
                      )}

                      {/* Recommendations & Action playbooks */}
                      {agentData.recommendation && (
                        <div className="p-5 rounded-2xl bg-surface-900 border border-white/5 space-y-4">
                          <h4 className="text-xs font-black uppercase tracking-wider text-[#d4af37] flex items-center gap-1.5">
                            <Lightbulb className="w-4 h-4" />
                            Next Step Playbook
                          </h4>
                          <RenderMarkdown text={agentData.recommendation.action} />

                          {/* Sources list */}
                          {agentData.recommendation.sources?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {agentData.recommendation.sources.map((src) => (
                                <span key={src} className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-800 text-slate-500 border border-white/5">
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  {SOURCE_LABELS[src] ?? src}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Email Draft — always visible + Copy button */}
                          {agentData.recommendation.draftEmail && (
                            <div className="pt-2 border-t border-white/5 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                                  <Mail className="w-3.5 h-3.5" />
                                  Draft Outreach Email
                                </div>
                                <CopyButton text={agentData.recommendation.draftEmail} label="Copy Email" />
                              </div>
                              <div className="p-3.5 bg-surface-800 rounded-xl border border-white/5 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed shadow-inner">
                                {agentData.recommendation.draftEmail}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* EXPANDABLE REASONING TRACE LOG */}
                  {agentData.trace?.length > 0 && (
                    <div className="bg-surface-900/60 rounded-xl p-4 border border-white/5 space-y-2 font-mono text-[10px] text-slate-400">
                      <p className="text-[10px] uppercase font-bold tracking-widest text-[#d4af37] mb-2 font-sans flex items-center gap-1.5">
                        <Brain className="w-3.5 h-3.5" />
                        Agent Reasoning Trace Log
                      </p>
                      <div className="space-y-3 border-l border-white/10 pl-3.5 ml-2.5">
                        {agentData.trace.map((step, idx) => (
                          <div key={idx} className="relative">
                            {/* Timeline bullet */}
                            <div className="absolute -left-[19.5px] top-1 w-2 h-2 rounded-full bg-[#d4af37] border-2 border-surface-900 shadow-sm" />
                            <p className="font-bold text-slate-300">
                              [Step {idx + 1}] Executed tool: <span className="text-amber-500 font-bold">{step.tool}</span>
                            </p>
                            <p className="text-slate-600 mt-0.5 font-sans">Parameters: {JSON.stringify(step.args)}</p>
                            <p className="text-slate-400 mt-1 pl-2 border-l border-white/10 font-sans leading-relaxed">{step.result}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Feedback outcome updates */}
              <div className="pt-3 border-t border-white/5">
                <FeedbackButtons leadId={lead.lead_id} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
