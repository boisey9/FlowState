import React, { useEffect, useState } from "react";
import App from "./App.jsx";
import WatchlistPage from "./pages/WatchlistPage.jsx";
import TradeBananaNavigation from "./components/TradeBananaNavigation.jsx";

function getRoute() {
  const hash = window.location.hash.replace("#", "").toLowerCase();
  if (hash === "watchlist") return "watchlist";
  return "analyze";
}

function applySavedAnalyzeSelection() {
  const savedSymbol = localStorage.getItem("trade_banana_selected_symbol");
  const savedTimeframe = localStorage.getItem("trade_banana_selected_timeframe");
  const selects = Array.from(document.querySelectorAll("select"));

  const setSelectValue = (value) => {
    if (!value) return;
    const target = selects.find((select) => Array.from(select.options).some((option) => option.value === value));
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
    const timers = [
      window.setTimeout(applySavedAnalyzeSelection, 0),
      window.setTimeout(applySavedAnalyzeSelection, 80),
      window.setTimeout(applySavedAnalyzeSelection, 250),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [active]);

  return null;
}

export default function TradeBananaRouter() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <>
      {route === "watchlist" ? <WatchlistPage /> : <App />}
      <AnalyzeSelectionSync active={route === "analyze"} />
      <TradeBananaNavigation active={route} />
    </>
  );
}
