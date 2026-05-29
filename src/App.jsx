import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, CheckCircle2, Clock, Database, Gauge, HelpCircle, Info, Lock, RefreshCw, Shield, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent } from "./components/ui/card";
import { Button } from "./components/ui/button";
import FlowStateLogo from "./components/FlowStateLogo";
import AlertStatusPanel, { getAlertStatus } from "./components/AlertStatusPanel";

const SUPABASE_URL = "https://mauckkqddndphlihnbtt.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/flowstate-analysis`;
const SUPABASE_ANON_KEY = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_ANON_KEY || "" : "";
const WATCHLIST_STORAGE_KEY = "trade_banana_watchlist";
const DEFAULT_WATCHLIST = [{ symbol: "XAUUSD", name: "Gold / U.S. Dollar" }];
const DEFAULT_ASSETS = {
  XAUUSD: { name: "Gold / U.S. Dollar", base: 3340, drift: 0.16, vol: 13.2, personality: "Momentum with sharp liquidation wicks" },
  "BTC-USD": { name: "Bitcoin", base: 103500, drift: 0.28, vol: 620, personality: "High volatility trend transitions" },
  SPY: { name: "S&P 500 ETF", base: 625, drift: 0.05, vol: 2.8, personality: "Slow persistent equity trend" },
  QQQ: { name: "Nasdaq ETF", base: 535, drift: 0.08, vol: 4.2, personality: "Growth-led momentum regime" },
  AAPL: { name: "Apple", base: 212, drift: 0.04, vol: 1.9, personality: "Single-name trend with mean reversion" },
  NVDA: { name: "NVIDIA", base: 185, drift: 0.11, vol: 3.8, personality: "AI momentum with volatility clusters" },
  MSFT: { name: "Microsoft", base: 520, drift: 0.06, vol: 2.7, personality: "Persistent large-cap trend behavior" },
  TSLA: { name: "Tesla", base: 440, drift: 0.09, vol: 8.4, personality: "High beta transitions and mean reversion" },
};
const TF_CONFIG = { "1D": { label: "Daily", bars: 260, window: 20, threshold: 0.02 }, "4H": { label: "4H", bars: 360, window: 30, threshold: 0.018 }, "1H": { label: "1H", bars: 420, window: 40, threshold: 0.012 } };
const states = ["Bear", "Sideways", "Bull"];
const stateStyle = { Bull: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30", Bear: "bg-rose-500/15 text-rose-200 border-rose-400/30", Sideways: "bg-slate-500/15 text-slate-200 border-slate-400/25" };

function safeGet(key) { try { return window.localStorage?.getItem(key) || ""; } catch { return ""; } }
function safeSet(key, value) { try { window.localStorage?.setItem(key, value); } catch { /* noop */ } }
function loadWatchlist() {
  try {
    const stored = JSON.parse(safeGet(WATCHLIST_STORAGE_KEY) || "[]");
    const source = Array.isArray(stored) && stored.length ? stored : DEFAULT_WATCHLIST;
    const seen = new Set();
    return source.map((item) => ({ symbol: String(item?.symbol || "").trim().toUpperCase(), name: String(item?.name || item?.symbol || "").trim() })).filter((item) => item.symbol && !seen.has(item.symbol) && seen.add(item.symbol));
  } catch { return DEFAULT_WATCHLIST; }
}
function assetFor(symbol, watchlist) {
  const item = watchlist.find((x) => x.symbol === symbol);
  return DEFAULT_ASSETS[symbol] || { name: item?.name || symbol, base: symbol === "XAUUSD" ? 3340 : 100, drift: 0.05, vol: symbol === "XAUUSD" ? 13.2 : 2.5, personality: "Custom watchlist symbol using live data when available and generic fallback metadata when needed." };
}
function seededNoise(seed, index) { const x = Math.sin(seed * 999 + index * 12.9898) * 43758.5453; return x - Math.floor(x); }
function generateMockCandles(symbol, tf, asset) {
  const cfg = TF_CONFIG[tf] || TF_CONFIG["1D"];
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + tf.length * 17;
  let price = asset.base;
  const rows = [];
  for (let i = 0; i < cfg.bars; i++) {
    const cycle = Math.sin(i / 18) * asset.vol * 0.16;
    const shock = (seededNoise(seed, i) - 0.5) * asset.vol;
    const trendShift = i > cfg.bars * 0.72 ? asset.drift * 2.4 : i > cfg.bars * 0.45 ? -asset.drift * 1.7 : asset.drift;
    const open = price;
    const close = Math.max(0.1, price + trendShift + cycle + shock);
    const wick = Math.abs(shock) * 0.35 + asset.vol * 0.35;
    rows.push({ ts: String(i), open, high: Math.max(open, close) + wick, low: Math.min(open, close) - wick, close, state: "Sideways" });
    price = close;
  }
  return rows;
}
function localLabel(candles, tf) {
  const cfg = TF_CONFIG[tf] || TF_CONFIG["1D"];
  return candles.map((bar, i) => {
    if (i < cfg.window) return { ...bar, state: "Sideways", rolling_return: 0 };
    const ret = Math.log(bar.close / candles[i - cfg.window].close);
    return { ...bar, state: ret > cfg.threshold ? "Bull" : ret < -cfg.threshold ? "Bear" : "Sideways", rolling_return: ret };
  });
}
function localMatrix(labelled) {
  const counts = Array.from({ length: 3 }, () => Array(3).fill(0));
  const idx = { Bear: 0, Sideways: 1, Bull: 2 };
  for (let i = 1; i < labelled.length; i++) counts[idx[labelled[i - 1].state]][idx[labelled[i].state]] += 1;
  return counts.map((row) => { const sum = row.reduce((a, b) => a + b, 0); return row.map((v) => (sum ? v / sum : 1 / 3)); });
}
function buildFallback(symbol, tf, smcConfirm, dataQuality, asset) {
  const candles = localLabel(generateMockCandles(symbol, tf, asset), tf);
  const P = localMatrix(candles.slice((TF_CONFIG[tf] || TF_CONFIG["1D"]).window));
  const current = candles[candles.length - 1].state;
  const idx = { Bear: 0, Sideways: 1, Bull: 2 }[current];
  const bull = P[idx][2], bear = P[idx][0], sideways = P[idx][1], edge = bull - bear;
  const action = dataQuality < 80 ? "IGNORE" : Math.abs(edge) < 0.12 || current === "Sideways" ? "WAIT" : !smcConfirm ? "WAIT" : edge > 0 ? "READY_LONG" : "READY_SHORT";
  return { ok: true, source_mode: "mock_fallback", symbol, timeframe: tf, asset: { name: asset.name, symbol }, current: { close: candles[candles.length - 1].close, regime: current, ts: "mock" }, probabilities: { bull, bear, sideways, directional_edge: edge, persistence: P[idx][idx] }, decision: { action, title: action === "IGNORE" ? "Data not reliable enough" : action === "WAIT" ? "Context only, no execution" : action === "READY_LONG" ? "Long setup allowed" : "Short setup allowed", detail: action === "WAIT" ? "Probability context is present, but execution confirmation is not present." : "Fallback decision layer.", bias: edge > 0 ? "Bullish" : edge < 0 ? "Bearish" : "Neutral", reasons: ["Using local fallback metadata for this watchlist symbol."] }, matrix: { Bear: { Bear: P[0][0], Sideways: P[0][1], Bull: P[0][2] }, Sideways: { Bear: P[1][0], Sideways: P[1][1], Bull: P[1][2] }, Bull: { Bear: P[2][0], Sideways: P[2][1], Bull: P[2][2] } }, data_quality: { score: dataQuality, issues: ["mock_mode"] }, candles: candles.slice(-160) };
}
function pct(n) { return `${Math.round((Number(n) || 0) * 100)}%`; }
function fmt(n, symbol) { const value = Number(n); if (!Number.isFinite(value)) return "—"; if (symbol === "BTC-USD" || symbol === "XAUUSD") return value.toLocaleString(undefined, { maximumFractionDigits: 0 }); return value.toLocaleString(undefined, { maximumFractionDigits: value > 100 ? 2 : 4 }); }
function Badge({ children, variant = "default", title = "" }) { const cls = variant === "good" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : variant === "warn" ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-white/10 bg-white/5 text-slate-300"; return <span title={title} className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${cls}`}>{children}</span>; }
function InfoTip({ text }) { return <span title={text} className="inline-flex cursor-help items-center text-slate-400 hover:text-emerald-300"><Info className="h-4 w-4" /></span>; }
function SectionTitle({ title, subtitle, icon, tooltip }) { return <div className="mb-4 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{title}</h2>{tooltip ? <InfoTip text={tooltip} /> : null}</div>{subtitle ? <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p> : null}</div>{icon}</div>; }
function PriceContextCard({ data, symbol, regime, edge }) {
  const width = 580, height = 220, padX = 18, padY = 26;
  const sample = (data || []).slice(-90);
  const hasData = sample.length > 1;
  const highs = sample.map((d) => Number(d.high ?? d.close ?? 0));
  const lows = sample.map((d) => Number(d.low ?? d.close ?? 0));
  const max = hasData ? Math.max(...highs) : 1, min = hasData ? Math.min(...lows) : 0, range = Math.max(0.00001, max - min);
  const x = (i) => padX + (i / Math.max(1, sample.length - 1)) * (width - padX * 2);
  const y = (v) => padY + ((max - v) / range) * (height - padY * 2);
  const path = hasData ? sample.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(Number(d.close))}`).join(" ") : "";
  const close = Number(sample[sample.length - 1]?.close || 0);
  const rangePosition = (close - min) / range;
  const location = rangePosition > 0.72 ? "Extended High" : rangePosition < 0.28 ? "Pullback Area" : "Neutral";
  const locationTone = location === "Neutral" ? "text-yellow-300" : location === "Pullback Area" ? "text-emerald-300" : "text-amber-300";
  const edgePct = Math.round((Number(edge) || 0) * 100);
  const edgeTone = edgePct > 0 ? "text-emerald-300" : edgePct < 0 ? "text-rose-300" : "text-slate-300";
  const regimeTone = regime === "Bull" ? "text-emerald-300" : regime === "Bear" ? "text-rose-300" : "text-yellow-300";
  return <div className="overflow-hidden rounded-3xl border border-yellow-400/20 bg-black/25 p-4 shadow-2xl shadow-black/30"><div className="mb-3 flex items-start justify-between gap-3"><div><div className="text-base font-semibold text-white">Price Context</div><div className="mt-1 text-xs text-slate-400">Shows where price sits within the recent range.</div></div><div className="rounded-2xl border border-yellow-400/25 bg-black/35 px-3 py-2 text-sm font-semibold text-slate-100">Last {fmt(close, symbol)}</div></div><div className="relative rounded-2xl border border-white/10 bg-black/30 p-3"><svg viewBox={`0 0 ${width} ${height}`} className="h-[230px] w-full"><defs><linearGradient id="tbPriceGlow" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="rgba(255,212,0,.28)" /><stop offset="55%" stopColor="rgba(255,212,0,.10)" /><stop offset="100%" stopColor="rgba(255,212,0,0)" /></linearGradient></defs><rect x="0" y="0" width={width} height={height} rx="18" fill="rgba(0,0,0,.18)" />{[0.25, 0.5, 0.75].map((t) => <line key={t} x1="0" x2={width} y1={height * t} y2={height * t} stroke="rgba(255,255,255,.07)" strokeDasharray="4 8" />)}{hasData ? <><line x1="0" x2={width} y1={y(max)} y2={y(max)} stroke="rgba(255,212,0,.35)" strokeDasharray="7 10" /><line x1="0" x2={width} y1={y(min)} y2={y(min)} stroke="rgba(255,212,0,.28)" strokeDasharray="7 10" /><path d={`${path} L${x(sample.length - 1)},${height - padY} L${x(0)},${height - padY} Z`} fill="url(#tbPriceGlow)" opacity="0.75" /><path d={path} fill="none" stroke="rgba(255,212,0,.96)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx={x(sample.length - 1)} cy={y(close)} r="6" fill="white" /></> : null}</svg><div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/70 px-4 py-2 text-sm backdrop-blur"><span className="text-slate-400">Location:</span> <span className={`font-bold ${locationTone}`}>{location}</span></div></div><div className="mt-4 grid gap-3 text-sm md:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="text-xs text-slate-400">Regime</div><div className={`mt-1 font-bold ${regimeTone}`}>{regime} Regime</div></div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="text-xs text-slate-400">Location</div><div className={`mt-1 font-bold ${locationTone}`}>{location}</div></div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="text-xs text-slate-400">Edge</div><div className={`mt-1 font-bold ${edgeTone}`}>{edgePct > 0 ? "+" : ""}{edgePct}%</div></div></div></div>;
}
function Matrix({ matrix, current }) { const P = states.map((r) => states.map((c) => matrix?.[r]?.[c] ?? 0)); return <div className="grid gap-2"><div className="grid grid-cols-4 gap-2 text-xs text-slate-400"><div />{states.map((s) => <div key={s} className="text-center">To {s}</div>)}</div>{states.map((r, i) => <div key={r} className="grid grid-cols-4 items-center gap-2"><div className={`rounded-xl border px-3 py-2 text-xs ${r === current ? stateStyle[r] : "border-white/10 bg-white/5 text-slate-300"}`}>From {r}</div>{states.map((c, j) => <div key={c} className={`rounded-xl border px-3 py-3 text-center font-semibold ${i === j ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-300"}`}>{pct(P[i][j])}</div>)}</div>)}</div>; }
function getWhyDecision(model, smcConfirm) { const current = model.current?.regime || "Sideways", probs = model.probabilities || {}, bull = Math.round((Number(probs.bull) || 0) * 100), bear = Math.round((Number(probs.bear) || 0) * 100), edge = Math.round((Number(probs.directional_edge) || 0) * 100), action = model.decision?.action || "WAIT"; if (action === "IGNORE") return "Trade Banana says IGNORE because the data quality gate failed."; if (action === "READY_LONG") return `READY LONG because ${current} context favors upside, Bull Next is ${bull}%, Bear Next is ${bear}%, and entry confirmation is on.`; if (action === "READY_SHORT") return `READY SHORT because ${current} context favors downside, Bear Next is ${bear}%, Bull Next is ${bull}%, and entry confirmation is on.`; if (!smcConfirm && Math.abs(edge) >= 12 && current !== "Sideways") return `WAIT because context is directional, but entry confirmation is missing. Edge is ${edge}%.`; return `WAIT because there is no clean directional edge. Bull Next is ${bull}% and Bear Next is ${bear}%.`; }
function getEntryReadiness(model, smcConfirm) { const current = model.current?.regime || "Sideways", action = model.decision?.action || "WAIT", edge = Number(model.probabilities?.directional_edge || 0), score = Number(model.data_quality?.score ?? 0); const direction = action === "READY_LONG" || (current === "Bull" && edge >= 0.12) ? "LONG" : action === "READY_SHORT" || (current === "Bear" && edge <= -0.12) ? "SHORT" : "NONE"; const contextPass = score >= 80 && direction !== "NONE", triggerPass = contextPass && (smcConfirm || action === "READY_LONG" || action === "READY_SHORT"); const final = score < 80 ? "IGNORE" : triggerPass ? `READY ${direction}` : contextPass ? `WATCH ${direction}` : "NO SETUP"; return { final, finalTone: final.includes("LONG") ? "bull" : final.includes("SHORT") ? "bear" : final === "IGNORE" ? "danger" : "neutral", summary: triggerPass ? `${direction} context and trigger are aligned.` : contextPass ? `${direction} context is active. Wait for confirmation.` : "No clean entry context yet." }; }
function EntryReadinessCard({ readiness }) { const finalCls = readiness.finalTone === "bull" ? "text-emerald-300" : readiness.finalTone === "bear" ? "text-rose-300" : readiness.finalTone === "danger" ? "text-rose-200" : "text-slate-300"; return <Card className="border-yellow-400/30 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Entry Readiness" subtitle="Context first, trigger last." icon={<Zap className="h-5 w-5 text-yellow-300" />} /><div className="grid gap-3 md:grid-cols-[1fr_2fr]"><div className="rounded-2xl border border-yellow-400/25 bg-black/25 p-4"><div className="text-xs uppercase tracking-[0.2em] text-slate-400">Final Status</div><div className={`mt-2 text-2xl font-bold ${finalCls}`}>{readiness.final}</div></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-300">{readiness.summary} Trade Banana still requires your risk plan before any real trade decision.</div></div></CardContent></Card>; }

export default function FlowStatePrototype() {
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [symbol, setSymbol] = useState(() => safeGet("trade_banana_selected_symbol") || loadWatchlist()[0]?.symbol || "XAUUSD");
  const [tf, setTf] = useState(() => safeGet("trade_banana_selected_timeframe") || "1D");
  const [smcConfirm, setSmcConfirm] = useState(false);
  const [dataQuality, setDataQuality] = useState(94);
  const asset = useMemo(() => assetFor(symbol, watchlist), [symbol, watchlist]);
  const [model, setModel] = useState(() => buildFallback(symbol, tf, false, 94, asset));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { const reload = () => setWatchlist(loadWatchlist()); window.addEventListener("storage", reload); window.addEventListener("trade_banana_watchlist_changed", reload); return () => { window.removeEventListener("storage", reload); window.removeEventListener("trade_banana_watchlist_changed", reload); }; }, []);
  useEffect(() => { if (!watchlist.some((item) => item.symbol === symbol)) setSymbol(watchlist[0]?.symbol || "XAUUSD"); }, [watchlist, symbol]);
  useEffect(() => { safeSet("trade_banana_selected_symbol", symbol); }, [symbol]);
  useEffect(() => { safeSet("trade_banana_selected_timeframe", tf); }, [tf]);

  async function loadAnalysis() {
    const currentAsset = assetFor(symbol, watchlist);
    setLoading(true); setError("");
    try {
      if (!SUPABASE_ANON_KEY) { setModel(buildFallback(symbol, tf, smcConfirm, dataQuality, currentAsset)); setError("Preview is using mock fallback. Set VITE_SUPABASE_ANON_KEY to call the real Supabase Edge Function."); return; }
      const res = await fetch(FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ symbol, timeframe: tf, execution_confirmed: smcConfirm, outputsize: 5000 }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Trade Banana function failed");
      setDataQuality(data.data_quality?.score ?? 0);
      setModel({ ...data, asset: data.asset || { name: currentAsset.name, symbol }, source_mode: "twelve_data_live" });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setModel(buildFallback(symbol, tf, smcConfirm, dataQuality, currentAsset)); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadAnalysis(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [symbol, tf, smcConfirm]);

  const current = model.current?.regime || "Sideways", candles = model.candles || [], decision = model.decision || {}, probs = model.probabilities || {};
  const alertStatus = useMemo(() => getAlertStatus(model), [model]);
  const entryReadiness = useMemo(() => getEntryReadiness(model, smcConfirm), [model, smcConfirm]);
  const tone = decision.action === "READY_LONG" ? "bull" : decision.action === "READY_SHORT" ? "bear" : decision.action === "IGNORE" ? "danger" : decision.bias === "Bullish" || decision.bias === "Bearish" ? "warn" : "neutral";
  const toneClasses = { bull: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100", bear: "border-rose-400/30 bg-rose-500/10 text-rose-100", warn: "border-amber-400/30 bg-amber-500/10 text-amber-100", danger: "border-rose-400/40 bg-rose-500/15 text-rose-100", neutral: "border-slate-400/30 bg-slate-500/10 text-slate-100" };

  return <div className="min-h-screen bg-[#070B0A] p-4 pb-40 text-white md:p-8 md:pb-12"><div className="mx-auto max-w-7xl space-y-5"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><div className="mb-4"><FlowStateLogo variant="full" className="h-14 w-auto md:h-16" /></div><h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Peel back the charts. Find the good stuff.</h1><p className="mt-2 max-w-3xl text-sm text-slate-400 md:text-base">Trade Banana measures the current market regime, checks whether that regime tends to continue, and separates market context from trade execution.</p></div><div className="flex flex-wrap gap-2"><Badge title={model.source_mode === "twelve_data_live" ? "Candles are fetched from Twelve Data and saved before analysis." : "Demo data is active."} variant={model.source_mode === "twelve_data_live" ? "good" : "warn"}><Database className="mr-1 h-3 w-3" /> {model.source_mode === "twelve_data_live" ? "Live market data" : "Demo data active"}</Badge><Badge><Lock className="mr-1 h-3 w-3" /> No live orders</Badge><Badge variant="warn"><Shield className="mr-1 h-3 w-3" /> Decision support</Badge></div></div>{error ? <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</div> : null}<AlertStatusPanel alert={alertStatus} browserAlerts={false} onToggle={() => {}} /><Card className="border-white/10 bg-white/[0.03] shadow-2xl shadow-black/20"><CardContent className="p-4 md:p-5"><div className="grid gap-4 md:grid-cols-[1.1fr_.9fr]"><div className="space-y-4"><div className="flex flex-wrap items-center gap-3"><select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none">{watchlist.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} — {item.name || item.symbol}</option>)}</select><select title="The timeframe controls which candles are analyzed." value={tf} onChange={(e) => setTf(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none">{Object.keys(TF_CONFIG).map((s) => <option key={s} value={s}>{TF_CONFIG[s].label}</option>)}</select><Button onClick={() => setSmcConfirm(!smcConfirm)} className={`rounded-xl ${smcConfirm ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : "bg-white/10 text-white hover:bg-white/15"}`}>{smcConfirm ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />} {smcConfirm ? "Entry confirmed" : "Entry not confirmed"}</Button><Button onClick={loadAnalysis} disabled={loading} className="rounded-xl bg-white/10 text-white hover:bg-white/15">{loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Refresh</Button></div><PriceContextCard data={candles} symbol={symbol} regime={current} edge={probs.directional_edge} /></div><motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-3xl border p-5 ${toneClasses[tone]}`}><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm opacity-75">Trade Permission <InfoTip text="Final decision layer. Combines regime probability, data quality, and entry confirmation." /></div><div className="mt-1 text-4xl font-bold tracking-tight">{String(decision.action || "WAIT").replace("_", " ")}</div></div>{decision.action === "READY_LONG" ? <TrendingUp className="h-9 w-9" /> : decision.action === "READY_SHORT" ? <TrendingDown className="h-9 w-9" /> : <AlertTriangle className="h-9 w-9" />}</div><div className="mt-5 text-xl font-semibold">{decision.title}</div><p className="mt-2 text-sm leading-6 opacity-80">{decision.detail}</p><div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Bull Next</div><div className="text-2xl font-bold">{pct(probs.bull)}</div></div><div className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Bear Next</div><div className="text-2xl font-bold">{pct(probs.bear)}</div></div><div className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Directional Edge</div><div className="text-2xl font-bold">{Math.round((Number(probs.directional_edge) || 0) * 100)}%</div></div></div><div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><HelpCircle className="h-4 w-4" /> Why this decision?</div><p className="text-sm leading-6 opacity-80">{getWhyDecision(model, smcConfirm)}</p></div></motion.div></div></CardContent></Card><EntryReadinessCard readiness={entryReadiness} /><div className="grid gap-5 lg:grid-cols-3"><Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Current Market State" subtitle="Current Bull, Bear, or Sideways classification." icon={<Activity className="h-5 w-5 text-emerald-300" />} /><div className={`inline-flex rounded-2xl border px-4 py-2 text-2xl font-bold ${stateStyle[current]}`}>{current} Regime</div><p className="mt-4 text-sm text-slate-400">Asset behavior: {asset.personality}</p><div className="mt-5 text-sm text-slate-400">As of: {model.current?.ts || "—"}</div></CardContent></Card><Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Data Quality Gate" subtitle="Checks whether candle data is fresh, complete, and usable." icon={<Gauge className="h-5 w-5 text-emerald-300" />} /><div className="text-4xl font-bold">{model.data_quality?.score ?? dataQuality}%</div><div className="mt-5 space-y-2 text-sm text-slate-300">{(model.data_quality?.issues || []).length ? model.data_quality.issues.map((x) => <div key={x} className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-2 text-amber-100">{x}</div>) : <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-2 text-emerald-100">Data is clean — no quality issues detected</div>}</div></CardContent></Card><Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Execution Filter" subtitle="Separates directional context from actual entry timing." icon={<Zap className="h-5 w-5 text-amber-300" />} /><div className="space-y-3"><div className={`rounded-2xl border p-3 ${smcConfirm ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}><div className="font-semibold">Entry confirmation</div><div className="text-sm text-slate-400">Turn on only after sweep, displacement, retest, or your valid entry trigger.</div></div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="font-semibold">Context is not entry</div><div className="text-sm text-slate-400">A probability edge gives bias. Your entry model confirms timing.</div></div></div></CardContent></Card></div><Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Markov Transition Matrix" subtitle="How the market usually moves from one regime to the next." icon={<Activity className="h-5 w-5 text-emerald-300" />} /><Matrix matrix={model.matrix} current={current} /></CardContent></Card></div></div>;
}
