# AlterEgo · talk to your future self

> Twenty years from now, who's looking back?

AlterEgo is a future-life simulator. Tell it about who you are today — work,
hours, ambition, fear — and it walks the years forward, simulating the choices
you'll make and where they take you. Then it lets you talk to the person
waiting at the other end.

Honest, not motivational. The future-self isn't a cheerleader. She's *you*
twenty years on, and she's tired, and she remembers what mattered.

---

## What to expect

1. **Seven short questions.** Name. Age. Work. Hours. MBTI (optional). The
   thing you want most. The thing you're afraid of. Honest answers only —
   the simulation is only as honest as you are.
2. **About ninety seconds of simulation.** The people in your life. The
   turning points. The years you'll later wish you'd been awake for.
3. **A conversation.** When the simulation lands, I am her now. Ask her
   anything.

---

## Things to ask your future self

- *What did I get wrong?*
- *Am I happy?*
- *What should I change?*
- *Who did I lose?*
- *What was worth it?*
- *Tell me about a year that hurt.*

She'll tell you. She's not optimistic. She's just there.

---

## How to start

Say **hi**.

Type **restart** anytime to wipe the session and simulate a different life.

---

## Under the hood

- **Multi-agent trajectory simulation.** A curated pool of ~300 life events
  is armed and triggered by an 8-aspect state model — work intensity,
  financial pressure, isolation, family distance, health strain, career
  momentum, meaning drift, relationship strain.
- **Branched re-runs.** Intervene at any year and only the years after that
  point regenerate; the past you've already lived in the simulation stays
  intact.
- **Anthropic Claude** plans the trajectory and gives the future-self her
  voice. **ElevenLabs** gives her a literal one on the web frontend.
- **Fetch.ai uAgents**, mailbox mode, ASI:One-native.

Source: <https://github.com/SVAH-X/AlterEgo>

Built for **LA Hacks 2026**. Innovation Lab.
