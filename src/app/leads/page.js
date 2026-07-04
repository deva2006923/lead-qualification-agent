"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import LeadRow from "@/components/LeadRow";
import {
  Search, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown,
  Loader2, AlertCircle, TrendingUp, Flame, Zap, Shield,
  ChevronLeft, ChevronRight, User, LogOut, Settings
} from "lucide-react";
import clsx from "clsx";

// -------------------------------------------------------------------
// Custom Stat Card (Premium Gold/Amber styling)
// -------------------------------------------------------------------
function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-surface-800 border border-white/5 rounded-2xl p-5 flex items-start gap-4 relative overflow-hidden group hover:border-white/10 transition-all duration-200 shadow-lg shadow-black/35">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-3xl font-extrabold text-white tracking-tight font-mono">{value}</p>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">{label}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-1 font-medium italic">{sub}</p>}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Custom Sort Header (Mono details)
// -------------------------------------------------------------------
function SortHeader({ label, field, currentSort, currentOrder, onSort }) {
  const active = currentSort === field;
  return (
    <button
      onClick={() => onSort(field)}
      className="table-header flex items-center gap-1.5 hover:text-[#d4af37] transition-colors font-mono text-[11px] uppercase tracking-wider"
    >
      {label}
      {active ? (
        currentOrder === "desc"
          ? <ArrowDown className="w-3.5 h-3.5 text-[#d4af37]" />
          : <ArrowUp className="w-3.5 h-3.5 text-[#d4af37]" />
      ) : (
        <ArrowUpDown className="w-3.5 h-3.5 opacity-30 group-hover:opacity-60 transition-opacity" />
      )}
    </button>
  );
}

