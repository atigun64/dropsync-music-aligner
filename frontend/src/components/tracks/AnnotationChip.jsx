export default function AnnotationChip({
  annotation,
  selected = false,
  onMouseDown,
  onContextMenu,
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      style={{
        width: 36,
        height: 24,
        borderRadius: "50%",
        background: selected ? "#ff8686" : "#ff4343",
        border: selected ? "2px solid #ff0000" : "2px solid #ff0000",
        cursor: "grab",
        userSelect: "none",
        boxSizing: "border-box",
        boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
      }}
      title={`${annotation.label} @ ${annotation.time_seconds.toFixed(2)}s`}
    />
  );
}
