export function formatSpeedDisplay(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n)) return "?";

  const text = n.toFixed(8).replace(/\.?0+$/, "");
  return text || "0";
}

export function formatSpeedInput(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n)) return "1";
  return String(n);
}
