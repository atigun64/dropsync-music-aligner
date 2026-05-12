import numpy as np
from scipy.ndimage import gaussian_filter1d

def beat_sync(x, beat_times, frame_times):
    vals = []
    for i, t0 in enumerate(beat_times):
        print(t0)
        t1 = beat_times[i + 1] if i < len(beat_times) - 1 else frame_times[-1]
        mask = (frame_times >= t0) & (frame_times < t1)
        vals.append(np.mean(x[mask]) if np.any(mask) else np.nan)
    vals = np.array(vals, dtype=float)

    # fill gaps
    if np.any(np.isnan(vals)):
        good = np.where(~np.isnan(vals))[0]
        bad = np.where(np.isnan(vals))[0]
        vals[bad] = np.interp(bad, good, vals[good])

    return vals

def smooth(x, sigma=1.0):
    return gaussian_filter1d(x, sigma=sigma) if len(x) > 5 else x
