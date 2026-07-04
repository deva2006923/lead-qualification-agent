"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Building2, Key, UploadCloud, Loader2, 
  ArrowLeft, CheckCircle2, AlertCircle, FileText
} from "lucide-react";
import clsx from "clsx";

export default function RegisterPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [accessCode,  setAccessCode]  = useState("");
  const [file,        setFile]        = useState(null);
  
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [success,     setSuccess]     = useState(null);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError(null);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("Company Name is required.");
      return;
    }
    if (!file) {
      setError("Please select a leads CSV file to score.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("companyName", companyName.trim());
    formData.append("accessCode", accessCode.trim());
    formData.append("file", file);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed.");

      setSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background gradients */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-amber-600/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] bg-[#d4af37]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-md w-full relative z-10 space-y-6">
        
        {/* Logo Header */}
        <div className="text-center space-y-2">
          <Link href="/login" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wider font-semibold font-mono mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
          </Link>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-600 to-[#d4af37] flex items-center justify-center mx-auto shadow-xl shadow-amber-600/10">
            <Building2 className="w-6 h-6 text-surface-900" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase mt-2">
            REGISTER <span className="text-[#d4af37] font-mono">NEW COMPANY</span>
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto uppercase tracking-widest leading-relaxed">
            Create tenant profile & score your lead database
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-800 border border-white/5 rounded-2xl p-6 shadow-2xl shadow-black/40 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-amber-600/40 via-[#d4af37]/60 to-transparent" />

          {success ? (
            /* Success Display */
            <div className="text-center space-y-5 py-4 animate-fade-in">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto border border-emerald-500/20">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Registration Success</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {success.message}
                </p>
              </div>

              {/* Stored Credentials Card */}
              <div className="bg-surface-900 border border-white/5 p-4 rounded-xl text-left space-y-2.5 font-mono text-xs">
                <div>
                  <span className="text-slate-500">Company Name:</span>
                  <p className="text-white font-bold">{success.companyName}</p>
                </div>
                <div>
                  <span className="text-slate-500">Access Code:</span>
                  <p className="text-[#d4af37] font-bold">{success.accessCode}</p>
                </div>
              </div>

              <button
                onClick={() => router.push("/login")}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#d4af37] hover:bg-[#e5c158] text-surface-900 shadow-md shadow-amber-600/10 transition-colors uppercase tracking-wider"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            /* Form Input */
            <form onSubmit={handleRegister} className="space-y-4">
              
              {/* Error box */}
              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/20 border border-red-500/25 text-xs text-red-400 animate-fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="font-semibold leading-relaxed">{error}</p>
                </div>
              )}

              {/* Company Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Company Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. CloudNine SaaS"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-surface-900 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none focus:border-[#d4af37]/60 focus:ring-1 focus:ring-[#d4af37]/25 transition-all duration-150"
                  />
                </div>
              </div>

              {/* Access Code */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Custom Access Code</label>
                  <span className="text-[9px] text-slate-500 font-mono italic">Optional</span>
                </div>
                <div className="relative">
                  <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    className="w-full bg-surface-900 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none focus:border-[#d4af37]/60 focus:ring-1 focus:ring-[#d4af37]/25 transition-all duration-150"
                  />
                </div>
              </div>

              {/* CSV Upload */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Upload Leads CSV</label>
                <label className={clsx(
                  "flex flex-col items-center justify-center p-5 border border-dashed rounded-xl cursor-pointer hover:bg-white/[0.02] transition-colors relative overflow-hidden",
                  file ? "border-[#d4af37]/60 bg-[#d4af37]/[0.02]" : "border-white/10"
                )}>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <UploadCloud className={clsx("w-7 h-7 mb-2", file ? "text-[#d4af37]" : "text-slate-500")} />
                  {file ? (
                    <div className="text-center">
                      <p className="text-xs font-bold text-slate-200 flex items-center gap-1.5 justify-center">
                        <FileText className="w-3.5 h-3.5 text-[#d4af37]" />
                        {file.name}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div className="text-center space-y-0.5">
                      <p className="text-xs font-semibold text-slate-300">Click to choose CSV file</p>
                      <p className="text-[10px] text-slate-600 max-w-[250px] leading-relaxed mx-auto">
                        Required fields: industry, company_size, website_visits, demo_requested, source.
                      </p>
                    </div>
                  )}
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-600 to-[#d4af37] hover:from-amber-500 hover:to-[#e5c158] text-surface-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-amber-600/10 flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-surface-900" />
                    Analyzing and scoring database...
                  </>
                ) : (
                  "Create Tenant Account"
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
