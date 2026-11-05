# Running Picks with football data

Picks has two explicit modes. With no `PICKS_DATA_PATH`, it remains a labelled sample preview. With a configured path, it reads a validated OpenFootball snapshot and records experimental Premier League predictions in the backend database. A missing, invalid or stale configured source never falls back to samples. Other competitions remain unavailable in this real-data slice.

## Prepare the source and model report

From the repository root:

```sh
pnpm audit:picks
pnpm evaluate:picks-model
```

The audit writes ignored `data/picks/source.json` and `report.json`; the model command writes `evaluation.json`. See [data coverage](picks-data-audit.md) and [model evaluation](picks-model.md). The report may describe a failed download while the source file retains its previous usable version. The backend reads `source.json`.

The audited feed on 5 November 2026 has results only through 20 September. **It currently holds new predictions.** Successful downloading or a passing historical backtest does not establish a current feed. A later upstream snapshot must pass the same freshness and coverage checks before real upcoming forecasts appear.

## Enable in development on Windows

Keep the development database and ports separate from production, as described in the README. With Ollama running on loopback and the existing development authentication configured, set the source path in PowerShell:

```powershell
$env:PICKS_DATA_PATH = (Resolve-Path .\data\picks\source.json).Path
pnpm dev
```

The absolute path avoids differences between the workspace root and the backend working directory. For a persistent configuration, put `PICKS_DATA_PATH` in the backend's development environment file. `MODEL_PROVIDER=ollama` and the configured local model control explanations; the statistical predictions themselves run in TypeScript and require no LLM or paid API.

Open Picks. The owner can use **Refresh predictions** after running a new audit. This explicitly reloads the local source file; it does not download data, retry failed submissions or change the model provider. There is no background download scheduler. Other accounts can read predictions and ask their own private follow-up questions but cannot refresh the shared catalogue.

## Publication checks

New predictions require a source audited on the current UTC day and retrieved within 48 hours, a complete current Premier League regular-season calendar, no unknown results on earlier dates, and a completed result within the previous 14 days. Postponements cannot be distinguished from missing results in this source, so an unresolved earlier fixture holds publication. All these restrictions are deliberate and visible in the page's status.

Only fixtures within the next fourteen days are considered. The source supplies an unverified date-only schedule, so forecasts must be recorded before the start of the preceding UTC day. No exact kickoff time is invented. At least 100 earlier completed matches are required; the model excludes same-day and later results. Unknown teams use league priors, with that limitation in their evidence.

Each match/model version receives one immutable prediction. It stores the original probabilities, goal estimates, training counts and cutoff, source revision/retrieval time and recording time. Refreshing cannot overwrite it. Expired forecasts leave the upcoming list; their original records and account-scoped explanations remain stored. A source failure retains those records and displays a hold/error state.

## Record results

After a new audit, use **Refresh predictions** to reconcile full-time scores for matches that already have saved forecasts. **Results history** includes every recorded prediction: upcoming matches, matches awaiting a result, correct and incorrect most-likely outcomes, and any records excluded from scoring. No predictions are manufactured for already-played matches.

Corrections append a new result revision while preserving the original forecast. Re-importing the same score does not create duplicate revisions, and an older source snapshot cannot roll back a newer result. A missing score does not erase the last recorded result; this feed cannot distinguish cancellations or withdrawn results from missing data.

Performance is grouped by model version and includes only genuinely prematch records. If a changed match date places the result before the forecast's conservative publication deadline, the record remains visible with an exclusion reason but does not contribute to scores. Pending and excluded counts remain visible. With no scored matches, accuracy and probability-error measures are unavailable rather than zero.

These are recorded-prediction results. The 380-match retrospective evaluation in `evaluation.json` is a separate measurement and is never included in this history. The initial stale source therefore produces neither new real forecasts nor a fabricated performance record.

## Verification

```sh
pnpm check
pnpm build
pnpm test:e2e tests/picks.spec.ts
pnpm test:picks-real
```

The real-data browser harness uses generated football records, a temporary source file and an in-memory database. It does not write to the live backend. Real Ollama execution and answer quality must be checked separately on Windows with the [isolated evaluation command](picks-evaluation.md).
