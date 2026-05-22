export default function FlowStateLogo({ variant = "mark", className = "" }) {
  const markClasses = className || "h-8 w-8 rounded-xl";

  if (variant === "full") {
    return (
      <div className={`inline-flex items-center gap-3 ${className || "h-12 w-auto"}`} aria-label="Trade Banana">
        <TradeBananaMark className="h-12 w-12" />
        <div className="leading-none">
          <div className="text-2xl font-black uppercase tracking-tight text-white">Trade</div>
          <div className="text-2xl font-black uppercase tracking-tight text-[#FFD400]">Banana</div>
        </div>
      </div>
    );
  }

  return <TradeBananaMark className={markClasses} />;
}

function TradeBananaMark({ className = "h-8 w-8" }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Trade Banana logo">
      <rect width="64" height="64" rx="16" fill="#050505" />
      <path
        d="M35 8c-7 8-9 16-8 25 1 9-4 15-13 19 9 5 21 3 29-6 9-10 10-25 3-38-3-2-7-2-11 0Z"
        fill="#FFD400"
        stroke="#090909"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M30 10c5 6 8 14 7 23-1 9-6 16-14 20"
        fill="none"
        stroke="#9C8500"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M22 27h8M36 27h8" stroke="#050505" strokeWidth="5" strokeLinecap="round" />
      <path d="M31 35c3 2 7 2 10 0" stroke="#050505" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M39 7c2-3 6-4 10-2-2 4-5 6-10 5Z" fill="#FFD400" stroke="#050505" strokeWidth="2" />
    </svg>
  );
}
