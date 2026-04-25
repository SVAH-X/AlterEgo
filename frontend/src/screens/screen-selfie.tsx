import { useEffect, useRef, useState } from "react";
import type { ScreenProps } from "../App";

type CaptureState =
  | { kind: "idle" }
  | { kind: "live"; stream: MediaStream }
  | { kind: "preview"; blob: Blob; url: string };

const MAX_EDGE = 1024;

export function ScreenSelfie({ onContinue, onBack, selfie, setSelfie }: ScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<CaptureState>(() =>
    selfie ? { kind: "preview", blob: selfie, url: URL.createObjectURL(selfie) } : { kind: "idle" },
  );
  const [cameraDenied, setCameraDenied] = useState(false);

  // Attach stream to video element when entering live state; stop tracks on exit.
  useEffect(() => {
    if (state.kind !== "live" || !videoRef.current) return;
    videoRef.current.srcObject = state.stream;
    videoRef.current.play().catch(() => {});
    return () => {
      state.stream.getTracks().forEach((t) => t.stop());
    };
  }, [state]);

  // Revoke object URL when leaving preview state or unmounting.
  useEffect(() => {
    return () => {
      if (state.kind === "preview") URL.revokeObjectURL(state.url);
    };
  }, [state]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setState({ kind: "live", stream });
    } catch {
      setCameraDenied(true);
    }
  }

  function snap() {
    if (state.kind !== "live" || !videoRef.current) return;
    const video = videoRef.current;
    const longest = Math.max(video.videoWidth, video.videoHeight);
    if (longest === 0) return; // video metadata not yet ready; user can re-snap
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        state.stream.getTracks().forEach((t) => t.stop());
        setState({ kind: "preview", blob, url: URL.createObjectURL(blob) });
      },
      "image/jpeg",
      0.9,
    );
  }

  // AMENDMENT A5: downscale uploaded files the same way as webcam snaps.
  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.width, img.height);
      const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) return;
          setState({ kind: "preview", blob, url: URL.createObjectURL(blob) });
        },
        "image/jpeg",
        0.9,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Selected file isn't a renderable image; stay in idle so user can pick again.
    };
    img.src = objectUrl;
  }

  function retake() {
    if (state.kind === "preview") URL.revokeObjectURL(state.url);
    setState({ kind: "idle" });
  }

  function confirm() {
    if (state.kind !== "preview") return;
    setSelfie(state.blob);
    onContinue();
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 24,
        padding: 24,
      }}
    >
      <h2 className="serif" style={{ fontSize: 32, textAlign: "center", maxWidth: 600, margin: 0 }}>
        First, look at yourself.
      </h2>

      {/* Photo well */}
      <div
        style={{
          width: 360,
          height: 360,
          background: "var(--bg-3)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {state.kind === "live" && (
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        {state.kind === "preview" && (
          <img
            src={state.url}
            alt="selfie preview"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        {state.kind === "idle" && (
          <span className="muted" style={{ fontSize: 13 }}>
            no photo yet
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {state.kind === "idle" && !cameraDenied && (
          <button className="btn" onClick={startCamera}>
            Use camera
          </button>
        )}
        {state.kind === "live" && (
          <button className="btn btn-accent" onClick={snap}>
            Snap
          </button>
        )}
        {state.kind === "preview" && (
          <>
            <button className="btn" onClick={retake}>
              Retake
            </button>
            <button className="btn btn-accent" onClick={confirm}>
              Use this photo
            </button>
          </>
        )}
        {state.kind === "idle" && (
          <>
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
              Upload a file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              style={{ display: "none" }}
              onChange={onFileChosen}
            />
          </>
        )}
      </div>

      {/* Privacy notice */}
      <p
        className="muted"
        style={{
          fontSize: 12,
          maxWidth: 420,
          textAlign: "center",
          fontFamily: "var(--mono)",
          margin: 0,
        }}
      >
        Your photo is sent to Gemini to generate the portraits. Nothing is saved on our servers.
      </p>

      {/* Back button — AMENDMENT A6: use .btn with inline overrides, not .btn-link */}
      <button
        className="btn"
        onClick={onBack}
        style={{
          position: "absolute",
          top: 24,
          left: 24,
          background: "transparent",
          border: "none",
          color: "var(--ink-2)",
        }}
      >
        ← back
      </button>
    </div>
  );
}
