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
      className={`list-item${selected ? " list-item--selected" : ""}`}
      onClick={() => onSelect?.(studioId)}
      onContextMenu={handleContextMenu}
      title={studioId}
    >
      <div className="list-item__title">Studio</div>
      <div className="list-item__subtitle">#{studioId}</div>
    </div>
  );
}
