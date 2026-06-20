from dataclasses import dataclass, field
from heapq import heappush, heappop
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
    Frontier-DP with:
    - top-K states per frontier bucket
    - candidate pre-ranking
    - bucket deduplication
    - diversity pruning
    - randomized final selection
    """

    def __init__(
        self,
        beam_width: int = 100,
        max_steps: int = 300,
        frontier_bucket_size: float = 0.10,
        final_window: float = 10.0,
        candidate_limit_per_state: int = 80,
        request_anchor_limit: int = 5,
        randomize_final: bool = True,
        final_top_k: int = 20,
        final_temperature: float = 0.35,
        search_noise: float = 0.0,
        random_seed: int | None = None,
    ):
        self.beam_width = beam_width
        self.max_steps = max_steps
        self.frontier_bucket_size = frontier_bucket_size
        self.final_window = final_window

        self.candidate_limit_per_state = candidate_limit_per_state
        self.request_anchor_limit = request_anchor_limit

        self.randomize_final = randomize_final
        self.final_top_k = final_top_k
        self.final_temperature = final_temperature

        # if > 0, ranking/pruning uses a small Gumbel noise
        # this makes repeated runs explore different paths
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

        dp: dict[float, list[BeamState]] = {}
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

            current_states = dp.get(bucket, [])
            if not current_states:
                processed_buckets += 1
                continue

            # prune before expansion
            current_states = self._prune_bucket_states(current_states, query, limit=self.beam_width)
            dp[bucket] = current_states

            idx = 0
            while idx < len(current_states):
                state = current_states[idx]
                idx += 1

                if query.length is not None and state.frontier_end > query.length + self.final_window:
                    continue

                candidates = self._candidate_extensions(state, query, tracks)
                if not candidates:
                    continue

                # rank + limit candidates before expensive full expansion
                candidates = self._rank_candidates(state, candidates, query)
                if self.candidate_limit_per_state > 0:
                    candidates = candidates[: self.candidate_limit_per_state]

                for candidate in candidates:
                    new_state = self._extend_state(state, candidate, query)

                    if query.length is not None and new_state.frontier_end > query.length + self.final_window:
                        continue

                    self._push_state(
                        dp=dp,
                        bucket_heap=bucket_heap,
                        bucket_in_heap=bucket_in_heap,
                        state=new_state,
                        current_bucket=bucket,
                        query=query,
                    )

                # if same-bucket insertions exploded, trim a little mid-pass
                if len(current_states) > self.beam_width * 4:
                    current_states = self._prune_bucket_states(
                        current_states,
                        query,
                        limit=self.beam_width * 2,
                    )
                    dp[bucket] = current_states
                    idx = min(idx, len(current_states))

            # final prune for this bucket
            dp[bucket] = self._prune_bucket_states(dp.get(bucket, []), query, limit=self.beam_width)

            processed_buckets += 1

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

    def _frontier_bucket(self, t: float) -> float:
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
        query: Query,
    ) -> None:
        bucket = self._frontier_bucket(state.frontier_end)
        states = dp.setdefault(bucket, [])
        states.append(state)

        # same-bucket states are processed immediately in current loop
        if bucket == current_bucket:
            return

        # future buckets: prune early
        if len(states) > self.beam_width * 2:
            dp[bucket] = self._prune_bucket_states(states, query, limit=self.beam_width)
            states = dp[bucket]

        if bucket not in bucket_in_heap:
            heappush(bucket_heap, bucket)
            bucket_in_heap.add(bucket)

    def _collect_final_states(self, dp: dict[float, list[BeamState]], query: Query) -> list[BeamState]:
        final_states: list[BeamState] = []

        if query.length is None:
            for states in dp.values():
                final_states.extend(states)
            return final_states

        lo = query.length - self.final_window
        hi = query.length + self.final_window

        for states in dp.values():
            for state in states:
                if lo <= state.frontier_end <= hi:
                    final_states.append(state)

        # if window is empty, fall back to globally best reachable states
        if not final_states:
            for states in dp.values():
                final_states.extend(states)

        return final_states

    def _choose_final_state(self, final_states: list[BeamState], query: Query) -> BeamState:
        scored = [(state, score_alignment_final(state.alignment, query)) for state in final_states]
        scored.sort(key=lambda x: x[1], reverse=True)

        if not scored:
            return final_states[0]

        pool = scored[: max(1, self.final_top_k)]

        if not self.randomize_final or len(pool) == 1:
            return pool[0][0]

        temp = max(1e-6, float(self.final_temperature))
        max_score = max(score for _, score in pool)

        weights = []
        for _, s in pool:
            w = math.exp((s - max_score) / temp)
            weights.append(w)

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

    def _prune_bucket_states(
        self,
        states: list[BeamState],
        query: Query,
        limit: int,
    ) -> list[BeamState]:
        if len(states) <= limit:
            return self._dedupe_states(states)

        states = self._dedupe_states(states)
        if len(states) <= limit:
            return states

        # sort by noisy ranking score for exploration, but keep true score unchanged
        ranked = sorted(states, key=lambda s: self._ranking_score(s), reverse=True)

        # diversity step:
        # first keep some states with different last tracks
        diverse_target = max(1, limit // 3)
        selected: list[BeamState] = []
        selected_ids: set[int] = set()
        seen_last_track: set[int | None] = set()

        for s in ranked:
            last_tid = self._last_track_id(s)
            if last_tid not in seen_last_track:
                selected.append(s)
                selected_ids.add(id(s))
                seen_last_track.add(last_tid)
                if len(selected) >= diverse_target:
                    break

        # then fill remaining slots by best ranking
        for s in ranked:
            if id(s) in selected_ids:
                continue
            selected.append(s)
            if len(selected) >= limit:
                break

        # final stable sort by true score
        selected.sort(key=lambda s: s.score, reverse=True)
        return selected[:limit]

    def _dedupe_states(self, states: list[BeamState]) -> list[BeamState]:
        best_by_sig: dict[tuple, BeamState] = {}

        for s in states:
            sig = self._state_signature(s)
            prev = best_by_sig.get(sig)
            if prev is None or s.score > prev.score:
                best_by_sig[sig] = s

        return list(best_by_sig.values())

    def _state_signature(self, state: BeamState) -> tuple:
        # exact enough to remove obvious duplicates without merging too aggressively
        path = []
        for t in state.alignment.tracks:
            tid = t.track_id if t.track_id is not None else -1
            st = round(float(t.start_time or 0.0), 2)
            sp = round(float(t.speed or 1.0), 3)
            path.append((tid, st, sp))
        return tuple(path)

    def _last_track_id(self, state: BeamState) -> int | None:
        if not state.alignment.tracks:
            return None
        t = state.alignment.tracks[-1]
        return t.track_id if t.track_id is not None else id(t)

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
        """
        Returns candidate placements:
            (track, start_time, speed)

        Strategy:
        1) anchor to strong nearby requests
        2) add sequential fallback
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
        ranked = sorted(
            candidates,
            key=lambda c: self._candidate_priority(state, c, query),
            reverse=True,
        )

        # optional extra randomness in search:
        # instead of always taking exactly same top-N, sample from a larger promising pool
        if self.search_noise > 0 and self.candidate_limit_per_state > 0 and len(ranked) > self.candidate_limit_per_state:
            pool_size = min(len(ranked), self.candidate_limit_per_state * 3)
            pool = ranked[:pool_size]
            pool.sort(
                key=lambda c: self._candidate_priority(state, c, query) + self.search_noise * self._gumbel(),
                reverse=True,
            )
            return pool

        return ranked

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

        # prefer stronger/preferred tracks a bit
        score += 0.5 * math.log(max(1e-6, preference))

        # prefer candidates near frontier
        score -= 0.04 * abs(start_time - frontier)

        # prefer not leaving too much unused gap
        if start_time > frontier:
            score -= 0.08 * (start_time - frontier)

        # prefer ending near query end if known
        if query.length is not None:
            remaining = query.length - frontier
            cand_dur = max(0.0, end_time - frontier)
            score -= 0.01 * abs(cand_dur - max(0.0, remaining))

            # small reward for ending inside final window
            if query.length - self.final_window <= end_time <= query.length + self.final_window:
                score += 0.5

        # reward drop matches
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
        return [0.0, -tol, tol, -tol / 2, tol / 2, -tol / 4, tol / 4]

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
