from app.models import Checkpoint, Profile, Trajectory


def render_portrait_prompt(
    profile: Profile,
    target_age: int,
    target_year: int,
    trajectory: Trajectory,
    relevant_events: list[Checkpoint],
) -> str:
    """Construct the Gemini image-edit prompt for one aged portrait.

    `relevant_events` is cumulative: every checkpoint on this trajectory with
    year <= target_year, ordered most-recent-first so the prompt weights the
    latest stress visibly."""
    events_block = (
        "\n".join(
            f"- Year {e.year} (age {e.age}): {e.title}. {e.event} {e.consequence}"
            for e in sorted(relevant_events, key=lambda e: -e.year)
        )
        or "- (no major events yet — show them roughly as they look today, age-progressed only)"
    )

    return (
        f"You are aging this person to {target_age} years old (year {target_year}).\n"
        "Preserve their identity: bone structure, eye color, distinguishing features.\n\n"
        "Profile context:\n"
        f"- Occupation: {profile.occupation}\n"
        f"- Sustained work intensity: {profile.workHours} hours/week\n"
        f"- Their stated fear: {profile.topFear}\n\n"
        "Life events that shaped them (cumulative, most recent first):\n"
        f"{events_block}\n\n"
        "Render as a photorealistic portrait. The events should show in their face: "
        "fatigue, weight changes, posture, hair, skin texture, the look in their eyes, "
        "the clothing of someone living that life. Neutral background, soft natural light, "
        "shoulders-up framing. Documentary-portrait aesthetic, consistent across all "
        f"images of this person. Trajectory: {trajectory}."
    )
