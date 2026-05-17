import numpy as np

def get_window(beat_idx):
    return slice(beat_idx - 20, beat_idx + 10 + 1)


def build_feature_window(E, O, B, C, beat_idx):
    w = get_window(beat_idx)
    window_size = w.stop - w.start

    x = np.zeros((window_size, 4), dtype=np.float32)

    src_start = max(0, w.start)
    src_stop = min(len(E), w.stop)

    if src_start < src_stop:
        dst_start = src_start - w.start
        dst_stop = dst_start + (src_stop - src_start)

        x[dst_start:dst_stop, 0] = E[src_start:src_stop]
        x[dst_start:dst_stop, 1] = O[src_start:src_stop]
        x[dst_start:dst_stop, 2] = C[src_start:src_stop]
        x[dst_start:dst_stop, 3] = B[src_start:src_stop]

    return x

def window_times(beat_idx, beat_times):
    w = get_window(beat_idx)
    
    src_start = max(0, w.start)
    src_stop = min(len(beat_times), w.stop)

    return (beat_times[src_start], beat_times[src_stop-1] + 1)