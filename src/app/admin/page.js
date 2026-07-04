"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, ArrowLeft, FileSpreadsheet } from "lucide-react";

export default function AdminPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("lead_iq_user");
    if (!stored) {
      router.push("/login");
    } else {
      setUser(JSON.parse(stored));
    }
  }, [router]);

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setError("");
      setSuccess("");
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body:   formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to upload file");
      }

      setSuccess(data.message ?? "File uploaded and scored successfully.");
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 text-slate-100">
      <Navbar />

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        {/* Back Link */}
        <button
          onClick={() => router.push("/leads")}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-[#d4af37] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </button>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            System <span className="text-[#d4af37]">Administration</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Scoring engine settings, database loads, and custom CSV imports.
          </p>
        </div>

        {/* Upload Panel */}
        <div className="card p-6 border border-white/5 bg-surface-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#d4af37]" />
          
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 mb-4 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#d4af37]" />
            Upload Custom Leads Database
          </h2>

          <p className="text-xs text-slate-500 leading-relaxed mb-6">
            Upload a CSV containing your proprietary leads database. The system will validate all required columns, run predictions through the active ML model (<code className="font-mono text-slate-400">best_model.pkl</code>), automatically generate scores/factors, and update the lead prioritizations dashboard.
          </p>

          {/* Guidelines */}
          <div className="bg-surface-900 rounded-xl p-4 border border-white/5 text-xs text-slate-400 mb-6 space-y-2">
            <p className="font-bold text-slate-300">Required CSV Columns:</p>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] text-slate-500">
              <div>• company_id</div>
              <div>• company_name</div>
              <div>• industry</div>
              <div>• company_size</div>
              <div>• website_visits</div>
              <div>• demo_requested</div>
              <div>• source</div>
              <div>• response_time_hours</div>
              <div>• days_since_last_contact</div>
              <div>• sales_person_id</div>
            </div>
            <p className="text-[10px] text-slate-500 italic mt-2">
              Note: "converted" column is optional. The upload will completely overwrite the existing data.
            </p>
          </div>

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="relative group border border-dashed border-white/10 hover:border-[#d4af37]/30 rounded-xl p-8 text-center bg-surface-900/50 hover:bg-surface-900 transition-all duration-150 cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={loading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <UploadCloud className="w-10 h-10 mx-auto text-slate-500 group-hover:text-[#d4af37] mb-3 transition-colors" />
              <p className="text-sm font-semibold text-slate-300">
                {file ? file.name : "Click or drag to choose leads CSV"}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Only CSV files up to 10MB</p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/20 border border-red-500/20 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="font-medium leading-relaxed">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="font-medium leading-relaxed">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!file || loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-600 to-[#d4af37] hover:from-amber-500 hover:to-[#e5c158] text-surface-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-600/10"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-surface-900" />
                  <span>Processing & Scoring Leads...</span>
                </>
              ) : (
                <span>Upload & Score CSV</span>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
