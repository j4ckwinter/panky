# IA-1 interview evaluation

This evaluates typed questions through Panky's authenticated HTTP backend and local Ollama provider. It uses an ephemeral port and an in-memory database; it does not load the server `.env`, touch live conversations, download models or use a cloud fallback.

The 24 cases in [interview-cases.ts](../scripts/interview-cases.ts) cover behavioural, technical, system-design, mixed, ambiguous, follow-up and missing-evidence questions. Every case starts a fresh conversation. IA-1 does not remember prior spoken answers: a follow-up without its referent should request clarification. The explicit-context follow-up supplies its context in the question.

## Run on the Windows PC

Use Node 24+, the repository's pnpm version and an already installed local Ollama model. Create a private UTF-8 text file containing 1–4000 characters of experience you want to evaluate. Include actual personal contributions and outcomes, and avoid filling gaps with invented metrics. The selected sample is submitted with every case.

From the repository root, inspect the command without making model calls:

```sh
pnpm evaluate:interview
```

Then run explicitly, substituting private paths appropriate for the host:

```sh
pnpm evaluate:interview --run --experience-file /path/to/private-sample.txt > /path/to/private-results.json
```

Alternatively invoke `pnpm exec tsx scripts/interview-evaluation.ts` with the same flags. `--model` defaults to `panky-qwen3:4b`; `--endpoint` defaults to `http://127.0.0.1:11434` and accepts only a loopback HTTP origin. Use the repository's documented local-only Ollama configuration.

The report contains generated personal content. Keep it outside the repository and other shared locations. The sample itself is not echoed into the report, but answers may quote it. Preserve the exact sample privately alongside results if a reproducible comparison is needed.

## Measurements and interpretation

- `firstDeltaMs`: submission until the first text chunk, including headers or introductory text. This is not useful-answer latency.
- `firstCompleteCueMs`: submission until a complete first Markdown bullet and its terminating newline are observed under `## Immediate cues`. This is a syntactic proxy for first-useful-cue time; it is null if the expected structure is absent. A reviewer must confirm that the cue is useful.
- `durationMs`: submission until the response stream closes.
- `transportPassed`: the task completed without a reported error. This does not assess correctness, relevance or quality.

The timings include local HTTP and generation, but exclude a remote Mac-to-PC connection, browser rendering, audio and transcription. The first case may include cold model loading; retain run order and distinguish it from warm cases. Record PC/GPU, Ollama version, model digest, sample revision and run conditions privately with the report when comparing results. The report records configured model, context and history budgets.

A nonzero exit indicates an execution failure. A zero exit does not mean IA-1 is accepted: all rubric fields start as null and acceptance remains pending human review and agreed targets. Failed runs preserve completed case results in the report; do not compare an incomplete run as if it covered all 24 cases.

## Human review rubric

Score each dimension 0, 1 or 2, using the case's `review` guidance and the actual experience sample. Mark a dimension not applicable in reviewer notes rather than inventing a score.

| Dimension           | 0                                       | 1                                              | 2                                                                 |
| ------------------- | --------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Correctness         | Material technical or logical error     | Broadly sound, important qualification missing | Accurate with appropriate assumptions and tradeoffs               |
| Relevant experience | Irrelevant or invented example          | Plausible but weak selection                   | Strong supported example, or correct recognition that none exists |
| Factual support     | Unsupported personal claim              | Evidence and suggestion partly blurred         | Personal claims supported; suggestions clearly distinguished      |
| Readability         | Hard to scan or unusable while speaking | Useful but too long or poorly prioritised      | Three or four concise cues with useful expandable detail          |
| Missing information | Invents absent requirements or facts    | Signals uncertainty but gives poor next steps  | Requests the relevant clarification or clearly explains the gap   |

Set `unsupportedPersonalClaims` to true for any invented achievement, metric, role, team ownership or source claim. Treat that case as a quality failure regardless of the total score. Set `usefulCueConfirmed` only after reading the first cue; a fast generic placeholder does not establish usefulness. Add specific corrections or observations to `reviewerNotes`.

## Acceptance decision

After the initial PC run, agree numerical targets for warm and cold first-useful-cue time, full-response time and rubric scores with the user. Record those targets before declaring the milestone complete. Repeat the same set and sample after a relevant model or prompt change; do not lower expectations to turn a failed comparison into a pass.

Separately, have the user read questions aloud and use the browser panel while answering. Record whether cues can be found quickly, whether the panel is distracting and whether supporting detail is accessible. Script execution cannot establish this interaction criterion.

Notion retrieval accuracy, live question detection, audio latency and multi-turn spoken-context quality belong to later milestones and are not claimed by this evaluation.
