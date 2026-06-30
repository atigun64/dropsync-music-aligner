# Optimizer

Domain-specific **alignment engine**: given a query timeline with pinpoint annotations and a library of tracks (each with their own drop annotations), find a subset of tracks and a temporal placement that **maximizes a custom score function**.

The optimizer has **no dependency on audio files** — only on structured segment/annotation objects.

---

## Core concepts

| Type | Meaning |
|------|---------|
| `Query` | Target session: length + pinpoint annotations (e.g. video cue drops) |
| `TrackLibrary` | Collection of tracks with metadata, BPM, style signature, annotations |
| `AssignedTrack` | A track placed on the timeline: start time, speed, mapped points |
| `Alignment` | Full assignment: ordered tracks + global score |
| `PointAnnotation` | Labeled point (`drop`, etc.) with time, strength |

Types live in `optimizer/models.py` and are mirrored in `app/models.py` for API persistence.

---

## Search algorithm

`optimizer/core/beam_search.py`

- **Beam search** over partial alignments
- At each step, consider adding/extending track placements
- Prune by partial score to keep beam width manageable
- Returns highest-scoring complete `Alignment`

The optimizer chooses **which tracks** to include and **how to align** their annotated drops to query pinpoints.

---

## Score function

`optimizer/scores/final_score.py` combines multiple objectives:

| Factor | Module | Intent |
|--------|--------|--------|
| Drop match | `scores/drop.py` | Align track drops to query pinpoints |
| Gap quality | `scores/gap.py` | Reasonable spacing between placements |
| Overlap | `scores/overlap.py` | Penalize overlapping segments |
| BPM | `scores/bpm.py` | Tempo coherence with session |
| Style | `scores/style.py` | Spectral/style similarity to video signature |
| Preference | `scores/preference.py` | User track preference weights |

Weights configured in `optimizer/scores/config.py`.

**Final score** blends a “critical” block (drops, gaps, overlap) with secondary style/BPM/preference terms — see `score_alignment_final()` for the exact composition.

Partial placements during search use `score_alignment_partial()` (does not penalize unfulfilled future query points).

---

## Integration with `app/`

1. API loads studio query + track library from storage
2. Maps to optimizer domain types
3. Runs beam search (`app/services/run_optimization.py`)
4. Persists `AlignmentSpec` (score + assigned tracks) back to studio store
---

## Demo placeholder

<!-- Record: studio with pinpoints, run optimizer, show before/after alignment and score -->

**[Optimizer demo video]()** <!-- link to README demo row 3 -->

