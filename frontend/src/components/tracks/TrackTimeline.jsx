import { useEffect, useMemo, useRef, useState } from "react";
import AnnotationChip from "./AnnotationChip";

const HEADER_HEIGHT = 28;
const TRACK_HEIGHT = 120;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function getTickStep(duration) {
  if (duration <= 30) return 5;
  if (duration <= 120) return 10;
  return 20;
}

export default function TrackTimeline({
  track,
  onAddAnnotation,
  onMoveAnnotation,
  onDeleteAnnotation,
  onSelectAnnotation,
}) {
  const audioRef = useRef(null);
  const containerRef = useRef(null);
  const dragAnnotationRef = useRef(null);
  const dragPlayheadRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const duration = useMemo(() => {
    if (!track) return 0;
    return Number(track.meta?.length_seconds ?? 0);
  }, [track]);

  // Use backend route to fetch the actual audio file
  const audioSrc = useMemo(() => {
    if (!track?.track_id) return "";
    return `/api/tracks/${track.track_id}/audio`;
  }, [track?.track_id]);

  const ticks = useMemo(() => {
    if (!duration) return [];
    const step = getTickStep(duration);
    const max = Math.ceil(duration);
    const list = [];

    for (let t = 0; t <= max; t += step) {
      list.push(t);
    }

    if (list[list.length - 1] !== max) {
      list.push(max);
    }

    return list;
  }, [duration]);

  function timeToPct(time) {
    if (!duration) return 0;
    return (clamp(time, 0, duration) / duration) * 100;
  }

  function mouseToTime(e) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || !duration) return 0;

    const x = e.clientX - rect.left;
    const pct = clamp(x / rect.width, 0, 1);
    return pct * duration;
  }

  function seekTo(time) {
    const audio = audioRef.current;
    const next = clamp(time, 0, duration);

    if (audio) {
      audio.currentTime = next;
    }

    setCurrentTime(next);

    if (next >= duration && audio) {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !track) return;

    if (audio.paused) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.error("Failed to play audio:", err);
        });
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  // When switching tracks, reset UI.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    setCurrentTime(0);
    setIsPlaying(false);
  }, [track?.track_id]);

  // Keep UI synced with actual audio playback.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(duration);
    };

    const onPlay = () => {
      setIsPlaying(true);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onError = () => {
      console.error("Audio load/play error:", audio.error);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [duration, audioSrc]);

  function handleBackgroundMouseDown(e) {
    if (e.target.closest("[data-annotation-chip]")) return;
    const time = mouseToTime(e);
    seekTo(time);
  }

  function handleAddAnnotationAtPlayhead() {
    onAddAnnotation?.(currentTime);
  }

  // Drag annotation
  function startDragAnnotation(e, annotationIndex) {
    e.preventDefault();
    e.stopPropagation();

    const annotation = track.annotations[annotationIndex];
    if (!annotation) return;

    dragAnnotationRef.current = {
      annotationIndex,
      startMouseX: e.clientX,
      startTime: annotation.time_seconds,
    };

    window.addEventListener("mousemove", handleDragAnnotationMove);
    window.addEventListener("mouseup", stopDragAnnotation);
  }

  function handleDragAnnotationMove(e) {
    if (!dragAnnotationRef.current || !containerRef.current || !duration) return;

    const rect = containerRef.current.getBoundingClientRect();
    const { annotationIndex, startMouseX, startTime } = dragAnnotationRef.current;

    const dx = e.clientX - startMouseX;
    const dt = (dx / rect.width) * duration;
    const nextTime = clamp(startTime + dt, 0, duration);

    onMoveAnnotation?.(annotationIndex, nextTime);
  }

  function stopDragAnnotation() {
    dragAnnotationRef.current = null;
    window.removeEventListener("mousemove", handleDragAnnotationMove);
    window.removeEventListener("mouseup", stopDragAnnotation);
  }

  // Drag playhead
  function startDragPlayhead(e) {
    e.preventDefault();
    e.stopPropagation();

    dragPlayheadRef.current = {
      dragging: true,
    };

    seekTo(mouseToTime(e));

    window.addEventListener("mousemove", handleDragPlayheadMove);
    window.addEventListener("mouseup", stopDragPlayhead);
  }

  function handleDragPlayheadMove(e) {
    if (!dragPlayheadRef.current?.dragging) return;
    seekTo(mouseToTime(e));
  }

  function stopDragPlayhead() {
    dragPlayheadRef.current = null;
    window.removeEventListener("mousemove", handleDragPlayheadMove);
    window.removeEventListener("mouseup", stopDragPlayhead);
  }

  if (!track) {
    return (
      <div
        style={{
          padding: 16,
          color: "#9ca3af",
          border: "1px solid #374151",
          borderRadius: 12,
          background: "#111827",
        }}
      >
        Select a track to see its timeline.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Playback controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button onClick={togglePlay} style={controlButtonStyle}>
          {isPlaying ? "Pause" : "Play"}
        </button>

        <button onClick={() => seekTo(0)} style={controlButtonStyle}>
          ⏮ Start
        </button>

        <button onClick={() => seekTo(duration)} style={controlButtonStyle}>
          End ⏭
        </button>

        <button onClick={handleAddAnnotationAtPlayhead} style={controlButtonStyle}>
          + Add annotation here
        </button>

        <div style={{ color: "#9ca3af", fontSize: 13 }}>
          Time: <b>{formatTime(currentTime)}</b> / <b>{formatTime(duration)}</b>
        </div>

        <div style={{ color: "#9ca3af", fontSize: 13 }}>
          Annotations: <b>{track.annotations.length}</b>
        </div>
      </div>

      {/* Actual audio element */}
      <audio ref={audioRef} src={audioSrc} preload="metadata" />

      {/* Timeline */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          height: HEADER_HEIGHT + TRACK_HEIGHT,
          border: "1px solid #374151",
          borderRadius: 12,
          background: "#0b0f19",
          overflow: "hidden",
          userSelect: "none",
        }}
        onMouseDown={handleBackgroundMouseDown}
      >
        {/* Axis */}
        <div
          style={{
            position: "relative",
            height: HEADER_HEIGHT,
            borderBottom: "1px solid #1f2937",
          }}
        >
          {ticks.map((t) => (
            <div
              key={t}
              style={{
                position: "absolute",
                left: `${timeToPct(t)}%`,
                top: 0,
                transform: "translateX(-1px)",
                height: "100%",
                borderLeft: "1px solid #1f2937",
                color: "#9ca3af",
                fontSize: 11,
                paddingLeft: 4,
                display: "flex",
                alignItems: "flex-start",
                whiteSpace: "nowrap",
              }}
            >
              {t}s
            </div>
          ))}
        </div>

        {/* Playhead */}
        <div
          style={{
            position: "absolute",
            top: HEADER_HEIGHT,
            bottom: 0,
            left: `${timeToPct(currentTime)}%`,
            width: 2,
            background: "#ef4444",
            zIndex: 20,
            pointerEvents: "none",
          }}
        />

        {/* Playhead handle */}
        <div
          onMouseDown={startDragPlayhead}
          style={{
            position: "absolute",
            top: HEADER_HEIGHT - 6,
            left: `${timeToPct(currentTime)}%`,
            transform: "translateX(-50%)",
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#ef4444",
            zIndex: 21,
            cursor: "ew-resize",
            boxShadow: "0 0 0 3px rgba(239,68,68,0.2)",
          }}
          title="Drag playhead"
        />

        {/* Annotation lane */}
        <div style={{ position: "relative", height: TRACK_HEIGHT }}>
          {track.annotations.map((annotation, index) => {
            const x = timeToPct(annotation.time_seconds);

            return (
              <div
                key={`${annotation.label}-${index}-${annotation.time_seconds}`}
                data-annotation-chip
                style={{
                  position: "absolute",
                  left: `${x}%`,
                  top: 34,
                  transform: "translateX(-50%)",
                  zIndex: 15,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation?.(index);
                }}
              >
                <AnnotationChip
                  annotation={annotation}
                  selected={false}
                  onMouseDown={(e) => startDragAnnotation(e, index)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onDeleteAnnotation?.(index);
                  }}
                />

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const controlButtonStyle = {
  background: "#111827",
  color: "white",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
};
