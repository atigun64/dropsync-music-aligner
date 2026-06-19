import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { updateStudioAlignment } from "../api/studios";
import { getTrack } from "../api/tracks";


import {
  getStudioSession,
  uploadStudioVideo,
  updateStudioQuery,
  updateStudioMetadata,
  runOptimizer,
  getStudioAudioBlob,
  getStudioVideoBlob,
} from "../api/studios";

import { normalizeStudioSession, createQuerySpec } from "../schemas/studio";

import LoadingState from "../components/shared/LoadingState";
import StudioOperationsPanel from "../components/studios/StudioOperationsPanel";
import StudioVideoPanel from "../components/studios/StudioVideoPanel";
import StudioTracker from "../components/studios/StudioTracker";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function StudioPage() {
  const { studioId } = useParams();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const videoInputRef = useRef(null);

  const transportRef = useRef({
    wallTime: 0,
    timelineTime: 0,
  });

  const pendingSeekRef = useRef(null);
  const rafRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [savingQuery, setSavingQuery] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [runningOptimizer, setRunningOptimizer] = useState(false);
  const [downloadingAudio, setDownloadingAudio] = useState(false);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [session, setSession] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  const [studioLength, setStudioLength] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [videoToken, setVideoToken] = useState(0);
  const [trackLengthsById, setTrackLengthsById] = useState({});

  const [audioStatus, setAudioStatus] = useState("none"); // none | loading | ready | error
  const [audioError, setAudioError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  const [videoStatus, setVideoStatus] = useState("none"); // none | loading | ready | error
  const [videoError, setVideoError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const audioBlobUrlRef = useRef("");
  const audioLoadPromiseRef = useRef(null);
  const videoBlobUrlRef = useRef("");
  const videoLoadPromiseRef = useRef(null);

  const query = session?.query ?? null;
  const alignment = session?.alignment ?? null;
  const requestedPoints = query?.requested_points ?? [];
  const alignmentTracks = alignment?.tracks ?? [];

  const hasVideo = Boolean(session?.meta?.video_path);
  const hasAudio = alignmentTracks.length > 0;
  const hasMedia = hasVideo || hasAudio;

  const timelineLength = useMemo(() => {
    const qLen = Number(query?.length_seconds ?? 0);
    return Math.max(qLen, videoDuration || 0, audioDuration || 0, 1);
  }, [query?.length_seconds, videoDuration, audioDuration]);

  const audioSrc = useMemo(() => {
    if (!hasAudio || audioStatus !== "ready") return "";
    return audioUrl;
  }, [hasAudio, audioStatus, audioUrl]);

  async function saveAlignment(nextAlignment) {
    const updated = await updateStudioAlignment(studioId, nextAlignment);
    invalidateStudioAudio();
    setSession(normalizeStudioSession(updated));
  }
  async function handleMoveAlignmentBlock(index, nextStartTime) {
    if (!alignment) return;

    try {
      setStatus("Saving alignment...");
      setError("");

      const nextTracks = alignmentTracks.map((t, i) =>
        i === index
          ? {
            ...t,
            start_time_seconds: clamp(nextStartTime, 0, timelineLength),
          }
          : t
      );

      await saveAlignment({
        score: Number(alignment.score || 0),
        tracks: nextTracks,
      });

      setStatus("Alignment updated");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Failed to move alignment block");
      setStatus("");
    }
  }
  async function handleChangeAlignmentBlockSpeed(index, nextSpeed) {
    if (!alignment) return;

    try {
      setStatus("Saving alignment...");
      setError("");

      const nextTracks = alignmentTracks.map((t, i) =>
        i === index
          ? {
            ...t,
            speed: nextSpeed,
          }
          : t
      );

      await saveAlignment({
        score: Number(alignment.score || 0),
        tracks: nextTracks,
      });

      setStatus("Speed updated");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Failed to change block speed");
      setStatus("");
    }
  }
  async function loadSession() {
    setLoading(true);
    setError("");
    invalidateStudioAudio();
    invalidateStudioVideo();

    try {
      const raw = await getStudioSession(studioId);
      const normalized = normalizeStudioSession(raw);
      setSession(normalized);

      const length = normalized.query?.length_seconds ?? 0;
      setStudioLength(String(length || ""));

          if (!normalized.meta?.video_path) {
        setVideoDuration(0);
      }
    } catch (e) {
      setError(e.message || "Failed to load studio session");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }

  function invalidateStudioAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }

    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = "";
    }

    audioLoadPromiseRef.current = null;
    setAudioUrl("");
    setAudioError("");
    setAudioStatus("none");
  }

  function invalidateStudioVideo() {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }

    if (videoBlobUrlRef.current) {
      URL.revokeObjectURL(videoBlobUrlRef.current);
      videoBlobUrlRef.current = "";
    }

    videoLoadPromiseRef.current = null;
    setVideoUrl("");
    setVideoError("");
    setVideoStatus("none");
    setVideoToken((v) => v + 1);
  }

  async function ensureStudioAudioLoaded() {
    if (!alignmentTracks.length) {
      return false;
    }

    if (audioStatus === "ready" && audioUrl) {
      return true;
    }

    if (audioLoadPromiseRef.current) {
      return audioLoadPromiseRef.current;
    }

    setAudioStatus("loading");
    setAudioError("");

    const promise = (async () => {
      const blob = await getStudioAudioBlob(studioId);
      const nextUrl = URL.createObjectURL(blob);

      if (audioBlobUrlRef.current) {
        URL.revokeObjectURL(audioBlobUrlRef.current);
      }

      audioBlobUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setAudioStatus("ready");
      return true;
    })()
      .catch((e) => {
        setAudioStatus("error");
        setAudioError(e.message || "Failed to load studio audio");
        return false;
      })
      .finally(() => {
        audioLoadPromiseRef.current = null;
      });

    audioLoadPromiseRef.current = promise;
    return promise;
  }

  async function ensureStudioVideoLoaded() {
    if (!hasVideo) {
      return false;
    }

    if (videoStatus === "ready" && videoUrl) {
      return true;
    }

    if (videoLoadPromiseRef.current) {
      return videoLoadPromiseRef.current;
    }

    setVideoStatus("loading");
    setVideoError("");

    const promise = (async () => {
      const blob = await getStudioVideoBlob(studioId);
      const nextUrl = URL.createObjectURL(blob);

      if (videoBlobUrlRef.current) {
        URL.revokeObjectURL(videoBlobUrlRef.current);
      }

      videoBlobUrlRef.current = nextUrl;
      setVideoUrl(nextUrl);
      setVideoStatus("ready");
      return true;
    })()
      .catch((e) => {
        setVideoStatus("error");
        setVideoError(e.message || "Failed to load studio video");
        return false;
      })
      .finally(() => {
        videoLoadPromiseRef.current = null;
      });

    videoLoadPromiseRef.current = promise;
    return promise;
  }

  async function playMedia() {
    if (alignmentTracks.length > 0) {
      const ok = await ensureStudioAudioLoaded();
      if (!ok) return;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    if (hasVideo && videoStatus !== "ready") {
      const ok = await ensureStudioVideoLoaded();
      if (!ok) return;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const actions = [];

    if (hasVideo && videoRef.current) {
      actions.push(videoRef.current.play());
    }

    if (alignmentTracks.length > 0 && audioRef.current) {
      actions.push(audioRef.current.play());
    }

    if (actions.length === 0) {
      setIsPlaying(true);
      return;
    }

    const results = await Promise.allSettled(actions);
    const anyPlayed = results.some((r) => r.status === "fulfilled");
    setIsPlaying(anyPlayed);
  }

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId]);

  const alignmentTrackIdsKey = useMemo(
    () => alignmentTracks.map((t) => t.track_id).join("|"),
    [alignmentTracks]
  );

  useEffect(() => {
    if (!alignmentTracks.length) {
      invalidateStudioAudio();
      return;
    }

    if (audioStatus === "none") {
      void ensureStudioAudioLoaded();
    }
  }, [alignmentTrackIdsKey, alignmentTracks.length, audioStatus]);

  useEffect(() => {
    if (!hasVideo) {
      invalidateStudioVideo();
      return;
    }

    if (videoStatus === "none") {
      void ensureStudioVideoLoaded();
    }
  }, [hasVideo, videoStatus, studioId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrackLengths() {
      if (!alignmentTracks.length) {
        setTrackLengthsById({});
        return;
      }

      try {
        const entries = await Promise.all(
          alignmentTracks.map(async (t) => {
            try {
              const track = await getTrack(t.track_id);
              return [t.track_id, Number(track?.meta?.length_seconds || 0)];
            } catch {
              return [t.track_id, 0];
            }
          })
        );

        if (!cancelled) {
          setTrackLengthsById(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) {
          setTrackLengthsById({});
        }
      }
    }

    loadTrackLengths();

    return () => {
      cancelled = true;
    };
  }, [alignmentTrackIdsKey]);
  

  // No-media mode only.
  useEffect(() => {
    if (hasMedia) return;

    if (!isPlaying) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    transportRef.current = {
      wallTime: performance.now(),
      timelineTime: currentTime,
    };

    const tick = (now) => {
      const { wallTime, timelineTime } = transportRef.current;
      const elapsed = (now - wallTime) / 1000;

      const nextTime = clamp(timelineTime + elapsed, 0, timelineLength);
      setCurrentTime(nextTime);

      if (nextTime >= timelineLength) {
        setIsPlaying(false);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, timelineLength, hasMedia, currentTime]);

  useEffect(() => {
    if (!isPlaying) return;

    if (hasVideo && videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch((err) => {
        console.error("Failed to play video:", err);
        setIsPlaying(false);
      });
    }

    if (
      alignmentTracks.length > 0 &&
      audioStatus === "ready" &&
      audioRef.current &&
      audioRef.current.paused
    ) {
      audioRef.current.play().catch((err) => {
        console.error("Failed to play studio audio:", err);
        setIsPlaying(false);
      });
    }
  }, [isPlaying, hasVideo, alignmentTracks.length, audioStatus, audioUrl]);

  function pausePlayback() {
    setIsPlaying(false);

    if (videoRef.current) {
      videoRef.current.pause();
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  async function playMedia() {
    if (alignmentTracks.length > 0) {
      const ok = await ensureStudioAudioLoaded();
      if (!ok) return;

      // give React a frame to mount the audio element
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    if (videoRef.current) {
      try {
        videoRef.current.currentTime = currentTime;
      } catch {
        // ignore
      }
    }

    if (audioRef.current) {
      try {
        audioRef.current.currentTime = currentTime;
      } catch {
        // ignore
      }
    }

    const actions = [];

    if (hasVideo && videoRef.current) {
      actions.push(videoRef.current.play());
    }

    if (alignmentTracks.length > 0 && audioRef.current) {
      actions.push(audioRef.current.play());
    }

    if (actions.length === 0) {
      setIsPlaying(true);
      return;
    }

    const results = await Promise.allSettled(actions);
    const anyPlayed = results.some((r) => r.status === "fulfilled");
    setIsPlaying(anyPlayed);
  }

  function togglePlay() {
    if (isPlaying) {
      pausePlayback();
      return;
    }

    void playMedia();
  }

  // Commit a seek once dragging ends.
  function commitSeek(targetTime) {
    const next = clamp(targetTime, 0, timelineLength);

    // Remember we're waiting for media to catch up
    pendingSeekRef.current = next;

    // Move tracker immediately
    setCurrentTime(next);

    if (videoRef.current) {
      try {
        videoRef.current.currentTime = next;
      } catch {
        // ignore
      }
    }

    if (audioRef.current) {
      try {
        audioRef.current.currentTime = next;
      } catch {
        // ignore
      }
    }

    if (!hasMedia && isPlaying) {
      transportRef.current = {
        wallTime: performance.now(),
        timelineTime: next,
      };
    }
  }

  function handleVideoLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;

    const duration = Number(video.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;

    setVideoDuration(duration);
    autoAssignStudioLength(duration);
  }

  function handleVideoTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;

    const pending = pendingSeekRef.current;

    if (pending !== null) {
      if (Math.abs(video.currentTime - pending) < 0.25) {
        pendingSeekRef.current = null;
        setCurrentTime(video.currentTime || 0);
      }
      return;
    }

    setCurrentTime(video.currentTime || 0);
  }

  function handleAudioLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;

    const duration = Number(audio.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;

    setAudioDuration(duration);
  }

  function handleAudioTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;

    const pending = pendingSeekRef.current;

    if (pending !== null) {
      if (Math.abs(audio.currentTime - pending) < 0.25) {
        pendingSeekRef.current = null;
        setCurrentTime(audio.currentTime || 0);
      }
      return;
    }

    if (!hasVideo) {
      setCurrentTime(audio.currentTime || 0);
    }
  }

  async function autoAssignStudioLength(length) {
    const nextLength = Number(length || 0);
    if (!Number.isFinite(nextLength) || nextLength <= 0) return;

    const existing = Number(query?.length_seconds ?? 0);
    if (Math.abs(existing - nextLength) < 0.05) {
      setStudioLength(String(nextLength));
      return;
    }

    try {
      setSavingQuery(true);

      const nextQuery = query
        ? {
          ...query,
          length_seconds: nextLength,
        }
        : createQuerySpec({
          length_seconds: nextLength,
          signature: [],
          requested_points: [],
        });

      await updateStudioQuery(studioId, nextQuery);
      const raw = await getStudioSession(studioId);
      setSession(normalizeStudioSession(raw));
      setStudioLength(String(nextLength));
    } catch (e) {
      setError(e.message || "Failed to auto-save studio length");
    } finally {
      setSavingQuery(false);
    }
  }

  function handleImportVideoClick() {
    videoInputRef.current?.click();
  }

  async function handleVideoUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingVideo(true);
    setStatus("Uploading video...");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      await uploadStudioVideo(studioId, formData);

      setVideoToken((v) => v + 1);
      await loadSession();

      setStatus("Video uploaded");
      setTimeout(() => setStatus(""), 1200);
    } catch (e2) {
      setError(e2.message || "Failed to upload video");
      setStatus("");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleRemoveVideo() {
    const ok = window.confirm("Remove the current video from this studio?");
    if (!ok) return;

    setStatus("Removing video...");
    setError("");

    try {
      await updateStudioMetadata(studioId, {
        source: "silent",
        video_path: null,
        notes: session?.meta?.notes ?? "",
      });

      setVideoDuration(0);
      setVideoToken((v) => v + 1);

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }

      await loadSession();

      setStatus("Video removed");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Failed to remove video");
      setStatus("");
    }
  }

  async function handleSaveLengthManual() {
    if (hasVideo) return;

    const nextLength = Number(studioLength);
    if (!Number.isFinite(nextLength) || nextLength < 0) {
      setError("Studio length must be a valid number");
      return;
    }

    setSavingQuery(true);
    setStatus("Saving studio length...");
    setError("");

    try {
      const nextQuery = query
        ? {
          ...query,
          length_seconds: nextLength,
        }
        : createQuerySpec({
          length_seconds: nextLength,
          signature: [],
          requested_points: [],
        });

      await updateStudioQuery(studioId, nextQuery);
      await loadSession();

      setStatus("Studio length saved");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Failed to save studio length");
      setStatus("");
    } finally {
      setSavingQuery(false);
    }
  }

  async function handleClearAnnotations() {
    const ok = window.confirm("Clear all requested annotations?");
    if (!ok) return;

    try {
      setStatus("Clearing annotations...");
      setError("");

      const nextQuery = query
        ? {
          ...query,
          requested_points: [],
        }
        : createQuerySpec({
          length_seconds: Number(studioLength || videoDuration || 0),
          signature: [],
          requested_points: [],
        });

      await updateStudioQuery(studioId, nextQuery);
      await loadSession();

      setStatus("Annotations cleared");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Failed to clear annotations");
      setStatus("");
    }
  }

  async function handleRunOptimizer() {
    setRunningOptimizer(true);
    setStatus("Running optimizer...");
    setError("");

    try {
      await runOptimizer(studioId);
      invalidateStudioAudio();
      await loadSession();

      setStatus("Optimization complete");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Optimizer failed");
      setStatus("");
    } finally {
      setRunningOptimizer(false);
    }
  }

  async function handleDownloadAudio() {
    setDownloadingAudio(true);
    setStatus("Preparing audio download...");
    setError("");

    try {
      const blob = await getStudioAudioBlob(studioId);
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${studioId}_output.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      setStatus("Download started");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Failed to download audio");
      setStatus("");
    } finally {
      setDownloadingAudio(false);
    }
  }

  async function handleAddAnnotation(timeSeconds) {
    const label = window.prompt("Annotation label?", "drop");
    if (label === null) return;

    const strengthRaw = window.prompt("Strength (0 to 1)?", "1");
    if (strengthRaw === null) return;

    const strength = Number(strengthRaw);
    if (!Number.isFinite(strength)) {
      setError("Strength must be a number");
      return;
    }

    const nextPoint = {
      label,
      time_seconds: clamp(Number(timeSeconds || currentTime), 0, timelineLength),
      strength,
    };

    const nextPoints = [...requestedPoints, nextPoint];

    const nextQuery = query
      ? {
        ...query,
        requested_points: nextPoints,
      }
      : createQuerySpec({
        length_seconds: Number(studioLength || videoDuration || 0),
        signature: [],
        requested_points: nextPoints,
      });

    try {
      setStatus("Saving annotation...");
      setError("");

      await updateStudioQuery(studioId, nextQuery);
      await loadSession();

      setStatus("Annotation saved");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Failed to save annotation");
      setStatus("");
    }
  }

  async function handleEditAnnotation(index) {
    const ann = requestedPoints[index];
    if (!ann) return;

    const label = window.prompt("Edit label", ann.label);
    if (label === null) return;

    const timeRaw = window.prompt(
      "Edit time (seconds)",
      String(Number(ann.time_seconds ?? 0))
    );
    if (timeRaw === null) return;

    const strengthRaw = window.prompt(
      "Edit strength",
      String(Number(ann.strength ?? 1))
    );
    if (strengthRaw === null) return;

    const timeSeconds = Number(timeRaw);
    const strength = Number(strengthRaw);

    if (!Number.isFinite(timeSeconds) || !Number.isFinite(strength)) {
      setError("Time and strength must be numbers");
      return;
    }

    const nextPoints = requestedPoints.map((p, i) =>
      i === index
        ? {
          ...p,
          label,
          time_seconds: clamp(timeSeconds, 0, timelineLength),
          strength,
        }
        : p
    );

    const nextQuery = query
      ? {
        ...query,
        requested_points: nextPoints,
      }
      : createQuerySpec({
        length_seconds: Number(studioLength || videoDuration || 0),
        signature: [],
        requested_points: nextPoints,
      });

    try {
      setStatus("Saving annotation...");
      setError("");

      await updateStudioQuery(studioId, nextQuery);
      await loadSession();

      setStatus("Annotation updated");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Failed to update annotation");
      setStatus("");
    }
  }

  async function handleDeleteAnnotation(index) {
    const nextPoints = requestedPoints.filter((_, i) => i !== index);

    const nextQuery = query
      ? {
        ...query,
        requested_points: nextPoints,
      }
      : createQuerySpec({
        length_seconds: Number(studioLength || videoDuration || 0),
        signature: [],
        requested_points: nextPoints,
      });

    try {
      setStatus("Deleting annotation...");
      setError("");

      await updateStudioQuery(studioId, nextQuery);
      await loadSession();

      setStatus("Annotation removed");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Failed to delete annotation");
      setStatus("");
    }
  }

  function handleBlockContextMenu(index) {
    console.log("Right-click block:", index);
  }

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
        background: "#0f1115",
        color: "#e5e7eb",
        display: "grid",
        gridTemplateRows: "minmax(320px, 44vh) 1fr",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
        style={{ display: "none" }}
      />

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="auto"
          onLoadedMetadata={handleAudioLoadedMetadata}
          onTimeUpdate={handleAudioTimeUpdate}
          style={{ display: "none" }}
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          minHeight: 0,
          overflow: "hidden",
          borderBottom: "1px solid #1f2937",
        }}
      >
        <StudioOperationsPanel
          studioId={studioId}
          canEditLength={!hasVideo}
          studioLength={studioLength}
          onStudioLengthChange={setStudioLength}
          onSaveLength={handleSaveLengthManual}
          onImportVideo={handleImportVideoClick}
          onRemoveVideo={handleRemoveVideo}
          onClearAnnotations={handleClearAnnotations}
          onRunOptimizer={handleRunOptimizer}
          onDownloadAudio={handleDownloadAudio}
          videoDuration={videoDuration}
          queryLength={query?.length_seconds ?? 0}
          savingQuery={savingQuery}
          uploadingVideo={uploadingVideo}
          runningOptimizer={runningOptimizer}
          downloadingAudio={downloadingAudio}
        />

        <StudioVideoPanel
          studioId={studioId}
          hasVideo={hasVideo}
          videoToken={videoToken}
          videoRef={videoRef}
          videoSrc={videoUrl}
          onLoadedMetadata={handleVideoLoadedMetadata}
          onTimeUpdate={handleVideoTimeUpdate}
        />
      </div>

      <div
        style={{
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 16,
          gap: 12,
        }}
      >
        <StudioTracker
          timelineLength={timelineLength}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onSeekCommit={commitSeek}
          onTogglePlay={togglePlay}
          onPausePlayback={pausePlayback}
          onAddAnnotation={handleAddAnnotation}
          onEditAnnotation={handleEditAnnotation}
          onDeleteAnnotation={handleDeleteAnnotation}
          requestedPoints={requestedPoints}
          alignmentTracks={alignmentTracks}
          trackLengthsById={trackLengthsById}
          onMoveAlignmentBlock={handleMoveAlignmentBlock}
          onChangeAlignmentBlockSpeed={handleChangeAlignmentBlockSpeed}
        />




        {loading && <LoadingState label="Loading studio..." />}
        {status && <div style={{ color: "#93c5fd", fontSize: 13 }}>{status}</div>}
        {error && <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div>}
        {alignmentTracks.length === 0 && (
          <div style={{ color: "#64748b", fontSize: 13 }}>
            No studio audio yet. Run optimization to generate it.
          </div>
        )}

        <button
          onClick={() => navigate("/")}
          style={{
            alignSelf: "flex-end",
            background: "#111827",
            color: "white",
            border: "1px solid #374151",
            borderRadius: 10,
            padding: "10px 12px",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
      </div>

      {audioStatus === "loading" && alignmentTracks.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            pointerEvents: "all",
          }}
        >
          <div
            style={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 14,
              padding: "18px 22px",
              color: "white",
              minWidth: 260,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 16, marginBottom: 8 }}>Rendering studio audio...</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>
              This may take a few seconds.
            </div>
          </div>
        </div>
      )}

      {audioStatus === "error" && alignmentTracks.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#111827",
              border: "1px solid #7f1d1d",
              borderRadius: 14,
              padding: "18px 22px",
              color: "white",
              minWidth: 280,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 16, marginBottom: 8 }}>Failed to render audio</div>
            <div style={{ fontSize: 13, color: "#fca5a5" }}>
              {audioError || "Unknown error"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
