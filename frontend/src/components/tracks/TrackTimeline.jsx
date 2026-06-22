import { useEffect, useMemo, useRef, useState } from "react";
import AnnotationChip from "./AnnotationChip";
import { formatTime } from "../../utils/formatTime";
import { isEditableKeyboardTarget } from "../../utils/sortIds";
import { getTrackAnnotationRegion } from "../../utils/annotationRegion";

const HEADER_HEIGHT = 26;
const SEEK_STEP_SECONDS = 10;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const hasTrackRef = useRef(false);
  const togglePlayRef = useRef(() => {});
  const seekByRef = useRef(() => {});

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const duration = useMemo(() => {
    if (!track) return 0;
    return Number(track.meta?.length_seconds ?? 0);
  }, [track]);

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

  function seekBy(deltaSeconds) {
    if (!track) return;
    seekTo(clamp(currentTimeRef.current + deltaSeconds, 0, durationRef.current));
  }

  currentTimeRef.current = currentTime;
  durationRef.current = duration;
  hasTrackRef.current = Boolean(track);
  togglePlayRef.current = togglePlay;
  seekByRef.current = seekBy;

  useEffect(() => {
    function handleKeyDown(e) {
      if (!hasTrackRef.current) return;
      if (isEditableKeyboardTarget(e.target)) return;

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
        seekByRef.current(delta);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    setCurrentTime(0);
    setIsPlaying(false);
  }, [track?.track_id]);

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
      <div className="track-timeline__canvas track-timeline__canvas--empty">
        Select a track from the library to preview and annotate.
      </div>
    );
  }

  return (
    <div className="track-timeline">
      <div className="track-timeline__transport">
        <button className={`btn btn--play`} onClick={togglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>

        <button className="btn btn--icon" onClick={() => seekTo(0)} title="Go to start">
          ⏮
        </button>

        <button
          className="btn btn--icon"
          onClick={() => seekTo(duration)}
          title="Go to end"
        >
          ⏭
        </button>

        <button className="btn" onClick={handleAddAnnotationAtPlayhead}>
          + Annotation
        </button>

        <div className="track-timeline__timecode">
          {formatTime(currentTime)} / {formatTime(duration)} · {track.annotations.length}{" "}
          markers
        </div>
      </div>

      <audio ref={audioRef} src={audioSrc} preload="metadata" style={{ display: "none" }} />

      <div
        ref={containerRef}
        className="track-timeline__canvas"
        onMouseDown={handleBackgroundMouseDown}
      >
        <div className="track-timeline__axis">
          {ticks.map((t) => (
            <div
              key={t}
              className="track-timeline__tick"
              style={{ left: `${timeToPct(t)}%` }}
            >
              {formatTime(t)}
            </div>
          ))}
        </div>

        <div
          className="track-timeline__playhead"
          style={{ left: `${timeToPct(currentTime)}%` }}
        />

        <div
          className="track-timeline__playhead-handle"
          onMouseDown={startDragPlayhead}
          style={{ left: `${timeToPct(currentTime)}%` }}
          title="Drag playhead"
        />

        <div className="track-timeline__lane">
          <span className="track-timeline__lane-label">Match windows (±5s)</span>
          {track.annotations.map((annotation, index) => {
            const region = getTrackAnnotationRegion(annotation.time_seconds, duration);
            if (!region.width) return null;

            const leftPct = (region.start / duration) * 100;
            const widthPct = (region.width / duration) * 100;

            return (
              <div
                key={`${annotation.label}-${index}-${annotation.time_seconds}`}
                data-annotation-chip
                style={{
                  position: "absolute",
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  top: 28,
                  height: 28,
                  zIndex: 15,
                  boxSizing: "border-box",
                  padding: "0 1px",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAnnotation?.(index);
                }}
              >
                <AnnotationChip
                  annotation={annotation}
                  region={region}
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
