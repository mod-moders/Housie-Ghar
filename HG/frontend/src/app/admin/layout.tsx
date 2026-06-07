"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { apiFetch } from "@/lib/api";
import { useEffect } from "react";

const NAV: Record<string, { label: string; href: string; roles: number[] }[]> = {
  Superadmin: [
    { label: "Dashboard", href: "/admin/superadmin", roles: [1] },
    { label: "Users", href: "/admin/superadmin/users", roles: [1] },
    { label: "Audit Log", href: "/admin/superadmin/audit", roles: [1] },
    { label: "Theming", href: "/admin/superadmin/theming", roles: [1] },
  ],
  Admin: [
    { label: "Dashboard", href: "/admin/admin", roles: [2] },
    { label: "Game Builder", href: "/admin/admin/game-builder", roles: [2] },
    { label: "Agents", href: "/admin/admin/agents", roles: [2] },
  ],
  Operator: [
    { label: "My Games", href: "/admin/operator", roles: [3] },
  ],
  Agent: [
    { label: "Live Queue", href: "/admin/agent", roles: [4] },
    { label: "Wallet", href: "/admin/agent/wallet", roles: [4] },
    { label: "Sales", href: "/admin/agent/sales", roles: [4] },
  ],
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user && pathname !== "/admin/login") {
      apiFetch<{ user: any }>("/api/auth/me").then((d) => setUser(d.user)).catch(() => router.push("/admin/login"));
    }
  }, []);

  if (pathname === "/admin/login") return <>{children}</>;

  const roleName = user?.role_name ?? "Agent";
  const navItems = NAV[roleName] ?? [];

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen bg-bg1 font-admin flex">
      {/* Sidebar */}
      <aside className="w-56 bg-bg2 border-r border-border flex flex-col py-6 px-4 hidden md:flex">
        <div className="mb-8">
          <p className="font-display text-lg font-bold text-gold">Housie Ghar</p>
          <p className="text-[10px] font-mono text-[#6b7280] uppercase tracking-wider mt-0.5">{roleName} Panel</p>
        </div>
        <nav className="space-y-1 flex-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${pathname === item.href ? "bg-gold/10 text-gold font-semibold" : "text-[#9ca3af] hover:text-white hover:bg-bg3"}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        {user && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-[#6b7280] truncate">{user.full_name}</p>
            <button onClick={logout} className="text-xs text-[#6b7280] hover:text-danger mt-1 transition-colors">
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {/* Topbar */}
        <div className="bg-bg2 border-b border-border px-6 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">{navItems.find((i) => i.href === pathname)?.label ?? "Dashboard"}</p>
          {user?.current_balance !== undefined && (
            <div className="text-xs font-mono text-gold bg-gold/10 border border-gold/20 px-3 py-1 rounded-full">
              Wallet: ₹{user.current_balance.toLocaleString()}
            </div>
          )}
        </div>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
