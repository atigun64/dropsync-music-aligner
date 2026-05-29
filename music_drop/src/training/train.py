import numpy as np
from typing import List
from joblib import dump

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from .model import model

from .data import Sample
from .utils import sample_to_vector

def filter_training_samples(samples: List[Sample]) -> List[Sample]:
    """
    Filter samples to include in training.
    """
    return samples  # For now, include all samples. Can add filtering logic here if needed.

def train_model(labeled_samples: List[Sample]) -> Pipeline:
    train_samples = filter_training_samples(labeled_samples)

    X = np.stack([
        sample_to_vector(s)
        for s in train_samples
    ])
    y = np.array([s.y for s in train_samples], dtype=int)

    model.fit(X, y)
    dump(model, "drop_model.joblib")
    return model
