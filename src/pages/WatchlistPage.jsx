import React, { useEffect, useMemo, useState } from "react";
import { Bell, RefreshCw, Search, Star, ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "../components/ui/button";
import FlowStateLogo from "../components/FlowStateLogo";
import { getAlertStatus } from "../components/AlertStatusPanel";

const SUPABASE_URL = "https://mauckkqddndphlihnbtt.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/flowstate-analysis`;
const SUPABASE_ANON_KEY = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_ANON_KEY || "" : "";
const WATCHLIST = [
  { symbol: "XAUUSD", name: "Gold / U.S. Dollar", icon: "◆", cls: "bg-yellow-400" },
  { symbol: "NVDA", name: "NVIDIA Corporation", icon: "N", cls: "bg-lime-500" },
];
const TIMEFRAME_OPTIONS = ["1D", "4H"];
const tfLabel = { "1D": "Daily", "4H": "4H" };
const pct = (n) => `${Math.round((Number(n) || 0) * 100)}%`;
const money = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: Number(n) > 999 ? 0 : 2 }) : "—";

function tone(level) {
  if (["WATCH_LONG", "READY_LONG"].includes(level)) return "long";
  if (["WATCH_SHORT", "READY_SHORT"].includes(level)) return "short";
  if (level === "DATA_WARNING") return "warning";
  return "neutral";
}
function pill(row) {
  const level = row.alert.level;
  const label = level === "NO_ALERT" ? "NO ALERT" : row.alert.label.toUpperCase();
  const t = tone(level);
  const cls = t === "long" ? "border-lime-400/40 bg-lime-500/10 text-lime-200" : t === "short" ? "border-red-400/40 bg-red-500/10 text-red-200" : t === "warning" ? "border-yellow-400/40 bg-yellow-500/10 text-yellow-200" : "border-white/10 bg-white/5 text-slate-300";
  return <span className={`inline-flex rounded-xl border px-3 py-1 text-xs font-bold ${cls}`}>{label}</span>;
}
function regimeCls(regime) {
  return regime === "Bull" ? "text-lime-300" : regime === "Bear" ? "text-red-300" : "text-yellow-300";
}
function qualityCls(score) {
  return score >= 90 ? "border-lime-400 text-lime-300" : score >= 80 ? "border-yellow-400 text-yellow-300" : "border-red-400 text-red-300";
}

function normalize(item, timeframe, data, error = "") {
  const model = data || { symbol: item.symbol, timeframe, current: { regime: "Sideways" }, probabilities: {}, data_quality: { score: 0 }, decision: { action: "WAIT" } };
  const alert = error ? { level: "DATA_WARNING", label: "Data Warning" } : getAlertStatus(model);
  return {
    id: `${item.symbol}-${timeframe}`,
    symbol: item.symbol,
    name: item.name,
    icon: item.icon,
    cls: item.cls,
    timeframe,
    alert,
    regime: model.current?.regime || "Sideways",
    close: model.current?.close,
    bull: Number(model.probabilities?.bull || 0),
    bear: Number(model.probabilities?.bear || 0),
    edge: Number(model.probabilities?.directional_edge || 0),
    quality: Number(model.data_quality?.score || 0),
    error,
  };
}

function Summary({ title, value, subtitle, children, cls = "border-yellow-400/25" }) {
  return <div className={`rounded-3xl border ${cls} bg-white/[0.03] p-5`}><div className="flex items-center justify-between"><div><div className="text-sm text-slate-300">{title}</div><div className="mt-2 text-4xl font-bold">{value}</div><div className="mt-1 text-sm text-slate-400">{subtitle}</div></div><div className="rounded-2xl bg-black/30 p-3 text-yellow-300">{children}</div></div></div>;
}
function Quality({ score }) {
  return <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold ${qualityCls(score)}`}>{Math.round(score || 0)}</span>;
}

function MobileCard({ row, open }) {
  return <div className="rounded-3xl border border-yellow-400/20 bg-white/[0.03] p-5 md:hidden"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${row.cls} font-black text-black`}>{row.icon}</div><div><div className="text-xl font-bold">{row.symbol} <span className="text-slate-400">· {tfLabel[row.timeframe]}</span></div><div className="text-sm text-slate-400">{row.name}</div></div></div>{pill(row)}</div><div className={`mt-3 font-semibold ${regimeCls(row.regime)}`}>{row.regime} Regime •</div><div className="mt-5 grid grid-cols-4 gap-3 text-sm"><div><div className="text-slate-400">Bull</div><div className="mt-1 text-lg font-bold text-lime-300">{pct(row.bull)}</div></div><div><div className="text-slate-400">Bear</div><div className="mt-1 text-lg font-bold text-red-300">{pct(row.bear)}</div></div><div><div className="text-slate-400">Edge</div><div className={`mt-1 text-lg font-bold ${row.edge >= 0 ? "text-lime-300" : "text-red-300"}`}>{pct(row.edge)}</div></div><div><div className="text-slate-400">Quality</div><div className="mt-1"><Quality score={row.quality} /></div></div></div><div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm"><span className="text-slate-400">Last {money(row.close)}</span><button onClick={() => open(row)} className="inline-flex items-center gap-2 font-semibold text-yellow-300">Open Analysis <ArrowRight className="h-4 w-4" /></button></div></div>;
}

