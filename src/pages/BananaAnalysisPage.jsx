import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  HelpCircle,
  Info,
  LineChart,
  Lock,
  RefreshCw,
  Shield,
  Sprout,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import FlowStateLogo from "../components/FlowStateLogo";

const SUPABASE_URL = "https://mauckkqddndphlihnbtt.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/flowstate-analysis`;
const SUPABASE_ANON_KEY = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_ANON_KEY || "" : "";

const ASSETS = {
  XAUUSD: { name: "Gold", base: 3340, drift: 0.16, vol: 13.2, personality: "Momentum with sharp liquidation wicks" },
  "BTC-USD": { name: "Bitcoin", base: 103500, drift: 0.28, vol: 620, personality: "High volatility trend transitions" },
  SPY: { name: "S&P 500 ETF", base: 625, drift: 0.05, vol: 2.8, personality: "Slow persistent equity trend" },
  QQQ: { name: "Nasdaq ETF", base: 535, drift: 0.08, vol: 4.2, personality: "Growth-led momentum regime" },
  AAPL: { name: "Apple", base: 212, drift: 0.04, vol: 1.9, personality: "Single-name trend with mean reversion" },
  NVDA: { name: "NVIDIA", base: 185, drift: 0.11, vol: 3.8, personality: "AI momentum with volatility clusters" },
  MSFT: { name: "Microsoft", base: 520, drift: 0.06, vol: 2.7, personality: "Persistent large-cap trend behavior" },
  TSLA: { name: "Tesla", base: 440, drift: 0.09, vol: 8.4, personality: "High beta transitions and mean reversion" },
};

const TF_CONFIG = {
  "1D": { bars: 260, label: "Daily", window: 20, threshold: 0.02 },
  "4H": { bars: 360, label: "4H", window: 30, threshold: 0.018 },
  "1H": { bars: 420, label: "1H", window: 40, threshold: 0.012 },
};

const REGIMES = ["Bear", "Sideways", "Bull"];
const REGIME_STYLE = {
  Bull: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  Bear: "bg-rose-500/15 text-rose-200 border-rose-400/30",
  Sideways: "bg-slate-500/15 text-slate-200 border-slate-400/25",
};

const BANANA_STYLE = {
  Reset: "border-slate-400/30 bg-slate-500/10 text-slate-100",
  Seed: "border-lime-400/30 bg-lime-500/10 text-lime-100",
  Breakout: "border-yellow-400/35 bg-yellow-400/10 text-yellow-100",
  Ride: "border-emerald-400/35 bg-emerald-500/10 text-emerald-100",
  Peel: "border-amber-400/35 bg-amber-500/10 text-amber-100",
  Split: "border-rose-400/35 bg-rose-500/10 text-rose-100",
};

function seededNoise(seed, index) {
  const x = Math.sin(seed * 999 + index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function generateMockCandles(symbol, tf) {
  const cfg = TF_CONFIG[tf];
  const asset = ASSETS[symbol];
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
  const cfg = TF_CONFIG[tf];
  return candles.map((bar, i) => {
    if (i < cfg.window) return { ...bar, state: "Sideways", rolling_return: 0 };
    const ret = Math.log(bar.close / candles[i - cfg.window].close);
    const state = ret > cfg.threshold ? "Bull" : ret < -cfg.threshold ? "Bear" : "Sideways";
    return { ...bar, state, rolling_return: ret };
  });
}

function localMatrix(labelled) {
  const counts = Array.from({ length: 3 }, () => Array(3).fill(0));
  const idx = { Bear: 0, Sideways: 1, Bull: 2 };
  for (let i = 1; i < labelled.length; i++) counts[idx[labelled[i - 1].state]][idx[labelled[i].state]] += 1;
  return counts.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0);
    return row.map((v) => (sum ? v / sum : 1 / 3));
  });
}

function localStationary(P) {
  let v = [1 / 3, 1 / 3, 1 / 3];
  for (let n = 0; n < 80; n++) {
    v = [
      v[0] * P[0][0] + v[1] * P[1][0] + v[2] * P[2][0],
      v[0] * P[0][1] + v[1] * P[1][1] + v[2] * P[2][1],
      v[0] * P[0][2] + v[1] * P[1][2] + v[2] * P[2][2],
    ];
  }
  return v;
}

