import { useVoice } from "./VoiceContext";

export function VoiceModeToggle() {
  const { voiceMode, setVoiceMode, prime } = useVoice();
  const click = () => {
    prime();
    setVoiceMode(!voiceMode);
  };
  return (
    <button
      type="button"
      className={`voice-toggle ${voiceMode ? "on" : ""}`}
      onClick={click}
      title={voiceMode ? "Voice mode on — click to mute" : "Voice mode off — click to enable"}
      aria-pressed={voiceMode}
    >
      {voiceMode ? <SpeakerIcon /> : <MutedIcon />}
      <span className="voice-toggle-label">{voiceMode ? "voice" : "text"}</span>
    </button>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        d="M3 10v4a1 1 0 0 0 1 1h3l4 4a1 1 0 0 0 1.7-.7V5.7A1 1 0 0 0 11 5L7 9H4a1 1 0 0 0-1 1Z"
        fill="currentColor"
      />
      <path
        d="M16 8a5 5 0 0 1 0 8M19 5a8 8 0 0 1 0 14"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        d="M3 10v4a1 1 0 0 0 1 1h3l4 4a1 1 0 0 0 1.7-.7V5.7A1 1 0 0 0 11 5L7 9H4a1 1 0 0 0-1 1Z"
        fill="currentColor"
      />
      <path
        d="M16 9l5 5M21 9l-5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
