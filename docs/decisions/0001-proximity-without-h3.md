# 1. Proximity by pre-computed adjacency, not H3

**Status:** accepted
**Date:** 2026-09-10

## Context

Finding "doctors near me" needs some notion of proximity. Three approaches were
on the table:

1. **Runtime geospatial queries** — PostGIS `ST_DWithin` against clinic
   coordinates on every search.
2. **H3 hexagonal indexing** — resolve every clinic to a 64-bit cell id at
   registration, then match on cell equality and k-ring neighbours.
3. **Pre-computed locality adjacency** — a table of which localities neighbour
   which, built offline, joined at request time.

A proposal argued for (2) on the grounds that it would eliminate "massive
monthly API bills to Google Maps / MapmyIndia" and cut infrastructure cost by
99%.

## Decision

Keep (3). Revisit H3 when the trigger below fires.

## Why the cost argument does not apply

CareNest makes **zero** map API calls. There is no geocoding on the request
path, no tile service, no directions API. Coordinates are used exactly once —
by `scripts/seed.mjs`, offline, to compute the adjacency graph — and never read
again at runtime. There is no bill to cut by 99%.

`ST_DWithin` is also not an API call. It is local computation inside Postgres.
Treating PostGIS and a paid map service as the same line item is a category
error, and the cost case rests on it.

## Why adjacency wins today

**Hexagons do not respect geography.** Two localities 1 km apart across a creek
with no bridge are neighbours in H3 and forty minutes apart in life. Navi
Mumbai has plenty of these: a cell boundary knows nothing about a railway line,
a creek, or which side of the highway a bus actually stops on.

**A human can correct a table.** `locality_adjacency` holds `ring` and
`distance_km` columns that someone who knows the area can edit when the graph
is wrong. There is no equivalent for a cell id — H3 is a function of latitude
and longitude, and disagreeing with it means adding a correction layer on top,
which is the table we already have.

**H3 does not remove the lookup it is supposed to replace.** Patients type PIN
codes. A PIN code still has to be resolved to a coordinate before it can become
a cell id, and that resolution is the `localities` table — so H3 adds a layer
rather than removing one.

**Cell equality is the wrong query.** `WHERE clinic_h3 = user_h3` misses a
clinic 200 m away in the adjacent hexagon. At resolution 8 (~1 km across) most
searches would return nothing. The correct query is a k-ring, which is a set
membership test against several cell ids — the same shape and roughly the same
cost as the indexed join already running.

## What H3 would genuinely buy

Not nothing. It is the right answer under different conditions:

- **Arbitrary coordinates.** Adjacency must be pre-computed per pair. That is
  fine for a curated list of localities and does not scale to clinics
  registering anywhere in India with a dropped pin.
- **No precompute step.** A new clinic gets a cell id from its coordinates
  instantly; adjacency needs the offline job re-run.
- **Free multi-resolution.** "Within this neighbourhood" and "within this city"
  are the same index at different resolutions.

## Revisit when

Any of:

- clinics self-register at arbitrary coordinates rather than being seeded into
  a known locality;
- the locality registry passes roughly 10,000 rows, where re-running the
  pairwise adjacency job stops being cheap;
- searches need a radius the ring model cannot express, such as "within 2 km"
  as a user-chosen slider rather than a fixed ring.

At that point H3 replaces `locality_adjacency` — it is a substitution, not an
addition, and both cannot be the source of truth for proximity.

## Consequences

- Coverage is limited to seeded localities. An unknown PIN code falls back to
  the "not in our registry" path rather than resolving geometrically.
- The adjacency job must be re-run when localities are added.
- Distances shown are straight-line centroid to centroid, and the UI says so
  rather than implying travel time.
