import { normalizeAnnotation, createAnnotation } from "./annotation";

// StudioMetaSchema / StudioMetaCreateSchema
export function normalizeStudioMeta(raw) {
  return {
    source: String(raw?.source ?? "silent"),
    video_path: raw?.video_path ? String(raw.video_path) : null,
    notes: String(raw?.notes ?? ""),
  };
}

export function createStudioMeta({
  source = "silent",
  video_path = null,
  notes = "",
} = {}) {
  return {
    source,
    video_path,
    notes,
  };
}

// QuerySpecSchema / QuerySpecCreateSchema
export function normalizeQuerySpec(raw) {
  return {
    length_seconds: Number(raw?.length_seconds ?? 0),
    signature: Array.isArray(raw?.signature)
      ? raw.signature.map((x) => Number(x))
      : [],
    requested_points: Array.isArray(raw?.requested_points)
      ? raw.requested_points.map(normalizeAnnotation)
      : [],
  };
}

export function createQuerySpec({
  length_seconds = 0,
  signature = [],
  requested_points = [],
} = {}) {
  return {
    length_seconds,
    signature,
    requested_points,
  };
}

// AlignmentTrackSchema
export function normalizeAlignmentTrack(raw) {
  return {
    track_id: String(raw?.track_id ?? ""),
    start_time_seconds: Number(raw?.start_time_seconds ?? 0),
    speed: Number(raw?.speed ?? 1),
    placed_points: Array.isArray(raw?.placed_points)
      ? raw.placed_points.map(normalizeAnnotation)
      : [],
  };
}

export function createAlignmentTrack({
  track_id = "",
  start_time_seconds = 0,
  speed = 1,
  placed_points = [],
} = {}) {
  return {
    track_id,
    start_time_seconds,
    speed,
    placed_points,
  };
}

// AlignmentSpecSchema
export function normalizeAlignmentSpec(raw) {
  return {
    score: Number(raw?.score ?? 0),
    tracks: Array.isArray(raw?.tracks)
      ? raw.tracks.map(normalizeAlignmentTrack)
      : [],
  };
}

export function createAlignmentSpec({ score = 0, tracks = [] } = {}) {
  return {
    score,
    tracks,
  };
}

// StudioSessionSchema
export function normalizeStudioSession(raw) {
  return {
    studio_id: String(raw?.studio_id ?? ""),
    meta: normalizeStudioMeta(raw?.meta ?? {}),
    query: raw?.query ? normalizeQuerySpec(raw.query) : null,
    alignment: raw?.alignment ? normalizeAlignmentSpec(raw.alignment) : null,
  };
}

// Useful when creating a new empty session shape locally
export function createEmptyStudioSession() {
  return {
    studio_id: "",
    meta: createStudioMeta(),
    query: null,
    alignment: null,
  };
}