function buildFallback(symbol, tf, entryConfirmed, dataQuality) {
  const candles = localLabel(generateMockCandles(symbol, tf), tf);
  const P = localMatrix(candles.slice(TF_CONFIG[tf].window));
  const current = candles[candles.length - 1].state;
  const idx = { Bear: 0, Sideways: 1, Bull: 2 }[current];
  const bull = P[idx][2];
  const bear = P[idx][0];
  const sideways = P[idx][1];
  const edge = bull - bear;
  const action = dataQuality < 80 ? "IGNORE" : Math.abs(edge) < 0.12 || current === "Sideways" ? "WAIT" : !entryConfirmed ? "WAIT" : edge > 0 ? "READY_LONG" : "READY_SHORT";
  return {
    ok: true,
    source_mode: "mock_fallback",
    symbol,
    timeframe: tf,
    asset: { name: ASSETS[symbol].name, symbol },
    current: { close: candles[candles.length - 1].close, regime: current, ts: "mock" },
    probabilities: { bull, bear, sideways, directional_edge: edge, persistence: P[idx][idx] },
    decision: {
      action,
      title: action === "IGNORE" ? "Data not reliable enough" : action === "WAIT" ? (current === "Sideways" ? "No clean directional edge" : "Context only, no execution") : action === "READY_LONG" ? "Long setup allowed" : "Short setup allowed",
      detail: action === "WAIT" ? "Probability context is present, but this page blocks execution until Markov context and entry confirmation align." : "Prototype decision layer.",
      bias: edge > 0 ? "Bullish" : edge < 0 ? "Bearish" : "Neutral",
    },
    matrix: {
      Bear: { Bear: P[0][0], Sideways: P[0][1], Bull: P[0][2] },
      Sideways: { Bear: P[1][0], Sideways: P[1][1], Bull: P[1][2] },
      Bull: { Bear: P[2][0], Sideways: P[2][1], Bull: P[2][2] },
    },
    stationary_distribution: Object.fromEntries(REGIMES.map((s, i) => [s, localStationary(P)[i]])),
    regime_mix: Object.fromEntries(REGIMES.map((s) => [s, candles.filter((c) => c.state === s).length / candles.length])),
    data_quality: { score: dataQuality, issues: ["mock_mode"] },
    candles: candles.slice(-160),
  };
}

function pct(n) {
  return `${Math.round((Number(n) || 0) * 100)}%`;
}

function fmt(n, symbol) {
  if (symbol === "BTC-USD" || symbol === "XAUUSD") return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return Number(n).toFixed(2);
}

function getMatrixRow(model) {
  const current = model.current?.regime || "Sideways";
  const row = model.matrix?.[current] || { Bear: 1 / 3, Sideways: 1 / 3, Bull: 1 / 3 };
  return {
    current,
    bear: Number(row.Bear || 0),
    sideways: Number(row.Sideways || 0),
    bull: Number(row.Bull || 0),
    persistence: Number(row[current] || 0),
  };
}

function getPriceLocation(candles, model) {
  const sample = (candles || []).slice(-30);
  if (!sample.length) return { location: "Neutral", rangePosition: 0.5 };
  const high = Math.max(...sample.map((d) => Number(d.high ?? d.close ?? 0)));
  const low = Math.min(...sample.map((d) => Number(d.low ?? d.close ?? 0)));
  const close = Number(sample[sample.length - 1]?.close ?? model.current?.close ?? 0);
  const rangePosition = (close - low) / Math.max(0.00001, high - low);
  return {
    rangePosition,
    location: rangePosition > 0.72 ? "Extended High" : rangePosition < 0.28 ? "Pullback Area" : "Neutral",
  };
}

