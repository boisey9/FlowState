import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bell, CheckCircle2, RefreshCw, Search, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "../components/ui/button";
import FlowStateLogo from "../components/FlowStateLogo";

const SUPABASE_URL = "https://mauckkqddndphlihnbtt.supabase.co";
const ALERT_HISTORY_URL = `${SUPABASE_URL}/functions/v1/trade-banana-alert-history`;
const tfLabel = { "1D": "Daily", "4H": "4H", "1H": "1H" };

function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: n > 999 ? 0 : 2 });
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function direction(level) {
  if (["WATCH_LONG", "READY_LONG"].includes(level)) return "long";
  if (["WATCH_SHORT", "READY_SHORT"].includes(level)) return "short";
  return "neutral";
}

function statusLabel(level) {
  return String(level || "ALERT").replaceAll("_", " ");
}

function statusClass(level) {
  const dir = direction(level);
  if (dir === "long") return "border-lime-400/35 bg-lime-500/10 text-lime-200";
  if (dir === "short") return "border-red-400/35 bg-red-500/10 text-red-200";
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200";
}

function StatCard({ title, value, subtitle, children, cls = "border-yellow-400/25" }) {
  return (
    <div className={`rounded-3xl border ${cls} bg-white/[0.03] p-5`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-slate-300">{title}</div>
          <div className="mt-2 text-4xl font-bold">{value}</div>
          <div className="mt-1 text-sm text-slate-400">{subtitle}</div>
        </div>
        <div className="rounded-2xl bg-black/30 p-3 text-yellow-300">{children}</div>
      </div>
    </div>
  );
}

function StatusPill({ level }) {
  return <span className={`inline-flex rounded-xl border px-3 py-1 text-xs font-bold ${statusClass(level)}`}>{statusLabel(level)}</span>;
}

function Message({ row }) {
  const fallback = direction(row.alert_level) === "long" ? "Bullish alert sent to Telegram." : direction(row.alert_level) === "short" ? "Bearish alert sent to Telegram." : "Telegram alert sent.";
  const text = String(row.message || fallback).split("\n").find(Boolean) || fallback;
  return <span>{text.length > 120 ? `${text.slice(0, 120)}...` : text}</span>;
}

function MobileAlertCard({ row, open }) {
  return (
    <div className="rounded-3xl border border-yellow-400/20 bg-white/[0.03] p-5 md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-bold text-white">{row.symbol} <span className="text-slate-400">· {tfLabel[row.timeframe] || row.timeframe}</span></div>
          <div className="mt-1 text-sm text-slate-400">{formatTime(row.created_at)}</div>
        </div>
        <StatusPill level={row.alert_level} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div><div className="text-slate-400">Regime</div><div className="mt-1 font-bold text-yellow-200">{row.current_regime || "—"}</div></div>
        <div><div className="text-slate-400">Edge</div><div className={`mt-1 font-bold ${Number(row.directional_edge) >= 0 ? "text-lime-300" : "text-red-300"}`}>{pct(row.directional_edge)}</div></div>
        <div><div className="text-slate-400">Last</div><div className="mt-1 font-bold text-white">{money(row.current_close)}</div></div>
      </div>
      <div className="mt-4 border-t border-white/10 pt-4 text-sm text-slate-300"><Message row={row} /></div>
      <button onClick={() => open(row)} className="mt-4 inline-flex items-center gap-2 font-semibold text-yellow-300">Open Analysis <ArrowRight className="h-4 w-4" /></button>
    </div>
  );
}

function DesktopAlertsTable({ rows, open }) {
  return (
    <div className="hidden overflow-hidden rounded-3xl border border-yellow-400/20 bg-white/[0.03] md:block">
      <div className="grid grid-cols-[1.1fr_.7fr_1fr_1fr_1fr_1.8fr_1fr] border-b border-white/10 px-5 py-4 text-sm text-slate-400">
        <div>Symbol</div><div>TF</div><div>Alert</div><div>Time</div><div>Price</div><div>Message</div><div>Action</div>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[1.1fr_.7fr_1fr_1fr_1fr_1.8fr_1fr] items-center border-b border-white/10 px-5 py-4 text-sm last:border-b-0">
          <div>
            <div className="font-bold text-white">{row.symbol}</div>
            <div className="text-xs text-slate-400">{row.current_regime || "—"} regime</div>
          </div>
          <div>{tfLabel[row.timeframe] || row.timeframe}</div>
          <div><StatusPill level={row.alert_level} /></div>
          <div className="text-slate-300">{formatTime(row.created_at)}</div>
          <div className="font-semibold text-white">{money(row.current_close)}</div>
          <div className="text-slate-300"><Message row={row} /></div>
          <button onClick={() => open(row)} className="inline-flex items-center gap-2 font-semibold text-yellow-300">Open <ArrowRight className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

export default function AlertsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${ALERT_HISTORY_URL}?limit=150`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const summary = useMemo(() => ({
    total: rows.length,
    long: rows.filter((row) => direction(row.alert_level) === "long").length,
    short: rows.filter((row) => direction(row.alert_level) === "short").length,
    sent: rows.filter((row) => row.telegram_sent).length,
  }), [rows]);

  const filtered = useMemo(() => rows.filter((row) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || String(row.symbol || "").toLowerCase().includes(q) || String(row.message || "").toLowerCase().includes(q);
    const dir = direction(row.alert_level);
    const matchesFilter = filter === "all" || (filter === "long" && dir === "long") || (filter === "short" && dir === "short") || (filter === "sent" && row.telegram_sent);
    return matchesQuery && matchesFilter;
  }), [rows, query, filter]);

  const open = (row) => {
    localStorage.setItem("trade_banana_selected_symbol", row.symbol);
    localStorage.setItem("trade_banana_selected_timeframe", row.timeframe);
    window.location.hash = "#analyze";
  };

  return (
    <div className="min-h-screen bg-[#070B0A] p-4 pb-40 text-white md:p-8 md:pb-12">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-5">
          <FlowStateLogo variant="full" className="h-16 w-auto" />
          <Button onClick={refresh} disabled={loading} className="rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr] lg:items-end">
          <div>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Alerts</h1>
            <p className="mt-2 text-slate-400">Telegram alert history only. Newest alerts appear first.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard title="Total" value={summary.total} subtitle="Sent alerts"><Bell className="h-5 w-5" /></StatCard>
            <StatCard title="Watch Long" value={summary.long} subtitle="Bullish" cls="border-lime-400/25"><TrendingUp className="h-5 w-5" /></StatCard>
            <StatCard title="Watch Short" value={summary.short} subtitle="Bearish" cls="border-red-400/25"><TrendingDown className="h-5 w-5" /></StatCard>
            <StatCard title="Telegram" value={summary.sent} subtitle="Delivered" cls="border-sky-400/25"><CheckCircle2 className="h-5 w-5" /></StatCard>
          </div>
        </div>

        <div className="rounded-3xl border border-yellow-400/20 bg-white/[0.03] p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {[["all", "All"], ["long", "Long"], ["short", "Short"], ["sent", "Sent"]].map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key)} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${filter === key ? "border-yellow-400 bg-yellow-400/15 text-yellow-300" : "border-white/10 bg-white/5 text-slate-300"}`}>{label}</button>
              ))}
            </div>
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbols or messages..." className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-12 pr-4 text-sm outline-none focus:border-yellow-400/50" />
            </div>
          </div>
        </div>

        {error ? <div className="rounded-3xl border border-red-400/25 bg-red-500/10 p-5 text-red-200">Could not load alert history: {error}</div> : null}
        {!error && !loading && filtered.length === 0 ? <div className="rounded-3xl border border-dashed border-yellow-400/25 bg-white/[0.03] p-8 text-center text-slate-300">No Telegram alerts found yet.</div> : null}

        <DesktopAlertsTable rows={filtered} open={open} />
        <div className="space-y-3 md:hidden">{filtered.map((row) => <MobileAlertCard key={row.id} row={row} open={open} />)}</div>
      </div>
    </div>
  );
}
