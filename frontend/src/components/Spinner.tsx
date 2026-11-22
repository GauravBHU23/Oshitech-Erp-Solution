export default function Spinner({ className = "" }: { className?: string }) {
  return <span aria-label="Loading" role="status" className={`inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}
