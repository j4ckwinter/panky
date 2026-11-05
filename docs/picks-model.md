# Picks statistical baseline

`poisson-venue-shrink10-v1` estimates home/draw/away probabilities from completed match scores. It runs locally in TypeScript; Ollama explains its output but does not calculate or alter the numbers. It is an experimental baseline, not evidence of a dependable forecasting advantage.

## Reproduce the evaluation

First create the audited source snapshot described in [the data audit](picks-data-audit.md). Then run:

```sh
pnpm evaluate:picks-model
```

Defaults: `--source data/picks/source.json --season 2025-26 --output data/picks/evaluation.json`. The command validates the bounded source snapshot, evaluates Premier League matches and writes its full report atomically. The generated files remain outside Git. No database, live provider, AI model or external API is used by this command.

The report contains the source revision/retrieval time, model version, aggregate probability scores, per-outcome reliability bins and every evaluated match's original probabilities, outcome, training count and latest included match date. It does not overwrite the source snapshot.

## Fixed model

Training uses completed matches in the same competition, within the current July–June season and its predecessor, strictly before the earlier of the forecast cutoff date and fixture date. Same-day matches are always excluded. A forecast requires at least 100 eligible results. Missing scores are never treated as draws.

League home and away goals per match use one prior match with one goal per side. Each team's scoring and conceding rate at the relevant venue is shrunk toward its league rate with ten prior matches. The home goal estimate multiplies the home team's shrunk home scoring rate by the away team's shrunk away conceding rate, divided by the league home rate. The away estimate uses the corresponding away scoring/home conceding rates and league away rate. An unseen or promoted club therefore starts at league rates; the output reports both teams' venue-specific sample counts.

Expected goals are bounded to 0.2–4 per side. They are model goal estimates from final scores, **not** shot-based xG. Independent Poisson goal counts from zero through twelve produce outcome probabilities. The tiny omitted tail is removed by normalizing the retained probability mass. This independence assumption does not model low-score correlation, injuries, lineups or tactical changes.

All parameters and the model version were fixed before inspecting evaluation results. They were not selected by searching the evaluated season. Any subsequent tuning requires a separate later holdout period.

## Evaluation design and observed results

Run on 5 November 2026 using OpenFootball revision `e6744429ee395bc86f247348c6184bb08d4eb361`, snapshot retrieved at `2026-11-05T17:30:52.486Z`.

The 2024–25 Premier League season supplies the warmup history. Every 2025–26 regular-season match is then predicted chronologically, adding only results from earlier calendar dates. The target must contain all 380 ordered pairings among twenty clubs, each exactly once, with known scores; a partial season is rejected. The generic evaluation helper also recognizes the 552-match, 24-club lower-division format, but no lower-division evaluation was used for these results.

The comparator uses the eligible history's home/draw/away frequencies with one prior observation per outcome. It has the same date cutoff and training window as the goals model. Neither method uses bookmaker data.

| Measure                                                           | Goals model | Frequency baseline |
| ----------------------------------------------------------------- | ----------: | -----------------: |
| Evaluated matches                                                 |         380 |                380 |
| Multiclass Brier score, sum over three outcomes (lower is better) |    0.625567 |           0.656236 |
| Natural-log loss (lower is better)                                |    1.041097 |           1.083854 |
| Most-likely-outcome accuracy                                      |      46.05% |             42.63% |

These are observations on one retrospective season, not uncertainty intervals or a claim of statistical significance. Reliability bins in the full JSON report show mean predicted probability and observed frequency separately for each outcome, with sample counts; empty bins remain null. Accuracy uses a fixed home/draw/away tie order. Brier score ranges from zero to two; log loss penalizes confidently wrong forecasts.

The historical files were downloaded after the matches. They lack original publication timestamps and may contain later corrections. Strict date filtering prevents future match results from entering a forecast, but does not prove historical point-in-time data availability. These measurements must never be mixed with the performance of predictions actually saved before kickoff.

## Live publication remains held

The current audited feed's latest result is 20 September 2026. This model evaluation does not establish current-data freshness. The live catalogue must enforce its own source freshness and coverage checks before producing upcoming predictions. Source date-only values also cannot establish an exact kickoff instant; no kickoff timezone is invented here.
