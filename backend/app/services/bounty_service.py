from __future__ import annotations

from pydantic import BaseModel


class RubricCriterion(BaseModel):
    criterion: str
    max_points: int


def validate_bounty(data: dict) -> None:
    """Validate bounty payload. Raises ValueError on any violation."""
    rubric = data.get("rubric", [])
    if not rubric:
        raise ValueError("Rubric must have at least one criterion")

    total = sum(
        (c["max_points"] if isinstance(c, dict) else c.max_points)
        for c in rubric
    )
    if total <= 0:
        raise ValueError("Rubric total max points must be positive")

    start = data.get("start_date")
    end = data.get("end_date")
    if start and end and end <= start:
        raise ValueError("end_date must be after start_date")

    tags = data.get("tags", [])
    if any(not str(t).strip() for t in tags):
        raise ValueError("Tags must be non-empty strings")

    submission_formats = data.get("submission_formats", [])
    if not submission_formats:
        raise ValueError("At least one submission format required")
