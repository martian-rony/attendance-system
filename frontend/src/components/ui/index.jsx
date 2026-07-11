import { cn } from "../../utils/helpers.js";

export * from "./form.jsx";

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}) {
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50",
    danger: "bg-danger-600 text-white hover:bg-danger-700",
    ghost: "text-gray-600 hover:bg-gray-100",
    success: "bg-success-600 text-white hover:bg-success-700",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white shadow-card border border-gray-100",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({ color = "gray", className, children }) {
  const colors = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-success-50 text-success-700",
    red: "bg-danger-50 text-danger-700",
    yellow: "bg-warning-50 text-warning-600",
    blue: "bg-brand-50 text-brand-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        colors[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ size = "md", className }) {
  const sizes = { sm: "h-4 w-4", md: "h-8 w-8", lg: "h-12 w-12" };
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-gray-300 border-t-brand-600",
        sizes[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingScreen({ message = "Loading..." }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = "md" }) {
  if (!open) return null;
  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full rounded-2xl bg-white shadow-xl animate-fade-in",
          sizes[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function StatCard({
  title,
  value,
  icon: Icon,
  color = "brand",
  subtitle,
  trend,
}) {
  const colors = {
    brand: "text-brand-600 bg-brand-50",
    green: "text-success-600 bg-success-50",
    red: "text-danger-600 bg-danger-50",
    yellow: "text-warning-600 bg-warning-50",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={cn("rounded-xl p-3", colors[color])}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
      {trend && (
        <p className="mt-3 text-xs font-medium text-gray-500">{trend}</p>
      )}
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 px-6 py-12 text-center">
      {Icon && <Icon className="h-12 w-12 text-gray-300" />}
      <h3 className="mt-3 text-sm font-medium text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
