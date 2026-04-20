from typing import List, Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
import re

class EventAction(str, Enum):
    READ = "READ"
    WRITE = "WRITE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    ACCESS = "ACCESS"
    UPDATE = "UPDATE"
    SYSTEM = "SYSTEM"

class LogEvent(BaseModel):
    """
    Represents a single raw audit log or network event.
    """
    event_id: str = Field(..., min_length=4, pattern=r"^[a-zA-Z0-9_\-]+$")
    timestamp: datetime
    source_entity: str = Field(..., min_length=1, pattern=r"^[a-zA-Z0-9\._\-]+$")
    destination_entity: str = Field(..., min_length=1, pattern=r"^[a-zA-Z0-9\._\-]+$")
    action: EventAction
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("source_entity", "destination_entity")
    @classmethod
    def validate_entities(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Entity ID cannot be empty or whitespace")
        return v

class EventBatch(BaseModel):
    """
    A batch of events to be processed.
    """
    events: List[LogEvent]

class ScoredEvent(BaseModel):
    """
    The result of the anomaly detection for a specific event/edge.
    """
    event_id: str
    anomaly_score: float  # 0.0 to 1.0
    is_anomaly: bool
    importance_score: Optional[float] = None  # Learned weight from GSL/Attention
    explanation: Optional[str] = None
    contributing_factors: Optional[Dict[str, float]] = Field(default_factory=dict)

class ScoreResponse(BaseModel):
    """
    Response containing scores for the submitted batch.
    """
    results: List[ScoredEvent]
    processed_at: datetime
