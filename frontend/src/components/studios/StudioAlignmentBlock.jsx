import { useEffect, useRef, useState } from "react";
import { useAppDialog } from "../shared/AppDialogProvider";
import { formatSpeedDisplay, formatSpeedInput } from "../../utils/formatSpeed";
import {
  getTrackAnnotationRegion,
  regionCenterOffsetPct,
  TRACK_ANNOTATION_HALF_WINDOW_SEC,
} from "../../utils/annotationRegion";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const BLOCK_PALETTES = [
  { bg: "rgba(99, 102, 241, 0.2)", border: "rgba(129, 140, 248, 0.45)" },
  { bg: "rgba(244, 63, 94, 0.16)", border: "rgba(251, 113, 133, 0.4)" },
  { bg: "rgba(34, 197, 94, 0.14)", border: "rgba(74, 222, 128, 0.38)" },
  { bg: "rgba(245, 158, 11, 0.14)", border: "rgba(251, 191, 36, 0.4)" },
  { bg: "rgba(6, 182, 212, 0.14)", border: "rgba(34, 211, 238, 0.38)" },
  { bg: "rgba(168, 85, 247, 0.16)", border: "rgba(192, 132, 252, 0.4)" },
];

export default function StudioAlignmentBlock({
  trackerRef,
  timelineLength = 1,
  index,
  trackId,
  speed,
  startTimeSeconds,
  widthPct,
  top,
  sourceDuration = 0,
  sourceAnnotations = [],
  interactionLocked = false,
  pausePlayback,
  onMoveCommit,
  onChangeSpeed,
}) {
  const [dragging, setDragging] = useState(false);
  const [previewStart, setPreviewStart] = useState(startTimeSeconds);

  const dragRef = useRef(null);
  const previewRef = useRef(startTimeSeconds);

  const palette = BLOCK_PALETTES[index % BLOCK_PALETTES.length];
  const { prompt } = useAppDialog();

  useEffect(() => {
    if (!dragging) {
      setPreviewStart(startTimeSeconds);
      previewRef.current = startTimeSeconds;
    }
  }, [startTimeSeconds, dragging]);

  function startDrag(e) {
    if (interactionLocked) return;
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

  async function handleContextMenu(e) {
    if (interactionLocked) return;
    e.preventDefault();
    e.stopPropagation();

    const result = await prompt({
      title: "Change block speed",
      submitLabel: "Apply",
      fields: [
        {
          key: "speed",
          label: "Speed",
          type: "decimal",
          defaultValue: formatSpeedInput(speed ?? 1),
          validate: (value) =>
            value <= 0 ? "Speed must be a positive number" : null,
        },
      ],
    });
    if (!result) return;

    const nextSpeed = Number(result.speed);
    if (!Number.isFinite(nextSpeed) || nextSpeed <= 0) return;

    onChangeSpeed?.(index, nextSpeed);
  }

  const left = `${clamp((previewStart / Math.max(1, timelineLength)) * 100, 0, 100)}%`;

  const dropAnnotations = sourceAnnotations.filter(
    (ann) => String(ann.label || "").toLowerCase() === "drop"
  );

  return (
    <div
      data-block
      className={`studio-block${dragging ? " studio-block--dragging" : ""}`}
      onMouseDown={startDrag}
      onContextMenu={handleContextMenu}
      title={`${trackId} | ${formatSpeedDisplay(speed)}x`}
      style={{
        left,
        top,
        width: `${widthPct}%`,
        "--block-bg": palette.bg,
        "--block-border": palette.border,
        "--block-border-hover": palette.border,
      }}
    >
      {sourceDuration > 0 &&
        dropAnnotations.map((ann, annIdx) => {
          const region = getTrackAnnotationRegion(
            ann.time_seconds,
            sourceDuration
          );
          if (!region.width) return null;

          const leftPct = (region.start / sourceDuration) * 100;
          const widthPctInner = (region.width / sourceDuration) * 100;
          const centerPct = regionCenterOffsetPct(region);

          return (
            <div
              key={`${ann.label}-${annIdx}-${ann.time_seconds}`}
              className="studio-block__drop"
              style={{
                left: `${leftPct}%`,
                width: `${widthPctInner}%`,
              }}
              title={`${ann.label} @ ${Number(ann.time_seconds).toFixed(2)}s source (±${TRACK_ANNOTATION_HALF_WINDOW_SEC}s)`}
            >
              <span
                className="studio-block__drop-center"
                style={{ left: `${centerPct}%` }}
              />
            </div>
          );
        })}

      <div className="studio-block__footer">
        <div className="studio-block__id">{trackId}</div>
        <div className="studio-block__speed">{formatSpeedDisplay(speed)}x</div>
      </div>
    </div>
  );
}
