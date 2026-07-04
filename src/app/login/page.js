"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Building2, Key, Loader2, AlertCircle, 
  ArrowRight, ShieldCheck, PlusCircle
} from "lucide-react";
import clsx from "clsx";

export default function LoginPage() {
  const router = useRouter();
  
  const [companies,   setCompanies]   = useState([]);
  const [selected,    setSelected]    = useState(null); // Selected company object
  const [accessCode,  setAccessCode]  = useState("");
  
  const [loadingList, setLoadingList] = useState(true);
  const [signingIn,   setSigningIn]   = useState(false);
  const [error,       setError]       = useState(null);

  // Fetch registered companies on load
  useEffect(() => {
    async function getCompanies() {
      try {
        const res = await fetch("/api/companies");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to fetch companies");
        setCompanies(data.companies ?? []);
      } catch (err) {
        setError("Error loading companies list.");
      } finally {
        setLoadingList(false);
      }
    }
    getCompanies();
  }, []);

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!selected) {
      setError("Please select a company from the left panel first.");
      return;
    }
    if (!accessCode.trim()) {
      setError("Access code is required.");
      return;
    }

    setSigningIn(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          companyName: selected.name, 
          accessCode:  accessCode.trim() 
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Authentication failed");

      // Store company credentials session
      localStorage.setItem("lead_iq_user", JSON.stringify({
        companyName: data.companyName,
        companyId:   data.companyId
      }));

      router.push("/leads");
    } catch (err) {
      setError(err.message);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background gradients */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-[#d4af37]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-4xl w-full relative z-10 grid grid-cols-1 md:grid-cols-12 bg-surface-800 border border-white/5 rounded-3xl overflow-hidden shadow-2xl shadow-black/60 min-h-[500px]">
        
        {/* Left Side Panel - Companies Roster Selector */}
        <div className="md:col-span-5 bg-surface-900/60 border-r border-white/5 p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <span className="text-[10px] font-bold text-[#d4af37] font-mono tracking-widest uppercase">Roster Selection</span>
              <h2 className="text-base font-black text-white tracking-tight uppercase mt-0.5">
                REGISTERED <span className="text-slate-400 font-mono">COMPANIES</span>
              </h2>
            </div>

            {loadingList ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-2 text-slate-600">
                <Loader2 className="w-5 h-5 animate-spin text-[#d4af37]" />
                <p className="text-[10px] font-mono uppercase tracking-widest font-bold">Loading Roster...</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                {companies.map((c) => {
                  const isActive = selected?.name === c.name;
                  return (
                    <button
                      key={c.name}
                      onClick={() => {
                        setSelected(c);
                        setAccessCode("");
                        setError(null);
                      }}
                      className={clsx(
                        "w-full text-left p-3.5 rounded-xl border transition-all duration-150 relative group",
                        isActive
                          ? "bg-surface-800 border-[#d4af37]/60 text-white shadow-lg shadow-black/20"
                          : "bg-surface-800/40 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10"
                      )}
                    >
                      {isActive && (
                        <div className="absolute top-1/2 -translate-y-1/2 right-3 w-1.5 h-1.5 rounded-full bg-[#d4af37] animate-pulse-slow" />
                      )}
                      <div className="flex items-center gap-2">
                        <Building2 className={clsx("w-4 h-4", isActive ? "text-[#d4af37]" : "text-slate-500")} />
                        <span className="text-xs font-bold truncate max-w-[170px]">{c.name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add New Company Button */}
          <div className="pt-4 border-t border-white/5 mt-4">
            <Link
              href="/register"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[10px] font-bold border border-dashed border-white/10 hover:border-[#d4af37]/30 hover:bg-[#d4af37]/5 text-slate-400 hover:text-[#d4af37] transition-all duration-150 uppercase tracking-widest font-mono"
            >
              <PlusCircle className="w-4 h-4" />
              Add New Company
            </Link>
          </div>
        </div>

        {/* Right Side Panel - Authentication / Access Code Input */}
        <div className="md:col-span-7 p-8 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#d4af37]/25 to-transparent" />

          {selected ? (
            /* Step 2: Access code verification form */
            <form onSubmit={handleSignIn} className="space-y-6 max-w-sm w-full mx-auto animate-fade-in">
              <div className="space-y-1">
                <div className="w-10 h-10 rounded-xl bg-[#d4af37]/10 flex items-center justify-center border border-[#d4af37]/20">
                  <ShieldCheck className="w-5 h-5 text-[#d4af37]" />
                </div>
                <h2 className="text-lg font-black text-white tracking-tight uppercase mt-2">
                  COMPANY AUTH
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter access code to authorize session for <span className="text-white font-bold">{selected.name}</span>.
                </p>
              </div>

              {/* Error display */}
              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/20 border border-red-500/25 text-xs text-red-400 animate-fade-in">
                  <AlertCircle className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
                  <p className="font-semibold leading-relaxed">{error}</p>
                </div>
              )}

              {/* Access code field */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Access Code</label>
                <div className="relative">
                  <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    className="w-full bg-surface-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none focus:border-[#d4af37]/60 focus:ring-1 focus:ring-[#d4af37]/25 transition-all duration-150"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={signingIn}
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-600 to-[#d4af37] hover:from-amber-500 hover:to-[#e5c158] text-surface-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-amber-600/10 flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                {signingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-surface-900" />
                    Authorizing Credentials...
                  </>
                ) : (
                  <>
                    Authorize Sign In
                    <ArrowRight className="w-4 h-4 text-surface-900" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Step 1 default: Request selection */
            <div className="text-center space-y-4 max-w-sm w-full mx-auto py-12">
              <div className="w-14 h-14 rounded-2xl bg-surface-900 border border-white/5 flex items-center justify-center mx-auto shadow-inner">
                <Building2 className="w-6 h-6 text-slate-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Select A Company</h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[240px] mx-auto">
                  Click a registered company card on the left list panel to load authorization prompt.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
