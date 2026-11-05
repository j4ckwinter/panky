# Picks data feasibility

Audited 5 November 2026. The first statistical model should use Premier League history only. Current-weekend publication must remain on hold: the audited current-season source's latest result is 20 September 2026, 46 days before this audit. Having upcoming fixtures does not establish fresh supporting results.

## Source decision

[OpenFootball's JSON repository](https://github.com/openfootball/football.json) publishes its data under [CC0-1.0](https://github.com/openfootball/football.json/blob/master/LICENSE.md). It supplies dates, team names and results without an API key. It has no guaranteed update schedule or stable provider match IDs. This audit derives a stable match ID from competition, season and ordered team names; a date change preserves that ID. Team renames would require explicit mapping in a future importer.

The earlier Football-Data.co.uk candidate is excluded: its [current usage statement](https://football-data.co.uk/data.php) restricts the free data to private individuals and excludes commercial or automated AI/data-training products. We did not ingest its CSV data.

[API-Football](https://www.api-football.com/pricing) advertises 100 daily requests on its free plan with season restrictions. [football-data.org](https://www.football-data.org/pricing) advertises 12 free competitions with delayed scores/schedules. Both require an account/key; their actual current four-division coverage and applicable reuse terms have not been verified in this audit. Neither integration or subscription was created.

## Reproduce

From the repository root:

```sh
pnpm audit:picks --revision e6744429ee395bc86f247348c6184bb08d4eb361 --as-of 2026-11-05
```

Without arguments, the command resolves the current OpenFootball commit and audits the current July–June season plus the preceding two seasons. `--revision` pins all downloaded files to one immutable commit. `--as-of` controls the whole-day score cutoff and season selection; it does not claim the downloaded data was available on that historical date. `--output` selects a directory; the default is ignored `data/picks`.

The command writes `report.json` and, when the accepted sources are usable, `source.json`. Neither file belongs in Git. Requests use fixed GitHub hosts, reject redirects, have 20-second deadlines and 2 MiB response limits, and are not retried. The source file is replaced atomically. Any transient request failure or a completely empty dataset exits nonzero and preserves an existing source snapshot; the new report still records the problem. Explicitly missing or rejected files are reported and omitted without preventing usable historical files from being retained.

The normalizer accepts the source's `[home, away]` and `{ft: [home, away]}` full-time score shapes. Unknown scores remain null. It rejects the entire file if any row has invalid calendar/season dates, malformed scores, a self-match or duplicate regular-season home/away pairing. A scored match on or after the audit day is excluded conservatively by rejecting its file. Explicit playoff/finals rounds are counted and excluded. The file's competition and season name must match its expected identity. A saved snapshot is revalidated for source metadata, match identity, dates and coverage consistency.

## Observed coverage

Revision: `e6744429ee395bc86f247348c6184bb08d4eb361`. Counts refer to regular-season fixtures after explicit playoff exclusion. “Past unknown” means a fixture dated before the audit day with no full-time result; these are not treated as draws.

| Season | Competition | Accepted fixtures | Results | Future fixtures | Past unknown | Outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 2024–25 | Premier League | 380 | 380 | 0 | 0 | Accepted |
| 2024–25 | Championship | 552 | 552 | 0 | 0 | Accepted; 5 playoff matches excluded |
| 2024–25 | League One | 552 | 552 | 0 | 0 | Accepted |
| 2024–25 | League Two | 552 | 552 | 0 | 0 | Accepted |
| 2025–26 | Premier League | 380 | 380 | 0 | 0 | Accepted |
| 2025–26 | Championship | 552 | 552 | 0 | 0 | Accepted; 5 playoff matches excluded |
| 2025–26 | League One | 0 | 0 | 0 | 0 | Entire 552-row file rejected: 276 records outside season |
| 2025–26 | League Two | 0 | 0 | 0 | 0 | Entire 564-row file rejected: 12 duplicate pairings |
| 2026–27 | Premier League | 380 | 50 | 290 | 40 | Accepted, stale results; latest completed date 20 September |
| 2026–27 | Championship | 552 | 95 | 384 | 73 | Accepted, stale results; latest completed date 20 September |
| 2026–27 | League One | 0 | 0 | 0 | 0 | Source file missing (HTTP 404) |
| 2026–27 | League Two | 0 | 0 | 0 | 0 | Source file missing (HTTP 404) |

The current Premier League file includes Arsenal FC–Hull City AFC on 7 November, and the Championship file includes Derby County FC–Bolton Wanderers FC on 6 November. These are examples of source records, not independently confirmed fixture schedules.

## What the first model can support

The two completed Premier League seasons provide 760 dated match results for chronological development and evaluation. Goals and home/away identity can support a simple team-strength baseline. No shots, xG, injuries, player availability or live news are supplied by this importer. Odds remain outside the requested scope.

Dates are retained as date-only values because the source's kickoff timezone has not been verified. Historical files were retrieved now and lack result-publication timestamps. Evaluation can prevent using later match dates, but cannot prove the records were available at a historical prediction timestamp or free from later corrections. Treat retrospective measurements as baseline evaluation, not prospective performance. A later result history must distinguish genuinely saved prematch predictions from retrospective calculations.

Before publishing predictions for upcoming matches, establish a fresh, complete-enough current feed and record the source freshness check. Missing divisions should remain explicitly unavailable. Do not replace missing data with sample fixtures or invent result values.
