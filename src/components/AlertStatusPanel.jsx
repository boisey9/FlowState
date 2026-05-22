import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, BellRing } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

export function getAlertStatus(model) {
  const current = model.current?.regime || "Sideways";
  const q = Number(model.data_quality?.score ?? 0);
  const p = model.probabilities || {};
  const bull = Number(p.bull || 0);
  const bear = Number(p.bear || 0);
  const edge = Number(p.directional_edge || 0);
  const action = model.decision?.action || "WAIT";

  const pct = (n) => `${Math.round((Number(n) || 0) * 100)}%`;

  if (q < 80 || action === "IGNORE") {
    return {
      level: "DATA_WARNING",
      label: "Data Warning",
      title: "Do not alert from this output",
      detail: "Data quality is below the safe threshold, so FlowState blocks trading context alerts.",
      variant: "danger",
    };
  }

  if (action === "READY_LONG") {
    return {
      level: "READY_LONG",
      label: "Ready Long",
      title: "Trade-ready long context",
      detail: "Probability favors upside and entry confirmation is enabled. Define invalidation and risk before acting.",
      variant: "bull",
    };
  }

  if (action === "READY_SHORT") {
    return {
      level: "READY_SHORT",
      label: "Ready Short",
      title: "Trade-ready short context",
      detail: "Probability favors downside and entry confirmation is enabled. Define invalidation and risk before acting.",
      variant: "bear",
    };
  }

  if (current === "Bull" && bull >= 0.7 && edge >= 0.3) {
    return {
      level: "WATCH_LONG",
      label: "Watch Long",
      title: "Bullish context alert",
      detail: `Bull regime is active. Bull Next is ${pct(bull)} and Directional Edge is ${pct(edge)}. Wait for entry confirmation before taking a trade.`,
      variant: "bull",
    };
  }

  if (current === "Bear" && bear >= 0.7 && edge <= -0.3) {
    return {
      level: "WATCH_SHORT",
      label: "Watch Short",
      title: "Bearish context alert",
      detail: `Bear regime is active. Bear Next is ${pct(bear)} and Directional Edge is ${pct(edge)}. Wait for entry confirmation before taking a trade.`,
      variant: "bear",
    };
  }

  return {
    level: "NO_ALERT",
    label: "No Alert",
    title: "No alert condition",
    detail: "FlowState does not see enough regime persistence or directional edge to trigger a watch alert.",
    variant: "neutral",
  };
}

export function shouldNotify(alert) {
  return ["WATCH_LONG", "WATCH_SHORT", "READY_LONG", "READY_SHORT"].includes(alert.level);
}

export default function AlertStatusPanel({ alert, browserAlerts, onToggle }) {
  const [internalAlerts, setInternalAlerts] = useState(() => localStorage.getItem("flowstate_browser_alerts") === "true");
  const [lastNotified, setLastNotified] = useState("");
  const alertsEnabled = typeof browserAlerts === "boolean" ? browserAlerts || internalAlerts : internalAlerts;

  const classes = {
    bull: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    bear: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    danger: "border-rose-400/40 bg-rose-500/15 text-rose-100",
    neutral: "border-slate-400/30 bg-slate-500/10 text-slate-100",
  };

  const Icon = alert.level.includes("READY") ? BellRing : alert.level === "NO_ALERT" ? Bell : AlertTriangle;
  const buttonText = useMemo(() => {
    if (!("Notification" in window)) return "Browser alerts unavailable";
    if (Notification.permission === "denied") return "Alerts blocked in browser";
    return alertsEnabled ? "Browser alerts on" : "Enable browser alerts";
  }, [alertsEnabled]);

  async function handleToggle() {
    if (!("Notification" in window)) return;

    if (!alertsEnabled && Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
    }

    const next = !alertsEnabled;
    setInternalAlerts(next);
    localStorage.setItem("flowstate_browser_alerts", String(next));

    if (typeof onToggle === "function") {
      onToggle(next);
    }
  }

  useEffect(() => {
    if (!alertsEnabled || !("Notification" in window) || Notification.permission !== "granted" || !shouldNotify(alert)) return;

    const key = `${alert.level}-${alert.title}-${alert.detail}`;
    if (key === lastNotified) return;

    new Notification(`FlowState ${alert.label}`, {
      body: alert.detail,
      icon: "/android-chrome-192x192.png",
    });
    setLastNotified(key);
  }, [alert, alertsEnabled, lastNotified]);

  return (
    <Card className={`border ${classes[alert.variant] || classes.neutral}`}>
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-black/20 p-3">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] opacity-70">Alert Status</div>
              <div className="mt-1 text-2xl font-bold">{alert.label}</div>
              <p className="mt-1 text-sm leading-6 opacity-80">
                <b>{alert.title}</b> — {alert.detail}
              </p>
            </div>
          </div>
          <Button
            onClick={handleToggle}
            disabled={!("Notification" in window) || Notification.permission === "denied"}
            className={`rounded-xl ${alertsEnabled ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : "bg-white/10 text-white hover:bg-white/15"}`}
          >
            {alertsEnabled ? <BellRing className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
            {buttonText}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
