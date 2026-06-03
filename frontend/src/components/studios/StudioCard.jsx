export default function StudioCard({
  studio,
  selected = false,
  onSelect,
  onContextMenu,
}) {
  const studioId = studio?.studio_id || "";

  function handleContextMenu(e) {
    e.preventDefault();
    onContextMenu?.(e, studio);
  }

  return (
    <div
      onClick={() => onSelect?.(studio)}
      onContextMenu={handleContextMenu}
      style={{
        padding: 12,
        borderRadius: 12,
        cursor: "pointer",
        background: selected ? "#1f2937" : "#111827",
        border: selected ? "1px solid #60a5fa" : "1px solid #374151",
        color: "white",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      title={studioId}
    >
      <div style={{ fontWeight: 700 }}>Studio</div>
      <div
        style={{
          fontSize: 12,
          color: "#9ca3af",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {studioId}
      </div>

      {studio?.meta?.source && (
        <div style={{ fontSize: 12, color: "#cbd5e1" }}>
          source: {studio.meta.source}
        </div>
      )}
    </div>
  );
}
