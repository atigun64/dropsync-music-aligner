export default function StudioOperationsPanel({
  studioId,
  canEditLength = true,
  studioLength,
  onStudioLengthChange,
  onSaveLength,
  onImportVideo,
  onRemoveVideo,
  onClearAnnotations,
  onRunOptimizer,
  onDownloadAudio,
  videoDuration = 0,
  queryLength = 0,
  savingQuery = false,
  uploadingVideo = false,
  runningOptimizer = false,
  downloadingAudio = false,
}) {
  const locked = runningOptimizer;

  return (
    <aside className={`studio-ops${locked ? " studio-ops--locked" : ""}`}>
      <div>
        <h2 className="studio-ops__title">Studio</h2>
        <p className="studio-ops__meta" style={{ marginTop: 6 }}>
          Session <b>#{studioId}</b>
        </p>
      </div>

      <div className="studio-ops__divider" />

      <div className="studio-ops__section">
        <div className="studio-ops__section-label">Media</div>
        <button
          className="btn btn--primary"
          onClick={onImportVideo}
          disabled={locked || uploadingVideo}
        >
          {uploadingVideo ? "Uploading…" : "Import video"}
        </button>
        <button className="btn" onClick={onRemoveVideo} disabled={locked}>
          Remove video
        </button>
      </div>

      <div className="studio-ops__divider" />

      <div className="studio-ops__section">
        <div className="studio-ops__section-label">Timeline length</div>

        {canEditLength ? (
          <>
            <input
              className="input"
              type="number"
              min={videoDuration > 0 ? videoDuration : 0}
              step="0.1"
              value={studioLength}
              onChange={(e) => onStudioLengthChange?.(e.target.value)}
              placeholder="e.g. 120"
              disabled={locked}
            />
            <button
              className="btn"
              onClick={onSaveLength}
              disabled={locked || savingQuery}
            >
              {savingQuery ? "Saving…" : "Save length"}
            </button>
          </>
        ) : (
          <div className="studio-ops__stat">
            <span>From video</span>
            <span className="studio-ops__stat-value">
              {videoDuration > 0
                ? `${videoDuration.toFixed(1)}s`
                : `${Number(queryLength || 0).toFixed(1)}s`}
            </span>
          </div>
        )}

        <div className="studio-ops__stat">
          <span>Query</span>
          <span className="studio-ops__stat-value">
            {Number(queryLength || 0).toFixed(1)}s
          </span>
        </div>
        <div className="studio-ops__stat">
          <span>Video</span>
          <span className="studio-ops__stat-value">
            {videoDuration > 0 ? `${videoDuration.toFixed(1)}s` : "—"}
          </span>
        </div>
      </div>

      <div className="studio-ops__divider" />

      <div className="studio-ops__section">
        <div className="studio-ops__section-label">Workflow</div>
        <button className="btn" onClick={onClearAnnotations} disabled={locked}>
          Clear annotations
        </button>
        <button
          className="btn btn--primary"
          onClick={onRunOptimizer}
          disabled={locked}
        >
          {locked ? "Running…" : "Run optimization"}
        </button>
        <button
          className="btn"
          onClick={onDownloadAudio}
          disabled={locked || downloadingAudio}
        >
          {downloadingAudio ? "Downloading…" : "Download song"}
        </button>
      </div>
    </aside>
  );
}