function interpretBananaState(model) {
  const row = getMatrixRow(model);
  const edge = Number(model.probabilities?.directional_edge || row.bull - row.bear);
  const absEdge = Math.abs(edge);
  const quality = Number(model.data_quality?.score ?? 0);
  const candles = model.candles || [];
  const { rangePosition } = getPriceLocation(candles, model);
  const latest = candles[candles.length - 1] || {};
  const previous = candles[candles.length - 8] || latest;
  const momentum = latest.close && previous.close ? (latest.close - previous.close) / previous.close : 0;
  const strongDirectional = absEdge >= 0.12 && row.current !== "Sideways";
  const risingFromSideways = row.current === "Sideways" && Math.max(row.bull, row.bear) >= 0.34 && row.sideways <= 0.52;
  const extended = rangePosition > 0.75 || rangePosition < 0.25;
  const weakeningTrend = row.current !== "Sideways" && row.persistence < 0.58;
  const oppositeRisk = row.current === "Bull" ? row.bear : row.current === "Bear" ? row.bull : 0;

  if (quality < 80) {
    return {
      state: "Reset",
      emoji: "🔄",
      title: "Banana Reset",
      permission: "IGNORE",
      riskTag: "Data quality gate failed",
      summary: "Candle data is not clean enough. The safest Banana state is Reset until data improves.",
      smartAction: "Do not act on this output.",
      confidence: Math.max(35, quality),
    };
  }

  if (strongDirectional && row.persistence >= 0.62 && !extended) {
    return {
      state: "Ride",
      emoji: "🍌",
      title: "Banana Ride",
      permission: "WATCH",
      riskTag: "Trend body",
      summary: "The 3-state Markov matrix still favors regime persistence. This is the cleanest participation phase, but timing still needs confirmation.",
      smartAction: "Look for a clean pullback or continuation trigger. Do not chase the candle.",
      confidence: Math.min(92, 58 + Math.round(row.persistence * 35)),
    };
  }

  if (strongDirectional && (extended || weakeningTrend || oppositeRisk >= 0.22)) {
    return {
      state: "Peel",
      emoji: "⚠️",
      title: "Banana Peel",
      permission: "WAIT",
      riskTag: "Exhaustion risk rising",
      summary: "The underlying Markov regime is still directional, but the move is less clean. Late entries can slip here.",
      smartAction: "Protect gains or wait for a reset. Avoid forcing late continuation entries.",
      confidence: Math.min(88, 50 + Math.round((absEdge + oppositeRisk) * 80)),
    };
  }

  if (row.current !== "Sideways" && oppositeRisk >= 0.30) {
    return {
      state: "Split",
      emoji: "💥",
      title: "Banana Split",
      permission: "WAIT",
      riskTag: "Distribution / reversal risk",
      summary: "Opposite-regime probability is high enough that the move may be transitioning. This is not a clean trend participation zone.",
      smartAction: "Wait for a confirmed reset or a fresh breakout. Do not guess the reversal.",
      confidence: Math.min(86, 48 + Math.round(oppositeRisk * 100)),
    };
  }

  if (risingFromSideways && Math.abs(momentum) > 0.003) {
    return {
      state: "Breakout",
      emoji: "🚀",
      title: "Banana Breakout",
      permission: "WATCH",
      riskTag: "Expansion starting",
      summary: "The market is trying to leave the neutral regime. Breakout is forming, but the 3-state matrix still needs cleaner confirmation.",
      smartAction: "Watch for follow-through. Confirmation matters more than prediction.",
      confidence: Math.min(84, 45 + Math.round(Math.max(row.bull, row.bear) * 80)),
    };
  }

  if (row.current === "Sideways" && row.persistence >= 0.55 && Math.abs(momentum) < 0.004) {
    return {
      state: "Seed",
      emoji: "🌱",
      title: "Banana Seed",
      permission: "WAIT",
      riskTag: "Compression / forming",
      summary: "The market is forming inside a sideways regime. There may be future expansion, but the current edge is not tradable yet.",
      smartAction: "Observe. Let the market choose direction before acting.",
      confidence: Math.min(80, 45 + Math.round(row.persistence * 50)),
    };
  }

  return {
    state: "Reset",
    emoji: "🔄",
    title: "Banana Reset",
    permission: "WAIT",
    riskTag: "Range / no clean edge",
    summary: "The real Markov matrix does not show enough separation between Bull, Bear, and Sideways probabilities.",
    smartAction: "Stay patient until Banana Breakout or Banana Ride becomes clearer.",
    confidence: Math.min(78, 44 + Math.round(row.sideways * 55)),
  };
}

function getWhyBanana(model, banana) {
  const row = getMatrixRow(model);
  const edge = Math.round((Number(model.probabilities?.directional_edge || row.bull - row.bear)) * 100);
  return `Trade Banana uses the actual 3-state Markov matrix underneath. Current raw regime is ${row.current}: Bull Next ${pct(row.bull)}, Sideways Next ${pct(row.sideways)}, Bear Next ${pct(row.bear)}, with ${edge}% directional edge. The Banana label is only the user-facing interpretation layer.`;
}

