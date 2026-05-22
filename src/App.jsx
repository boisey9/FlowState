import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, BarChart3, Brain, CheckCircle2, Clock, Database, Gauge, LineChart, Lock, PlayCircle, RefreshCw, Shield, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent } from "./components/ui/card";
import { Button } from "./components/ui/button";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://mauckkqddndphlihnbtt.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/flowstate-analysis`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const ASSETS = {
  "XAUUSD": { name: "Gold", base: 3340, drift: 0.16, vol: 13.2, personality: "Momentum with sharp liquidation wicks" },
  "BTC-USD": { name: "Bitcoin", base: 103500, drift: 0.28, vol: 620, personality: "High volatility trend transitions" },
  "SPY": { name: "S&P 500 ETF", base: 625, drift: 0.05, vol: 2.8, personality: "Slow persistent equity trend" },
  "QQQ": { name: "Nasdaq ETF", base: 535, drift: 0.08, vol: 4.2, personality: "Growth-led momentum regime" },
  "AAPL": { name: "Apple", base: 212, drift: 0.04, vol: 1.9, personality: "Single-name trend with mean reversion" },
  "NVDA": { name: "NVIDIA", base: 185, drift: 0.11, vol: 3.8, personality: "AI momentum with volatility clusters" },
  "MSFT": { name: "Microsoft", base: 520, drift: 0.06, vol: 2.7, personality: "Persistent large-cap trend behavior" },
  "TSLA": { name: "Tesla", base: 440, drift: 0.09, vol: 8.4, personality: "High beta transitions and mean reversion" },
};

const TF_CONFIG = {
  "1D": { bars: 260, label: "Daily", window: 20, threshold: 0.02 },
  "4H": { bars: 360, label: "4H", window: 30, threshold: 0.018 },
  "1H": { bars: 420, label: "1H", window: 40, threshold: 0.012 },
};

const states = ["Bear", "Sideways", "Bull"];
const stateStyle = {
  Bull: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  Bear: "bg-rose-500/15 text-rose-200 border-rose-400/30",
  Sideways: "bg-slate-500/15 text-slate-200 border-slate-400/25",
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

function buildFallback(symbol, tf, smcConfirm, dataQuality) {
  const candles = localLabel(generateMockCandles(symbol, tf), tf);
  const P = localMatrix(candles.slice(TF_CONFIG[tf].window));
  const current = candles[candles.length - 1].state;
  const idx = { Bear: 0, Sideways: 1, Bull: 2 }[current];
  const bull = P[idx][2];
  const bear = P[idx][0];
  const sideways = P[idx][1];
  const edge = bull - bear;
  const action = dataQuality < 80 ? "IGNORE" : Math.abs(edge) < 0.12 || current === "Sideways" ? "WAIT" : !smcConfirm ? "WAIT" : edge > 0 ? "READY_LONG" : "READY_SHORT";
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
      detail: action === "WAIT" ? "Probability context is present, but this prototype blocks execution until conditions align." : "Prototype decision layer.",
      bias: edge > 0 ? "Bullish" : edge < 0 ? "Bearish" : "Neutral",
      reasons: ["Using local fallback data because the Supabase anon key is not configured in this preview."],
    },
    matrix: {
      Bear: { Bear: P[0][0], Sideways: P[0][1], Bull: P[0][2] },
      Sideways: { Bear: P[1][0], Sideways: P[1][1], Bull: P[1][2] },
      Bull: { Bear: P[2][0], Sideways: P[2][1], Bull: P[2][2] },
    },
    stationary_distribution: Object.fromEntries(states.map((s, i) => [s, localStationary(P)[i]])),
    regime_mix: Object.fromEntries(states.map((s) => [s, candles.filter((c) => c.state === s).length / candles.length])),
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

function matrixArray(matrix) {
  return states.map((r) => states.map((c) => matrix?.[r]?.[c] ?? 0));
}

function MiniChart({ data, symbol }) {
  const width = 580;
  const height = 170;
  const pad = 12;
  const sample = data.slice(-90);
  const max = Math.max(...sample.map((d) => Number(d.high)));
  const min = Math.min(...sample.map((d) => Number(d.low)));
  const x = (i) => pad + (i / Math.max(1, sample.length - 1)) * (width - pad * 2);
  const y = (v) => pad + ((max - v) / Math.max(0.00001, max - min)) * (height - pad * 2);
  const path = sample.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(Number(d.close))}`).join(" ");
  const last = sample[sample.length - 1];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full">
        {[0.25, 0.5, 0.75].map((t) => <line key={t} x1="0" x2={width} y1={height * t} y2={height * t} stroke="rgba(255,255,255,.08)" strokeDasharray="4 6" />)}
        <path d={path} fill="none" stroke="rgba(111,240,166,.9)" strokeWidth="3" strokeLinecap="round" />
        {sample.map((d, i) => i % 7 === 0 ? (
          <rect key={i} x={x(i) - 1.5} y={y(Math.max(Number(d.open), Number(d.close)))} width="3" height={Math.max(3, Math.abs(y(Number(d.open)) - y(Number(d.close))))} rx="1.5" fill={Number(d.close) >= Number(d.open) ? "rgba(111,240,166,.75)" : "rgba(251,113,133,.75)"} />
        ) : null)}
        <circle cx={x(sample.length - 1)} cy={y(Number(last.close))} r="5" fill="white" />
      </svg>
      <div className="absolute right-5 top-4 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-xs text-slate-300">Last {fmt(last.close, symbol)}</div>
    </div>
  );
}

function Matrix({ matrix, current }) {
  const P = matrixArray(matrix);
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-4 gap-2 text-xs text-slate-400">
        <div />{states.map(s => <div key={s} className="text-center">To {s}</div>)}
      </div>
      {states.map((r, i) => (
        <div key={r} className="grid grid-cols-4 gap-2 items-center">
          <div className={`rounded-xl border px-3 py-2 text-xs ${r === current ? stateStyle[r] : "border-white/10 bg-white/5 text-slate-300"}`}>From {r}</div>
          {states.map((c, j) => <div key={c} className={`rounded-xl border px-3 py-3 text-center font-semibold ${i === j ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-300"}`}>{pct(P[i][j])}</div>)}
        </div>
      ))}
    </div>
  );
}

