# Moves the unlabeled data in download.txt to the training split, so that it can be used for training.
from pathlib import Path
import numpy as np

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

    # Gather all downloaded track ids (these are considered "unlabeled" at track level)
    unlabeled = get_track_ids()

    split_dir = DATASET_ROOT / "split"
    train_path = split_dir / TRAIN_SPLIT
    eval_path = split_dir / EVAL_SPLIT

    # Read existing eval and train splits
    eval_set = set()
    if eval_path.exists():
        with eval_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                eval_set.add(line)

    train_list = []
    train_set = set()
    if train_path.exists():
        with train_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                train_list.append(line)
                train_set.add(line)

    # Determine which unlabeled tracks should be added to train:
    # - not in eval
    # - not already in train
    to_add = [t for t in unlabeled if t not in eval_set and t not in train_set]

    if not to_add:
        print("No new unlabeled tracks to add to train (all are in eval or already in train)")
        print(f"Unlabeled count: {len(unlabeled)}, eval: {len(eval_set)}, train: {len(train_set)}")
        return

    # Append new tracks to train file (leave eval untouched)
    split_dir.mkdir(parents=True, exist_ok=True)
    with train_path.open("a", encoding="utf-8") as f:
        for tid in to_add:
            f.write(tid + "\n")

    print(f"Added {len(to_add)} tracks to train (left eval file untouched)")
    print(f"Unlabeled count: {len(unlabeled)}, eval: {len(eval_set)}, previous train: {len(train_set)} -> new train: {len(train_set) + len(to_add)}")
if __name__ == "__main__":
    main()
