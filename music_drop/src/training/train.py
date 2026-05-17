import numpy as np
from typing import List

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

from .data import Sample
from .utils import sample_to_vector

def train_model(labeled_samples: List[Sample]) -> Pipeline:
    X = np.stack([
        sample_to_vector(s)
        for s in labeled_samples
    ])
    y = np.array([s.y for s in labeled_samples], dtype=int)

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(
            max_iter=2000,
            class_weight="balanced"
        ))
    ])

    model.fit(X, y)
    return model
