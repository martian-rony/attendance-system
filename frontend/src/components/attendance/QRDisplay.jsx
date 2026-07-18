import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { sessionAPI } from "../../api/index.js";
import { Spinner } from "../ui/index.jsx";
import { cn, formatTime } from "../../utils/helpers.js";

export function QRDisplay({ sessionId, className }) {
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer = null;

    const load = async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      try {
        const { data } = await sessionAPI.getQR(sessionId);
        if (cancelled) return;
        setQr(data.data);
        // Schedule the next refresh just after the rotating token rolls over,
        // so the displayed QR always carries a currently-valid token.
        const expiresInMs = data.data?.rotating?.expiresInMs;
        if (expiresInMs && expiresInMs > 0) {
          refreshTimer = setTimeout(() => load(true), expiresInMs + 500);
        }
      } catch (err) {
        if (!cancelled)
          setError(err.response?.data?.message || "Failed to load QR");
      } finally {
        if (!cancelled && !isRefresh) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [sessionId]);

  const copyToken = async () => {
    const token = qr?.qrCode?.data;
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked (e.g. insecure context); ignore silently.
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  if (error) return <p className="text-sm text-danger-600">{error}</p>;
  if (!qr) return null;

  const qrImage = qr.qrCodeImage || qr.qrCodeDataUrl;
  const expiresAt = qr.qrCode?.expiresAt || qr.expiresAt;
  const sessionEnd = qr.session?.endTime || qr.sessionEnd;

  if (!qrImage) return null;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
        <img src={qrImage} alt="Attendance QR" className="h-56 w-56" />
      </div>
      <button
        type="button"
        onClick={copyToken}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-success-600" /> Copied!
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" /> Copy QR token
          </>
        )}
      </button>
      <div className="mt-3 text-center text-xs text-gray-500">
        <p>
          Code refreshes at:{" "}
          <span className="font-medium text-gray-700">
            {formatTime(expiresAt)}
          </span>
        </p>
        <p className="mt-1">
          Session ends:{" "}
          <span className="font-medium text-gray-700">
            {formatTime(sessionEnd)}
          </span>
        </p>
      </div>
    </div>
  );
}
