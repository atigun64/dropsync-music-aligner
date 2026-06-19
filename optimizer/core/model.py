
from optimizer.models import Alignment, Query, TrackLibrary


class Optimizer:
    def optimize(self, query: Query, tracks: TrackLibrary) -> Alignment:
        raise NotImplementedError