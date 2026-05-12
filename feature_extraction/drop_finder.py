import numpy as np
import pandas as pd
from scipy.signal import find_peaks

from extract_features import extract_features

def find_drops(audio_path):
    E, O, C, F, B, bpm, beat_times, frame_times = extract_features(audio_path)

    # ----------------------------
    # 5) Derivative / trend features
    # ----------------------------
    def z(x):
        return (x - np.mean(x)) / (np.std(x) + 1e-9)

    dE = np.diff(E, prepend=E[0])
    dO = np.diff(O, prepend=O[0])
    dC = np.diff(C, prepend=C[0])
    dB = np.diff(B, prepend=B[0])

    drop_score = (
        1.5 * z(dE) +
        1.2 * z(dO) +
        1.2 * z(dB) +
        1 * z(E)
    )

    drop_peaks, _ = find_peaks(drop_score, distance=4, prominence=0.5)

    def top_candidates(peaks, score, n=5):
        if len(peaks) == 0:
            return []
        ranked = sorted(peaks, key=lambda i: score[i], reverse=True)[:n]
        rows = []
        for i in ranked:
            rows.append({
                "time_sec": round(float(beat_times[i]), 2),
                "time_min:sec": f"{int(beat_times[i]//60)}:{int(beat_times[i]%60):02d}",
                "score": round(float(score[i]), 3),
                "beat_idx": int(i),
            })
        return rows

    drop_rows = top_candidates(drop_peaks, drop_score, n=5)

    print(f"\nEstimated BPM: {bpm:.2f}\n")

    print("\n=== Likely DROP points ===")
    print(pd.DataFrame(drop_rows).to_string(index=False) if drop_rows else "None found")

    return [r.time_sec for r in drop_rows]

if __name__ == "__main__":
    times = find_drops("musics/test.mp3")