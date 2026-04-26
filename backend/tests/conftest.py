import pytest

from app.services.orchestrator import _reset_portrait_sem_for_tests


@pytest.fixture(autouse=True)
def _reset_portrait_sem_between_tests():
    """Reset the orchestrator's lazy portrait semaphore so each test binds it
    to that test's fresh asyncio event loop."""
    _reset_portrait_sem_for_tests()
    yield
    _reset_portrait_sem_for_tests()
