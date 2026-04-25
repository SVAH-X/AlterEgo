"""Real-news ingestion — turn GDELT / curated feeds into OASIS posts.

Filters by relevance to the user's profile (industry, country, life stage)
and injects content as posts onto the simulated platform.
"""


async def fetch_relevant_news(profile: dict, window_days: int = 30) -> list[dict]:
    """TODO: GDELT GKG / events query → list of news items with source labels."""
    raise NotImplementedError


def news_to_posts(news_items: list[dict], poster_agent_ids: list[str]) -> list[dict]:
    """TODO: format news items as posts attributed to industry/media agents."""
    raise NotImplementedError
