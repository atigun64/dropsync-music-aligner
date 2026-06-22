import { useMemo, useRef, useState } from "react";
import StudioAlignmentBlock from "./StudioAlignmentBlock";
import { formatTime } from "../../utils/formatTime";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const TRACK_ROW_HEIGHT = 56;
const ALIGNMENT_TOP_INSET = 14;
const ALIGNMENT_BOTTOM_PADDING = 16;
const AXIS_HEIGHT = 26;
const ANNOTATIONS_HEIGHT = 52;

export default function StudioTracker({
  timelineLength = 1,
  currentTime = 0,
  isPlaying = false,
  interactionLocked = false,
  onSeekCommit,
  onTogglePlay,
  onPausePlayback,
  onAddAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  requestedPoints = [],
  alignmentTracks = [],
  trackMetaById = {},
  onMoveAlignmentBlock,
  onChangeAlignmentBlockSpeed,
}) {
  const trackerRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState(null);
  const dragTimeRef = useRef(null);

  const axisTicks = useMemo(() => {
    const len = Math.max(1, Number(timelineLength || 1));
    const step = len <= 60 ? 5 : len <= 180 ? 10 : 20;
    const ticks = [];

    for (let t = 0; t <= len; t += step) {
      ticks.push(t);
    }

    if (ticks[ticks.length - 1] !== len) ticks.push(len);
    return ticks;
  }, [timelineLength]);

  function timeToPct(time) {
    const len = Math.max(1, Number(timelineLength || 1));
    return `${clamp((Number(time || 0) / len) * 100, 0, 100)}%`;
  }

  function mouseToTime(e) {
    const rect = trackerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;

    const x = e.clientX - rect.left;
    const pct = clamp(x / rect.width, 0, 1);
    return pct * Math.max(1, Number(timelineLength || 1));
  }

  const displayTime = dragging ? dragTime : currentTime;

  const alignmentContentHeight = useMemo(() => {
    if (alignmentTracks.length === 0) return 120;
    return (
      ALIGNMENT_TOP_INSET +
      alignmentTracks.length * TRACK_ROW_HEIGHT +
      ALIGNMENT_BOTTOM_PADDING
    );
  }, [alignmentTracks.length]);

  function startScrub(e) {
    if (interactionLocked) return;
    e.preventDefault();
    e.stopPropagation();

    const shouldResume = isPlaying;
    onPausePlayback?.();

    const startTime = mouseToTime(e);
    setDragging(true);
    setDragTime(startTime);
    dragTimeRef.current = startTime;

    const onMove = (ev) => {
      const next = mouseToTime(ev);
      dragTimeRef.current = next;
      setDragTime(next);
    };

    const onUp = () => {
      const finalTime = dragTimeRef.current ?? currentTime;

      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      setDragging(false);
      dragTimeRef.current = null;

      onSeekCommit?.(finalTime, { resume: shouldResume });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleBackgroundMouseDown(e) {
    if (interactionLocked) return;
    if (e.target.closest("[data-dot]")) return;
    if (e.target.closest("[data-block]")) return;
    startScrub(e);
  }

  return (
    <div className={`studio-tracker${interactionLocked ? " studio-tracker--locked" : ""}`}>
      <div className="studio-tracker__toolbar">
        <div>
          <h2 className="studio-tracker__heading">Timeline</h2>
          <p className="studio-tracker__hint">
            Drag to scrub · Space play/pause · ← → ±10s
          </p>
        </div>

        <div className="studio-tracker__transport">
          <button
            className={`btn btn--play${isPlaying ? "" : ""}`}
            onClick={onTogglePlay}
            disabled={interactionLocked}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>

          <button
            className="btn btn--icon"
            onClick={() => onSeekCommit?.(0)}
            title="Go to start"
            disabled={interactionLocked}
          >
            ⏮
          </button>

          <button
            className="btn btn--icon"
            onClick={() => onSeekCommit?.(timelineLength)}
            title="Go to end"
            disabled={interactionLocked}
          >
            ⏭
          </button>

          <button
            className="btn"
            onClick={() => onAddAnnotation?.(currentTime)}
            disabled={interactionLocked}
          >
            + Annotation
          </button>
        </div>
      </div>

      <div ref={trackerRef} className="studio-tracker__canvas">
        <div
          className="studio-tracker__playhead"
          style={{ left: timeToPct(displayTime) }}
        />

        <div className="studio-tracker__header" onMouseDown={handleBackgroundMouseDown}>
          <div className="studio-tracker__axis" style={{ height: AXIS_HEIGHT }}>
            {axisTicks.map((t) => (
              <div
                key={t}
                className="studio-tracker__tick"
                style={{ left: timeToPct(t) }}
              >
                {formatTime(t)}
              </div>
            ))}
          </div>

          <div
            className="studio-tracker__playhead-handle"
            onMouseDown={startScrub}
            style={{ left: timeToPct(displayTime) }}
            title="Drag playhead"
          />

          <div
            className="studio-tracker__annotations"
            style={{ height: ANNOTATIONS_HEIGHT }}
          >
            <span className="studio-tracker__annotations-label">Markers</span>
            {requestedPoints.length === 0 ? (
              <div className="studio-tracker__empty" style={{ paddingTop: 22 }}>
                No annotations yet
              </div>
            ) : (
              requestedPoints.map((p, idx) => (
                <div
                  key={`${p.label}-${idx}-${p.time_seconds}`}
                  data-dot
                  className="studio-tracker__annotation-dot"
                  title={`${p.label} @ ${Number(p.time_seconds || 0).toFixed(2)}s`}
                  style={{ left: timeToPct(Number(p.time_seconds || 0)) }}
                onClick={(e) => {
                  if (interactionLocked) return;
                  e.stopPropagation();
                  onEditAnnotation?.(idx);
                }}
                onContextMenu={(e) => {
                  if (interactionLocked) return;
                  e.preventDefault();
                    e.stopPropagation();
                    onDeleteAnnotation?.(idx);
                  }}
                />
              ))
            )}
          </div>
        </div>

        <div className="studio-tracker__lanes">
          <div
            className="studio-tracker__lanes-scroll"
            onMouseDown={handleBackgroundMouseDown}
          >
            <div
              className="studio-tracker__lanes-content"
              style={{ height: alignmentContentHeight }}
            >
              <span className="studio-tracker__lanes-label">Tracks</span>
              {alignmentTracks.length === 0 ? (
                <div className="studio-tracker__empty" style={{ paddingTop: 28 }}>
                  Run optimization to generate alignment blocks
                </div>
              ) : (
                alignmentTracks.map((t, idx) => {
                  const trackMeta = trackMetaById[t.track_id] || {};
                  const sourceDuration = Number(trackMeta.length_seconds || 0);
                  const sourceAnnotations = trackMeta.annotations ?? [];
                  const speed = Math.max(0.01, Number(t.speed || 1));

                  let visibleDuration = 0;

                  if (sourceDuration > 0) {
                    visibleDuration = sourceDuration / speed;
                  } else {
                    const pts = t.placed_points || [];
                    if (pts.length > 0) {
                      const minT = Math.min(...pts.map((p) => Number(p.time_seconds || 0)));
                      const maxT = Math.max(...pts.map((p) => Number(p.time_seconds || 0)));
                      visibleDuration = Math.max(5, maxT - minT);
                    } else {
                      visibleDuration = 5;
                    }
                  }

                  const start = Number(t.start_time_seconds || 0);
                  const widthPct = clamp(
                    (visibleDuration / Math.max(1, timelineLength)) * 100,
                    6,
                    100
                  );

                  return (
                    <StudioAlignmentBlock
                      key={`${t.track_id}-${idx}`}
                      trackerRef={trackerRef}
                      timelineLength={timelineLength}
                      index={idx}
                      trackId={t.track_id}
                      speed={speed}
                      startTimeSeconds={start}
                      widthPct={widthPct}
                      sourceDuration={sourceDuration}
                      sourceAnnotations={sourceAnnotations}
                      top={ALIGNMENT_TOP_INSET + idx * TRACK_ROW_HEIGHT}
                      pausePlayback={onPausePlayback}
                      onMoveCommit={onMoveAlignmentBlock}
                      onChangeSpeed={onChangeAlignmentBlockSpeed}
                      interactionLocked={interactionLocked}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
