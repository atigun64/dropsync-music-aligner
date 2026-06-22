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
    <aside className="library-sidebar">
      <div className="library-sidebar__header">
        <h2 className="library-sidebar__title">Tracks</h2>
        <p className="library-sidebar__meta">{tracks.length} uploaded</p>
      </div>

      <div className="library-sidebar__scroll">
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
          <div className="library-empty">No tracks yet — upload below.</div>
        )}
      </div>

      <div className="library-sidebar__footer">
        <AddTrackButton
          onSingleFilesSelected={onSingleFilesSelected}
          onFolderFilesSelected={onFolderFilesSelected}
        />
      </div>
    </aside>
  );
}
