import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { listTracks, getTrack, uploadTrack, updateTrackAnnotations, deleteTrack } from "../api/tracks";
import { listStudios, createStudio, deleteStudio } from "../api/studios";

import { normalizeTrackListItem, normalizeTrackRecord } from "../schemas/track";
import { createAnnotation } from "../schemas/annotation";

import LoadingState from "../components/shared/LoadingState";
import ContextMenu from "../components/shared/ContextMenu";
import TrackSidebar from "../components/tracks/TrackSidebar";
import TrackTimeline from "../components/tracks/TrackTimeline";
import StudioSidebar from "../components/studios/StudioSidebar";

const MAX_TRACK_SECONDS = 300;
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".aiff", ".wma"];

function sortAnnotations(list) {
  return [...list].sort((a, b) => a.time_seconds - b.time_seconds);
}

function isAudioFile(file) {
  const name = (file?.name || "").toLowerCase();
  const type = (file?.type || "").toLowerCase();

  if (type.startsWith("audio/")) return true;
  return AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function getFileDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();

    audio.preload = "metadata";
    audio.src = url;

    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(url);
      resolve(duration);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read audio duration for ${file.name}`));
    };
  });
}

export default function MainPage() {
  const navigate = useNavigate();

  // -----------------------------
  // Main page state
  // -----------------------------
  const [tracks, setTracks] = useState([]);
  const [studios, setStudios] = useState([]);

  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState(null);

  const [selectedStudioId, setSelectedStudioId] = useState(null);

  const [loadingTracks, setLoadingTracks] = useState(true);
  const [loadingStudios, setLoadingStudios] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Right-click menu state
  const [contextMenu, setContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    items: [],
  });

  // Used to debounce annotation saves while dragging.
  const annotationSaveTimerRef = useRef(null);

  // -----------------------------
  // Helpers
  // -----------------------------
  function closeContextMenu() {
    setContextMenu((prev) => ({ ...prev, open: false, items: [] }));
  }

  function openTrack(trackId) {
    return getTrack(trackId).then((raw) => {
      const record = normalizeTrackRecord(raw);
      setSelectedTrackId(record.track_id);
      setSelectedTrack(record);
      return record;
    });
  }

  async function reloadTracks(preferredTrackId = null) {
    setLoadingTracks(true);
    setError("");

    try {
      const rawList = await listTracks();
      const normalizedList = Array.isArray(rawList)
        ? rawList.map(normalizeTrackListItem)
        : [];

      setTracks(normalizedList);

      const currentStillExists = selectedTrackId
        ? normalizedList.some((t) => t.track_id === selectedTrackId)
        : false;

      const nextTrackId =
        preferredTrackId ||
        (currentStillExists ? selectedTrackId : normalizedList[0]?.track_id) ||
        null;

      if (nextTrackId) {
        await openTrack(nextTrackId);
      } else {
        setSelectedTrackId(null);
        setSelectedTrack(null);
      }
    } catch (e) {
      setError(e.message || "Failed to load tracks");
      setTracks([]);
      setSelectedTrackId(null);
      setSelectedTrack(null);
    } finally {
      setLoadingTracks(false);
    }
  }

  async function reloadStudios(preferredStudioId = null) {
    setLoadingStudios(true);
    setError("");

    try {
      const rawList = await listStudios();
      const normalizedList = Array.isArray(rawList) ? rawList.map(String) : [];

      setStudios(normalizedList);

      if (preferredStudioId && normalizedList.includes(preferredStudioId)) {
        setSelectedStudioId(preferredStudioId);
      } else if (!normalizedList.includes(selectedStudioId)) {
        setSelectedStudioId(null);
      }
    } catch (e) {
      setError(e.message || "Failed to load studios");
      setStudios([]);
      setSelectedStudioId(null);
    } finally {
      setLoadingStudios(false);
    }
  }

  function clearPendingAnnotationSave() {
    if (annotationSaveTimerRef.current) {
      clearTimeout(annotationSaveTimerRef.current);
      annotationSaveTimerRef.current = null;
    }
  }

  function scheduleAnnotationSave(nextAnnotations) {
    if (!selectedTrackId) return;

    const sorted = sortAnnotations(nextAnnotations);

    // Update UI immediately.
    setSelectedTrack((prev) =>
      prev
        ? {
          ...prev,
          annotations: sorted,
        }
        : prev
    );

    // Cancel older save if user is still dragging.
    clearPendingAnnotationSave();

    // Debounce backend save so we don't spam requests on every mousemove.
    setStatus("Saving annotations...");

    annotationSaveTimerRef.current = setTimeout(async () => {
      try {
        const updated = await updateTrackAnnotations(selectedTrackId, sorted);
        setSelectedTrack(normalizeTrackRecord(updated));
        setStatus("Annotations saved");
        setTimeout(() => setStatus(""), 1000);
      } catch (e) {
        setError(e.message || "Failed to save annotations");
        setStatus("");
      }
    }, 350);
  }

  function updateAnnotationAtIndex(index, patch) {
    if (!selectedTrack) return;

    const next = selectedTrack.annotations.map((ann, i) =>
      i === index ? { ...ann, ...patch } : ann
    );

    scheduleAnnotationSave(next);
  }

  // -----------------------------
  // Initial load
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await reloadTracks();
        await reloadStudios();
      } catch {
        // errors are already handled inside reload functions
      }
    }

    init();

    return () => {
      cancelled = true;
      clearPendingAnnotationSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // Track selection
  // -----------------------------
  async function handleSelectTrack(track) {
    closeContextMenu();
    setStatus("");
    try {
      await openTrack(track.track_id);
    } catch (e) {
      setError(e.message || "Failed to open track");
    }
  }

  // -----------------------------
  // Annotation actions
  // -----------------------------
  function handleAddAnnotation(timeSeconds) {
    if (!selectedTrack) return;

    const label = window.prompt("Annotation label?", "drop");
    if (label === null) return;

    const strengthRaw = window.prompt("Strength (0 to 1)?", "1");
    if (strengthRaw === null) return;

    const strength = Number(strengthRaw);
    if (Number.isNaN(strength)) {
      setError("Strength must be a number");
      return;
    }

    const newAnnotation = createAnnotation({
      label,
      time_seconds: timeSeconds,
      strength,
    });

    const next = [...selectedTrack.annotations, newAnnotation];
    scheduleAnnotationSave(next);
  }

  function handleMoveAnnotation(index, nextTime) {
    updateAnnotationAtIndex(index, { time_seconds: nextTime });
  }

  function handleDeleteAnnotation(index) {
    if (!selectedTrack) return;

    const next = selectedTrack.annotations.filter((_, i) => i !== index);
    scheduleAnnotationSave(next);
  }

  function handleSelectAnnotation(index) {
    if (!selectedTrack) return;

    const ann = selectedTrack.annotations[index];
    if (!ann) return;

    // Simple edit flow for now:
    const label = window.prompt("Edit label", ann.label);
    if (label === null) return;

    const timeRaw = window.prompt("Edit time (seconds)", String(ann.time_seconds));
    if (timeRaw === null) return;

    const strengthRaw = window.prompt("Edit strength", String(ann.strength));
    if (strengthRaw === null) return;

    const timeSeconds = Number(timeRaw);
    const strength = Number(strengthRaw);

    if (Number.isNaN(timeSeconds) || Number.isNaN(strength)) {
      setError("Time and strength must be numbers");
      return;
    }

    updateAnnotationAtIndex(index, {
      label,
      time_seconds: timeSeconds,
      strength,
    });
  }

  // -----------------------------
  // Upload helpers
  // -----------------------------
  async function uploadValidatedFiles(files, { folderMode = false } = {}) {
    const validFiles = [];
    const skipped = [];

    for (const file of files) {
      if (!isAudioFile(file)) {
        skipped.push(`${file.name} (not an audio file)`);
        continue;
      }

      try {
        const duration = await getFileDuration(file);

        if (duration > MAX_TRACK_SECONDS) {
          skipped.push(`${file.name} (${duration.toFixed(1)}s > 300s)`);
          continue;
        }

        validFiles.push(file);
      } catch (e) {
        skipped.push(`${file.name} (duration read failed)`);
      }
    }

    if (validFiles.length === 0) {
      if (skipped.length > 0) {
        setError(`No valid audio files to upload. Skipped: ${skipped.join(", ")}`);
      } else {
        setError("No files selected");
      }
      return;
    }

    setUploading(true);
    setError("");
    setStatus(folderMode ? "Uploading folder..." : "Uploading track...");

    let firstUploadedTrackId = null;

    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setStatus(
          folderMode
            ? `Uploading ${i + 1}/${validFiles.length}: ${file.name}...`
            : `Uploading ${file.name}...`
        );

        const formData = new FormData();
        formData.append("file", file);

        const uploaded = normalizeTrackRecord(await uploadTrack(formData));

        if (!firstUploadedTrackId) {
          firstUploadedTrackId = uploaded.track_id;
        }
      }

      await reloadTracks(firstUploadedTrackId);
      setStatus(
        skipped.length > 0
          ? `Upload finished. Skipped: ${skipped.length} file(s).`
          : "Upload finished."
      );

      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSingleFilesSelected(files) {
    // Single upload: use only the first selected file.
    const first = files?.[0];
    if (!first) return;
    await uploadValidatedFiles([first], { folderMode: false });
  }

  async function handleFolderFilesSelected(files) {
    await uploadValidatedFiles(files || [], { folderMode: true });
  }

  // -----------------------------
  // Track delete menu
  // -----------------------------
  function openTrackContextMenu(e, track) {
    e.preventDefault();

    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: `Delete track`,
          danger: true,
          onClick: async () => {
            const ok = window.confirm(`Delete track "${track.track_id}"?`);
            if (!ok) return;

            try {
              await deleteTrack(track.track_id);
              await reloadTracks();
            } catch (err) {
              setError(err.message || "Failed to delete track");
            }
          },
        },
      ],
    });
  }

  // -----------------------------
  // Studio actions
  // -----------------------------
  async function handleCreateStudio() {
    closeContextMenu();

    try {
      setStatus("Creating studio...");
      const studioId = await createStudio();
      await reloadStudios(studioId);
      setStatus("");

      // Open the studio page right away.
      navigate(`/studios/${studioId}`);
    } catch (e) {
      setError(e.message || "Failed to create studio");
      setStatus("");
    }
  }

  function handleSelectStudio(studioId) {
    closeContextMenu();
    setSelectedStudioId(studioId);
    navigate(`/studios/${studioId}`);
  }

  function openStudioContextMenu(e, studioId) {
    e.preventDefault();

    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: `Delete studio`,
          danger: true,
          onClick: async () => {
            const ok = window.confirm(`Delete studio "${studioId}"?`);
            if (!ok) return;

            try {
              await deleteStudio(studioId);
              await reloadStudios();
            } catch (err) {
              setError(err.message || "Failed to delete studio");
            }
          },
        },
      ],
    });
  }

  return (
    <div
      onClick={closeContextMenu}
      style={{
        height: "100vh",
        background: "#0f1115",
        color: "#e5e7eb",
        display: "grid",
        gridTemplateColumns: "340px minmax(0, 1fr)",
        overflow: "hidden",
      }}
    >
      {/* LEFT SIDE: track list */}
      <TrackSidebar
        tracks={tracks}
        selectedTrackId={selectedTrackId}
        onSelectTrack={handleSelectTrack}
        onTrackContextMenu={openTrackContextMenu}
        onSingleFilesSelected={handleSingleFilesSelected}
        onFolderFilesSelected={handleFolderFilesSelected}
      />

      {/* RIGHT SIDE */}
      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* TOP RIGHT: selected track timeline */}
        <div
          style={{
            padding: 16,
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Track Timeline</h2>
              <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
                {selectedTrack
                  ? `Selected: ${selectedTrack.track_id}`
                  : "Select a track from the left"}
              </div>
            </div>

            <div style={{ color: "#9ca3af", fontSize: 13 }}>
              {selectedTrack ? (
                <>
                  Duration: {selectedTrack.meta.length_seconds.toFixed(1)}s ·{" "}
                  Annotations: {selectedTrack.annotations.length}
                </>
              ) : (
                ""
              )}
            </div>
          </div>

          {loadingTracks && !selectedTrack ? (
            <LoadingState label="Loading tracks..." />
          ) : (
            <div style={{ minHeight: 180 }}>
              <TrackTimeline
                track={selectedTrack}
                onAddAnnotation={handleAddAnnotation}
                onMoveAnnotation={handleMoveAnnotation}
                onDeleteAnnotation={handleDeleteAnnotation}
                onSelectAnnotation={handleSelectAnnotation}
              />
            </div>
          )}

          {status && (
            <div style={{ color: "#93c5fd", fontSize: 13 }}>{status}</div>
          )}

          {error && (
            <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div>
          )}

          {uploading && (
            <div style={{ color: "#fbbf24", fontSize: 13 }}>
              Uploading and waiting for backend analysis...
            </div>
          )}
        </div>

        {/* BOTTOM RIGHT: studios */}
        <div
          style={{
            padding: 16,
            borderTop: "1px solid #1f2937",
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flex: "0 0 auto",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Studios</h2>
              <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
                {studios.length} saved studio(s)
              </div>
            </div>

            <button
              onClick={handleCreateStudio}
              style={{
                background: "#1f2937",
                color: "white",
                border: "1px solid #374151",
                borderRadius: 10,
                padding: "10px 12px",
                cursor: "pointer",
              }}
            >
              + Create Studio
            </button>
          </div>

          <div style={{ minHeight: 0, flex: 1, overflow: "hidden" }}>
            {loadingStudios ? (
              <LoadingState label="Loading studios..." />
            ) : (
              <StudioSidebar
                studios={studios}
                selectedStudioId={selectedStudioId}
                onSelectStudio={handleSelectStudio}
                onStudioContextMenu={openStudioContextMenu}
              />
            )}
          </div>
        </div>
      </div>

      <ContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenu.items}
        onClose={closeContextMenu}
      />
    </div>
  );
}  