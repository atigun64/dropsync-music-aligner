from sklearn.ensemble import ExtraTreesClassifier

from music_drop.src.score.score import evaluate_drop_level
from music_drop.src.training import model
from music_drop.src.training.labeling import load_labeled_samples
from music_drop.src.training.train import train_model

LABEL_SPLIT = "train"

def main():
    labeled_samples = load_labeled_samples(split=LABEL_SPLIT)
    if len(labeled_samples) == 0:
        print(f"No labeled samples found in split='{LABEL_SPLIT}'.")
        return

    print(f"Loaded {len(labeled_samples)} labeled samples.")

    model = ExtraTreesClassifier(
        n_estimators=500,
        max_features="sqrt",
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=0
    )
    train_model(labeled_samples=labeled_samples, ml_model=model)

    ml_drop_params = {
        "min_score": 0.6,
        "heuristic_threshold": 0.1,
        "min_gap_sec": 10,
    }
    
    evaluate_drop_level(ml_drop_params)

if __name__ == "__main__":
    main()