function InfoTip({ text }) {
  return <span title={text} className="inline-flex cursor-help items-center text-slate-400 hover:text-emerald-300"><Info className="h-4 w-4" /></span>;
}

function Badge({ children, variant = "default", title = "" }) {
  const cls = variant === "good" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : variant === "warn" ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-white/10 bg-white/5 text-slate-300";
  return <span title={title} className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${cls}`}>{children}</span>;
}

function SectionTitle({ title, subtitle, icon, tooltip }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><h2 className="font-semibold">{title}</h2>{tooltip ? <InfoTip text={tooltip} /> : null}</div>
        {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p> : null}
      </div>
      {icon}
    </div>
  );
}

function PriceContextCard({ data, symbol, regime, edge }) {
  const width = 580;
  const height = 220;
  const padX = 18;
  const padY = 26;
  const sample = data.slice(-90);
  const highs = sample.map((d) => Number(d.high ?? d.close ?? 0));
  const lows = sample.map((d) => Number(d.low ?? d.close ?? 0));
  const max = sample.length ? Math.max(...highs) : 1;
  const min = sample.length ? Math.min(...lows) : 0;
  const range = Math.max(0.00001, max - min);
  const x = (i) => padX + (i / Math.max(1, sample.length - 1)) * (width - padX * 2);
  const y = (v) => padY + ((max - v) / range) * (height - padY * 2);
  const path = sample.length > 1 ? sample.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(Number(d.close))}`).join(" ") : "";
  const close = Number(sample[sample.length - 1]?.close || 0);
  const rangePosition = (close - min) / range;
  const location = rangePosition > 0.72 ? "Extended High" : rangePosition < 0.28 ? "Pullback Area" : "Neutral";
  const edgePct = Math.round((Number(edge) || 0) * 100);

  return (
    <div className="overflow-hidden rounded-3xl border border-yellow-400/20 bg-black/25 p-4 shadow-2xl shadow-black/30">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><div className="text-base font-semibold text-white">Price Context</div><div className="mt-1 text-xs text-slate-400">Shows where price sits within the recent range.</div></div>
        <div className="rounded-2xl border border-yellow-400/25 bg-black/35 px-3 py-2 text-sm font-semibold text-slate-100">Last {fmt(close, symbol)}</div>
      </div>
      <div className="relative rounded-2xl border border-white/10 bg-black/30 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[230px] w-full">
          <defs><linearGradient id="bananaPriceGlow" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="rgba(255,212,0,.28)" /><stop offset="100%" stopColor="rgba(255,212,0,0)" /></linearGradient></defs>
          {[0.25, 0.5, 0.75].map((t) => <line key={t} x1="0" x2={width} y1={height * t} y2={height * t} stroke="rgba(255,255,255,.07)" strokeDasharray="4 8" />)}
          {sample.length > 1 ? <><line x1="0" x2={width} y1={y(max)} y2={y(max)} stroke="rgba(255,212,0,.35)" strokeDasharray="7 10" /><line x1="0" x2={width} y1={y(min)} y2={y(min)} stroke="rgba(255,212,0,.28)" strokeDasharray="7 10" /><path d={`${path} L${x(sample.length - 1)},${height - padY} L${x(0)},${height - padY} Z`} fill="url(#bananaPriceGlow)" /><path d={path} fill="none" stroke="rgba(255,212,0,.96)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx={x(sample.length - 1)} cy={y(close)} r="6" fill="white" /></> : null}
        </svg>
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/70 px-4 py-2 text-sm backdrop-blur"><span className="text-slate-400">Location:</span> <span className="font-bold text-yellow-300">{location}</span></div>
      </div>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="text-xs text-slate-400">Raw Regime</div><div className="mt-1 font-bold text-yellow-300">{regime}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="text-xs text-slate-400">Location</div><div className="mt-1 font-bold text-yellow-300">{location}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="text-xs text-slate-400">Edge</div><div className={`mt-1 font-bold ${edgePct > 0 ? "text-emerald-300" : edgePct < 0 ? "text-rose-300" : "text-slate-300"}`}>{edgePct > 0 ? "+" : ""}{edgePct}%</div></div>
      </div>
    </div>
  );
}

