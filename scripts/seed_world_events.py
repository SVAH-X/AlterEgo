"""Seed a starter scenario library into MongoDB Atlas.

The political-science teammate maintains the canonical set; this script
just loads them into Mongo for the event planner to sample from.

Run:
    cd backend && uv run python ../scripts/seed_world_events.py
"""

# TODO: define starter scenarios (macro / industry / social / personal)
#       with realistic probabilities and source rationale.
# TODO: connect to Mongo and upsert into a `scenarios` collection.

if __name__ == "__main__":
    raise SystemExit("seed_world_events: not implemented yet")
