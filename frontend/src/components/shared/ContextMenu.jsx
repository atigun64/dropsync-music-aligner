import { useEffect } from "react";

export default function ContextMenu({
  open,
  x,
  y,
  items = [],
  onClose,
}) {
  useEffect(() => {
    if (!open) return;

    function handleClickOutside() {
      onClose?.();
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: x,
        top: y,
        minWidth: 180,
        background: "#111827",
        color: "white",
        border: "1px solid #374151",
        borderRadius: 10,
        boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
        zIndex: 2000,
        overflow: "hidden",
      }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={() => {
            item.onClick?.();
            onClose?.();
          }}
          style={{
            width: "100%",
            textAlign: "left",
            background: "transparent",
            color: item.danger ? "#fca5a5" : "white",
            border: "none",
            padding: "10px 12px",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#1f2937";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