function Matrix({ matrix, current }) {
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-4 gap-2 text-xs text-slate-400"><div />{REGIMES.map((s) => <div key={s} className="text-center">To {s}</div>)}</div>
      {REGIMES.map((r) => (
        <div key={r} className="grid grid-cols-4 gap-2 items-center">
          <div className={`rounded-xl border px-3 py-2 text-xs ${r === current ? REGIME_STYLE[r] : "border-white/10 bg-white/5 text-slate-300"}`}>From {r}</div>
          {REGIMES.map((c) => <div key={c} className={`rounded-xl border px-3 py-3 text-center font-semibold ${r === c ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-300"}`}>{pct(matrix?.[r]?.[c])}</div>)}
        </div>
      ))}
    </div>
  );
}

function BananaInterpretationCard({ banana, model, entryConfirmed }) {
  const row = getMatrixRow(model);
  const permission = banana.permission === "IGNORE" ? "IGNORE" : banana.state === "Ride" && entryConfirmed ? "READY" : banana.permission;
  const tone = BANANA_STYLE[banana.state] || BANANA_STYLE.Reset;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-3xl border p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm opacity-75">Banana Permission <InfoTip text="The actual Markov matrix stays 3-state. Banana labels are the user-facing interpretation layer." /></div>
          <div className="mt-1 text-4xl font-bold tracking-tight">{permission}</div>
          <div className="mt-3 inline-flex rounded-2xl border border-current/30 bg-black/20 px-4 py-2 text-2xl font-bold">{banana.emoji} {banana.title}</div>
        </div>
        {banana.state === "Ride" ? <TrendingUp className="h-9 w-9" /> : banana.state === "Peel" || banana.state === "Split" ? <AlertTriangle className="h-9 w-9" /> : banana.state === "Breakout" ? <Zap className="h-9 w-9" /> : banana.state === "Seed" ? <Sprout className="h-9 w-9" /> : <Clock className="h-9 w-9" />}
      </div>
      <div className="mt-5 text-xl font-semibold">{banana.riskTag}</div>
      <p className="mt-2 text-sm leading-6 opacity-85">{banana.summary}</p>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Raw Regime</div><div className="text-2xl font-bold">{row.current}</div></div>
        <div className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Confidence</div><div className="text-2xl font-bold">{banana.confidence}%</div></div>
        <div className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Persistence</div><div className="text-2xl font-bold">{pct(row.persistence)}</div></div>
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><HelpCircle className="h-4 w-4" /> Why this Banana state?</div>
        <p className="text-sm leading-6 opacity-85">{getWhyBanana(model, banana)}</p>
        <p className="mt-2 text-sm leading-6 opacity-85"><b>Smart action:</b> {banana.smartAction}</p>
      </div>
    </motion.div>
  );
}

function BananaStateRail({ active }) {
  const states = [
    { key: "Seed", label: "Banana Seed", icon: "🌱", note: "forming" },
    { key: "Breakout", label: "Banana Breakout", icon: "🚀", note: "expansion" },
    { key: "Ride", label: "Banana Ride", icon: "🍌", note: "trend body" },
    { key: "Peel", label: "Banana Peel", icon: "⚠️", note: "exhaustion" },
    { key: "Split", label: "Banana Split", icon: "💥", note: "distribution" },
    { key: "Reset", label: "Banana Reset", icon: "🔄", note: "no edge" },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
      {states.map((s) => <div key={s.key} className={`rounded-2xl border p-3 ${active === s.key ? BANANA_STYLE[s.key] : "border-white/10 bg-white/5 text-slate-300"}`}><div className="text-lg font-bold">{s.icon} {s.label}</div><div className="text-xs opacity-70">{s.note}</div></div>)}
    </div>
  );
}

