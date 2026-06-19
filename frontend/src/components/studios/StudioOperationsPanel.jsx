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
  return (
    <div
      style={{
        padding: 12,
        borderRight: "1px solid #1f2937",
        background: "#0f172a",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 0,
        overflowY: "auto",
      }}
    >
      <div>
        <h2 style={{ margin: 0 }}>Operations</h2>
        <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
          Studio: <b>{studioId}</b>
        </div>
      </div>

      <button onClick={onImportVideo} style={buttonStyle}>
        {uploadingVideo ? "Uploading..." : "Import video"}
      </button>

      <button onClick={onRemoveVideo} style={buttonStyle}>
        Remove video
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 13, color: "#cbd5e1" }}>
          Studio length (seconds)
        </label>

        {canEditLength ? (
          <>
            <input
              type="number"
              min={videoDuration > 0 ? videoDuration : 0}
              step="0.1"
              value={studioLength}
              onChange={(e) => onStudioLengthChange?.(e.target.value)}
              style={inputStyle}
              placeholder="e.g. 120"
            />
            <button
              onClick={onSaveLength}
              style={buttonStyle}
              disabled={savingQuery}
            >
              {savingQuery ? "Saving..." : "Save length"}
            </button>
          </>
        ) : (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #374151",
              background: "#111827",
              color: "#e5e7eb",
            }}
          >
            Auto from video:{" "}
            <b>
              {videoDuration > 0
                ? `${videoDuration.toFixed(1)}s`
                : `${Number(queryLength || 0).toFixed(1)}s`}
            </b>
          </div>
        )}

        <div style={{ color: "#94a3b8", fontSize: 12 }}>
          Current query length: <b>{Number(queryLength || 0).toFixed(1)}s</b>
        </div>

        <div style={{ color: "#94a3b8", fontSize: 12 }}>
          Video length:{" "}
          <b>{videoDuration > 0 ? `${videoDuration.toFixed(1)}s` : "n/a"}</b>
        </div>
      </div>

      <button
        onClick={onClearAnnotations}
        style={buttonStyle}
        disabled={runningOptimizer}
      >
        Clear annotations
      </button>

      <button
        onClick={onRunOptimizer}
        style={buttonStyle}
        disabled={runningOptimizer}
      >
        {runningOptimizer ? "Running..." : "Run optimization"}
      </button>

      <button
        onClick={onDownloadAudio}
        style={buttonStyle}
        disabled={downloadingAudio}
      >
        {downloadingAudio ? "Downloading..." : "Download song"}
      </button>
    </div>
  );
}

const buttonStyle = {
  background: "#111827",
  color: "white",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: "10px 12px",
  cursor: "pointer",
  textAlign: "center",
};

const inputStyle = {
  background: "#111827",
  color: "white",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: "10px 12px",
  outline: "none",
};
