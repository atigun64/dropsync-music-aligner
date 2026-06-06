from music_core import get_ml_candidates
from music_drop.src.cache import AudioFeatureCache

def second_to_beat_idx(time_seconds, beat_times):
    for i in range(len(beat_times) - 1):
        if beat_times[i] <= time_seconds < beat_times[i + 1]:
            return i
    return len(beat_times) - 1

def F1_score(track_ids, real_drops_seconds, tolerance_beats=7, ml_drop_params=None):
    cache = AudioFeatureCache()
    tp = 0
    total_predicted = 0
    total_real = 0

    for track_id in track_ids:
        payload = cache.get_by_id(track_id)
        E, O, C, F, B, beat_times = payload["E"], payload["O"], payload["C"], payload["F"], payload["B"], payload["beat_times"]
        
        
        candidates = get_ml_candidates(
            E, O, C, F, B, beat_times,
            **(ml_drop_params or {})
        )

        predicted_drops = set()
        for beat_idx, _, _ in candidates:
            predicted_drops.add(beat_idx)
        
        real_drops = set()
        for drop_time in real_drops_seconds[track_id]:
            beat_idx = second_to_beat_idx(drop_time, beat_times)
            real_drops.add(beat_idx)

        # print([beat_times[i] for i in predicted_drops])
        # print([beat_times[i] for i in real_drops])

        # Count true positives using a one-to-one matching within tolerance
        matched_real = set()
        for pred in predicted_drops:
            # find the closest unmatched real drop within tolerance
            closest = None
            min_dist = tolerance_beats + 1
            for real in real_drops:
                if real in matched_real:
                    continue
                dist = abs(pred - real)
                if dist <= tolerance_beats and dist < min_dist:
                    closest = real
                    min_dist = dist
            if closest is not None:
                tp += 1
                matched_real.add(closest)

        total_predicted += len(predicted_drops)
        total_real += len(real_drops)

    recall = tp / total_real if total_real > 0 else 0
    precision = tp / total_predicted if total_predicted > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    return precision, recall, f1

def evaluate_drop_level(ml_drop_params = None):
  data = {}

  with open("music_drop/data/drop_points.txt", "r", encoding="utf-8") as f:
      for line in f:
          line = line.strip()
          if not line:
              continue

          key, values = line.split(":", 1)
          values = values.strip().rstrip(".").strip()

          if values:
              data[key] = [int(x.strip()) for x in values.split(",")]
          else:
              data[key] = []
  
  track_ids = list(data.keys())
  real_drops_seconds = {track_id: data[track_id] for track_id in track_ids}

  precision, recall, f1 = F1_score(track_ids, real_drops_seconds, ml_drop_params=ml_drop_params)
  print(f"Precision: {precision:.4f}, Recall: {recall:.4f}, F1 Score: {f1:.4f}")
  return precision, recall, f1
