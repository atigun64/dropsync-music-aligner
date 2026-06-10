from music_drop.src.training.active_learning import active_learning_loop
from pathlib import Path
from music_drop.src.score.score import evaluate_drop_level

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
    print("Starting active learning process...")
    train_track_ids = get_track_ids(split="train")

    print(f"Found {len(train_track_ids)} tracks in training split.")

    ml_drop_params = {
        "min_score": 0.6,
        "heuristic_threshold": 0.1,
        "min_gap_sec": 10,
    }
    call_scores = lambda: evaluate_drop_level(ml_drop_params=ml_drop_params)

    print("Running active learning loop...")

    model, labeled_samples = active_learning_loop(
        train_track_ids=train_track_ids,
        rounds=10,
        initial_label_count=50,
        batch_size=10,
        split="train",
        call_scores=call_scores
    )
