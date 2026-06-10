import numpy as np
from typing import List
from joblib import dump

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from .model import model

from .data import Sample
from .utils import sample_to_vector
import numpy as np
from typing import List, Dict, Tuple
from collections import defaultdict

from .data import Sample

def minimal_filter_training_samples(samples: List[Sample]) -> List[Sample]:
    seen = set()
    filtered = []

    for s in samples:
        key = (s.track_id, s.beat_idx, int(s.y))
        if key in seen:
            continue
        seen.add(key)
        filtered.append(s)

    print(f"Minimal filter: kept {len(filtered)}/{len(samples)} samples "
          f"({len(samples) - len(filtered)} exact duplicates removed)")
    return filtered


def train_model(labeled_samples: List[Sample], ml_model = None) -> Pipeline:
    # train_samples = labeled_samples
    train_samples = minimal_filter_training_samples(labeled_samples)

    X = np.stack([
        sample_to_vector(s)
        for s in train_samples
    ])
    y = np.array([s.y for s in train_samples], dtype=int)

    if ml_model is None:
        ml_model = model()
    ml_model.fit(X, y)
    dump(ml_model, "drop_model.joblib")
    return ml_model
