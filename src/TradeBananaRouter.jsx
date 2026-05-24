import React, { useEffect, useState } from "react";
import App from "./App.jsx";
import WatchlistPage from "./pages/WatchlistPage.jsx";
import TradeBananaNavigation from "./components/TradeBananaNavigation.jsx";

function getRoute() {
  const hash = window.location.hash.replace("#", "").toLowerCase();
  if (hash === "watchlist") return "watchlist";
  return "analyze";
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
      <TradeBananaNavigation active={route} />
    </>
  );
}
