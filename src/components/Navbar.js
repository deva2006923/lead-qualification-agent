"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert, BarChart3, MessageSquare, Shield, LogOut } from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/leads", label: "Pipeline",    icon: BarChart3 },
  { href: "/chat",  label: "Assistant",   icon: MessageSquare },
  { href: "/admin", label: "Admin Console", icon: Shield },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("lead_iq_user");
    if (stored) {
      setUser(JSON.parse(stored));
    } else {
      setUser(null);
    }
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem("lead_iq_user");
    setUser(null);
    router.push("/login");
  };

  const isLoginPage = pathname === "/login";

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-surface-900/80 backdrop-blur-xl">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Brand */}
          <Link href="/leads" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-[#d4af37] flex items-center justify-center shadow-lg shadow-amber-600/10 group-hover:shadow-amber-600/25 transition-all duration-300">
              <ShieldAlert className="w-4.5 h-4.5 text-surface-900" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-white tracking-tight uppercase">
                LEAD<span className="text-[#d4af37] font-mono">IQ</span>
              </span>
            </div>
          </Link>

          {/* Navigation Links - Private (Only visible when logged in) */}
          {user && !isLoginPage && (
            <nav className="flex items-center gap-1.5">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-150 border",
                      active
                        ? "bg-[#d4af37]/10 text-[#d4af37] border-[#d4af37]/25"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Status pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 rounded-full border border-white/5 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37] animate-pulse-slow" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest font-mono">
              {user ? "SECURE CLIENT" : "AUTH REQUIRED"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
