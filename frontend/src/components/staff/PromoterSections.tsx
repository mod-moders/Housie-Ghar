"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { money } from "@/lib/money";
import { Icon } from "../Icon";
import { KpiCard, EmptyHint } from "../ui";
import { AuthUser } from "@/lib/stores/authStore";

interface Referral {
  player_id: string;
  full_name: string;
  housie_name: string;
  referred_at: string;
}

interface Commission {
  commission_id: string;
  booking_id: string;
  amount: number;
  created_at: string;
  game_title: string;
  player_housie_name: string;
}

interface PromoterStats {
  current_balance: number;
  lifetime_earnings: number;
  commissions: Commission[];
}

export function PromoterSection({ me }: { me: AuthUser }) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<PromoterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<Referral[]>("/api/promoter/referrals"),
      apiFetch<PromoterStats>("/api/promoter/earnings"),
    ])
      .then(([refData, statsData]) => {
        if (alive) {
          setReferrals(refData);
          setStats(statsData);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error loading promoter data:", err);
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const getReferralLink = () => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/?ref=${me.user_id}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getReferralLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <span className="hg-poll-spin" />
      </div>
    );
  }

  const commissions = stats?.commissions ?? [];

  return (
    <div className="space-y-6">
      {/* Referral Link Card */}
      <section className="bg-[#121214] border border-[#27272A] rounded-xl p-6 shadow-lg">
        <h3 className="text-white font-semibold text-lg mb-2 flex items-center gap-2">
          <Icon name="zap" size={18} className="text-[#06B6D4]" />
          Your Affiliate Link
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          Share this link with your community. When new players register through it, they are linked to you and you earn a 2% commission on their ticket bookings.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            readOnly
            value={getReferralLink()}
            className="flex-1 px-4 py-2.5 bg-[#1E1E22] border border-[#3F3F46] rounded-lg text-white font-mono text-sm focus:outline-none"
          />
          <button
            onClick={handleCopyLink}
            className={`px-5 py-2.5 font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
              copied ? "bg-[#10B981] text-white" : "bg-[#FBBF24] hover:bg-[#F43F5E] text-[#0B0B0C] hover:text-white"
            }`}
          >
            <Icon name={copied ? "check" : "copy"} size={16} />
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard label="Promoter Balance" value={money(stats?.current_balance ?? 0)} sub="Pending physical cash settlement" />
        <KpiCard label="Lifetime Earnings" value={money(stats?.lifetime_earnings ?? 0)} sub="Total referral commissions" tone="good" />
        <KpiCard label="Total Referrals" value={referrals.length} sub="Players linked to your code" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Referred Players Table */}
        <section className="bg-[#121214] border border-[#27272A] rounded-xl p-6 shadow-lg">
          <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
            <Icon name="users" size={18} className="text-[#06B6D4]" />
            Referred Players ({referrals.length})
          </h3>
          {referrals.length === 0 ? (
            <EmptyHint icon="users" title="No referrals yet" sub="Share your link to recruit players to the platform." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead>
                  <tr className="border-b border-[#27272A] text-gray-400 font-medium">
                    <th className="py-2.5">Housie Name</th>
                    <th className="py-2.5">Full Name</th>
                    <th className="py-2.5 text-right">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272A]">
                  {referrals.map((r) => (
                    <tr key={r.player_id} className="hover:bg-[#1E1E22]/30 transition-colors">
                      <td className="py-3 font-mono text-[#06B6D4] font-medium">{r.housie_name}</td>
                      <td className="py-3">{r.full_name}</td>
                      <td className="py-3 text-right text-gray-500 text-xs">
                        {new Date(r.referred_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Commissions Log Table */}
        <section className="bg-[#121214] border border-[#27272A] rounded-xl p-6 shadow-lg">
          <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
            <Icon name="wallet" size={18} className="text-[#06B6D4]" />
            Commissions Log ({commissions.length})
          </h3>
          {commissions.length === 0 ? (
            <EmptyHint icon="wallet" title="No commission log" sub="Commissions will appear here when your referrals book tickets." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead>
                  <tr className="border-b border-[#27272A] text-gray-400 font-medium">
                    <th className="py-2.5">Game</th>
                    <th className="py-2.5">Player</th>
                    <th className="py-2.5 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272A]">
                  {commissions.map((c) => (
                    <tr key={c.commission_id} className="hover:bg-[#1E1E22]/30 transition-colors">
                      <td className="py-3">
                        <div className="font-semibold text-white truncate max-w-[160px]">{c.game_title}</div>
                        <div className="text-[11px] text-gray-500">ID: #{c.booking_id.substring(0, 8).toUpperCase()}</div>
                      </td>
                      <td className="py-3 font-mono text-gray-400">{c.player_housie_name}</td>
                      <td className="py-3 text-right font-medium text-[#10B981]">{money(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Promo Asset Downloads */}
      <section className="bg-[#121214] border border-[#27272A] rounded-xl p-6 shadow-lg">
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
          <Icon name="grid" size={18} className="text-[#06B6D4]" />
          Marketing Asset Downloads
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <a
            href="/HG Primary.png"
            download="Housie_Ghar_Primary.png"
            className="flex items-center gap-3 p-4 bg-[#1E1E22] hover:bg-[#27272A] border border-[#27272A] rounded-xl text-white transition-colors"
          >
            <Icon name="shield" className="text-[#FBBF24]" size={24} />
            <div>
              <div className="font-semibold text-sm">Primary Logo</div>
              <div className="text-xs text-gray-500">PNG Image</div>
            </div>
          </a>
          <a
            href="/HG Secondary.png"
            download="Housie_Ghar_Secondary.png"
            className="flex items-center gap-3 p-4 bg-[#1E1E22] hover:bg-[#27272A] border border-[#27272A] rounded-xl text-white transition-colors"
          >
            <Icon name="shield" className="text-[#F43F5E]" size={24} />
            <div>
              <div className="font-semibold text-sm">Secondary Logo</div>
              <div className="text-xs text-gray-500">PNG Image</div>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}