function Badge({ children, variant = "default" }) {
  const cls = variant === "good" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : variant === "warn" ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-white/10 bg-white/5 text-slate-300";
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${cls}`}>{children}</span>;
}

export default function App() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [tf, setTf] = useState("1D");
  const [smcConfirm, setSmcConfirm] = useState(false);
  const [dataQuality, setDataQuality] = useState(94);
  const [model, setModel] = useState(() => buildFallback("XAUUSD", "1D", false, 94));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadAnalysis() {
    setLoading(true);
    setError("");
    try {
      if (!SUPABASE_ANON_KEY) {
        setModel(buildFallback(symbol, tf, smcConfirm, dataQuality));
        setError("Mock fallback: add VITE_SUPABASE_ANON_KEY in Vercel environment variables to call Supabase + Twelve Data.");
        return;
      }

      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ symbol, timeframe: tf, execution_confirmed: smcConfirm, outputsize: 5000 }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "FlowState function failed");
      setDataQuality(data.data_quality?.score ?? 0);
      setModel({ ...data, source_mode: "twelve_data_live" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setModel(buildFallback(symbol, tf, smcConfirm, dataQuality));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, smcConfirm]);

  const current = model.current?.regime || "Sideways";
  const candles = model.candles || [];
  const stat = model.stationary_distribution || { Bear: 0, Sideways: 0, Bull: 0 };
  const mix = model.regime_mix || { Bear: 0, Sideways: 0, Bull: 0 };
  const decision = model.decision || {};
  const probs = model.probabilities || {};

  const tone = decision.action === "READY_LONG" ? "bull" : decision.action === "READY_SHORT" ? "bear" : decision.action === "IGNORE" ? "danger" : decision.bias === "Bullish" || decision.bias === "Bearish" ? "warn" : "neutral";
  const toneClasses = {
    bull: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    bear: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    warn: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    danger: "border-rose-400/40 bg-rose-500/15 text-rose-100",
    neutral: "border-slate-400/30 bg-slate-500/10 text-slate-100",
  };

  return (
    <div className="min-h-screen bg-[#070B0A] p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-emerald-300"><Brain className="h-4 w-4" /> FlowState Prototype</div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Probability-first trading cockpit</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400 md:text-base">Connected to Supabase Edge Function + Twelve Data when the anon public key is configured.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={model.source_mode === "twelve_data_live" ? "good" : "warn"}><Database className="mr-1 h-3 w-3" /> {model.source_mode === "twelve_data_live" ? "Twelve Data live" : "Mock fallback"}</Badge>
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
                  <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none">{Object.keys(ASSETS).map((s) => <option key={s}>{s}</option>)}</select>
                  <select value={tf} onChange={(e) => setTf(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none">{Object.keys(TF_CONFIG).map((s) => <option key={s}>{s}</option>)}</select>
                  <Button onClick={() => setSmcConfirm(!smcConfirm)} className={`rounded-xl ${smcConfirm ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : "bg-white/10 text-white hover:bg-white/15"}`}>{smcConfirm ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />} Execution Confirmed</Button>
                  <Button onClick={loadAnalysis} disabled={loading} className="rounded-xl bg-white/10 text-white hover:bg-white/15">{loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Refresh</Button>
                </div>
                <MiniChart data={candles} symbol={symbol} />
              </div>

              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-3xl border p-5 ${toneClasses[tone]}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><div className="text-sm opacity-75">Trade Permission</div><div className="mt-1 text-4xl font-bold tracking-tight">{String(decision.action || "WAIT").replace("_", " ")}</div></div>
                  {decision.action === "READY_LONG" ? <TrendingUp className="h-9 w-9" /> : decision.action === "READY_SHORT" ? <TrendingDown className="h-9 w-9" /> : <AlertTriangle className="h-9 w-9" />}
                </div>
                <div className="mt-5 text-xl font-semibold">{decision.title}</div>
                <p className="mt-2 text-sm leading-6 opacity-80">{decision.detail}</p>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Bull Prob.</div><div className="text-2xl font-bold">{pct(probs.bull)}</div></div>
                  <div className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Bear Prob.</div><div className="text-2xl font-bold">{pct(probs.bear)}</div></div>
                  <div className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Edge</div><div className="text-2xl font-bold">{Math.round((Number(probs.directional_edge) || 0) * 100)}%</div></div>
                </div>
              </motion.div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Current Regime</h2><Activity className="h-5 w-5 text-emerald-300" /></div><div className={`inline-flex rounded-2xl border px-4 py-2 text-2xl font-bold ${stateStyle[current]}`}>{current}</div><p className="mt-4 text-sm text-slate-400">{ASSETS[symbol].personality}</p><div className="mt-5 text-sm text-slate-400">As of: {model.current?.ts || "—"}</div></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Data Quality Gate</h2><Gauge className="h-5 w-5 text-emerald-300" /></div><div className="text-4xl font-bold">{model.data_quality?.score ?? dataQuality}%</div><div className="mt-5 space-y-2 text-sm text-slate-300">{(model.data_quality?.issues || []).length ? model.data_quality.issues.map((x) => <div key={x} className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-2 text-amber-100">{x}</div>) : <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-2 text-emerald-100">No quality issues detected</div>}</div></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Execution Filter</h2><Zap className="h-5 w-5 text-amber-300" /></div><div className="space-y-3"><div className={`rounded-2xl border p-3 ${smcConfirm ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}><div className="font-semibold">SMC confirmation</div><div className="text-sm text-slate-400">Manual toggle for prototype only</div></div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="font-semibold">Context ≠ entry</div><div className="text-sm text-slate-400">Probability gives direction, not timing</div></div></div></CardContent></Card>
        </div>

        <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Markov Transition Matrix</h2><BarChart3 className="h-5 w-5 text-emerald-300" /></div><Matrix matrix={model.matrix} current={current} /></CardContent></Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Long-run Regime Mix</h2><LineChart className="h-5 w-5 text-emerald-300" /></div><div className="grid grid-cols-3 gap-3">{states.map((s) => <div key={s} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"><div className="text-xs text-slate-400">{s}</div><div className="mt-1 text-3xl font-bold">{pct(stat[s])}</div></div>)}</div><p className="mt-4 text-sm text-slate-400">Baseline long-run distribution based on the active transition matrix.</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Regime Sample Mix</h2><PlayCircle className="h-5 w-5 text-emerald-300" /></div><div className="space-y-3">{states.map((s) => <div key={s}><div className="mb-1 flex justify-between text-xs text-slate-400"><span>{s}</span><span>{pct(mix[s])}</span></div><div className="h-2 rounded-full bg-white/10"><div className={`h-2 rounded-full ${s === "Bull" ? "bg-emerald-400" : s === "Bear" ? "bg-rose-400" : "bg-slate-400"}`} style={{ width: pct(mix[s]) }} /></div></div>)}</div></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
