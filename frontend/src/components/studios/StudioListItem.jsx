export default function StudioListItem({
  studioId,
  selected = false,
  onSelect,
  onContextMenu,
}) {
  function handleContextMenu(e) {
    e.preventDefault();
    onContextMenu?.(e, studioId);
  }

  return (
    <div
      onClick={() => onSelect?.(studioId)}
      onContextMenu={handleContextMenu}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        cursor: "pointer",
        background: selected ? "#1f2937" : "#111827",
        border: selected ? "1px solid #60a5fa" : "1px solid #243041",
        color: "white",
        userSelect: "none",
      }}
      title={studioId}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>Studio</div>
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
    </div>
  );
}
