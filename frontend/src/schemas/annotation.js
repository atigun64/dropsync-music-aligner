// A small helper to normalize annotation objects coming from backend
// into a consistent frontend shape.

export function normalizeAnnotation(raw) {
  return {
    label: String(raw.label ?? ""),
    time_seconds: Number(raw.time_seconds ?? 0),
    strength: Number(raw.strength ?? 1),
  };
}

export function createAnnotation({
  label = "",
  time_seconds = 0,
  strength = 1,
} = {}) {
  return {
    label,
    time_seconds,
    strength,
  };
}
