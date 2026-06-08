"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const data = await apiFetch<{ user: any }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      const role: string = data.user.role_name ?? "";
      const dest = role === "Superadmin" ? "/admin/superadmin"
        : role === "Admin" ? "/admin/admin"
        : role === "Operator" ? "/admin/operator"
        : "/admin/agent";
      router.push(dest);
    } catch (e: any) {
      setError(e.message ?? "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-bg1 flex items-center justify-center px-5 font-admin">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-black text-gold">Housie Ghar</h1>
          <p className="text-[#6b7280] text-sm mt-1">Staff Login</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-bg2 border border-border rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#9ca3af] block mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full bg-bg3 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:border-gold/50 focus:outline-none font-mono"
              placeholder="you@housieghar.local" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#9ca3af] block mb-1.5">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full bg-bg3 border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:border-gold/50 focus:outline-none"
              placeholder="••••••••" />
          </div>
          {error && <p className="text-danger text-xs font-mono">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-gold hover:bg-gold-light text-forest font-black text-sm py-3 rounded-xl transition-all disabled:opacity-60">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="text-center text-xs text-[#6b7280] mt-4">
          <Link href="/" className="hover:text-gold transition-colors">← Back to public site</Link>
        </p>
      </div>
    </div>
  );
}
