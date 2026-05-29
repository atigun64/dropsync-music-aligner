from pathlib import Path

DATASET_ROOT = Path("music_drop", "data")

def get_track_ids(split="train"):
    split_file = DATASET_ROOT / "split" / split
    if not split_file.exists():
        print(f"Split file {split_file} does not exist.")
        return []

    with open(split_file, "r") as f:
        track_ids = [line.strip() for line in f if line.strip()]
    
    return sorted(track_ids)

if __name__ == "__main__":
    track_ids = get_track_ids(split="eval")
    print(f"Track IDs in 'eval' split:")
    for tid in track_ids:
        print(tid)