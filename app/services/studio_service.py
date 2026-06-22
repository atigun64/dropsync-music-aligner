from typing import List
from pathlib import Path

from app.services.track_service import TrackService
from app.storage import STUDIO_STORE
from app.storage.studio_store import StudioStore

from app.models import (
    AlignmentSpec,
    QuerySpec,
    StudioSession,
)

from app.services.run_optimization import run_optimizer as compile_alignment
from app.services.audio_service import ensure_studio_audio_for_alignment
from app.services.exceptions import StudioNotFound, AlignmentNotFound

class StudioService:
    """
    Service for managing the music production studio, including tracks, annotations, and project state.
    """
    def __init__(self, studio_store: StudioStore = STUDIO_STORE):
        self.studio_store = studio_store
    
    def create_studio(self) -> str:
        """
        Create a new studio session and return its ID.
        """
        return self.studio_store.create_studio()
    
    def list_studio_ids(self) -> List[str]:
        """
        Get a list of all existing studio session IDs.
        """
        return self.studio_store.list_studio_ids()

    def get_studio_session(self, studio_id: str) -> StudioSession:
        """
        Load the full studio session, including meta, query, and alignment.
        """
        try:
            return self.studio_store.load_session(studio_id)
        except FileNotFoundError:
            raise StudioNotFound()
    
    def save_studio_session(self, session: StudioSession) -> None:
        """
        Save the full studio session, including meta, query, and alignment.
        """
        self.studio_store.save_session(session)

    def load_query(self, studio_id: str) -> QuerySpec:
        """
        Load the query spec for a studio session.
        """
        session = self.studio_store.load_session(studio_id)
        if session.query is None:
            raise ValueError("Query not found for this studio session.")
        return session.query
    
    def save_query(self, studio_id: str, query: QuerySpec) -> None:
        """
        Save the query spec for a studio session.
        """
        self.studio_store.save_query(studio_id, query)
    
    def load_alignment(self, studio_id: str) -> AlignmentSpec:
        """
        Load the alignment spec for a studio session.
        """
        session = self.studio_store.load_session(studio_id)
        if session.alignment is None:
            raise AlignmentNotFound()
        return session.alignment
    
    def save_alignment(self, studio_id: str, alignment: AlignmentSpec) -> None:
        """
        Save the alignment spec for a studio session.
        """
        self.studio_store.save_alignment(studio_id, alignment)

    def render_audio_for_studio(self, studio_id: str) -> Path:
        """Ensure audio exists for the studio alignment and return path."""
        alignment = self.load_alignment(studio_id)
        return ensure_studio_audio_for_alignment(alignment, studio_id)

    def update_video_path(self, studio_id: str, video_path: str) -> None:
        session = self.studio_store.load_session(studio_id)
        session.meta.video_path = video_path
        session.meta.source = "video"
        self.studio_store.save_meta(studio_id, session.meta)

    def update_metadata(self, studio_id: str, meta) -> None:
        session = self.studio_store.load_session(studio_id)
        session.meta.source = meta.source
        session.meta.video_path = meta.video_path
        session.meta.notes = meta.notes
        self.studio_store.save_meta(studio_id, session.meta)

    def run_optimizer(self, studio_id: str) -> AlignmentSpec:
        """
        Run the optimizer for the given studio session and save the alignment result.
        """
        session = self.studio_store.load_session(studio_id)
        if session.query is None:
            raise ValueError("Cannot run optimizer: query is not set for this studio session.")
        alignment = compile_alignment(session.query, track_service=TrackService())
        session.alignment = alignment
        self.studio_store.save_session(session)
        return alignment
    
    def delete_studio(self, studio_id: str) -> None:
        self.studio_store.delete_studio(studio_id)

