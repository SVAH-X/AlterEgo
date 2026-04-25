"""Reality seed — pull live news and macro context relevant to the user.

Sources: GDELT (free, no key), curated RSS, country/industry context.
Output: structured world snapshot with source labels preserved.
"""

from app.models import IntakeProfile


async def build_reality_seed(profile: IntakeProfile) -> dict:
    """TODO:
    - GDELT query filtered by industry + country + life-stage keywords
    - macro signals: layoffs, inflation, AI disruption, climate, policy shifts
    - return structured snapshot with source labels
    """
    raise NotImplementedError
