from app.models import (
    AlignmentSpec,
    AlignmentTrack,
    AnnotationPoint,
    QuerySpec,
)
from app.schemas import (
    AnnotationPointCreateSchema,
    QuerySpecCreateSchema,
    AlignmentSpecSchema,
)


def annotation_create_to_model(a: AnnotationPointCreateSchema) -> AnnotationPoint:
    return AnnotationPoint(
        label=a.label,
        time_seconds=a.time_seconds,
        strength=a.strength,
    )


def query_create_to_model(q: QuerySpecCreateSchema) -> QuerySpec:
    return QuerySpec(
        length_seconds=q.length_seconds,
        signature=q.signature,
        requested_points=[annotation_create_to_model(p) for p in q.requested_points],
    )


def alignment_to_model(al: AlignmentSpecSchema) -> AlignmentSpec:
    return AlignmentSpec(
        score=al.score,
        tracks=[
            AlignmentTrack(
                track_id=t.track_id,
                start_time_seconds=t.start_time_seconds,
                speed=t.speed,
                placed_points=[
                    AnnotationPoint(
                        label=p.label,
                        time_seconds=p.time_seconds,
                        strength=p.strength,
                    )
                    for p in t.placed_points
                ],
            )
            for t in al.tracks
        ],
    )
