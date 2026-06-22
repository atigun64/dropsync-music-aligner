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
      className="context-menu"
      onMouseDown={(e) => e.stopPropagation()}
      style={{ left: x, top: y }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          type="button"
          className={`context-menu__item${item.danger ? " context-menu__item--danger" : ""}`}
          onClick={() => {
            item.onClick?.();
            onClose?.();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
