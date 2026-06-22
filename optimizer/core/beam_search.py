from dataclasses import dataclass, field
from typing import List
import math
import random

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
    Simple DP by integer second:
      dp[second] = top beam_width states reaching that frontier second
    """

    def __init__(
        self,
        beam_width: int = 100,
        final_window: float = 10.0,
        candidate_limit_per_state: int = 40,
        request_anchor_limit: int = 3,
        randomize_final: bool = True,
        final_top_k: int = 20,
        final_temperature: float = 0.35,
        search_noise: float = 0.0,
        random_seed: int | None = None,
        max_steps: int = 10000,
    ):
        self.beam_width = beam_width
        self.final_window = final_window
        self.candidate_limit_per_state = candidate_limit_per_state
        self.request_anchor_limit = request_anchor_limit
        self.randomize_final = randomize_final
        self.final_top_k = final_top_k
        self.final_temperature = final_temperature
        self.search_noise = search_noise
        self.rng = random.Random(random_seed)

    def optimize(self, query: Query, tracks: TrackLibrary) -> Alignment:
        initial_alignment = Alignment()
        initial_alignment.tracks = []

        initial_state = BeamState(
            alignment=initial_alignment,
            score=score_alignment_partial(initial_alignment, query),
            frontier_end=0.0,
            used_track_ids=set(),
        )

        max_second = self._max_second(query)
        dp: list[list[BeamState]] = [[] for _ in range(max_second + 1)]
        dp[0].append(initial_state)

        for sec in range(max_second + 1):
            if not dp[sec]:
                continue

            # keep only top-K for this second
            dp[sec].sort(key=lambda s: self._ranking_score(s), reverse=True)
            states = dp[sec][: self.beam_width]
            dp[sec] = states

            for state in states:
                if query.length is not None and state.frontier_end > query.length + self.final_window:
                    continue

                candidates = self._candidate_extensions(state, query, tracks)
                if not candidates:
                    continue

                candidates = self._rank_candidates(state, candidates, query)
                if self.candidate_limit_per_state > 0:
                    candidates = candidates[: self.candidate_limit_per_state]

                for candidate in candidates:
                    new_state = self._extend_state(state, candidate, query)

                    if new_state.frontier_end <= state.frontier_end + 1e-9:
                        continue

                    if query.length is not None and new_state.frontier_end > query.length + self.final_window:
                        continue

                    new_sec = self._frontier_bucket(new_state.frontier_end)
                    if new_sec > max_second:
                        continue

                    dp[new_sec].append(new_state)

        final_states = self._collect_final_states(dp, query)
        if not final_states:
            return initial_alignment

        best_state = self._choose_final_state(final_states, query)
        best_alignment = best_state.alignment
        best_alignment.score = score_alignment_final(best_alignment, query)
        return best_alignment

    # --------------------------------------------------
    # DP helpers
    # --------------------------------------------------

    def _max_second(self, query: Query) -> int:
        if query.length is not None:
            return int(math.ceil(query.length + self.final_window + MAX_ACCEPTABLE_GAP))
        return 600

    def _frontier_bucket(self, t: float) -> int:
        return max(0, int(round(t)))

    def _collect_final_states(self, dp: list[list[BeamState]], query: Query) -> list[BeamState]:
        all_states: list[BeamState] = []
        for bucket in dp:
            all_states.extend(bucket)

        if not all_states:
            return []

        if query.length is None:
            all_states.sort(key=lambda s: s.score, reverse=True)
            return all_states[: self.beam_width]

        lo = query.length - self.final_window
        hi = query.length + self.final_window

        in_window = [s for s in all_states if lo <= s.frontier_end <= hi]
        if in_window:
            in_window.sort(key=lambda s: score_alignment_final(s.alignment, query), reverse=True)
            return in_window[: max(self.beam_width, self.final_top_k)]

        # fallback: farthest-reaching states only
        max_frontier = max(s.frontier_end for s in all_states)
        near_farthest = [
            s for s in all_states
            if s.frontier_end >= max_frontier - 1.0
        ]
        near_farthest.sort(
            key=lambda s: (s.frontier_end, score_alignment_final(s.alignment, query)),
            reverse=True,
        )
        return near_farthest[: max(self.beam_width, self.final_top_k)]

    def _choose_final_state(self, final_states: list[BeamState], query: Query) -> BeamState:
        scored = [(state, score_alignment_final(state.alignment, query)) for state in final_states]
        scored.sort(key=lambda x: x[1], reverse=True)
        return self._sample_scored_states(scored)

    def _sample_scored_states(self, scored: list[tuple[BeamState, float]]) -> BeamState:
        if not scored:
            raise ValueError("_sample_scored_states called with empty list")

        pool = scored[: max(1, self.final_top_k)]

        if not self.randomize_final or len(pool) == 1:
            return pool[0][0]

        temp = max(1e-6, float(self.final_temperature))
        max_score = max(score for _, score in pool)

        weights = [math.exp((s - max_score) / temp) for _, s in pool]
        total = sum(weights)

        if total <= 0:
            return pool[0][0]

        r = self.rng.random() * total
        acc = 0.0
        for (state, _), w in zip(pool, weights):
            acc += w
            if acc >= r:
                return state

        return pool[-1][0]

    def _ranking_score(self, state: BeamState) -> float:
        score = state.score
        if self.search_noise > 0:
            score += self.search_noise * self._gumbel()
        return score

    def _gumbel(self) -> float:
        u = min(1.0 - 1e-12, max(1e-12, self.rng.random()))
        return -math.log(-math.log(u))

    # --------------------------------------------------
    # Candidate generation
    # --------------------------------------------------

    def _candidate_extensions(
        self,
        state: BeamState,
        query: Query,
        tracks: TrackLibrary
    ) -> list[tuple[Track, float, float]]:
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
            if r.time is not None
            and r.time >= frontier - overlap_slack
            and r.time <= frontier + gap_slack
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

        candidates.extend(self._sequential_candidates(state, query, tracks, seen))
        return candidates

    def _rank_candidates(
        self,
        state: BeamState,
        candidates: list[tuple[Track, float, float]],
        query: Query,
    ) -> list[tuple[Track, float, float]]:
        return sorted(
            candidates,
            key=lambda c: self._candidate_priority(state, c, query) + (
                self.search_noise * self._gumbel() if self.search_noise > 0 else 0.0
            ),
            reverse=True,
        )

    def _candidate_priority(
        self,
        state: BeamState,
        candidate: tuple[Track, float, float],
        query: Query,
    ) -> float:
        track, start_time, speed = candidate

        frontier = state.frontier_end
        length = track.length if track.length is not None else 0.0
        end_time = start_time + (length / speed if speed > 0 else 0.0)
        preference = float(getattr(track, "preference", 1.0) or 1.0)

        score = 0.0

        score += 0.5 * math.log(max(1e-6, preference))
        score -= 0.05 * abs(start_time - frontier)

        if start_time > frontier:
            score -= 0.10 * (start_time - frontier)

        if query.length is not None:
            score -= 0.01 * abs(query.length - end_time)

            if query.length - self.final_window <= end_time <= query.length + self.final_window:
                score += 0.5

        score += self._drop_match_bonus(track, start_time, speed, query)
        return score

    def _drop_match_bonus(
        self,
        track: Track,
        start_time: float,
        speed: float,
        query: Query,
    ) -> float:
        reqs = self._requested_drops(query)
        if not reqs:
            return 0.0

        drops = self._track_drops(track)
        if not drops:
            return 0.0

        tol = float(DROP_MISS_TOLERANCE)
        if tol <= 0:
            return 0.0

        total = 0.0
        for drop in drops:
            if drop.time is None:
                continue

            placed = start_time + (drop.time / speed)
            best = 0.0

            for req in reqs:
                if req.time is None:
                    continue
                miss = abs(req.time - placed)
                if miss <= 2.0 * tol:
                    proximity = max(0.0, 1.0 - miss / (2.0 * tol))
                    best = max(best, proximity * (0.5 + 0.5 * self._strength_of(req)))

            total += best

        return total

    def _requested_drops(self, query) -> list[PointAnnotation]:
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
        return [0.0, -tol, tol, -tol / 2, tol / 2]

    def _sequential_candidates(
        self,
        state: BeamState,
        query: Query,
        tracks: TrackLibrary,
        seen: set[tuple[int, float, float]] | None = None
    ) -> list[tuple[Track, float, float]]:
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
