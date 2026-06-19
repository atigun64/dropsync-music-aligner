import { useEffect, useRef, useState } from "react";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function StudioAlignmentBlock({
  trackerRef,
  timelineLength = 1,
  index,
  trackId,
  speed,
  startTimeSeconds,
  widthPct,
  top,
  pausePlayback,
  onMoveCommit,
  onChangeSpeed,
}) {
  const [dragging, setDragging] = useState(false);
  const [previewStart, setPreviewStart] = useState(startTimeSeconds);

  const dragRef = useRef(null);
  const previewRef = useRef(startTimeSeconds);

  useEffect(() => {
    if (!dragging) {
      setPreviewStart(startTimeSeconds);
      previewRef.current = startTimeSeconds;
    }
  }, [startTimeSeconds, dragging]);

  function mouseToTime(e) {
    const rect = trackerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;

    const x = e.clientX - rect.left;
    const pct = clamp(x / rect.width, 0, 1);
    return pct * Math.max(1, Number(timelineLength || 1));
  }

  function startDrag(e) {
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    pausePlayback?.();

    const initialStart = Number(startTimeSeconds || 0);

    dragRef.current = {
      startMouseX: e.clientX,
      initialStart,
    };

    previewRef.current = initialStart;
    setPreviewStart(initialStart);
    setDragging(true);

    const onMove = (ev) => {
      if (!dragRef.current) return;

      const rect = trackerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;

      const dx = ev.clientX - dragRef.current.startMouseX;
      const dt = (dx / rect.width) * Math.max(1, Number(timelineLength || 1));

      const next = clamp(dragRef.current.initialStart + dt, 0, timelineLength);

      previewRef.current = next;
      setPreviewStart(next);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      setDragging(false);

      const finalTime = previewRef.current ?? startTimeSeconds;
      dragRef.current = null;

      onMoveCommit?.(index, finalTime);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();

    const raw = window.prompt("New speed for this block?", String(speed ?? 1));
    if (raw === null) return;

    const nextSpeed = Number(raw);
    if (!Number.isFinite(nextSpeed) || nextSpeed <= 0) {
      window.alert("Speed must be a positive number");
      return;
    }

    onChangeSpeed?.(index, nextSpeed);
  }

  const left = `${clamp((previewStart / Math.max(1, timelineLength)) * 100, 0, 100)}%`;

  return (
    <div
      data-block
      onMouseDown={startDrag}
      onContextMenu={handleContextMenu}
      title={`${trackId} | ${speed}x`}
      style={{
        position: "absolute",
        left,
        top,
        width: `${widthPct}%`,
        height: 40,
        borderRadius: 10,
        background: dragging ? "#273244" : "#1f2937",
        border: dragging ? "1px solid #93c5fd" : "1px solid #475569",
        color: "white",
        padding: "10px 12px",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        cursor: "grab",
        boxShadow: dragging ? "0 0 0 2px rgba(147,197,253,0.18)" : "none",
        userSelect: "none",
      }}
    >
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <b>{trackId}</b>
      </div>

      <div style={{ fontSize: 12, color: "#cbd5e1" }}>{speed}x</div>
    </div>
  );
}
