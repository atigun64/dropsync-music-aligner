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
import { normalizeTrackRecord } from "../schemas/track";

import LoadingState from "../components/shared/LoadingState";
import { useAppDialog } from "../components/shared/AppDialogProvider";
import StudioOperationsPanel from "../components/studios/StudioOperationsPanel";
import StudioVideoPanel from "../components/studios/StudioVideoPanel";
import StudioTracker from "../components/studios/StudioTracker";
import {
  clampTime,
  correctAudioDrift,
  playMediaSynced,
  seekMediaSynced,
} from "../utils/mediaTransport";
import { formatTimePrecise } from "../utils/formatTime";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function StudioPage() {
  const { studioId } = useParams();
  const navigate = useNavigate();
  const { prompt, confirm } = useAppDialog();

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const videoInputRef = useRef(null);

  const transportRef = useRef({
    wallTime: 0,
    timelineTime: 0,
  });

  const timelineTimeRef = useRef(0);
  const seekPromiseRef = useRef(Promise.resolve());
  const isSeekingRef = useRef(false);
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
  const [trackMetaById, setTrackMetaById] = useState({});

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
  const togglePlayRef = useRef(() => {});
  const commitSeekRef = useRef(() => {});
  const timelineLengthRef = useRef(1);
  const isPlayingRef = useRef(false);
  const runningOptimizerRef = useRef(false);

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

  function setTimelineTime(time) {
    const next = clamp(time, 0, timelineLength);
    timelineTimeRef.current = next;
    setCurrentTime(next);
  }

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
  function applySession(raw) {
    const normalized = normalizeStudioSession(raw);
    setSession(normalized);

    const length = normalized.query?.length_seconds ?? 0;
    setStudioLength(String(length || ""));

    if (!normalized.meta?.video_path) {
      setVideoDuration(0);
    }

    return normalized;
  }

  async function loadSession({ invalidateAudio = true, invalidateVideo = true } = {}) {
    setLoading(true);
    setError("");
    if (invalidateAudio) invalidateStudioAudio();
    if (invalidateVideo) invalidateStudioVideo();

    try {
      const raw = await getStudioSession(studioId);
      applySession(raw);
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

    async function loadTrackMeta() {
      if (!alignmentTracks.length) {
        setTrackMetaById({});
        return;
      }

      try {
        const entries = await Promise.all(
          alignmentTracks.map(async (t) => {
            try {
              const track = normalizeTrackRecord(await getTrack(t.track_id));
              return [
                t.track_id,
                {
                  length_seconds: Number(track.meta?.length_seconds || 0),
                  annotations: track.annotations ?? [],
                },
              ];
            } catch {
              return [t.track_id, { length_seconds: 0, annotations: [] }];
            }
          })
        );

        if (!cancelled) {
          setTrackMetaById(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) {
          setTrackMetaById({});
        }
      }
    }

    loadTrackMeta();

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
      timelineTime: timelineTimeRef.current,
    };

    const tick = (now) => {
      const { wallTime, timelineTime } = transportRef.current;
      const elapsed = (now - wallTime) / 1000;

      const nextTime = clamp(timelineTime + elapsed, 0, timelineLength);
      setTimelineTime(nextTime);

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
  }, [isPlaying, timelineLength, hasMedia]);

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
    try {
      await seekPromiseRef.current;
    } catch {
      // ignore failed background seek
    }

    if (alignmentTracks.length > 0) {
      const ok = await ensureStudioAudioLoaded();
      if (!ok) return;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    if (hasVideo) {
      const ok = await ensureStudioVideoLoaded();
      if (!ok) return;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    if (hasMedia) {
      isSeekingRef.current = true;

      try {
        const played = await playMediaSynced({
          videoEl: videoRef.current,
          audioEl: audioRef.current,
          timeSeconds: timelineTimeRef.current,
          hasVideo,
        });

        setIsPlaying(played);
      } finally {
        isSeekingRef.current = false;
      }

      return;
    }

    setIsPlaying(true);
  }

  function togglePlay() {
    if (isPlaying) {
      pausePlayback();
      return;
    }

    void playMedia();
  }

  togglePlayRef.current = togglePlay;

  // Commit a seek once dragging ends.
  function commitSeek(targetTime, { resume } = {}) {
    const shouldResume = resume ?? isPlaying;
    pausePlayback();

    const next = clampTime(targetTime, 0, timelineLength);
    setTimelineTime(next);

    if (!hasMedia) {
      if (shouldResume) {
        transportRef.current = {
          wallTime: performance.now(),
          timelineTime: next,
        };
        setIsPlaying(true);
      }
      return;
    }

    const seekTask = (async () => {
      isSeekingRef.current = true;

      try {
        if (alignmentTracks.length > 0) {
          const audioReady = await ensureStudioAudioLoaded();
          if (!audioReady) return;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }

        if (hasVideo) {
          const videoReady = await ensureStudioVideoLoaded();
          if (!videoReady) return;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }

        const settledTime = await seekMediaSynced({
          videoEl: videoRef.current,
          audioEl: audioRef.current,
          timeSeconds: next,
          hasVideo,
        });

        setTimelineTime(settledTime);

        if (shouldResume) {
          const played = await playMediaSynced({
            videoEl: videoRef.current,
            audioEl: audioRef.current,
            timeSeconds: timelineTimeRef.current,
            hasVideo,
          });
          setIsPlaying(played);
        }
      } finally {
        isSeekingRef.current = false;
      }
    })();

    seekPromiseRef.current = seekTask;
    void seekTask.catch(() => {
      // seek errors are non-fatal; UI already shows target position
    });
  }

  timelineLengthRef.current = timelineLength;
  isPlayingRef.current = isPlaying;
  runningOptimizerRef.current = runningOptimizer;
  commitSeekRef.current = commitSeek;

  useEffect(() => {
    const SEEK_STEP_SECONDS = 10;

    function isEditableTarget(target) {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }

    function handleKeyDown(e) {
      if (runningOptimizerRef.current) return;
      if (isEditableTarget(e.target)) return;

      if (e.code === "Space") {
        if (e.repeat) return;

        e.preventDefault();
        e.stopPropagation();
        togglePlayRef.current();
        return;
      }

      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();

        const delta =
          e.code === "ArrowRight" ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS;
        const next = clampTime(
          timelineTimeRef.current + delta,
          0,
          timelineLengthRef.current
        );

        commitSeekRef.current(next, { resume: isPlayingRef.current });
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

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
    if (!video || isSeekingRef.current) return;

    if (hasAudio && audioRef.current && !video.paused) {
      correctAudioDrift(video, audioRef.current);
    }

    setTimelineTime(video.currentTime || 0);
  }

  function handleAudioLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;

    const duration = Number(audio.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;

    setAudioDuration(duration);
  }

  function handleAudioTimeUpdate() {
    if (hasVideo || isSeekingRef.current) return;

    const audio = audioRef.current;
    if (!audio) return;

    setTimelineTime(audio.currentTime || 0);
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

      const raw = await updateStudioQuery(studioId, nextQuery);
      applySession(raw);
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
    const ok = await confirm({
      title: "Remove video",
      message: "Remove the current video from this studio?",
      confirmLabel: "Remove",
      danger: true,
    });
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

      const raw = await updateStudioQuery(studioId, nextQuery);
      applySession(raw);

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
    const ok = await confirm({
      title: "Clear annotations",
      message: "Clear all requested annotations from this studio?",
      confirmLabel: "Clear",
      danger: true,
    });
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

      const raw = await updateStudioQuery(studioId, nextQuery);
      applySession(raw);

      setStatus("Annotations cleared");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setError(e.message || "Failed to clear annotations");
      setStatus("");
    }
  }

  async function handleRunOptimizer() {
    if (runningOptimizer) return;

    pausePlayback();
    setRunningOptimizer(true);
    setStatus("Running optimizer...");
    setError("");

    try {
      await runOptimizer(studioId);
      invalidateStudioAudio();
      await loadSession({ invalidateVideo: false });

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

    const nextPoint = {
      label: result.label,
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

      const raw = await updateStudioQuery(studioId, nextQuery);
      applySession(raw);

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

    const result = await prompt({
      title: "Edit annotation",
      submitLabel: "Save",
      fields: [
        { key: "label", label: "Label", defaultValue: ann.label },
        {
          key: "time_seconds",
          label: "Time (seconds)",
          type: "number",
          defaultValue: String(Number(ann.time_seconds ?? 0)),
          min: 0,
          step: 0.01,
        },
        {
          key: "strength",
          label: "Strength (0 to 1)",
          type: "number",
          defaultValue: String(Number(ann.strength ?? 1)),
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

    const nextPoints = requestedPoints.map((p, i) =>
      i === index
        ? {
          ...p,
          label: result.label,
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

      const raw = await updateStudioQuery(studioId, nextQuery);
      applySession(raw);

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

      const raw = await updateStudioQuery(studioId, nextQuery);
      applySession(raw);

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
    <div className="studio-page" aria-busy={runningOptimizer}>
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

      <header className="studio-header">
        <div className="studio-header__left">
          <button
            className="btn btn--ghost"
            onClick={() => navigate("/")}
            disabled={runningOptimizer}
          >
            ← Library
          </button>
          <div>
            <h1 className="studio-title">Studio #{studioId}</h1>
            <p className="studio-subtitle">
              {alignmentTracks.length > 0
                ? `${alignmentTracks.length} track${alignmentTracks.length === 1 ? "" : "s"} · ${requestedPoints.length} annotation${requestedPoints.length === 1 ? "" : "s"}`
                : "No alignment yet — run optimization to generate audio"}
            </p>
          </div>
        </div>

        <div className="studio-timecode" aria-live="polite">
          {formatTimePrecise(currentTime)}
          <span className="studio-timecode__sep">/</span>
          <span className="studio-timecode__total">
            {formatTimePrecise(timelineLength)}
          </span>
        </div>
      </header>

      <div className="studio-workspace">
        <div className="studio-preview-row">
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

        <div className="studio-timeline-row">
          {loading ? (
            <LoadingState label="Loading studio…" />
          ) : (
            <StudioTracker
              timelineLength={timelineLength}
              currentTime={currentTime}
              isPlaying={isPlaying}
              interactionLocked={runningOptimizer}
              onSeekCommit={commitSeek}
              onTogglePlay={togglePlay}
              onPausePlayback={pausePlayback}
              onAddAnnotation={handleAddAnnotation}
              onEditAnnotation={handleEditAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              requestedPoints={requestedPoints}
              alignmentTracks={alignmentTracks}
              trackMetaById={trackMetaById}
              onMoveAlignmentBlock={handleMoveAlignmentBlock}
              onChangeAlignmentBlockSpeed={handleChangeAlignmentBlockSpeed}
            />
          )}
        </div>
      </div>

      <footer className="studio-statusbar">
        <div>
          {error ? (
            <span className="studio-statusbar__message studio-statusbar__message--error">
              {error}
            </span>
          ) : runningOptimizer ? (
            <span className="studio-statusbar__message">Running optimizer…</span>
          ) : status ? (
            <span className="studio-statusbar__message">{status}</span>
          ) : (
            <span>
              {isPlaying ? "Playing" : "Paused"}
              {hasVideo ? " · Video" : ""}
              {hasAudio ? " · Audio" : ""}
            </span>
          )}
        </div>
        <span className="studio-statusbar__hint">
          Right-click blocks to change speed · Right-click markers to delete
        </span>
      </footer>

      {runningOptimizer && (
        <div className="studio-overlay studio-overlay--optimizer">
          <div className="studio-overlay__card">
            <div className="studio-overlay__spinner" />
            <div className="studio-overlay__title">Running optimization</div>
            <div className="studio-overlay__body">
              The optimizer is working through track combinations. This can take a
              while — please wait and avoid other actions until it finishes.
            </div>
          </div>
        </div>
      )}

      {audioStatus === "loading" && alignmentTracks.length > 0 && !runningOptimizer && (
        <div className="studio-overlay">
          <div className="studio-overlay__card">
            <div className="studio-overlay__spinner" />
            <div className="studio-overlay__title">Rendering studio audio</div>
            <div className="studio-overlay__body">This may take a few seconds.</div>
          </div>
        </div>
      )}

      {audioStatus === "error" && alignmentTracks.length > 0 && (
        <div className="studio-overlay">
          <div className="studio-overlay__card studio-overlay__card--error">
            <div className="studio-overlay__title">Failed to render audio</div>
            <div className="studio-overlay__body studio-overlay__body--error">
              {audioError || "Unknown error"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
