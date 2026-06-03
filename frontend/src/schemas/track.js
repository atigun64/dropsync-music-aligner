import { normalizeAnnotation } from "./annotation";

// TrackMetaSchema / TrackMetaCreateSchema
export function normalizeTrackMeta(raw) {
  return {
    length_seconds: Number(raw?.length_seconds ?? 0),
    bpm: Number(raw?.bpm ?? 0),
    signature: Array.isArray(raw?.signature)
      ? raw.signature.map((x) => Number(x))
      : [],
    preference: Number(raw?.preference ?? 1),
    min_speed: Number(raw?.min_speed ?? 0.98),
    max_speed: Number(raw?.max_speed ?? 1.2),
  };
}

export function createTrackMeta({
  length_seconds = 0,
  bpm = 0,
  signature = [],
  preference = 1,
  min_speed = 0.98,
  max_speed = 1.2,
} = {}) {
  return {
    length_seconds,
    bpm,
    signature,
    preference,
    min_speed,
    max_speed,
  };
}

// TrackListItemSchema
export function normalizeTrackListItem(raw) {
  return {
    track_id: String(raw?.track_id ?? ""),
    display_name: String(raw?.display_name ?? ""),
    audio_path: String(raw?.audio_path ?? ""),
  };
}

// TrackRecordSchema
export function normalizeTrackRecord(raw) {
  return {
    track_id: String(raw?.track_id ?? ""),
    audio_path: String(raw?.audio_path ?? ""),
    meta: normalizeTrackMeta(raw?.meta ?? {}),
    annotations: Array.isArray(raw?.annotations)
      ? raw.annotations.map(normalizeAnnotation)
      : [],
  };
}

// Optional helper for creating a fresh empty record shape
export function createEmptyTrackRecord() {
  return {
    track_id: "",
    audio_path: "",
    meta: createTrackMeta(),
    annotations: [],
  };
}
