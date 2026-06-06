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
        - If a sample in a track is labeled positive, try to get median positive samples among those which are too close to it. This is to avoid having many very similar positive samples which can cause overfitting.
        - If a sample is labeled negative, we can include more of the nearby samples as negatives, since they are less likely to cause overfitting. We can include samples within a window of [-5, +5] beat indices around the negative sample.
    """
    samples_by_track = {}
    for sample in samples:
        if sample.track_id not in samples_by_track:
            samples_by_track[sample.track_id] = []
        samples_by_track[sample.track_id].append(sample)
    
    filtered_samples = []
    for track_id, track_samples in samples_by_track.items():
        track_samples.sort(key=lambda s: s.beat_idx)
        positive_samples = [s for s in track_samples if s.y == 1]
        negative_samples = [s for s in track_samples if s.y == 0]

        # For positive samples, we want to include only a few representative ones to avoid overfitting
        if len(positive_samples) > 0:
            # We can group close positive samples together and take the median one from each group
            positive_samples.sort(key=lambda s: s.beat_idx)
            grouped_positives = []
            current_group = [positive_samples[0]]
            for s in positive_samples[1:]:
                if s.beat_idx - current_group[-1].beat_idx <= 10:  # close enough to be in the same group
                    current_group.append(s)
                else:
                    grouped_positives.append(current_group)
                    current_group = [s]
            if current_group:
                grouped_positives.append(current_group)
            # Take the median sample from each group
            for group in grouped_positives:
                median_idx = len(group) // 2
                filtered_samples.append(group[median_idx])
            
        # For negative samples, we can include more of them, but we still want to avoid having too many very close ones
        negative_samples.sort(key=lambda s: s.beat_idx)
        last_included_idx = -10  # initialize to a value far from any beat index
        for s in negative_samples:
            if s.beat_idx - last_included_idx > 5:  # include this negative sample if it's not too close to the last included one
                filtered_samples.append(s)
                last_included_idx = s.beat_idx
            
    return filtered_samples

def train_model(labeled_samples: List[Sample], ml_model = None) -> Pipeline:
    train_samples = filter_training_samples(labeled_samples)

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
