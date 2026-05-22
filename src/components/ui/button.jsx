export function Button({ className = '', children, disabled = false, ...props }) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
