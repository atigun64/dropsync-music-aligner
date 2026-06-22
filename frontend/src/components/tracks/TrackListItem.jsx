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
      className={`list-item${selected ? " list-item--selected" : ""}`}
      onClick={() => onSelect?.(track)}
      onContextMenu={handleContextMenu}
      title={track.audio_path}
    >
      <div className="list-item__title">{title}</div>
      <div className="list-item__subtitle">{track.track_id}</div>
    </div>
  );
}
