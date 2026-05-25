import React from "react";
import { Bell, Search, Star } from "lucide-react";

export default function TradeBananaNavigation({ active = "analyze" }) {
  const go = (route) => {
    window.location.hash = route === "analyze" ? "#analyze" : `#${route}`;
  };

  const itemClass = (route) =>
    active === route
      ? "border-yellow-400/35 bg-yellow-400/10 text-yellow-300"
      : "border-transparent text-slate-400 hover:text-yellow-300";

  return (
    <>
      <div className="pointer-events-none fixed left-1/2 top-4 z-30 hidden -translate-x-1/2 md:block">
        <div className="pointer-events-auto flex items-center gap-3 rounded-3xl border border-yellow-400/20 bg-black/80 px-4 py-2 backdrop-blur-xl">
          <button onClick={() => go("analyze")} className={`rounded-2xl border px-5 py-2 text-sm font-semibold ${itemClass("analyze")}`}>
            Analyze
          </button>
          <button onClick={() => go("watchlist")} className={`rounded-2xl border px-5 py-2 text-sm font-semibold ${itemClass("watchlist")}`}>
            Watchlist
          </button>
          <button onClick={() => go("alerts")} className={`rounded-2xl border px-5 py-2 text-sm font-semibold ${itemClass("alerts")}`}>
            Alerts
          </button>
        </div>
      </div>

      <div className="trade-banana-bottom-nav fixed bottom-3 left-4 right-4 z-30 grid grid-cols-3 rounded-3xl border border-yellow-400/20 bg-black/90 p-2 text-center text-xs backdrop-blur-xl md:hidden">
        <button onClick={() => go("analyze")} className={`rounded-2xl border p-3 ${itemClass("analyze")}`}>
          <Search className="mx-auto mb-1 h-5 w-5" />
          Analyze
        </button>
        <button onClick={() => go("watchlist")} className={`rounded-2xl border p-3 ${itemClass("watchlist")}`}>
          <Star className="mx-auto mb-1 h-5 w-5" />
          Watchlist
        </button>
        <button onClick={() => go("alerts")} className={`rounded-2xl border p-3 ${itemClass("alerts")}`}>
          <Bell className="mx-auto mb-1 h-5 w-5" />
          Alerts
        </button>
      </div>
    </>
  );
}
