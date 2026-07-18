import { cn } from "../../lib/utils.js";

export function Spinner({ size = "md", className }) {
  const sizes = { sm: "h-4 w-4", md: "h-8 w-8", lg: "h-12 w-12" };
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-muted border-t-primary",
        sizes[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
