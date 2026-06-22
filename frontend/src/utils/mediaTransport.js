export function clampTime(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const SEEK_TOLERANCE = 0.05;
const SEEK_TIMEOUT_MS = 3000;
const DRIFT_THRESHOLD = 0.12;

export function seekElement(element, timeSeconds) {
  if (!element) return Promise.resolve();

  const duration = Number(element.duration);
  const maxTime =
    Number.isFinite(duration) && duration > 0 ? duration : timeSeconds;
  const target = clampTime(timeSeconds, 0, maxTime);

  if (Math.abs(element.currentTime - target) < SEEK_TOLERANCE) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      element.removeEventListener("seeked", onSeeked);
      clearTimeout(timer);
      resolve();
    };

    const onSeeked = () => finish();
    const timer = setTimeout(finish, SEEK_TIMEOUT_MS);

    element.addEventListener("seeked", onSeeked);

    try {
      element.currentTime = target;
    } catch {
      finish();
    }
  });
}

/**
 * Seek video (master) and audio to the same timeline position.
 * Video is seeked first because it is typically slower to settle.
 */
export async function seekMediaSynced({
  videoEl,
  audioEl,
  timeSeconds,
  hasVideo,
}) {
  if (hasVideo && videoEl) {
    await seekElement(videoEl, timeSeconds);
  }

  if (audioEl) {
    await seekElement(audioEl, timeSeconds);
  }

  if (hasVideo && videoEl) {
    return videoEl.currentTime || timeSeconds;
  }

  if (audioEl) {
    return audioEl.currentTime || timeSeconds;
  }

  return timeSeconds;
}

export async function playMediaSynced({
  videoEl,
  audioEl,
  timeSeconds,
  hasVideo,
}) {
  await seekMediaSynced({ videoEl, audioEl, timeSeconds, hasVideo });

  const actions = [];

  if (hasVideo && videoEl) {
    actions.push(videoEl.play());
  }

  if (audioEl) {
    actions.push(audioEl.play());
  }

  if (actions.length === 0) {
    return true;
  }

  const results = await Promise.allSettled(actions);
  return results.some((result) => result.status === "fulfilled");
}

export function correctAudioDrift(videoEl, audioEl) {
  if (!videoEl || !audioEl || videoEl.paused) return;

  const drift = audioEl.currentTime - videoEl.currentTime;
  if (Math.abs(drift) <= DRIFT_THRESHOLD) return;

  try {
    audioEl.currentTime = videoEl.currentTime;
  } catch {
    // ignore seek errors during drift correction
  }
}
