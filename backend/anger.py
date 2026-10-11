"""The duck's mood scale: 1 (satisfied) to 5 (furious). The voice for each level lives in the persona.

The model picks the level; this module gives it hard numbers (progress) and keeps the
result sane (clamp). `req` is a payloads.DuckRequest.
"""


def allowed(req) -> tuple[int, int]:
    """5 to start, then at most one step from the previous level."""
    if req.anger is None:
        return 5, 5
    return max(1, req.anger - 1), min(5, req.anger + 1)


def progress(req) -> dict:
    def count(how):
        return sum(c.resolved and c.resolution == how for c in req.comments)

    low, high = allowed(req)
    return {
        "round": sum(t.role != "user" for t in req.history) + 1,  # one duck turn per round
        "previous_anger": req.anger,
        "anger_range": f"{low}-{high}",
        "kept": count("kept"),
        "edited": count("edited"),
        "addressed": count("addressed"),
        "reasoned": sum(c.resolved and c.resolution == "kept" and bool(c.reason) for c in req.comments),
        "open": sum(not c.resolved for c in req.comments),
        "made_changes": req.made_changes,
    }


def clamp(new, req) -> int:
    """Backstop: the model is told the allowed range, this enforces it."""
    low, high = allowed(req)
    try:
        return max(low, min(high, int(new)))
    except (TypeError, ValueError):
        return req.anger or 5
