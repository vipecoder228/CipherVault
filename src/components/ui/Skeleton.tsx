export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-vault-surface rounded ${className}`} />
}
