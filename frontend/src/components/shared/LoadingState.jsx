export default function LoadingState({ label = "Loading..." }) {
  return (
    <div
      style={{
        padding: 16,
        color: "#9ca3af",
        fontSize: 14,
      }}
    >
      {label}
    </div>
  );
}
