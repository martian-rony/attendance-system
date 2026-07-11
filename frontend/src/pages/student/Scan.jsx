import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle,
  XCircle,
  MapPin,
  Camera,
  LocateFixed,
  Loader2,
} from "lucide-react";
import { attendanceAPI } from "../../api/index.js";
import { QRScanner } from "../../components/attendance/QRScanner.jsx";
import { ErrorBoundary } from "../../components/ErrorBoundary.jsx";
import { Card, Button, Spinner, Input } from "../../components/ui/index.jsx";

export default function StudentScan() {
  const [status, setStatus] = useState({ type: "", message: "" });
  const [scanning, setScanning] = useState(false);
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [manualToken, setManualToken] = useState("");

  const markMutation = useMutation({
    mutationFn: (payload) => attendanceAPI.mark(payload),
    onSuccess: (res) => {
      setStatus({
        type: "success",
        message: res.data?.data?.message || "Attendance marked successfully!",
      });
      setScanning(false);
    },
    onError: (err) => {
      const data = err.response?.data;
      const details = data?.details;
      setStatus({
        type: "error",
        message: data?.message || "Failed to mark attendance",
        geo:
          details?.type === "GEOFENCE_OUTSIDE"
            ? {
                distance: details.distanceMeters,
                radius: details.allowedRadiusMeters,
                overBy: details.overByMeters,
                hint: details.hint,
              }
            : null,
      });
      setScanning(false);
    },
  });

  const getCurrentLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation)
        return reject(
          new Error("Geolocation is not supported by this device."),
        );
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });

  const fetchLocation = async () => {
    setLocating(true);
    setLocError("");
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
      setScanning(true);
    } catch (err) {
      const msg =
        err?.code === 1
          ? "Location permission denied. Please allow location access and try again."
          : err?.code === 3
            ? "Getting your location timed out. Move to an open area and retry."
            : err?.message || "Could not get your location. Please try again.";
      setLocError(msg);
    } finally {
      setLocating(false);
    }
  };

  const handleScan = (decoded) => {
    try {
      const payload =
        typeof decoded === "string" ? JSON.parse(decoded) : decoded;
      markMutation.mutate({
        sessionId: payload.sessionId,
        qrToken: payload.qrCode || payload.token,
        geolocation: location
          ? {
              coordinates: [location.longitude, location.latitude],
              accuracy: location.accuracy,
              timestamp: new Date().toISOString(),
            }
          : undefined,
        deviceInfo: { userAgent: navigator.userAgent },
      });
    } catch {
      setStatus({
        type: "error",
        message: "Invalid QR code. Please scan the session QR again.",
      });
      setScanning(false);
    }
  };

  const reset = () => {
    setStatus({ type: "", message: "", geo: null });
    setScanning(false);
    setLocation(null);
    setLocError("");
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Mark Attendance</h2>
        <p className="text-sm text-gray-500">
          Confirm your location, then scan the QR code shown by your faculty.
        </p>
      </div>

      {status.type === "success" && (
        <div className="rounded-2xl border border-success-200 bg-success-50 p-6 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-success-600" />
          <p className="mt-3 font-semibold text-success-700">
            {status.message}
          </p>
          {location && (
            <p className="mt-1 text-xs text-success-600">
              <MapPin className="inline h-3 w-3" /> Location verified
            </p>
          )}
          <Button className="mt-4" variant="secondary" onClick={reset}>
            Scan Another
          </Button>
        </div>
      )}

      {status.type === "error" && (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center">
          <XCircle className="mx-auto h-12 w-12 text-danger-600" />
          <p className="mt-3 font-semibold text-danger-700">{status.message}</p>
          {status.geo && (
            <div className="mt-3 rounded-xl border border-danger-200 bg-white/70 p-3 text-left text-xs text-danger-700">
              <p>
                Distance from classroom:{" "}
                <span className="font-semibold">{status.geo.distance} m</span>
              </p>
              <p>
                Allowed radius:{" "}
                <span className="font-semibold">{status.geo.radius} m</span>
              </p>
              <p>
                You are{" "}
                <span className="font-semibold">{status.geo.overBy} m</span>{" "}
                outside the allowed zone.
              </p>
              {status.geo.hint && (
                <p className="mt-2 text-danger-600">{status.geo.hint}</p>
              )}
            </div>
          )}
          <Button className="mt-4" variant="secondary" onClick={reset}>
            Try Again
          </Button>
        </div>
      )}

      {!status.type && (
        <Card className="p-5 space-y-4">
          {/* Step 1: location */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <MapPin className="h-4 w-4 text-brand-600" /> Step 1 · Your
                location
              </div>
              {location && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success-600">
                  <CheckCircle className="h-3 w-3" /> Captured
                </span>
              )}
            </div>

            {location ? (
              <div className="mt-2 text-xs text-gray-500">
                <p>
                  Lat {location.latitude.toFixed(6)}, Lng{" "}
                  {location.longitude.toFixed(6)}
                </p>
                {location.accuracy != null && (
                  <p>Accuracy ±{Math.round(location.accuracy)} m</p>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={fetchLocation}
                  disabled={locating}
                >
                  <LocateFixed className="h-3 w-3" /> Refresh location
                </Button>
              </div>
            ) : (
              <div className="mt-2">
                <Button
                  onClick={fetchLocation}
                  disabled={locating}
                  className="w-full sm:w-auto"
                >
                  {locating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LocateFixed className="h-4 w-4" />
                  )}
                  {locating ? "Getting location…" : "Get My Location"}
                </Button>
                {locError && (
                  <p className="mt-2 text-xs text-danger-600">{locError}</p>
                )}
              </div>
            )}
          </div>

          {/* Step 2: scan (unlocked after location) */}
          <div className={location ? "" : "pointer-events-none opacity-40"}>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Camera className="h-4 w-4 text-brand-600" /> Step 2 · Scan the QR
              code
            </div>
            {scanning ? (
              <ErrorBoundary
                fallback={
                  <p className="text-sm text-danger-600">
                    Scanner failed to load. Use manual entry below.
                  </p>
                }
              >
                <QRScanner onScan={handleScan} />
              </ErrorBoundary>
            ) : location ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-gray-400">
                Get your location first to unlock the scanner.
              </p>
            )}

            {/* Manual entry fallback: works even if the camera won't start */}
            {location && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="mb-2 text-xs text-gray-500">
                  Camera not working? Paste the session QR token manually:
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste QR token"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={!manualToken.trim() || markMutation.isLoading}
                    onClick={() => handleScan(manualToken.trim())}
                  >
                    Submit
                  </Button>
                </div>
              </div>
            )}
          </div>

          {markMutation.isLoading && (
            <p className="text-center text-sm text-gray-500">Submitting…</p>
          )}
        </Card>
      )}
    </div>
  );
}
