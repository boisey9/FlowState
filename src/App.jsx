import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Clock, Database, Gauge, HelpCircle, Info, LineChart, Lock, PlayCircle, RefreshCw, Shield, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent } from "./components/ui/card";
import { Button } from "./components/ui/button";
import FlowStateLogo from "./components/FlowStateLogo";
import AlertStatusPanel, { getAlertStatus } from "./components/AlertStatusPanel";

// FlowState Supabase project created in this chat.
// Add VITE_SUPABASE_ANON_KEY in Vercel/Bolt/Cursor env variables.
const SUPABASE_URL = "https://mauckkqddndphlihnbtt.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/flowstate-analysis`;
const SUPABASE_ANON_KEY = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_ANON_KEY || "" : "";

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
  Transition: "bg-amber-500/15 text-amber-200 border-amber-400/30",
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
  for (let n = 0; n < 80; n++) v = [v[0] * P[0][0] + v[1] * P[1][0] + v[2] * P[2][0], v[0] * P[0][1] + v[1] * P[1][1] + v[2] * P[2][1], v[0] * P[0][2] + v[1] * P[1][2] + v[2] * P[2][2]];
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
    matrix: { Bear: { Bear: P[0][0], Sideways: P[0][1], Bull: P[0][2] }, Sideways: { Bear: P[1][0], Sideways: P[1][1], Bull: P[1][2] }, Bull: { Bear: P[2][0], Sideways: P[2][1], Bull: P[2][2] } },
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
        {sample.map((d, i) => i % 7 === 0 ? <rect key={i} x={x(i) - 1.5} y={y(Math.max(Number(d.open), Number(d.close)))} width="3" height={Math.max(3, Math.abs(y(Number(d.open)) - y(Number(d.close))))} rx="1.5" fill={Number(d.close) >= Number(d.open) ? "rgba(111,240,166,.75)" : "rgba(251,113,133,.75)"} /> : null)}
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
      <div className="grid grid-cols-4 gap-2 text-xs text-slate-400"><div />{states.map(s => <div key={s} className="text-center">To {s}</div>)}</div>
      {states.map((r, i) => (
        <div key={r} className="grid grid-cols-4 gap-2 items-center">
          <div className={`rounded-xl border px-3 py-2 text-xs ${r === current ? stateStyle[r] : "border-white/10 bg-white/5 text-slate-300"}`}>From {r}</div>
          {states.map((c, j) => <div key={c} className={`rounded-xl border px-3 py-3 text-center font-semibold ${i === j ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-300"}`}>{pct(P[i][j])}</div>)}
        </div>
      ))}
    </div>
  );
}