function DesktopTable({ rows, open }) {
  return <div className="hidden overflow-hidden rounded-3xl border border-yellow-400/20 bg-white/[0.03] md:block"><div className="grid grid-cols-[1.6fr_.7fr_1fr_1.1fr_.7fr_.7fr_.7fr_.8fr_.8fr_1fr] border-b border-white/10 px-5 py-4 text-sm text-slate-400"><div>Asset</div><div>TF</div><div>Regime</div><div>Alert</div><div>Bull</div><div>Bear</div><div>Edge</div><div>Quality</div><div>Last</div><div>Action</div></div>{rows.map((row) => <div key={row.id} className="grid grid-cols-[1.6fr_.7fr_1fr_1.1fr_.7fr_.7fr_.7fr_.8fr_.8fr_1fr] items-center border-b border-white/10 px-5 py-4 text-sm last:border-b-0"><div className="flex items-center gap-3"><Star className="h-4 w-4 text-yellow-300" /><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${row.cls} font-black text-black`}>{row.icon}</div><div><div className="font-bold text-white">{row.symbol}</div><div className="text-xs text-slate-400">{row.name}</div></div></div><div>{tfLabel[row.timeframe]}</div><div className={regimeCls(row.regime)}>{row.regime} •</div><div>{pill(row)}</div><div className="font-bold text-lime-300">{pct(row.bull)}</div><div className="font-bold text-red-300">{pct(row.bear)}</div><div className={`font-bold ${row.edge >= 0 ? "text-lime-300" : "text-red-300"}`}>{pct(row.edge)}</div><div><Quality score={row.quality} /></div><div>{money(row.close)}</div><button onClick={() => open(row)} className="inline-flex items-center gap-2 font-semibold text-yellow-300">Open <ArrowRight className="h-4 w-4" /></button></div>)}</div>;
}

export default function WatchlistPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [timeframe, setTimeframe] = useState("1D");

  async function fetchRow(item, tf) {
    if (!SUPABASE_ANON_KEY) return normalize(item, tf, null, "Missing anon key");
    try {
      const res = await fetch(FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ symbol: item.symbol, timeframe: tf, execution_confirmed: false, outputsize: 5000 }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      return normalize(item, tf, { ...data, symbol: item.symbol, timeframe: tf });
    } catch (err) { return normalize(item, tf, null, err instanceof Error ? err.message : String(err)); }
  }
  async function refresh() {
    setLoading(true);
    const jobs = WATCHLIST.map((item) => fetchRow(item, timeframe));
    setRows(await Promise.all(jobs));
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [timeframe]);

  const filtered = useMemo(() => rows.filter((r) => {
    const q = query.toLowerCase();
    const matches = !q || r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
    const isAlert = !["NO_ALERT", "DATA_WARNING"].includes(r.alert.level);
    const isReady = ["READY_LONG", "READY_SHORT"].includes(r.alert.level);
    return matches && (filter === "all" || (filter === "alerts" && isAlert) || (filter === "ready" && isReady));
  }), [rows, query, filter]);
  const summary = useMemo(() => ({ alerts: rows.filter((r) => !["NO_ALERT", "DATA_WARNING"].includes(r.alert.level)).length, long: rows.filter((r) => ["WATCH_LONG", "READY_LONG"].includes(r.alert.level)).length, short: rows.filter((r) => ["WATCH_SHORT", "READY_SHORT"].includes(r.alert.level)).length }), [rows]);
  const open = (row) => { localStorage.setItem("trade_banana_selected_symbol", row.symbol); localStorage.setItem("trade_banana_selected_timeframe", row.timeframe); window.location.hash = "#analyze"; };

  return <div className="min-h-screen bg-[#070B0A] p-4 pb-40 text-white md:p-8 md:pb-12"><div className="mx-auto max-w-7xl space-y-6"><div className="flex items-center justify-between border-b border-white/10 pb-5"><FlowStateLogo variant="full" className="h-16 w-auto" /><Button onClick={refresh} disabled={loading} className="rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button></div><div className="grid gap-5 lg:grid-cols-[1fr_1.4fr] lg:items-end"><div><h1 className="text-4xl font-bold tracking-tight md:text-5xl">Watchlist</h1><p className="mt-2 text-slate-400">See what deserves attention now.</p></div><div className="grid grid-cols-3 gap-3"><Summary title="Alerts Now" value={summary.alerts} subtitle="Needs attention"><Bell className="h-5 w-5" /></Summary><Summary title="Watch Long" value={summary.long} subtitle="Bullish setups" cls="border-lime-400/25"><TrendingUp className="h-5 w-5" /></Summary><Summary title="Watch Short" value={summary.short} subtitle="Bearish setups" cls="border-red-400/25"><TrendingDown className="h-5 w-5" /></Summary></div></div><div className="rounded-3xl border border-yellow-400/20 bg-white/[0.03] p-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="relative w-full md:max-w-sm"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbols..." className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-12 pr-4 text-sm outline-none focus:border-yellow-400/50" /></div><div className="flex flex-wrap gap-2">{TIMEFRAME_OPTIONS.map((tf) => <button key={tf} onClick={() => setTimeframe(tf)} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${timeframe === tf ? "border-yellow-400 bg-yellow-400/15 text-yellow-300" : "border-white/10 bg-white/5 text-slate-300"}`}>{tfLabel[tf]}</button>)}{[["all", "All"], ["alerts", "Alerts"], ["ready", "Ready"]].map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${filter === key ? "border-yellow-400 bg-yellow-400/15 text-yellow-300" : "border-white/10 bg-white/5 text-slate-300"}`}>{label}</button>)}</div></div></div><DesktopTable rows={filtered} open={open} /><div className="space-y-3 md:hidden">{filtered.map((row) => <MobileCard key={row.id} row={row} open={open} />)}</div></div></div>;
}