// -------------------------------------------------------------------
// Main Page
// -------------------------------------------------------------------
export default function LeadsPage() {
  const [leads,      setLeads]      = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [sort,       setSort]       = useState("conversion_probability");
  const [order,      setOrder]      = useState("desc");
  const [filter,     setFilter]     = useState("");
  const [search,     setSearch]     = useState("");
  const [searchInput,setSearchInput]= useState("");
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);

  // Authenticated Sales Rep
  const [user, setUser] = useState(null);
  
  const router = useRouter();
  const LIMIT = 50;

  // Authentication check
  useEffect(() => {
    const stored = localStorage.getItem("lead_iq_user");
    if (!stored) {
      router.push("/login");
    } else {
      setUser(JSON.parse(stored));
    }
  }, [router]);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sort,
        order,
        page,
        limit: LIMIT,
        company_name: user.companyName,
        ...(filter && { filter }),
        ...(search && { search }),
      });
      const res  = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to load leads");

      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);

      // Populate analytics stats
      if (data.leads) {
        setStats({
          hot:   data.leads.filter((l) => l.priority === "hot").length,
          warm:  data.leads.filter((l) => l.priority === "warm").length,
          cold:  data.leads.filter((l) => l.priority === "cold").length,
          spike: data.leads.filter((l) => l.engagement_spike).length,
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sort, order, filter, search, page, user]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Search with debounce
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleSort = (field) => {
    if (sort === field) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSort(field);
      setOrder("desc");
    }
    setPage(1);
  };

  const handleFilter = (f) => {
    setFilter((prev) => (prev === f ? "" : f));
    setPage(1);
  };

  const handleLogout = () => {
    localStorage.removeItem("lead_iq_user");
    router.push("/login");
  };

  const FILTER_BTNS = [
    { key: "hot",  label: "🔥 Hot (≥70%)",  cls: "border-amber-600/30 text-amber-500 data-[active=true]:bg-amber-600/15" },
    { key: "warm", label: "📈 Warm (40-70%)", cls: "border-slate-500/30 text-slate-400 data-[active=true]:bg-slate-500/15" },
    { key: "cold", label: "❄️ Cold (<40%)", cls: "border-sky-700/20 text-sky-500 data-[active=true]:bg-sky-500/10" },
  ];

  if (!user) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#d4af37]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900 text-slate-100 font-sans">
      <Navbar />

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Dashboard Profile Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              QUALIFIED <span className="text-[#d4af37] font-mono">PIPELINE</span>
            </h1>
            <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest">
              ML-Driven Priority Routing & Intelligence Console
            </p>
          </div>
          
          {/* User Session Bar */}
          <div className="flex items-center gap-3 bg-surface-800 p-2.5 rounded-xl border border-white/5 shadow-lg shadow-black/25">
            <div className="flex items-center gap-2 border-r border-white/5 pr-4 mr-1">
              <div className="w-7 h-7 rounded-lg bg-[#d4af37]/10 flex items-center justify-center border border-[#d4af37]/20">
                <User className="w-4 h-4 text-[#d4af37]" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-white leading-tight">{user.companyName}</p>
                <p className="text-[9px] font-semibold text-slate-500 font-mono leading-none tracking-widest uppercase">{user.companyId}</p>
              </div>
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => router.push("/admin")}
                className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                title="System settings/upload"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleLogout}
                className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Hot Pipeline"      value={stats.hot}   icon={Flame}      color="bg-amber-600/10 border-amber-600/30 text-amber-500" />
            <StatCard label="Warm Nurturing"   value={stats.warm}  icon={TrendingUp} color="bg-slate-700/20 border-slate-600/30 text-slate-400" />
            <StatCard label="Cold Prospects"    value={stats.cold}  icon={Shield}     color="bg-sky-950/20 border-sky-800/20 text-sky-500" />
            <StatCard label="Engagement Spikes" value={stats.spike} sub="Accelerated Activity" icon={Zap} color="bg-[#d4af37]/10 border-[#d4af37]/20 text-[#d4af37]" />
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Search box */}
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
            <input
              type="text"
              placeholder="Filter company, industry, source…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-surface-800 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-[#d4af37]/60 focus:ring-1 focus:ring-[#d4af37]/25 transition-all duration-150"
            />
          </div>

          {/* Priority pills */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <SlidersHorizontal className="w-4 h-4 text-slate-600 hidden sm:inline flex-shrink-0" />
            {FILTER_BTNS.map(({ key, label, cls }) => (
              <button
                key={key}
                data-active={filter === key}
                onClick={() => handleFilter(key)}
                className={clsx(
                  "px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 shadow-sm",
                  "bg-surface-800 border-white/5 hover:border-white/10 text-slate-400 hover:text-slate-200",
                  cls,
                  filter === key && "!bg-opacity-100 !border-opacity-60"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Leads Table Card */}
        <div className="bg-surface-800 border border-white/5 rounded-2xl overflow-hidden shadow-xl shadow-black/20">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-[#d4af37]" />
              <p className="text-xs uppercase tracking-widest font-semibold font-mono">Syncing Database...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-red-500 font-bold tracking-tight">{error}</p>
              <p className="text-slate-500 text-xs max-w-sm">
                If the database cache is empty, ask the administrator to upload the custom lead list via settings.
              </p>
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-500 text-center space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">No leads assigned</p>
              <p className="text-xs text-slate-600 max-w-xs">You have caught up with all your leads, or they are filtered out.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-surface-900/60">
                    <th className="w-8 px-4 py-4" />
                    <th className="table-header">ID</th>
                    <th className="table-header">Company Name</th>
                    <th className="table-header">Scale</th>
                    <th className="table-header">Sector</th>
                    <SortHeader
                      label="Conversion Probability" field="conversion_probability"
                      currentSort={sort} currentOrder={order} onSort={handleSort}
                    />
                    <th className="table-header">Rating</th>
                    <SortHeader
                      label="Visits (7d)" field="website_visits"
                      currentSort={sort} currentOrder={order} onSort={handleSort}
                    />
                    <th className="table-header">Demo</th>
                    <th className="table-header">Channel</th>
                    <th className="table-header">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {leads.map((lead, i) => (
                    <LeadRow key={lead.lead_id} lead={lead} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paginated Footer */}
        {totalPages > 1 && !loading && !error && (
          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <p>
              Records {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total.toLocaleString()} leads
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="bg-surface-800 hover:bg-surface-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-white/5 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1.5 bg-surface-900 border border-white/5 rounded-lg text-slate-300 font-semibold">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="bg-surface-800 hover:bg-surface-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-white/5 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
