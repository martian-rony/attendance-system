export const API_URL = import.meta.env.VITE_API_URL || "/api";
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || window.location.origin;
export const APP_NAME = import.meta.env.VITE_APP_NAME || "Attendance System";
export const DEFAULT_GEOFENCE_RADIUS = parseInt(
  import.meta.env.VITE_DEFAULT_GEOFENCE_RADIUS || "100",
  10,
);
