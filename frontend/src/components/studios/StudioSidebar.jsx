import StudioListItem from "./StudioListItem";

export default function StudioSidebar({
  studios = [],
  selectedStudioId = null,
  onSelectStudio,
  onStudioContextMenu,
}) {
  return (
    <div className="library-panel__scroll">
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
        <div className="library-empty">No studios yet — create one below.</div>
      )}
    </div>
  );
}
