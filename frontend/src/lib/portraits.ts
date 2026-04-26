import type { AgedPortrait, Trajectory } from "../types";

export function nearestPortrait(
  portraits: AgedPortrait[] | undefined,
  trajectory: Trajectory,
  year: number,
): AgedPortrait | null {
  if (!portraits) return null;
  let best: AgedPortrait | null = null;
  let bestDist = Infinity;
  for (const p of portraits) {
    if (p.trajectory !== trajectory || !p.imageUrl) continue;
    const d = Math.abs(p.year - year);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
