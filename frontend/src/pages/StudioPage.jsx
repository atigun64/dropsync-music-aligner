import { useParams, useNavigate } from "react-router-dom";

export default function StudioPage() {
  const { studioId } = useParams();
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f1115",
        color: "#e5e7eb",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <button
        onClick={() => navigate("/")}
        style={{
          background: "#1f2937",
          color: "white",
          border: "1px solid #374151",
          borderRadius: 10,
          padding: "8px 12px",
          cursor: "pointer",
          marginBottom: 20,
        }}
      >
        ← Back
      </button>

      <h1 style={{ marginTop: 0 }}>Studio Page</h1>

      <div
        style={{
          padding: 16,
          border: "1px solid #374151",
          borderRadius: 12,
          background: "#111827",
          maxWidth: 700,
        }}
      >
        <p style={{ marginTop: 0 }}>
          This is a placeholder for the future studio editor.
        </p>

        <p>
          Studio ID: <b>{studioId}</b>
        </p>

        <p style={{ color: "#9ca3af" }}>
          Later we will load studio metadata, query, alignment, video preview,
          and the timeline editor here.
        </p>
      </div>
    </div>
  );
}
