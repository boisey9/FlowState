import React, { useEffect, useState } from "react";
import App from "./App.jsx";
import WatchlistPage from "./pages/WatchlistPage.jsx";
import AlertsPage from "./pages/AlertsPage.jsx";
import BananaAnalysisPage from "./pages/BananaAnalysisPage.jsx";
import TradeBananaNavigation from "./components/TradeBananaNavigation.jsx";

const WATCHLIST_STORAGE_KEY = "trade_banana_watchlist";
const DEFAULT_WATCHLIST = [{ symbol: "XAUUSD", name: "Gold / U.S. Dollar" }];
const KNOWN_ANALYZE_SYMBOLS = ["XAUUSD", "BTC-USD", "SPY", "QQQ", "AAPL", "NVDA", "MSFT", "TSLA"];

function normalizeRoute(value = "") {
  return value
    .replace(/^#/, "")
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function getRoute() {
  const hashRoute = normalizeRoute(window.location.hash);
  const pathRoute = normalizeRoute(window.location.pathname);
  const queryRoute = normalizeRoute(new URLSearchParams(window.location.search).get("view") || "");
  const route = hashRoute || queryRoute || pathRoute;

  if (route === "watchlist") return "watchlist";
  if (route === "alerts") return "alerts";
  if (["banana-analysis", "banana", "analysis-banana", "analyze-banana", "markov", "analyze-markov"].includes(route)) {
    return "banana-analysis";
  }

  return "analyze";
}

function safeLocalStorageGet(key) {
  try {
    return window.localStorage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeLocalStorageSet(key, value) {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Ignore storage errors in private mode.
  }
}

function loadWatchlistItems() {
  try {
    const stored = JSON.parse(safeLocalStorageGet(WATCHLIST_STORAGE_KEY) || "[]");
    if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_WATCHLIST;

    const seen = new Set();
    return stored
      .map((item) => ({
        symbol: String(item?.symbol || "").trim().toUpperCase(),
        name: String(item?.name || item?.symbol || "").trim(),
      }))
      .filter((item) => {
        if (!item.symbol || seen.has(item.symbol)) return false;
        seen.add(item.symbol);
        return true;
      });
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

function getAnalyzeWatchlistItems() {
  const watchlistItems = loadWatchlistItems();
  const items = watchlistItems.length ? watchlistItems : DEFAULT_WATCHLIST;
  return items.map((item) => ({
    ...item,
    supported: KNOWN_ANALYZE_SYMBOLS.includes(item.symbol),
  }));
}

function findAnalyzeSymbolSelect(selects) {
  return selects.find((select) => {
    const values = Array.from(select.options).map((option) => option.value);
    return values.some((value) => KNOWN_ANALYZE_SYMBOLS.includes(value));
  });
}

function syncAnalyzeSymbolDropdownToWatchlist() {
  const items = getAnalyzeWatchlistItems();
  const supportedItems = items.filter((item) => item.supported);
  const selectableItems = supportedItems.length ? supportedItems : DEFAULT_WATCHLIST.map((item) => ({ ...item, supported: true }));
  if (!items.length) return;

  const selects = Array.from(document.querySelectorAll("select"));
  const target = findAnalyzeSymbolSelect(selects);
  if (!target) return;

  const savedSymbol = safeLocalStorageGet("trade_banana_selected_symbol").trim().toUpperCase();
  const selectableSymbols = selectableItems.map((item) => item.symbol);
  const nextValue = selectableSymbols.includes(target.value)
    ? target.value
    : selectableSymbols.includes(savedSymbol)
      ? savedSymbol
      : selectableItems[0].symbol;

  const currentSignature = Array.from(target.options).map((option) => `${option.value}:${option.textContent}:${option.disabled}`).join("|");
  const nextSignature = items.map((item) => `${item.symbol}:${item.symbol} — ${item.name || item.symbol}${item.supported ? "" : " (watchlist only)"}:${!item.supported}`).join("|");

  if (currentSignature !== nextSignature) {
    target.innerHTML = "";
    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.symbol;
      option.disabled = !item.supported;
      option.textContent = `${item.symbol} — ${item.name || item.symbol}${item.supported ? "" : " (watchlist only)"}`;
      target.appendChild(option);
    });
  }

  if (target.value !== nextValue) {
    target.value = nextValue;
    safeLocalStorageSet("trade_banana_selected_symbol", nextValue);
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function applySavedAnalyzeSelection() {
  syncAnalyzeSymbolDropdownToWatchlist();

  const savedSymbol = safeLocalStorageGet("trade_banana_selected_symbol");
  const savedTimeframe = safeLocalStorageGet("trade_banana_selected_timeframe");
  const selects = Array.from(document.querySelectorAll("select"));

  const setSelectValue = (value) => {
    if (!value) return;
    const target = selects.find((select) => Array.from(select.options).some((option) => option.value === value && !option.disabled));
    if (!target || target.value === value) return;
    target.value = value;
    target.dispatchEvent(new Event("change", { bubbles: true }));
  };

  setSelectValue(savedSymbol);
  setSelectValue(savedTimeframe);
}

function AnalyzeSelectionSync({ active }) {
  useEffect(() => {
    if (!active) return;

    const sync = () => applySavedAnalyzeSelection();
    const timers = [0, 80, 250, 600, 1200].map((delay) => window.setTimeout(sync, delay));

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("storage", sync);
    window.addEventListener("trade_banana_watchlist_changed", sync);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
      window.removeEventListener("storage", sync);
      window.removeEventListener("trade_banana_watchlist_changed", sync);
    };
  }, [active]);

  return null;
}

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Trade Banana route crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-[#070B0A] p-6 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-yellow-400/25 bg-black/60 p-5">
          <div className="text-2xl font-bold text-yellow-300">Trade Banana could not load this page.</div>
          <p className="mt-3 text-sm text-slate-300">Refresh the page once. If this keeps happening, the route is loading but one component is crashing on mobile.</p>
          <pre className="mt-4 overflow-auto rounded-2xl bg-black/50 p-3 text-xs text-slate-300">{String(this.state.error?.message || this.state.error)}</pre>
          <button
            className="mt-4 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-semibold text-yellow-300"
            onClick={() => {
              window.location.hash = "#analyze";
              window.location.reload();
            }}
          >
            Back to Analyze
          </button>
        </div>
      </div>
    );
  }
}

export default function TradeBananaRouter() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onRouteChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onRouteChange);
    window.addEventListener("popstate", onRouteChange);
    return () => {
      window.removeEventListener("hashchange", onRouteChange);
      window.removeEventListener("popstate", onRouteChange);
    };
  }, []);

  return (
    <>
      <RouteErrorBoundary key={route}>
        {route === "watchlist" ? (
          <WatchlistPage />
        ) : route === "alerts" ? (
          <AlertsPage />
        ) : route === "banana-analysis" ? (
          <BananaAnalysisPage />
        ) : (
          <App />
        )}
      </RouteErrorBoundary>
      <AnalyzeSelectionSync active={route === "analyze"} />
      <TradeBananaNavigation active={route} />
    </>
  );
}
