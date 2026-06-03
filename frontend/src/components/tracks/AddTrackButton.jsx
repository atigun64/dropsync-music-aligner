import { useRef } from "react";

export default function AddTrackButton({
  onSingleFilesSelected,
  onFolderFilesSelected,
}) {
  const singleInputRef = useRef(null);
  const folderInputRef = useRef(null);

  function handleSingleChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onSingleFilesSelected?.(files);
    }
    e.target.value = "";
  }

  function handleFolderChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFolderFilesSelected?.(files);
    }
    e.target.value = "";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        onClick={() => singleInputRef.current?.click()}
        style={buttonStyle}
      >
        + Add Track
      </button>

      <button
        onClick={() => folderInputRef.current?.click()}
        style={buttonStyle}
      >
        + Add Folder
      </button>

      <input
        ref={singleInputRef}
        type="file"
        accept="audio/*"
        multiple
        onChange={handleSingleChange}
        style={{ display: "none" }}
      />

      <input
        ref={folderInputRef}
        type="file"
        accept="audio/*"
        multiple
        webkitdirectory="true"
        directory="true"
        onChange={handleFolderChange}
        style={{ display: "none" }}
      />
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
  textAlign: "left",
};
