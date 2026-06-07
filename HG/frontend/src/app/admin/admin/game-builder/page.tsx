"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const PRIZE_PATTERNS = [
  "Early Five", "Top Line", "Middle Line", "Bottom Line", "Four Corners", "Full House",
] as const;

interface Prize { pattern_name: string; prize_amount: string; }
interface Operator { user_id: string; full_name: string; }
interface WizardState {
  title: string;
  scheduled_at: string;
  ticket_price: string;
  total_tickets: string;
  operator_id: string;
  prizes: Prize[];
}

const INITIAL: WizardState = {
  title: "", scheduled_at: "", ticket_price: "", total_tickets: "",
  operator_id: "", prizes: [{ pattern_name: "Full House", prize_amount: "" }],
};

function validateStep1(s: WizardState): string | null {
  if (!s.title.trim()) return "Title is required";
  if (!s.scheduled_at) return "Scheduled time is required";
  if (new Date(s.scheduled_at) <= new Date()) return "Scheduled time must be in the future";
  if (!s.ticket_price || parseFloat(s.ticket_price) <= 0) return "Ticket price must be greater than 0";
  if (!s.total_tickets || parseInt(s.total_tickets, 10) <= 0) return "Total tickets must be greater than 0";
  return null;
}

function validateStep2(s: WizardState): string | null {
  if (s.prizes.length === 0) return "Add at least one prize";
  for (const p of s.prizes) {
    if (!p.pattern_name) return "Select a pattern for each prize";
    if (!p.prize_amount || parseFloat(p.prize_amount) <= 0) return "Each prize amount must be greater than 0";
  }
  const patterns = s.prizes.map((p) => p.pattern_name);
  if (new Set(patterns).size !== patterns.length) return "Each prize pattern can only be used once";
  const gross = parseFloat(s.ticket_price) * parseInt(s.total_tickets, 10);
  const cap = gross * 0.80;
  const total = s.prizes.reduce((sum, p) => sum + parseFloat(p.prize_amount || "0"), 0);
  if (total > cap) return `Total prizes ₹${total.toLocaleString()} exceeds the 80% cap of ₹${cap.toFixed(2)}`;
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm py-0.5">
      <span className="text-[#6b7280]">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

const INPUT = "w-full bg-bg3 border border-border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-border-active placeholder:text-[#4b5563]";

export default function GameBuilderPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<WizardState>(INITIAL);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<(Operator & { role_name: string })[]>("/api/users")
      .then((users) => setOperators(users.filter((u) => u.role_name === "Operator")))
      .catch(() => {});
  }, []);

  const gross = parseFloat(form.ticket_price || "0") * parseInt(form.total_tickets || "0", 10);
  const cap = gross * 0.80;
  const totalPrize = form.prizes.reduce((s, p) => s + parseFloat(p.prize_amount || "0"), 0);
  const capPct = cap > 0 ? Math.min((totalPrize / cap) * 100, 100) : 0;
  const usedPatterns = new Set(form.prizes.map((p) => p.pattern_name));
  const availablePatterns = PRIZE_PATTERNS.filter((p) => !usedPatterns.has(p));

  const addPrize = () =>
    setForm((f) => {
      const used = new Set(f.prizes.map((p) => p.pattern_name));
      const next = PRIZE_PATTERNS.find((pat) => !used.has(pat));
      if (!next) return f;
      return { ...f, prizes: [...f.prizes, { pattern_name: next, prize_amount: "" }] };
    });

  const removePrize = (i: number) =>
    setForm((f) => ({ ...f, prizes: f.prizes.filter((_, idx) => idx !== i) }));

  const updatePrize = (i: number, field: keyof Prize, val: string) =>
    setForm((f) => ({
      ...f,
      prizes: f.prizes.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)),
    }));

  const goNext = () => {
    setError("");
    const err = step === 1 ? validateStep1(form) : step === 2 ? validateStep2(form) : null;
    if (err) { setError(err); return; }
    setStep((s) => (s + 1) as 1 | 2 | 3);
  };

  const submit = async () => {
    setLoading(true); setError("");
    try {
      await apiFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          scheduled_at: form.scheduled_at,
          ticket_price: parseFloat(form.ticket_price),
          total_tickets: parseInt(form.total_tickets, 10),
          operator_id: form.operator_id || undefined,
          prizes: form.prizes.map((p) => ({
            pattern_name: p.pattern_name,
            prize_amount: parseFloat(p.prize_amount),
          })),
        }),
      });
      router.push("/admin/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game");
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
              step === s ? "bg-gold text-forest border-gold" :
              step > s ? "bg-success/20 text-success border-success/30" :
              "bg-bg3 text-[#6b7280] border-border"
            }`}>{s}</div>
            {s < 3 && <div className={`h-px w-8 ${step > s ? "bg-success/40" : "bg-border"}`} />}
          </div>
        ))}
        <span className="ml-3 text-xs text-[#9ca3af]">
          {step === 1 ? "Basics" : step === 2 ? "Prize Pool" : "Review & Create"}
        </span>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-xs px-4 py-3 rounded-xl mb-5">
          {error}
        </div>
      )}

      {/* ── Step 1: Basics ── */}
      {step === 1 && (
        <div className="space-y-5">
          <Field label="Game Title">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Sunday Blockbuster" className={INPUT} />
          </Field>

          <Field label="Scheduled At">
            <input type="datetime-local" value={form.scheduled_at}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
              className={INPUT} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Ticket Price (₹)">
              <input type="number" min="1" value={form.ticket_price}
                onChange={(e) => setForm((f) => ({ ...f, ticket_price: e.target.value }))}
                placeholder="50" className={INPUT} />
            </Field>
            <Field label="Total Tickets">
              <input type="number" min="1" value={form.total_tickets}
                onChange={(e) => setForm((f) => ({ ...f, total_tickets: e.target.value }))}
                placeholder="200" className={INPUT} />
              <div className="flex gap-1.5 mt-2">
                {[50, 100, 200, 300].map((n) => (
                  <button key={n} type="button"
                    onClick={() => setForm((f) => ({ ...f, total_tickets: String(n) }))}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-all ${
                      form.total_tickets === String(n)
                        ? "bg-gold/10 border-gold/30 text-gold"
                        : "border-border text-[#6b7280] hover:text-white"
                    }`}>{n}</button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Assign Operator (optional)">
            <select value={form.operator_id}
              onChange={(e) => setForm((f) => ({ ...f, operator_id: e.target.value }))}
              className={INPUT}>
              <option value="">— No operator assigned —</option>
              {operators.map((op) => (
                <option key={op.user_id} value={op.user_id}>{op.full_name}</option>
              ))}
            </select>
          </Field>

          <div className="flex justify-end pt-2">
            <button onClick={goNext}
              className="bg-gold text-forest font-black text-sm px-6 py-2.5 rounded-xl hover:bg-gold-light transition-all">
              Next: Prize Pool →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Prize Pool ── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Cap meter */}
          <div className="bg-bg2 border border-border rounded-xl p-4">
            <div className="flex justify-between text-xs text-[#9ca3af] mb-2">
              <span>Gross Revenue: <span className="text-white font-mono">₹{gross.toLocaleString()}</span></span>
              <span>80% Cap: <span className="text-white font-mono">₹{cap.toLocaleString()}</span></span>
            </div>
            <div className="h-2 bg-bg3 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${
                capPct >= 100 ? "bg-danger" : capPct >= 80 ? "bg-warning" : "bg-success"
              }`} style={{ width: `${capPct}%` }} />
            </div>
            <div className="flex justify-between text-xs mt-1.5">
              <span className={`font-mono ${totalPrize > cap ? "text-danger" : "text-[#9ca3af]"}`}>
                Used: ₹{totalPrize.toLocaleString()}
              </span>
              <span className="text-[#6b7280] font-mono">
                Remaining: ₹{Math.max(0, cap - totalPrize).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Prize rows */}
          <div className="space-y-3">
            {form.prizes.map((p, i) => {
              const opts = PRIZE_PATTERNS.filter((pat) => pat === p.pattern_name || !usedPatterns.has(pat));
              return (
                <div key={i} className="flex gap-3 items-center">
                  <select value={p.pattern_name}
                    onChange={(e) => updatePrize(i, "pattern_name", e.target.value)}
                    className="flex-1 bg-bg3 border border-border text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-border-active">
                    {opts.map((pat) => <option key={pat} value={pat}>{pat}</option>)}
                  </select>
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280] text-xs">₹</span>
                    <input type="number" min="1" value={p.prize_amount}
                      onChange={(e) => updatePrize(i, "prize_amount", e.target.value)}
                      placeholder="0"
                      className="w-full bg-bg3 border border-border text-white text-sm rounded-xl pl-7 pr-3 py-2.5 focus:outline-none focus:border-border-active" />
                  </div>
                  <button onClick={() => removePrize(i)}
                    className="text-[#6b7280] hover:text-danger transition-colors text-xl leading-none w-6 text-center">
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {availablePatterns.length > 0 && (
            <button onClick={addPrize}
              className="text-xs text-gold border border-gold/20 bg-gold/5 px-4 py-2 rounded-xl hover:bg-gold/10 transition-all">
              + Add Prize
            </button>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)}
              className="text-xs text-[#9ca3af] hover:text-white border border-border px-5 py-2.5 rounded-xl transition-all">
              ← Back
            </button>
            <button onClick={goNext}
              className="bg-gold text-forest font-black text-sm px-6 py-2.5 rounded-xl hover:bg-gold-light transition-all">
              Review →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review ── */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-bg2 border border-border rounded-2xl p-5 space-y-3">
            <ReviewRow label="Title" value={form.title} />
            <ReviewRow label="Scheduled At" value={new Date(form.scheduled_at).toLocaleString("en-IN")} />
            <ReviewRow label="Ticket Price" value={`₹${parseFloat(form.ticket_price).toLocaleString()}`} />
            <ReviewRow label="Total Tickets" value={parseInt(form.total_tickets, 10).toLocaleString()} />
            <ReviewRow label="Gross Revenue" value={`₹${gross.toLocaleString()}`} />
            {form.operator_id && (
              <ReviewRow
                label="Operator"
                value={operators.find((o) => o.user_id === form.operator_id)?.full_name ?? "—"}
              />
            )}
            <div className="border-t border-border pt-3 mt-3">
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-2">Prize Pool</p>
              {form.prizes.map((p, i) => (
                <div key={i} className="flex justify-between text-sm py-0.5">
                  <span className="text-[#9ca3af]">{p.pattern_name}</span>
                  <span className="font-mono text-white">₹{parseFloat(p.prize_amount).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs mt-2 pt-2 border-t border-border">
                <span className="text-[#6b7280]">Total Prizes</span>
                <span className="font-mono text-gold font-bold">₹{totalPrize.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)}
              className="text-xs text-[#9ca3af] hover:text-white border border-border px-5 py-2.5 rounded-xl transition-all">
              ← Back
            </button>
            <button onClick={submit} disabled={loading}
              className="bg-gold text-forest font-black text-sm px-6 py-2.5 rounded-xl hover:bg-gold-light transition-all disabled:opacity-50">
              {loading ? "Creating..." : "Create Game →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
