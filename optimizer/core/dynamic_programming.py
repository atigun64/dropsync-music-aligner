from dataclasses import dataclass, field
from heapq import heappush, heappop
from typing import List
import math

from optimizer.core.model import Optimizer
from optimizer.models import Query, TrackLibrary, Alignment, AssignedTrack, Track, PointAnnotation
from optimizer.scores import score_alignment_partial, score_alignment_final
from optimizer.scores.config import MAX_ACCEPTABLE_GAP
from .config import DROP_MISS_TOLERANCE, MAX_ACCEPTABLE_OVERLAP


@dataclass
class BeamState:
    alignment: Alignment
    score: float
    frontier_end: float = 0.0
    used_track_ids: set[int] = field(default_factory=set)


class BeamSearch(Optimizer):
    """
    DP over discretized frontier positions.

    dp[bucket] = up to beam_width best states whose frontier_end falls in that bucket.
    """
    def __init__(
        self,
        beam_width: int = 100,
        max_steps: int = 200,
        frontier_bucket_size: float = 0.1,
        final_window: float = 10.0,
    ):
        self.beam_width = beam_width
        self.max_steps = max_steps
        self.frontier_bucket_size = frontier_bucket_size
        self.final_window = final_window

        # how many request anchors to try each step
        self.request_anchor_limit = 3

    def optimize(self, query: Query, tracks: TrackLibrary) -> Alignment:
        initial_alignment = Alignment()
        initial_alignment.tracks = []

        initial_state = BeamState(
            alignment=initial_alignment,
            score=score_alignment_partial(initial_alignment, query),
            frontier_end=0.0,
            used_track_ids=set(),
        )

        # dp[bucket] -> list of BeamState
        dp: dict[float, list[BeamState]] = {}

        # min-heap of buckets to process
        bucket_heap: list[float] = []
        bucket_in_heap: set[float] = set()

        initial_bucket = self._frontier_bucket(initial_state.frontier_end)
        dp[initial_bucket] = [initial_state]
        heappush(bucket_heap, initial_bucket)
        bucket_in_heap.add(initial_bucket)

        processed_buckets = 0

        while bucket_heap and processed_buckets < self.max_steps:
            bucket = heappop(bucket_heap)
            bucket_in_heap.discard(bucket)

            states = dp.get(bucket, [])
            idx = 0

            # Process this bucket to closure:
            # if we append new states that fall into the same bucket,
            # they will also be processed in this loop.
            while idx < len(states):
                state = states[idx]
                idx += 1

                # Prune states already too far beyond the final window
                if query.length is not None and state.frontier_end > query.length + self.final_window:
                    continue

                candidates = self._candidate_extensions(state, query, tracks)
                for candidate in candidates:
                    new_state = self._extend_state(state, candidate, query)

                    # Hard prune beyond target window
                    if query.length is not None and new_state.frontier_end > query.length + self.final_window:
                        continue

                    self._push_state(
                        dp=dp,
                        bucket_heap=bucket_heap,
                        bucket_in_heap=bucket_in_heap,
                        state=new_state,
                        current_bucket=bucket,
                    )

            # After fully processing the bucket, keep only the best states there
            if len(states) > self.beam_width:
                states.sort(key=lambda s: s.score, reverse=True)
                del states[self.beam_width:]

            processed_buckets += 1

        # Choose best state in the requested final window
        final_states: list[BeamState] = []

        if query.length is not None:
            lo = query.length - self.final_window
            hi = query.length + self.final_window

            for states in dp.values():
                for state in states:
                    if lo <= state.frontier_end <= hi:
                        final_states.append(state)
        else:
            # If query length is unknown, just use all reachable states
            for states in dp.values():
                final_states.extend(states)

        if not final_states:
            return initial_alignment

        best_state = max(
            final_states,
            key=lambda s: score_alignment_final(s.alignment, query)
            if query.length is not None
            else s.score,
        )

        best_alignment = best_state.alignment
        best_alignment.score = (
            score_alignment_final(best_alignment, query)
            if query.length is not None
            else best_state.score
        )
        return best_alignment

    # --------------------------------------------------
    # DP helpers
    # --------------------------------------------------

    def _frontier_bucket(self, t: float) -> float:
        """
        Discretize continuous frontier_end into a bucket.
        We use ceil so that buckets are monotonic and never go backwards.
        """
        if self.frontier_bucket_size <= 0:
            return round(float(t), 6)

        b = self.frontier_bucket_size
        return round(math.ceil(t / b) * b, 6)

    def _push_state(
        self,
        dp: dict[float, list[BeamState]],
        bucket_heap: list[float],
        bucket_in_heap: set[float],
        state: BeamState,
        current_bucket: float,
    ) -> None:
        bucket = self._frontier_bucket(state.frontier_end)
        states = dp.setdefault(bucket, [])
        states.append(state)

        # If it stays in the current bucket, we do NOT prune yet,
        # because it may still need to be expanded in the same pass.
        if bucket == current_bucket:
            return

        # For future buckets, keep only top-K immediately.
        if len(states) > self.beam_width:
            states.sort(key=lambda s: s.score, reverse=True)
            del states[self.beam_width:]

        if bucket not in bucket_in_heap:
            heappush(bucket_heap, bucket)
            bucket_in_heap.add(bucket)

    # --------------------------------------------------
    # Candidate generation
    # --------------------------------------------------

    def _candidate_extensions(
        self,
        state: BeamState,
        query: Query,
        tracks: TrackLibrary
    ) -> list[tuple[Track, float, float]]:
        """
        Returns candidate placements:
            (track, start_time, speed)

        Strategy:
        1) try to anchor track drops to the next strongest nearby requests
        2) if nothing good appears, fall back to sequential placement
        """
        candidates: list[tuple[Track, float, float]] = []
        seen: set[tuple[int, float, float]] = set()

        requested_drops = self._requested_drops(query)

        if not requested_drops:
            return self._sequential_candidates(state, query, tracks)

        frontier = state.frontier_end
        overlap_slack = MAX_ACCEPTABLE_OVERLAP
        gap_slack = MAX_ACCEPTABLE_GAP

        future_targets = [
            r for r in requested_drops
            if r.time is not None and r.time >= frontier - overlap_slack and r.time <= frontier + gap_slack
        ]

        if not future_targets:
            future_targets = requested_drops[:]

        future_targets.sort(key=lambda r: (-self._strength_of(r), r.time))
        future_targets = future_targets[: self.request_anchor_limit]

        for request in future_targets:
            if request.time is None:
                continue

            for track in tracks.get_tracks():
                track_id = track.track_id if track.track_id is not None else id(track)
                if track_id in state.used_track_ids:
                    continue

                if track.length is None:
                    continue

                drop_anns = self._track_drops(track)
                if not drop_anns:
                    continue

                for drop in drop_anns:
                    if drop.time is None:
                        continue

                    for speed in self._speed_candidates(track):
                        if speed <= 0:
                            continue

                        base_start = request.time - (drop.time / speed)

                        for delta in self._anchor_offsets():
                            start_time = base_start + delta
                            end_time = start_time + (track.length / speed)

                            if start_time < 0:
                                continue

                            if query.length is not None and end_time > query.length + MAX_ACCEPTABLE_GAP:
                                continue

                            if start_time < frontier - overlap_slack or start_time > frontier + gap_slack:
                                continue

                            key = (track_id, round(start_time, 2), round(speed, 3))
                            if key in seen:
                                continue
                            seen.add(key)

                            candidates.append((track, start_time, speed))

        sequential_candidates = self._sequential_candidates(state, query, tracks, seen)
        candidates.extend(sequential_candidates)
        return candidates

    def _requested_drops(self, query: Query) -> list[PointAnnotation]:
        return [
            a for a in query.annotations
            if isinstance(a, PointAnnotation)
            and a.label == "drop"
            and a.time is not None
        ]

    def _track_drops(self, track: Track) -> list[PointAnnotation]:
        return [
            a for a in track.annotations
            if isinstance(a, PointAnnotation)
            and a.label == "drop"
            and a.time is not None
        ]

    def _strength_of(self, ann: PointAnnotation) -> float:
        s = ann.strength if ann.strength is not None else 0.0
        return max(0.0, min(1.0, float(s)))

    def _speed_candidates(self, track: Track) -> list[float]:
        min_speed = getattr(track, "min_speed", 0.98)
        max_speed = getattr(track, "max_speed", 1.20)

        if min_speed > max_speed:
            min_speed, max_speed = max_speed, min_speed

        return [min_speed + i * (max_speed - min_speed) / 9 for i in range(10)]

    def _anchor_offsets(self) -> list[float]:
        tol = float(DROP_MISS_TOLERANCE)
        return [0.0, -tol, tol, -tol / 2, tol / 2, -tol / 4, tol / 4]

    def _sequential_candidates(
        self,
        state: BeamState,
        query: Query,
        tracks: TrackLibrary,
        seen: set[tuple[int, float, float]] | None = None
    ) -> list[tuple[Track, float, float]]:
        """
        Fallback: place a new track after the current frontier.
        """
        candidates: list[tuple[Track, float, float]] = []
        seen = seen if seen is not None else set()

        frontier = state.frontier_end
        query_length = query.length

        for track in tracks.get_tracks():
            track_id = track.track_id if track.track_id is not None else id(track)
            if track_id in state.used_track_ids:
                continue

            if track.length is None:
                continue

            for speed in self._speed_candidates(track):
                start_time = frontier
                end_time = start_time + (track.length / speed)

                if query_length is not None and end_time > query_length + MAX_ACCEPTABLE_GAP:
                    continue

                key = (track_id, round(start_time, 2), round(speed, 3))
                if key in seen:
                    continue
                seen.add(key)

                candidates.append((track, start_time, speed))

        return candidates

    # --------------------------------------------------
    # State extension
    # --------------------------------------------------

    def _extend_state(
        self,
        state: BeamState,
        candidate: tuple[Track, float, float],
        query: Query
    ) -> BeamState:
        track, start_time, speed = candidate

        assigned = self._assign_track(track, start_time, speed)

        new_alignment = Alignment()
        new_alignment.tracks = list(state.alignment.tracks)
        new_alignment.tracks.append(assigned)

        new_used_ids = set(state.used_track_ids)
        new_used_ids.add(track.track_id if track.track_id is not None else id(track))

        new_end = max(state.frontier_end, start_time + self._assigned_duration(assigned))
        new_score = score_alignment_partial(new_alignment, query)

        return BeamState(
            alignment=new_alignment,
            score=new_score,
            frontier_end=new_end,
            used_track_ids=new_used_ids,
        )

    def _assign_track(self, track: Track, start_time: float, speed: float) -> AssignedTrack:
        assigned = AssignedTrack()

        assigned.track_id = track.track_id
        assigned.length = track.length
        assigned.BPM = track.BPM
        assigned.signature = track.signature
        assigned.annotations = list(track.annotations)

        assigned.preference = getattr(track, "preference", 1.0)
        assigned.min_speed = getattr(track, "min_speed", 0.98)
        assigned.max_speed = getattr(track, "max_speed", 1.20)

        assigned.start_time = start_time
        assigned.speed = speed

        return assigned

    def _assigned_duration(self, track: AssignedTrack) -> float:
        if track.length is None or track.speed is None or track.speed <= 0:
            return 0.0
        return track.length / track.speed
