import StudioListItem from "./StudioListItem";

export default function StudioSidebar({
  studios = [],
  selectedStudioId = null,
  onSelectStudio,
  onStudioContextMenu,
}) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderTop: "1px solid #1f2937",
        background: "#0f172a",
        minHeight: 240,
      }}
    >
      <div style={{ padding: "14px 14px 10px" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Studios</h2>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
          {studios.length} studio sessions
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 10px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {studios.map((studio) => (
          <StudioListItem
            key={studio}
            studioId={studio}
            selected={studio === selectedStudioId}
            onSelect={onSelectStudio}
            onContextMenu={onStudioContextMenu}
          />
        ))}

        {studios.length === 0 && (
          <div style={{ color: "#94a3b8", padding: 8, fontSize: 13 }}>
            No studios yet.
          </div>
        )}
      </div>
    </div>
  );
}
