export default function FlowStateLogo({ variant = "mark", className = "" }) {
  const full = variant === "full";
  const imagePath = full ? String.fromCharCode(47) + "logo/trade-banana-full.png" : String.fromCharCode(47) + "logo/trade-banana-mark.png";
  const classes = className || (full ? "h-12 w-auto" : "h-8 w-8 rounded-xl");
  return <img src={imagePath} alt="Trade Banana" className={classes} />;
}
