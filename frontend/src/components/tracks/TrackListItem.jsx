export default function TrackListItem({
  track,
  selected = false,
  onSelect,
  onContextMenu,
}) {
  const title = track.display_name?.trim() || track.track_id;

  function handleContextMenu(e) {
    e.preventDefault();
    onContextMenu?.(e, track);
  }

  return (
    <div
      onClick={() => onSelect?.(track)}
      onContextMenu={handleContextMenu}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "#1b2430";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "#111827";
      }}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        cursor: "pointer",
        background: selected ? "#1f2937" : "#111827",
        border: selected ? "1px solid #60a5fa" : "1px solid #243041",
        color: "white",
        userSelect: "none",
        boxShadow: selected ? "0 0 0 1px rgba(96,165,250,0.15)" : "none",
        transition: "background 0.15s ease, border 0.15s ease, transform 0.05s ease",
      }}
      title={track.audio_path}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
      <div
        style={{
          fontSize: 12,
          color: "#9ca3af",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {track.track_id}
      </div>
    </div>
  );
}
