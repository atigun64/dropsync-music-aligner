/**
 * Compare IDs that are usually numeric strings (e.g. "0", "1", "10").
 * Falls back to locale-aware string order for non-numeric IDs.
 */
export function compareNumericIds(a, b) {
  const aStr = String(a ?? "");
  const bStr = String(b ?? "");

  const aNum = Number(aStr);
  const bNum = Number(bStr);

  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aStr.trim() !== "" && bStr.trim() !== "") {
    return aNum - bNum;
  }

  return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: "base" });
}

export function isEditableKeyboardTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