function Badge({ children, variant = "default", title = "" }) {
  const cls = variant === "good" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : variant === "warn" ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : variant === "bad" ? "border-rose-400/30 bg-rose-500/10 text-rose-200" : "border-white/10 bg-white/5 text-slate-300";
  return <span title={title} className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${cls}`}>{children}</span>;
}

function InfoTip({ text }) {
  return (
    <span title={text} className="inline-flex cursor-help items-center text-slate-400 hover:text-emerald-300">
      <Info className="h-4 w-4" />
    </span>
  );
}

function SectionTitle({ title, subtitle, icon, tooltip }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{title}</h2>
          {tooltip ? <InfoTip text={tooltip} /> : null}
        </div>
        {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p> : null}
      </div>
      {icon}
    </div>
  );
}

function getWhyDecision(model, smcConfirm) {
  const current = model.current?.regime || "Sideways";
  const probs = model.probabilities || {};
  const bull = Math.round((Number(probs.bull) || 0) * 100);
  const bear = Math.round((Number(probs.bear) || 0) * 100);
  const edge = Math.round((Number(probs.directional_edge) || 0) * 100);
  const action = model.decision?.action || "WAIT";

  if (action === "IGNORE") {
    return "FlowState says IGNORE because the data quality gate failed. When candles are stale, incomplete, or unreliable, no trading decision should be made from the output.";
  }

  if (action === "READY_LONG") {
    return `FlowState says READY LONG because the current ${current} state favors upside, Bull Next is ${bull}%, Bear Next is ${bear}%, and entry confirmation is turned on. Define invalidation and risk before acting.`;
  }

  if (action === "READY_SHORT") {
    return `FlowState says READY SHORT because the current ${current} state favors downside, Bear Next is ${bear}%, Bull Next is ${bull}%, and entry confirmation is turned on. Define invalidation and risk before acting.`;
  }

  if (!smcConfirm && Math.abs(edge) >= 12 && current !== "Sideways") {
    return `FlowState says WAIT because the market context is directional, but entry confirmation is missing. Current state is ${current}. Bull Next is ${bull}%, Bear Next is ${bear}%, creating a ${edge}% directional edge. Context is present, but timing is not confirmed.`;
  }

  return `FlowState says WAIT because there is no clean directional edge. Bull Next is ${bull}% and Bear Next is ${bear}%, so the model is not showing enough separation to support a trade idea.`;
}

export default function FlowStatePrototype() {
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
        setError("Preview is using mock fallback. Set VITE_SUPABASE_ANON_KEY to call the real Supabase Edge Function.");
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
  const alertStatus = useMemo(() => getAlertStatus(model), [model]);

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
           <div className="mb-4">
            <FlowStateLogo variant="mark" className="h-14 w-14 rounded-2xl md:h-16 md:w-16" />
          </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Peel back the charts. Find the good stuff.</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400 md:text-base">Trade Banana measures the current market regime, checks whether that regime tends to continue, and separates market context from trade execution.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge title={model.source_mode === "twelve_data_live" ? "Candles are fetched from Twelve Data and saved before analysis." : "Demo data is active. Do not use this output for trading decisions."} variant={model.source_mode === "twelve_data_live" ? "good" : "warn"}><Database className="mr-1 h-3 w-3" /> {model.source_mode === "twelve_data_live" ? "Live market data" : "Demo data active"}</Badge>
            <Badge title="FlowState only provides decision support. It does not place trades or connect to a broker."><Lock className="mr-1 h-3 w-3" /> No live orders</Badge>
            <Badge title="Use FlowState as a second opinion before trading. Final trade decisions and risk remain your responsibility." variant="warn"><Shield className="mr-1 h-3 w-3" /> Decision support</Badge>
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</div> : null}
        <AlertStatusPanel
          alert={alertStatus}
          browserAlerts={false}
          onToggle={() => {}}
        />
        <Card className="border-white/10 bg-white/[0.03] shadow-2xl shadow-black/20">
          <CardContent className="p-4 md:p-5">
            <div className="grid gap-4 md:grid-cols-[1.1fr_.9fr]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none">{Object.keys(ASSETS).map((s) => <option key={s} value={s}>{s} — {ASSETS[s].name}</option>)}</select>
                  <select title="The timeframe controls which candles are analyzed. Daily is stronger context; 1H reacts faster but is noisier." value={tf} onChange={(e) => setTf(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none">{Object.keys(TF_CONFIG).map((s) => <option key={s} value={s}>{TF_CONFIG[s].label}</option>)}</select>
                  <Button onClick={() => setSmcConfirm(!smcConfirm)} className={`rounded-xl ${smcConfirm ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : "bg-white/10 text-white hover:bg-white/15"}`}>{smcConfirm ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />} {smcConfirm ? "Entry confirmed" : "Entry not confirmed"}</Button>
                  <Button title="Fetch latest candles, update the regime model, save a new snapshot, and recalculate the decision." onClick={loadAnalysis} disabled={loading} className="rounded-xl bg-white/10 text-white hover:bg-white/15">{loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Refresh</Button>
                </div>
                <MiniChart data={candles} symbol={symbol} />
              </div>

              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-3xl border p-5 ${toneClasses[tone]}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><div className="flex items-center gap-2 text-sm opacity-75">Trade Permission <InfoTip text="Final decision layer. Combines regime probability, data quality, and entry confirmation." /></div><div className="mt-1 text-4xl font-bold tracking-tight">{String(decision.action || "WAIT").replace("_", " ")}</div></div>
                  {decision.action === "READY_LONG" ? <TrendingUp className="h-9 w-9" /> : decision.action === "READY_SHORT" ? <TrendingDown className="h-9 w-9" /> : <AlertTriangle className="h-9 w-9" />}
                </div>
                <div className="mt-5 text-xl font-semibold">{decision.title}</div>
                <p className="mt-2 text-sm leading-6 opacity-80">{decision.detail}</p>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div title="Chance that the next regime state is Bull." className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Bull Next</div><div className="text-2xl font-bold">{pct(probs.bull)}</div></div>
                  <div title="Chance that the next regime state is Bear." className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Bear Next</div><div className="text-2xl font-bold">{pct(probs.bear)}</div></div>
                  <div title="Bull probability minus Bear probability. Positive favors long context. Negative favors short context." className="rounded-2xl bg-black/20 p-3"><div className="text-xs opacity-60">Directional Edge</div><div className="text-2xl font-bold">{Math.round((Number(probs.directional_edge) || 0) * 100)}%</div></div>
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><HelpCircle className="h-4 w-4" /> Why this decision?</div>
                  <p className="text-sm leading-6 opacity-80">{getWhyDecision(model, smcConfirm)}</p>
                </div>
              </motion.div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Current Market State" subtitle="Current Bull, Bear, or Sideways classification based on recent rolling return behavior." icon={<Activity className="h-5 w-5 text-emerald-300" />} tooltip="This tells you the current statistical market state. It is context, not an automatic entry." /><div className={`inline-flex rounded-2xl border px-4 py-2 text-2xl font-bold ${stateStyle[current]}`}>{current} Regime</div><p className="mt-4 text-sm text-slate-400">Asset behavior: {ASSETS[symbol].personality}.</p><div className="mt-5 text-sm text-slate-400">As of: {model.current?.ts || "—"}</div></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Data Quality Gate" subtitle="Checks whether candle data is fresh, complete, and usable before decisions are trusted." icon={<Gauge className="h-5 w-5 text-emerald-300" />} tooltip="Below 80 blocks trading decisions. 90–100 means data is clean enough for analysis." /><div className="text-4xl font-bold">{model.data_quality?.score ?? dataQuality}%</div><div className="mt-5 space-y-2 text-sm text-slate-300">{(model.data_quality?.issues || []).length ? model.data_quality.issues.map((x) => <div key={x} className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-2 text-amber-100">{x}</div>) : <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-2 text-emerald-100">Data is clean — no quality issues detected</div>}</div></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Execution Filter" subtitle="Separates directional context from actual entry timing." icon={<Zap className="h-5 w-5 text-amber-300" />} tooltip="FlowState may show strong context but still say WAIT if entry confirmation is missing." /><div className="space-y-3"><div className={`rounded-2xl border p-3 ${smcConfirm ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}><div className="font-semibold">Entry confirmation</div><div className="text-sm text-slate-400">Turn on only after sweep, displacement, retest, or your valid entry trigger.</div></div><div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="font-semibold">Context is not entry</div><div className="text-sm text-slate-400">A probability edge gives bias. Your entry model confirms timing.</div></div></div></CardContent></Card>
        </div>

        <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Markov Transition Matrix" subtitle="How the market usually moves from one regime to the next. Read the active row first." icon={<BarChart3 className="h-5 w-5 text-emerald-300" />} tooltip="Each row starts with the current regime. Each column shows the probability of the next regime. Rows should add up to 100%." /><Matrix matrix={model.matrix} current={current} /></CardContent></Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Long-run Market Personality" subtitle="Expected long-run balance of regimes if the current transition behavior continues." icon={<LineChart className="h-5 w-5 text-emerald-300" />} tooltip="This does not override the current regime. It describes baseline personality, not the next trade." /><div className="grid grid-cols-3 gap-3">{states.map((s) => <div key={s} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"><div className="text-xs text-slate-400">{s}</div><div className="mt-1 text-3xl font-bold">{pct(stat[s])}</div></div>)}</div><p className="mt-4 text-sm text-slate-400">Long-run mix is model-implied. It describes baseline market personality, not the next trade.</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5"><SectionTitle title="Historical Regime Breakdown" subtitle="How often this asset was classified as Bear, Sideways, or Bull in the analyzed candle sample." icon={<PlayCircle className="h-5 w-5 text-emerald-300" />} tooltip="Sample mix is historical. Long-run mix is model-implied." /><div className="space-y-3">{states.map((s) => <div key={s}><div className="mb-1 flex justify-between text-xs text-slate-400"><span>{s}</span><span>{pct(mix[s])}</span></div><div className="h-2 rounded-full bg-white/10"><div className={`h-2 rounded-full ${s === "Bull" ? "bg-emerald-400" : s === "Bear" ? "bg-rose-400" : "bg-slate-400"}`} style={{ width: pct(mix[s]) }} /></div></div>)}</div></CardContent></Card>
        </div>

        <Card className="border-white/10 bg-white/[0.03]"><CardContent className="p-5">
          <SectionTitle title="How to read this dashboard" subtitle="A calm checklist before acting on any trade idea." icon={<HelpCircle className="h-5 w-5 text-emerald-300" />} />
          <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><b>1. Start with Trade Permission.</b><br />If it says WAIT or IGNORE, do not force a trade.</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><b>2. Check Current Market State.</b><br />This shows Bull, Bear, or Sideways context.</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><b>3. Read the active matrix row.</b><br />It shows what usually happens next from the current state.</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><b>4. Use Directional Edge.</b><br />Positive favors long context. Negative favors short context.</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><b>5. Confirm execution.</b><br />FlowState gives context. Your entry model confirms timing.</div>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}
