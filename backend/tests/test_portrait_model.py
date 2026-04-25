from app.models import AgedPortrait, SimulationData, Profile, Checkpoint


def test_aged_portrait_validates() -> None:
    p = AgedPortrait(
        age=52, year=2046, trajectory="high",
        imageUrl="data:image/png;base64,AAAA",
    )
    assert p.trajectory == "high"
    assert p.imageUrl is not None


def test_aged_portrait_allows_null_image_url() -> None:
    p = AgedPortrait(age=52, year=2046, trajectory="low", imageUrl=None)
    assert p.imageUrl is None


def test_simulation_data_accepts_aged_portraits() -> None:
    profile = Profile(
        name="x", age=32, occupation="x", workHours=40,
        topGoal="x", topFear="x", targetYear=2046, presentYear=2026,
    )
    cp = Checkpoint(year=2030, age=36, title="t", event="e", did="d", consequence="c")
    sim = SimulationData(
        profile=profile,
        agedPortraits=[
            AgedPortrait(age=32, year=2026, trajectory="high", imageUrl=None),
        ],
        checkpointsHigh=[cp],
        checkpointsLow=[cp],
        futureSelfOpening="hi",
        futureSelfReplies={"a": "b"},
    )
    assert len(sim.agedPortraits) == 1
    assert "ages" not in sim.model_fields
