import { useState } from "react";
import type { ScreenProps } from "../App";
import { Mark } from "../atoms";
import { useVoice } from "../voice/VoiceContext";

export function ScreenModeSelect({ onContinue, onJumpTo }: ScreenProps) {
  const { setInputMode, setVoiceMode, prime } = useVoice();
  const [denied, setDenied] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function chooseSpeak() {
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We only needed the permission grant; release the tracks immediately.
      stream.getTracks().forEach((t) => t.stop());
      prime();
      setVoiceMode(true);
      setInputMode("voice");
      onContinue();
    } catch {
      setDenied(true);
    } finally {
      setRequesting(false);
    }
  }

  function chooseType() {
    setInputMode("typing");
    onContinue();
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="mark-anchor">
        <Mark onClick={() => onJumpTo("landing")} />
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 28,
          padding: "0 40px",
          textAlign: "center",
        }}
      >
        <h2
          className="serif"
          style={{ fontSize: 32, lineHeight: 1.25, margin: 0, maxWidth: 600 }}
        >
          How do you want to do this?
        </h2>
        <p
          className="muted"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          choose one · you can switch later
        </p>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            className="btn btn-accent"
            onClick={chooseSpeak}
            disabled={requesting}
            style={{ minWidth: 200, padding: "16px 28px", fontSize: 16 }}
          >
            {requesting ? "Asking your mic…" : "Speak it →"}
          </button>
          <button
            className="btn"
            onClick={chooseType}
            style={{ minWidth: 200, padding: "16px 28px", fontSize: 16 }}
          >
            Type it →
          </button>
        </div>
        {denied && (
          <p
            className="muted"
            style={{
              color: "var(--ink-2)",
              maxWidth: 420,
              fontFamily: "var(--mono)",
              fontSize: 12,
              margin: 0,
            }}
          >
            Mic permission denied. You can continue by typing.
          </p>
        )}
      </div>
    </div>
  );
}