export default function BananaAnalysisPage() {
  const [symbol, setSymbol] = useState(() => localStorage.getItem("trade_banana_selected_symbol") || "XAUUSD");
  const [tf, setTf] = useState(() => localStorage.getItem("trade_banana_selected_timeframe") || "1D");
  const [entryConfirmed, setEntryConfirmed] = useState(false);
  const [dataQuality, setDataQuality] = useState(94);
  const [model, setModel] = useState(() => buildFallback(symbol, tf, false, 94));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadAnalysis() {
    setLoading(true);
    setError("");
    localStorage.setItem("trade_banana_selected_symbol", symbol);
    localStorage.setItem("trade_banana_selected_timeframe", tf);
    try {
      if (!SUPABASE_ANON_KEY) {
        setModel(buildFallback(symbol, tf, entryConfirmed, dataQuality));
        setError("Preview is using mock fallback. Set VITE_SUPABASE_ANON_KEY to call the real Supabase Edge Function.");
        return;
      }
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ symbol, timeframe: tf, execution_confirmed: entryConfirmed, outputsize: 5000 }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Trade Banana function failed");
      setDataQuality(data.data_quality?.score ?? 0);
      setModel({ ...data, source_mode: "twelve_data_live" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setModel(buildFallback(symbol, tf, entryConfirmed, dataQuality));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, entryConfirmed]);

  const current = model.current?.regime || "Sideways";
  const candles = model.candles || [];
  const stat = model.stationary_distribution || { Bear: 0, Sideways: 0, Bull: 0 };
  const mix = model.regime_mix || { Bear: 0, Sideways: 0, Bull: 0 };
  const probs = model.probabilities || {};
  const banana = useMemo(() => interpretBananaState(model), [model]);
  const row = getMatrixRow(model);

  return (
    <div className="min-h-screen bg-[#070B0A] p-4 pb-28 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-4"><FlowStateLogo variant="full" className="h-14 w-54 rounded-2xl md:h-16 md:w-16" /></div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Banana Analysis</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400 md:text-base">The actual Markov matrix stays simple: Bear, Sideways, Bull. Trade Banana translates it into Banana Seed, Breakout, Ride, Peel, Split, or Reset for easier decision support.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge title={model.source_mode === "twelve_data_live" ? "Candles are fetched from live market data before analysis." : "Demo data is active. Do not use this output for trading decisions."} variant={model.source_mode === "twelve_data_live" ? "good" : "warn"}><Database className="mr-1 h-3 w-3" /> {model.source_mode === "twelve_data_live" ? "Live market data" : "Demo data active"}</Badge>
            <Badge><Lock className="mr-1 h-3 w-3" /> No live orders</Badge>
            <Badge variant="warn"><Shield className="mr-1 h-3 w-3" /> Decision support</Badge>
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</div> : null}

        <Card className="border-white/10 bg-white/[0.03] shadow-2xl shadow-black/20">
          <CardContent className="p-4 md:p-5">
            <div className="grid gap-4 md:grid-cols-[1.1fr_.9fr]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none">{Object.keys(ASSETS).map((s) => <option key={s} value={s}>{s} — {ASSETS[s].name}</option>)}</select>
                  <select title="The timeframe controls which candles are analyzed. Daily is stronger context; 1H reacts faster but is noisier." value={tf} onChange={(e) => setTf(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none">{Object.keys(TF_CONFIG).map((s) => <option key={s} value={s}>{TF_CONFIG[s].label}</option>)}</select>
                  <Button onClick={() => setEntryConfirmed(!entryConfirmed)} className={`rounded-xl ${entryConfirmed ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : "bg-white/10 text-white hover:bg-white/15"}`}>{entryConfirmed ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />} {entryConfirmed ? "Entry confirmed" : "Entry not confirmed"}</Button>
                  <Button onClick={loadAnalysis} disabled={loading} className="rounded-xl bg-white/10 text-white hover:bg-white/15">{loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Refresh</Button>
                </div>
                <PriceContextCard data={candles} symbol={symbol} regime={current} edge={probs.directional_edge} />
              </div>
              <BananaInterpretationCard banana={banana} model={model} entryConfirmed={entryConfirmed} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Banana State Map" subtitle="Six labels, but not six statistical buckets. This protects accuracy by keeping the real Markov math at 3 states." icon={<Sprout className="h-5 w-5 text-yellow-300" />} tooltip="The active Banana state is derived from raw regime, transition edge, persistence, data quality, price location, and simple exhaustion filters." /><BananaStateRail active={banana.state} /></CardContent></Card>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Current Raw Markov Regime" subtitle="This is the real statistical classification used underneath Banana Analysis." icon={<Activity className="h-5 w-5 text-emerald-300" />} tooltip="Bear, Sideways, and Bull remain the source of truth for probability math." /><div className={`inline-flex rounded-2xl border px-4 py-2 text-2xl font-bold ${REGIME_STYLE[current]}`}>{current} Regime</div><p className="mt-4 text-sm text-slate-400">Asset behavior: {ASSETS[symbol].personality}.</p><div className="mt-5 text-sm text-slate-400">As of: {model.current?.ts || "—"}</div></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Transition Edge" subtitle="The active row from the 3-state Markov matrix." icon={<Gauge className="h-5 w-5 text-emerald-300" />} tooltip="This is where Banana Analysis decides whether Reset, Breakout, Ride, Peel, or Split makes sense." /><div className="grid grid-cols-3 gap-2"><div className="rounded-2xl bg-black/25 p-3"><div className="text-xs text-slate-400">Bear</div><div className="text-2xl font-bold">{pct(row.bear)}</div></div><div className="rounded-2xl bg-black/25 p-3"><div className="text-xs text-slate-400">Sideways</div><div className="text-2xl font-bold">{pct(row.sideways)}</div></div><div className="rounded-2xl bg-black/25 p-3"><div className="text-xs text-slate-400">Bull</div><div className="text-2xl font-bold">{pct(row.bull)}</div></div></div><p className="mt-4 text-sm text-slate-400">Directional edge: {Math.round((Number(probs.directional_edge) || 0) * 100)}%</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Data Quality Gate" subtitle="Candle data must be fresh, complete, and usable before decisions are trusted." icon={<Database className="h-5 w-5 text-emerald-300" />} tooltip="Below 80 blocks Banana Analysis permission." /><div className="text-4xl font-bold">{model.data_quality?.score ?? dataQuality}%</div><div className="mt-5 space-y-2 text-sm text-slate-300">{(model.data_quality?.issues || []).length ? model.data_quality.issues.map((x) => <div key={x} className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-2 text-amber-100">{x}</div>) : <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-2 text-emerald-100">Data is clean — no quality issues detected</div>}</div></CardContent></Card>
        </div>

        <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Actual Markov Regime Matrix" subtitle="Accuracy layer: Bear, Sideways, Bull. Read the active row first." icon={<BarChart3 className="h-5 w-5 text-emerald-300" />} tooltip="Rows should add up to 100%. Banana labels do not replace this matrix." /><Matrix matrix={model.matrix} current={current} /></CardContent></Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Long-run Market Personality" subtitle="Expected long-run balance of raw regimes if the current transition behavior continues." icon={<LineChart className="h-5 w-5 text-emerald-300" />} tooltip="This is model-implied and describes baseline personality, not the next trade." /><div className="grid grid-cols-3 gap-3">{REGIMES.map((s) => <div key={s} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"><div className="text-xs text-slate-400">{s}</div><div className="mt-1 text-3xl font-bold">{pct(stat[s])}</div></div>)}</div><p className="mt-4 text-sm text-slate-400">Long-run mix is model-implied. Banana Analysis uses this for personality only, not execution.</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Historical Regime Breakdown" subtitle="How often this asset was classified as Bear, Sideways, or Bull in the analyzed candle sample." icon={<BarChart3 className="h-5 w-5 text-emerald-300" />} tooltip="Sample mix is historical. Banana labels are derived after this raw layer." /><div className="space-y-3">{REGIMES.map((s) => <div key={s}><div className="mb-1 flex justify-between text-xs text-slate-400"><span>{s}</span><span>{pct(mix[s])}</span></div><div className="h-2 rounded-full bg-white/10"><div className={`h-2 rounded-full ${s === "Bull" ? "bg-emerald-400" : s === "Bear" ? "bg-rose-400" : "bg-slate-400"}`} style={{ width: pct(mix[s]) }} /></div></div>)}</div></CardContent></Card>
        </div>

        <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="How to read Banana Analysis" subtitle="A calm checklist before acting on any trade idea." icon={<HelpCircle className="h-5 w-5 text-emerald-300" />} /><div className="grid gap-3 text-sm text-slate-300 md:grid-cols-5"><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><b>1. Start with Banana Permission.</b><br />WAIT or IGNORE means do not force a trade.</div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><b>2. Check the Banana state.</b><br />Seed, Breakout, Ride, Peel, Split, or Reset explains market phase.</div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><b>3. Read the raw matrix.</b><br />Bear, Sideways, Bull remains the actual probability engine.</div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><b>4. Separate context from entry.</b><br />Banana Ride can favor participation, but entry still needs timing.</div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><b>5. Respect Peel and Split.</b><br />These are caution states for late chasing and reversal guessing.</div></div></CardContent></Card>
      </div>
    </div>
  );
}
