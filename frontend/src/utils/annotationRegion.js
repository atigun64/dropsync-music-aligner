/** Half-width of the visual match window shown in the track editor (±seconds). */
export const TRACK_ANNOTATION_HALF_WINDOW_SEC = 5;

export function getTrackAnnotationRegion(timeSeconds, duration) {
  const center = Number(timeSeconds || 0);
  const len = Math.max(0, Number(duration || 0));

  if (len <= 0) {
    return { start: 0, end: 0, center, width: 0 };
  }

  const start = Math.max(0, center - TRACK_ANNOTATION_HALF_WINDOW_SEC);
  const end = Math.min(len, center + TRACK_ANNOTATION_HALF_WINDOW_SEC);

  return {
    start,
    end,
    center,
    width: Math.max(0, end - start),
  };
}

export function regionCenterOffsetPct(region) {
  if (!region.width) return 50;
  return ((region.center - region.start) / region.width) * 100;
}
