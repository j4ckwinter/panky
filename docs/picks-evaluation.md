# Picks local-model evaluation

Run this on the Windows PC with Ollama running and the evaluated local model installed. It starts a temporary loopback backend with in-memory storage and synthetic match evidence. It does not read the production environment file, use personal sources, select ChatGPT, or create records in the live database. Keep the normal Panky backend idle during the check so another process does not compete for Ollama.

From the repository root in PowerShell:

```powershell
pnpm install --frozen-lockfile
pnpm evaluate:picks
pnpm evaluate:picks --run > picks-evaluation.json
```

The first invocation prints help only. `--run` opts into three sequential checks: an explanation, a follow-up on the same match, and cancellation after partial output has been saved. Each generation has a two-minute deadline. Cancellation must preserve the partial answer as interrupted and release the shared execution slot. Requests are never resubmitted automatically. A reply that completes before partial output can be observed makes cancellation inconclusive and gives a nonzero exit code.

The default model is `panky-qwen3:4b` with a 4096-token context and an 8000-character input budget. To test another explicitly selected local model:

```powershell
pnpm evaluate:picks --run --model panky-qwen3:4b --endpoint http://127.0.0.1:11434 > picks-evaluation.json
```

Only loopback HTTP origins are accepted. Keep Ollama bound to loopback; do not expose its port to run this evaluation remotely.

The JSON report includes fixture evidence, complete saved answers, statuses, wall-clock request durations and configuration. Timings are individual observations, including any cold model load, not a benchmark. Output is only written to the redirected file; the evaluation database is discarded on exit. A nonzero exit code means an execution check failed or could not be established. `automaticChecksPassed` does **not** establish answer quality or prediction quality.

Review both answers against the report's evidence:

- The answer identifies the sample values as illustrative and does not imply a trained model or live fixtures.
- Team names, probabilities and scoring figures agree with the supplied data.
- Missing injuries and team news remain unknown; no current news, statistics or sources are invented.
- The follow-up correctly uses the preceding explanation and preserves uncertainty.
- The answer is understandable and the observed wait is acceptable for the Picks page.

Record the model, report, your quality verdict and any unsupported claims before accepting the real-model milestone. Repeat deliberately after changing prompts or models, retaining separate reports for comparison.

Status: the harness is implemented; a real Windows Ollama run and human quality review remain pending. Automated backend/browser checks with synthetic providers are separate evidence and do not satisfy this live check.
