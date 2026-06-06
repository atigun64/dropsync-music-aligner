import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getStudioSession,
  updateStudioMetadata,
  updateStudioQuery,
  updateStudioAlignment,
  runOptimizer,
} from "../api/studios";

import { normalizeStudioSession, createStudioMeta } from "../schemas/studio";
import LoadingState from "../components/shared/LoadingState";

function safeStringify(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function parseJson(text) {
  return JSON.parse(text);
}

function Panel({ title, children, subtitle = null }) {
  return (
    <div
      style={{
        background: "#111827",
        border: "1px solid #374151",
        borderRadius: 12,
        padding: 16,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h2 style={{ margin: 0 }}>{title}</h2>
      {subtitle && (
        <div style={{ color: "#9ca3af", fontSize: 13 }}>{subtitle}</div>
      )}
      {children}
    </div>
  );
}

function JsonEditor({ value, onChange, height = 240 }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      style={{
        width: "100%",
        height,
        resize: "none",
        background: "#0f172a",
        color: "white",
        border: "1px solid #374151",
        borderRadius: 10,
        padding: 12,
        outline: "none",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.5,
        overflow: "auto",
      }}
    />
  );
}

const buttonStyle = {
  background: "#1f2937",
  color: "white",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
};

const preStyle = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#d1d5db",
  background: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: 10,
  padding: 12,
  overflow: "auto",
  maxHeight: 220,
};

export default function StudioPage() {
  const { studioId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const [savingMeta, setSavingMeta] = useState(false);
  const [savingQuery, setSavingQuery] = useState(false);
  const [savingAlignment, setSavingAlignment] = useState(false);
  const [runningOptimizer, setRunningOptimizer] = useState(false);

  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [metaText, setMetaText] = useState(safeStringify(createStudioMeta()));
  const [queryText, setQueryText] = useState("{}");
  const [alignmentText, setAlignmentText] = useState("{}");

  async function loadSession() {
    if (!studioId) return;

    setLoading(true);
    setError("");

    try {
      const raw = await getStudioSession(studioId);
      const normalized = normalizeStudioSession(raw);

      setSession(normalized);
      setMetaText(safeStringify(normalized.meta ?? createStudioMeta()));
      setQueryText(safeStringify(normalized.query ?? {}));
      setAlignmentText(safeStringify(normalized.alignment ?? {}));
    } catch (e) {
      setError(e.message || "Failed to load studio");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId]);

  async function handleSaveMetadata() {
    if (!studioId) return;

    setSavingMeta(true);
    setError("");
    setStatus("");

    try {
      const payload = parseJson(metaText);
      const updated = await updateStudioMetadata(studioId, payload);
      const normalized = normalizeStudioSession(updated);

      setSession(normalized);
      setMetaText(safeStringify(normalized.meta ?? createStudioMeta()));

      setStatus("Metadata saved");
      setTimeout(() => setStatus(""), 1000);
    } catch (e) {
      setError(`Metadata error: ${e.message || "Invalid JSON"}`);
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSaveQuery() {
    if (!studioId) return;

    setSavingQuery(true);
    setError("");
    setStatus("");

    try {
      const payload = parseJson(queryText);
      const updated = await updateStudioQuery(studioId, payload);
      const normalized = normalizeStudioSession(updated);

      setSession(normalized);
      setQueryText(safeStringify(normalized.query ?? {}));

      setStatus("Query saved");
      setTimeout(() => setStatus(""), 1000);
    } catch (e) {
      setError(`Query error: ${e.message || "Invalid JSON"}`);
    } finally {
      setSavingQuery(false);
    }
  }

  async function handleSaveAlignment() {
    if (!studioId) return;

    setSavingAlignment(true);
    setError("");
    setStatus("");

    try {
      const payload = parseJson(alignmentText);
      const updated = await updateStudioAlignment(studioId, payload);
      const normalized = normalizeStudioSession(updated);

      setSession(normalized);
      setAlignmentText(safeStringify(normalized.alignment ?? {}));

      setStatus("Alignment saved");
      setTimeout(() => setStatus(""), 1000);
    } catch (e) {
      setError(`Alignment error: ${e.message || "Invalid JSON"}`);
    } finally {
      setSavingAlignment(false);
    }
  }

  async function handleRunOptimizer() {
    if (!studioId) return;

    setRunningOptimizer(true);
    setError("");
    setStatus("");

    try {
      const alignment = await runOptimizer(studioId);
      setAlignmentText(safeStringify(alignment ?? {}));

      setStatus("Optimizer finished");
      setTimeout(() => setStatus(""), 1000);
    } catch (e) {
      setError(e.message || "Optimizer failed");
    } finally {
      setRunningOptimizer(false);
    }
  }

  return (
    <div
      style={{
        height: "100vh",
        background: "#0f1115",
        color: "#e5e7eb",
        padding: 20,
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          flex: "0 0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate("/")} style={buttonStyle}>
            ← Back
          </button>

          <div>
            <h1 style={{ margin: 0 }}>Studio</h1>
            <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>
              {studioId}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={loadSession} style={buttonStyle}>
            Refresh
          </button>

          <button
            onClick={handleRunOptimizer}
            style={buttonStyle}
            disabled={runningOptimizer}
          >
            {runningOptimizer ? "Running..." : "Run Optimizer"}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading studio..." />
      ) : error ? (
        <div style={{ color: "#fca5a5", whiteSpace: "pre-wrap" }}>{error}</div>
      ) : !session ? (
        <div style={{ color: "#9ca3af" }}>No studio loaded.</div>
      ) : (
        <>
          {status && <div style={{ color: "#93c5fd" }}>{status}</div>}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              minHeight: 0,
              flex: 1,
              overflow: "hidden",
            }}
          >
            {/* LEFT COLUMN */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              {/* Metadata */}
              <Panel title="Metadata">
                <JsonEditor
                  value={metaText}
                  onChange={setMetaText}
                  height={180}
                />
                <button
                  onClick={handleSaveMetadata}
                  style={buttonStyle}
                  disabled={savingMeta}
                >
                  {savingMeta ? "Saving..." : "Save Metadata"}
                </button>
              </Panel>

              {/* Query */}
              <Panel
                title="Query"
                subtitle="Edit raw JSON. requested_points is optional."
              >
                <JsonEditor
                  value={queryText}
                  onChange={setQueryText}
                  height={260}
                />
                <button
                  onClick={handleSaveQuery}
                  style={buttonStyle}
                  disabled={savingQuery}
                >
                  {savingQuery ? "Saving..." : "Save Query"}
                </button>
              </Panel>
            </div>

            {/* RIGHT COLUMN */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              {/* Alignment */}
              <Panel title="Alignment">
                <JsonEditor
                  value={alignmentText}
                  onChange={setAlignmentText}
                  height={320}
                />
                <button
                  onClick={handleSaveAlignment}
                  style={buttonStyle}
                  disabled={savingAlignment}
                >
                  {savingAlignment ? "Saving..." : "Save Alignment"}
                </button>
              </Panel>

              {/* Session info */}
              <Panel title="Session Info">
                <pre style={preStyle}>{safeStringify(session)}</pre>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
