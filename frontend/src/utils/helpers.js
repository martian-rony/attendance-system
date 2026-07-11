import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(date, opts = {}) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: opts.short ? "short" : "long",
    day: "numeric",
    ...opts,
  });
}

export function formatDateTime(date) {
  if (!date) return "";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(time) {
  if (!time) return "";
  // `expiresAt` arrives as a Date/ISO string (UTC) — render it in the user's
  // local time. A plain "HH:MM" string (e.g. session.endTime) is returned as-is.
  const d = new Date(time);
  if (isNaN(d.getTime())) return time;
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function getInitials(firstName = "", lastName = "") {
  return `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase();
}

export function getStatusColor(status) {
  const map = {
    present: "bg-success-50 text-success-700",
    absent: "bg-danger-50 text-danger-700",
    late: "bg-warning-50 text-warning-600",
    excused: "bg-brand-50 text-brand-700",
    left_early: "bg-gray-100 text-gray-700",
    active: "bg-success-50 text-success-700",
    scheduled: "bg-brand-50 text-brand-700",
    completed: "bg-gray-100 text-gray-700",
    cancelled: "bg-danger-50 text-danger-700",
  };
  return map[status] || "bg-gray-100 text-gray-700";
}

export function getAttendanceRateColor(rate) {
  if (rate >= 75) return "text-success-600";
  if (rate >= 60) return "text-warning-600";
  return "text-danger-600";
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}

export function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
