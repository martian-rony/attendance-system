import { cn } from "../../utils/helpers.js";
// Explicit imports for primitives used by the legacy helpers defined in this
// file. `export *` re-exports them to consumers but does NOT bring the binding
// into this module's own scope, so they must be imported here too.
import { Card } from "./card.jsx";
import { Spinner } from "./spinner.jsx";

// Re-export shadcn-style primitives
export * from "./button.jsx";
export * from "./card.jsx";
export * from "./input.jsx";
export * from "./label.jsx";
export * from "./badge.jsx";
export * from "./dialog.jsx";
export * from "./textarea.jsx";
export * from "./table.jsx";
export * from "./select.jsx";
export * from "./dropdown-menu.jsx";
export * from "./tabs.jsx";
export * from "./avatar.jsx";
export * from "./separator.jsx";
export * from "./sheet.jsx";
export * from "./skeleton.jsx";
export * from "./switch.jsx";
export * from "./tooltip.jsx";
export * from "./sonner.jsx";
export * from "./spinner.jsx";

export { cn };

// DataTable is still provided by form.jsx (kept during migration).
export { DataTable } from "./form.jsx";

// ---- Legacy helpers retained for incremental migration ----
// These use the new token classes where possible so existing pages keep working
// and render consistently with the shadcn system.

export function StatCard({ title, value, icon: Icon, color = "primary", subtitle }) {
  const colors = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
    warning: "text-warning bg-warning/10",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {value}
          </p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={cn("rounded-xl p-3", colors[color])}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      {Icon && <Icon className="h-12 w-12 text-muted-foreground/50" />}
      <h3 className="mt-3 text-sm font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorAlert({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

export function SuccessAlert({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
      {message}
    </div>
  );
}

export function LoadingScreen({ message = "Loading..." }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

// Legacy modal kept for pages not yet migrated to Dialog.
export function Modal({ open, onClose, title, children, footer, size = "md" }) {
  if (!open) return null;
  const sizes = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full rounded-xl border bg-background text-foreground shadow-xl animate-fade-in",
          sizes[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
