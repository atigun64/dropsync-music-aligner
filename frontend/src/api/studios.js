import { apiDelete, apiGet, apiGetBlob, apiPost, apiPut } from "./http";

// GET /api/studios
export function listStudios() {
  return apiGet("/api/studios");
}

// POST /api/studios
export function createStudio() {
  return apiPost("/api/studios", {});
}

// GET /api/studios/{studioId}
export function getStudioSession(studioId) {
  return apiGet(`/api/studios/${studioId}`);
}

// GET /api/studios/{studioId}/metadata
export function getStudioMetadata(studioId) {
  return apiGet(`/api/studios/${studioId}/metadata`);
}

// PUT /api/studios/{studioId}/metadata
export function updateStudioMetadata(studioId, meta) {
  return apiPut(`/api/studios/${studioId}/metadata`, meta);
}

// GET /api/studios/{studioId}/query
export function getStudioQuery(studioId) {
  return apiGet(`/api/studios/${studioId}/query`);
}

// PUT /api/studios/{studioId}/query
export function updateStudioQuery(studioId, query) {
  return apiPut(`/api/studios/${studioId}/query`, query);
}

// GET /api/studios/{studioId}/alignment
export function getStudioAlignment(studioId) {
  return apiGet(`/api/studios/${studioId}/alignment`);
}

// PUT /api/studios/{studioId}/alignment
export function updateStudioAlignment(studioId, alignment) {
  return apiPut(`/api/studios/${studioId}/alignment`, alignment);
}

// POST /api/studios/{studioId}/run-optimizer
export function runOptimizer(studioId) {
  return apiPost(`/api/studios/${studioId}/run-optimizer`, {});
}

// DELETE /api/studios/{studioId}
export function deleteStudio(studioId) {
  return apiDelete(`/api/studios/${studioId}`);
}

// POST /api/studios/{studioId}/video
// file should be FormData with field name "file"
export function uploadStudioVideo(studioId, formData) {
  return apiPost(`/api/studios/${studioId}/video`, formData);
}

// GET /api/studios/{studioId}/audio
// returns the compiled studio audio as a Blob
export function getStudioAudioBlob(studioId) {
  return apiGetBlob(`/api/studios/${studioId}/audio`);
}

// GET /api/studios/{studioId}/video
// returns the uploaded studio video as a Blob
export function getStudioVideoBlob(studioId) {
  return apiGetBlob(`/api/studios/${studioId}/video`);
}

export function getStudioVideoUrl(studioId) {
  return `/api/studios/${studioId}/video`;
}
