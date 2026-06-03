import { apiDelete, apiGet, apiPost, apiPut } from "./http";

// GET /api/tracks
export function listTracks() {
  return apiGet("/api/tracks");
}

// GET /api/tracks/{trackId}
export function getTrack(trackId) {
  return apiGet(`/api/tracks/${trackId}`);
}

// POST /api/tracks/upload
// file should be a FormData object with field name "file"
export function uploadTrack(formData) {
  return apiPost("/api/tracks/upload", formData);
}

// PUT /api/tracks/{trackId}/annotations
// backend expects a raw list of annotations, not wrapped in { annotations: ... }
export function updateTrackAnnotations(trackId, annotations) {
  return apiPut(`/api/tracks/${trackId}/annotations`, annotations);
}

// PUT /api/tracks/{trackId}/metadata
export function updateTrackMetadata(trackId, meta) {
  return apiPut(`/api/tracks/${trackId}/metadata`, meta);
}

// DELETE /api/tracks/{trackId}
export function deleteTrack(trackId) {
  return apiDelete(`/api/tracks/${trackId}`);
}
