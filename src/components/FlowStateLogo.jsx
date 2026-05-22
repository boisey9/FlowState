export default function FlowStateLogo({ variant = "mark", className = "" }) {
  if (variant === "full") {
    return (
      <img
        src="/logo/flowstate-full.png"
        alt="FlowState"
        className={className || "h-10 w-auto"}
      />
    );
  }

  return (
    <img
      src="/logo/flowstate-mark.png"
      alt="FlowState logo"
      className={className || "h-8 w-8 rounded-xl"}
    />
  );
}
