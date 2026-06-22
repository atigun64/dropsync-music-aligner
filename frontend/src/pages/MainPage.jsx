import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { listTracks, getTrack, uploadTrack, updateTrackAnnotations, deleteTrack } from "../api/tracks";
import { listStudios, createStudio, deleteStudio } from "../api/studios";

import { normalizeTrackListItem, normalizeTrackRecord } from "../schemas/track";
import { createAnnotation } from "../schemas/annotation";
import { compareNumericIds } from "../utils/sortIds";

import LoadingState from "../components/shared/LoadingState";
import ContextMenu from "../components/shared/ContextMenu";
import { useAppDialog } from "../components/shared/AppDialogProvider";
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
  const { prompt, confirm } = useAppDialog();

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
      const normalizedList = (Array.isArray(rawList)
        ? rawList.map(normalizeTrackListItem)
        : []
      ).sort((a, b) => compareNumericIds(a.track_id, b.track_id));

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
      const normalizedList = (Array.isArray(rawList) ? rawList.map(String) : []).sort(
        compareNumericIds
      );

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
  async function handleAddAnnotation(timeSeconds) {
    if (!selectedTrack) return;

    const result = await prompt({
      title: "Add annotation",
      submitLabel: "Add",
      fields: [
        { key: "label", label: "Label", defaultValue: "drop" },
        {
          key: "strength",
          label: "Strength (0 to 1)",
          type: "number",
          defaultValue: "1",
          min: 0,
          max: 1,
          step: 0.01,
        },
      ],
    });
    if (!result) return;

    const strength = Number(result.strength);
    if (!Number.isFinite(strength)) {
      setError("Strength must be a number");
      return;
    }

    const newAnnotation = createAnnotation({
      label: result.label,
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

  async function handleSelectAnnotation(index) {
    if (!selectedTrack) return;

    const ann = selectedTrack.annotations[index];
    if (!ann) return;

    const result = await prompt({
      title: "Edit annotation",
      submitLabel: "Save",
      fields: [
        { key: "label", label: "Label", defaultValue: ann.label },
        {
          key: "time_seconds",
          label: "Time (seconds)",
          type: "number",
          defaultValue: String(ann.time_seconds),
          min: 0,
          step: 0.01,
        },
        {
          key: "strength",
          label: "Strength (0 to 1)",
          type: "number",
          defaultValue: String(ann.strength),
          min: 0,
          max: 1,
          step: 0.01,
        },
      ],
    });
    if (!result) return;

    const timeSeconds = Number(result.time_seconds);
    const strength = Number(result.strength);

    if (!Number.isFinite(timeSeconds) || !Number.isFinite(strength)) {
      setError("Time and strength must be numbers");
      return;
    }

    updateAnnotationAtIndex(index, {
      label: result.label,
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
            const ok = await confirm({
              title: "Delete track",
              message: `Delete track "${track.track_id}"? This cannot be undone.`,
              confirmLabel: "Delete",
              danger: true,
            });
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
            const ok = await confirm({
              title: "Delete studio",
              message: `Delete studio "${studioId}"? This cannot be undone.`,
              confirmLabel: "Delete",
              danger: true,
            });
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
    <div className="library-page" onClick={closeContextMenu}>
      <header className="library-header">
        <div>
          <h1 className="library-header__title">Music Matcher</h1>
          <p className="library-header__subtitle">
            {tracks.length} track{tracks.length === 1 ? "" : "s"} · {studios.length} studio
            {studios.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className="library-body">
        <TrackSidebar
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          onSelectTrack={handleSelectTrack}
          onTrackContextMenu={openTrackContextMenu}
          onSingleFilesSelected={handleSingleFilesSelected}
          onFolderFilesSelected={handleFolderFilesSelected}
        />

        <div className="library-main">
          <section className="library-panel">
            <div className="library-panel__header">
              <div>
                <h2 className="library-panel__heading">Track editor</h2>
                <p className="library-panel__hint">
                  {selectedTrack
                    ? `Editing ${selectedTrack.track_id} · Space play/pause · ← → ±10s`
                    : "Select a track to annotate"}
                </p>
              </div>
              {selectedTrack && (
                <div className="library-panel__stats">
                  {selectedTrack.meta.length_seconds.toFixed(1)}s ·{" "}
                  {selectedTrack.annotations.length} annotations
                </div>
              )}
            </div>

            <div className="library-panel__content">
              {loadingTracks && !selectedTrack ? (
                <LoadingState label="Loading tracks…" />
              ) : (
                <TrackTimeline
                  track={selectedTrack}
                  onAddAnnotation={handleAddAnnotation}
                  onMoveAnnotation={handleMoveAnnotation}
                  onDeleteAnnotation={handleDeleteAnnotation}
                  onSelectAnnotation={handleSelectAnnotation}
                />
              )}
            </div>
          </section>

          <section className="library-panel">
            <div className="library-panel__header">
              <div>
                <h2 className="library-panel__heading">Studios</h2>
                <p className="library-panel__hint">
                  Open a session to match tracks to video
                </p>
              </div>
              <button className="btn btn--primary" onClick={handleCreateStudio}>
                + Create studio
              </button>
            </div>

            <div className="library-panel__content">
              {loadingStudios ? (
                <LoadingState label="Loading studios…" />
              ) : (
                <StudioSidebar
                  studios={studios}
                  selectedStudioId={selectedStudioId}
                  onSelectStudio={handleSelectStudio}
                  onStudioContextMenu={openStudioContextMenu}
                />
              )}
            </div>
          </section>
        </div>
      </div>

      <footer className="library-statusbar">
        <div>
          {error ? (
            <span className="library-statusbar__message library-statusbar__message--error">
              {error}
            </span>
          ) : uploading ? (
            <span className="library-statusbar__message library-statusbar__message--warn">
              Uploading and waiting for backend analysis…
            </span>
          ) : status ? (
            <span className="library-statusbar__message">{status}</span>
          ) : (
            <span>Ready</span>
          )}
        </div>
        <span>Right-click items to delete · Click studio to open</span>
      </footer>

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