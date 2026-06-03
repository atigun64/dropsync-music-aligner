import TrackListItem from "./TrackListItem";
import AddTrackButton from "./AddTrackButton";

export default function TrackSidebar({
  tracks = [],
  selectedTrackId = null,
  onSelectTrack,
  onTrackContextMenu,
  onSingleFilesSelected,
  onFolderFilesSelected,
}) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #1f2937",
        background: "#0f172a",
        minWidth: 280,
        overflow: "hidden",
      }}
    >
      {/* Top header */}
      <div style={{ padding: "14px 14px 10px", flex: "0 0 auto" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Tracks</h2>
        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
          {tracks.length} uploaded tracks
        </div>
      </div>

      {/* Scrollable track list */}
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "0 10px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {tracks.map((track) => (
          <TrackListItem
            key={track.track_id}
            track={track}
            selected={track.track_id === selectedTrackId}
            onSelect={onSelectTrack}
            onContextMenu={onTrackContextMenu}
          />
        ))}

        {tracks.length === 0 && (
          <div style={{ color: "#94a3b8", padding: 8, fontSize: 13 }}>
            No tracks yet.
          </div>
        )}
      </div>

      {/* Bottom upload area - always visible */}
      <div
        style={{
          flex: "0 0 auto",
          borderTop: "1px solid #1f2937",
          padding: 12,
          background: "#0f172a",
        }}
      >
        <AddTrackButton
          onSingleFilesSelected={onSingleFilesSelected}
          onFolderFilesSelected={onFolderFilesSelected}
        />
      </div>
    </div>
  );
}
