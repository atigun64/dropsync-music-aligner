# Optimizer

The core optimizer is implemented in `optimizer/core/beam_search.py`.

- It uses a beam search to build `Alignment` objects from a `Query` and a `TrackLibrary`.
- Each candidate placement is evaluated using track drop annotations and requested query drops.
- The optimizer considers track speed constraints, overlaps, gaps, and placement score.

Key concepts:
- `Query`: requested session length and drop point annotations.
- `TrackLibrary`: collection of tracks with metadata and annotations.
- `AssignedTrack`: a track placed into the timeline with a start time and speed.
- `PointAnnotation`: labeled drop points on both queries and tracks.
