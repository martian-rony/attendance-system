import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

// Turn a raw getUserMedia / html5-qrcode error into a message the student can act on.
function friendlyCameraError(err) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission denied. Allow camera access in your browser, then tap Retry — or use manual entry below.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device. Use manual entry below.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is in use by another app. Close it and tap Retry, or use manual entry below.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "No camera matches the requested mode. Tap Retry, or use manual entry below.";
  }
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const secure = typeof window !== "undefined" && window.isSecureContext;
  if (!secure && host !== "localhost" && host !== "127.0.0.1") {
    return "The camera needs a secure (HTTPS) page. On a phone over the LAN you must serve the app over HTTPS, or use manual entry below.";
  }
  // Config/layout failures (e.g. qrbox too small) are ours, not the user's.
  if (typeof err === "string" && err.toLowerCase().includes("qrbox")) {
    return "Scanner layout error. Reload the page and try again, or use manual entry below.";
  }
  return "Camera unavailable. Allow camera permission and tap Retry, or use manual entry below.";
}

// stop() THROWS synchronously (not a rejected promise) when the scanner was never
// started — which happens in React 18 StrictMode's mount/cleanup/mount cycle. An
// uncaught throw escapes a React lifecycle and crashes the ErrorBoundary. Wrap it so
// it can never propagate.
function safeStop(qr) {
  try {
    return qr?.stop?.().catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

export function QRScanner({ onScan, onError }) {
  const reactId = useId();
  const elementId = `qr-reader-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0); // bump to retry

  // Keep latest callbacks in refs so they don't need to be effect dependencies
  // (which would re-create the scanner on every parent render).
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  onScanRef.current = onScan;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");

    const qr = new Html5Qrcode(elementId, { verbose: false });

    // qrbox as a FUNCTION: the library passes the real viewfinder dimensions, so
    // we return a box that always fits and never drops below the 50px minimum
    // (which the library throws on and crashes the component).
    const config = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const size = Math.max(
          50,
          Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.8),
        );
        return { width: size, height: size };
      },
    };

    qr.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        if (cancelled) return;
        try {
          onScanRef.current(JSON.parse(decodedText));
        } catch {
          onScanRef.current(decodedText);
        }
        safeStop(qr);
      },
      () => {
        // Transient scan errors (no QR in frame) are expected; ignore.
      },
    )
      .then(() => {
        // If we were unmounted (StrictMode) while starting, tear it down.
        if (cancelled) safeStop(qr);
        else setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(friendlyCameraError(err));
        setStatus("error");
        onErrorRef.current?.(err);
      });

    return () => {
      cancelled = true;
      safeStop(qr);
    };
  }, [elementId, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center">
      {/* React must never try to reconcile the <video>/<canvas> that html5-qrcode
          injects here; it owns that DOM subtree entirely. */}
      <div
        id={elementId}
        className="w-full max-w-sm overflow-hidden rounded-xl border border-border"
      />
      {status === "loading" && (
        <p className="mt-2 text-sm text-muted-foreground">Starting camera…</p>
      )}
      {status === "error" && (
        <div className="mt-2 flex flex-col items-center gap-2">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="rounded-lg border border-input px-3 py-1 text-xs font-medium text-foreground hover:bg-muted/40"
          >
            Retry camera
          </button>
        </div>
      )}
    </div>
  );
}
