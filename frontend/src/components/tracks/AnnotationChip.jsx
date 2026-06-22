import {
  TRACK_ANNOTATION_HALF_WINDOW_SEC,
  regionCenterOffsetPct,
} from "../../utils/annotationRegion";

export default function AnnotationChip({
  annotation,
  region,
  onMouseDown,
  onContextMenu,
}) {
  const centerPct = regionCenterOffsetPct(region);

  return (
    <div
      className="annotation-region"
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      title={`${annotation.label} @ ${annotation.time_seconds.toFixed(2)}s (±${TRACK_ANNOTATION_HALF_WINDOW_SEC}s)`}
    >
      <div
        className="annotation-region__center"
        style={{ left: `${centerPct}%` }}
      />
      {annotation.label ? (
        <span className="annotation-region__label">{annotation.label}</span>
      ) : null}
    </div>
  );
}
