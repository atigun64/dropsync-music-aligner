export function formatTime(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const s = Math.floor(total);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatTimePrecise(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const s = Math.floor(total);
  const ms = Math.floor((total - s) * 100);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}
