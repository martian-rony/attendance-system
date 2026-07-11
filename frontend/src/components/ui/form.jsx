import { forwardRef } from "react";
import { cn } from "../../utils/helpers.js";

export const Input = forwardRef(function Input(
  { label, error, className, id, ...props },
  ref,
) {
  const inputId = id || props.name;
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        className={cn(
          "block w-full rounded-xl border px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1",
          error
            ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500"
            : "border-gray-300 focus:border-brand-500 focus:ring-brand-500",
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
});

export const Select = forwardRef(function Select(
  { label, error, className, id, children, ...props },
  ref,
) {
  const selectId = id || props.name;
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        ref={ref}
        className={cn(
          "block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
          error && "border-danger-500",
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, error, className, id, ...props },
  ref,
) {
  const textareaId = id || props.name;
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        ref={ref}
        className={cn(
          "block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
          error && "border-danger-500",
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
});

export function DataTable({
  columns,
  data,
  loading,
  emptyMessage = "No data available",
  onRowClick,
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-brand-600" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.map((row, idx) => (
            <tr
              key={row._id || idx}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "transition-colors",
                onRowClick && "cursor-pointer hover:bg-gray-50",
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-gray-700">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Avatar({ name, src, size = "md" }) {
  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-base",
  };
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn("rounded-full object-cover", sizes[size])}
      />
    );
  }
  const initials = name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700",
        sizes[size],
      )}
    >
      {initials}
    </div>
  );
}

export function ErrorAlert({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
      {message}
    </div>
  );
}

export function SuccessAlert({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">
      {message}
    </div>
  );
}
