import { useMemo, useRef, useState } from "react";
import StudioAlignmentBlock from "./StudioAlignmentBlock";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds || 0)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function StudioTracker({
  timelineLength = 1,
  currentTime = 0,
  isPlaying = false,
  onSeekCommit,
  onTogglePlay,
  onPausePlayback,
  onAddAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  requestedPoints = [],
  alignmentTracks = [],
  trackLengthsById = {},
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

  function startScrub(e) {
    e.preventDefault();
    e.stopPropagation();

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

      onSeekCommit?.(finalTime);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleBackgroundMouseDown(e) {
    if (e.target.closest("[data-dot]")) return;
    if (e.target.closest("[data-block]")) return;
    startScrub(e);
  }

  function handleAddAnnotation() {
    onAddAnnotation?.(currentTime);
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 12,
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
          <h2 style={{ margin: 0 }}>Studio Tracker</h2>
          <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
            Click or drag to scrub. Scrubbing pauses playback first.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onTogglePlay} style={buttonStyle}>
            {isPlaying ? "Pause" : "Play"}
          </button>

          <button onClick={() => onSeekCommit?.(0)} style={buttonStyle}>
            ⏮ Start
          </button>

          <button onClick={() => onSeekCommit?.(timelineLength)} style={buttonStyle}>
            End ⏭
          </button>

          <button onClick={handleAddAnnotation} style={buttonStyle}>
            + Add annotation
          </button>
        </div>
      </div>

      <div
        ref={trackerRef}
        onMouseDown={handleBackgroundMouseDown}
        style={{
          flex: 1,
          minHeight: 0,
          border: "1px solid #374151",
          borderRadius: 12,
          background: "#0b0f19",
          overflow: "hidden",
          position: "relative",
          userSelect: "none",
        }}
      >
        <div
          style={{
            height: 28,
            borderBottom: "1px solid #1f2937",
            position: "relative",
          }}
        >
          {axisTicks.map((t) => (
            <div
              key={t}
              style={{
                position: "absolute",
                left: timeToPct(t),
                top: 0,
                height: "100%",
                borderLeft: "1px solid #233044",
                color: "#94a3b8",
                fontSize: 11,
                paddingLeft: 4,
                whiteSpace: "nowrap",
              }}
            >
              {formatTime(t)}
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            top: 28,
            bottom: 0,
            left: timeToPct(displayTime),
            width: 2,
            background: "#ef4444",
            zIndex: 20,
            pointerEvents: "none",
          }}
        />

        <div
          onMouseDown={startScrub}
          style={{
            position: "absolute",
            top: 22,
            left: timeToPct(displayTime),
            transform: "translateX(-50%)",
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#ef4444",
            zIndex: 21,
            cursor: "ew-resize",
            boxShadow: "0 0 0 3px rgba(239,68,68,0.2)",
          }}
          title="Drag tracker"
        />

        <div
          style={{
            position: "relative",
            height: 64,
            borderBottom: "1px solid #1f2937",
          }}
        >
          {requestedPoints.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 13, padding: 14 }}>
              No requested annotations yet.
            </div>
          ) : (
            requestedPoints.map((p, idx) => (
              <div
                key={`${p.label}-${idx}-${p.time_seconds}`}
                data-dot
                title={`${p.label} @ ${Number(p.time_seconds || 0).toFixed(2)}s`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditAnnotation?.(idx);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteAnnotation?.(idx);
                }}
                style={{
                  position: "absolute",
                  left: timeToPct(Number(p.time_seconds || 0)),
                  top: 18,
                  transform: "translateX(-50%)",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#94a3b8",
                  border: "2px solid #cbd5e1",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                }}
              />
            ))
          )}
        </div>

        <div
          style={{
            position: "relative",
            height: "calc(100% - 92px)",
            padding: 12,
          }}
        >
          {alignmentTracks.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 13 }}>
              Alignment blocks will appear here after optimization.
            </div>
          ) : (
            alignmentTracks.map((t, idx) => {
              const sourceDuration = Number(trackLengthsById[t.track_id] || 0);
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
                  top={14 + idx * 56}
                  pausePlayback={onPausePlayback}
                  onMoveCommit={onMoveAlignmentBlock}
                  onChangeSpeed={onChangeAlignmentBlockSpeed}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const buttonStyle = {
  background: "#111827",
  color: "white",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: "10px 12px",
  cursor: "pointer",
  textAlign: "center",
};
