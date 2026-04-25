from enum import Enum


class Tier(str, Enum):
    """Agent tier — drives which model the router picks.

    FUTURE_SELF: the simulated future self (interview crown jewel)
    HIGH_SIGNAL: manager, close friend, family — high-impact relationships
    PEERS:       colleagues, industry voices — moderate impact
    NOISE:       throwaway / misinformation accounts — low signal, high volume
    """

    FUTURE_SELF = "future_self"
    HIGH_SIGNAL = "high_signal"
    PEERS = "peers"
    NOISE = "noise"
