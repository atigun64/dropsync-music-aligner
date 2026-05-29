from pathlib import Path
import random
import numpy as np
from music_drop.src.training.labeling import load_labeled_samples

DATASET_ROOT = Path("music_drop", "data")
TRAIN_SPLIT = "train"
EVAL_SPLIT = "eval"
EVAL_TRACK_SIZE = 50

def get_track_ids():
    track_ids = []
    downloaded_file = DATASET_ROOT / "music_dataset" / "downloaded.txt"
    
    if downloaded_file.exists():
        with open(downloaded_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and line.startswith("youtube "):
                    track_id = line.split(" ", 1)[1]
                    track_ids.append(track_id)
    
    return sorted(track_ids)

def main():
    unlabeled_tracks = get_track_ids()
    print(f"Found {len(unlabeled_tracks)} tracks in dataset.")

    labeled_samples = load_labeled_samples(split=TRAIN_SPLIT)

    for s in labeled_samples:
        if s.track_id in unlabeled_tracks:
            unlabeled_tracks.remove(s.track_id)

    print(f"Remaining unlabeled tracks: {len(unlabeled_tracks)}")

    # Save EVAL_TRACK_SIZE random tracks for evaluation, and the rest for training
    random.shuffle(unlabeled_tracks)
    eval_tracks = set(unlabeled_tracks[:EVAL_TRACK_SIZE])
    train_tracks = set(unlabeled_tracks[EVAL_TRACK_SIZE:]).union(set(s.track_id for s in labeled_samples))

    print(f"Tracks for evaluation: {len(eval_tracks)}")
    print(f"Tracks for training: {len(train_tracks)}")

    # Write them in DATASETROOT/split/train.txt and eval.txt
    with open(DATASET_ROOT / "split" / TRAIN_SPLIT, "w") as f:
        for track_id in sorted(train_tracks):
            f.write(track_id + "\n")
    with open(DATASET_ROOT / "split" / EVAL_SPLIT, "w") as f:
        for track_id in sorted(eval_tracks):
            f.write(track_id + "\n")
    
if __name__ == "__main__":
    main()
