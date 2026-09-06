/** Prosjektets overordnede fremdrift = gjennomsnittlig prosent fullført over alle milepæler. */
export function computeProjectProgressPercent(milestones: Array<{ progress_percent: number }>): number {
  if (milestones.length === 0) return 0;
  const sum = milestones.reduce((acc, m) => acc + m.progress_percent, 0);
  return Math.round(sum / milestones.length);
}
