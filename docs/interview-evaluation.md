# Typed interview evaluation (IA-1–IA-3)

This evaluates typed questions through Panky's authenticated HTTP backend and local Ollama provider. It uses an ephemeral port and an in-memory database; it does not load the server `.env`, touch live conversations, download models or use a cloud fallback.

The cases in [interview-cases.ts](../scripts/interview-cases.ts) cover 36 turns: 24 standalone questions and four three-turn sequences. Standalone cases cover behavioural, technical, system-design, mixed, ambiguous, follow-up and missing-evidence questions. Each starts a fresh conversation. Sequences reuse one conversation and cover payment retries, notification design constraints, personal contributions and a change from React performance to database isolation.

Sequence context contains only earlier questions and scripted summaries of what the user actually said. Generated responses are saved in the isolated conversation but never forwarded as spoken context. The summaries are fixed fixtures, not model-generated answers or claims about your experience. This makes runs comparable even when model suggestions differ. A follow-up with no referent should still request clarification.

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
- `durationMs`: submission until the response stream closes.
- `admittedContextChars`: total admitted system and user prompt characters from the backend activity event, including question, experience and retained conversation context.
- `sourceCount`: retrieved passages attached to the response; zero in this empty-corpus harness.
- `transportPassed`: the task completed without a reported error. This does not assess correctness, relevance or quality.

The former `firstCompleteCueMs` metric required the old two-section response format and is no longer emitted. Do not compare that metric with `firstDeltaMs`; the latter does not establish usefulness.

The timings include local HTTP, the empty-corpus retrieval path and generation, but exclude a remote Mac-to-PC connection, browser rendering, audio and transcription. The first case may include cold model loading; retain run order and distinguish it from warm cases. Record PC/GPU, Ollama version, model digest, sample revision and run conditions privately with the report when comparing results. The report records configured model, context and history budgets, the exact scripted context submitted per turn and pending `runConditions` fields for host measurements. Fill those fields from the actual run; null does not mean zero memory usage.

A nonzero exit indicates an execution failure. A zero exit does not mean the milestone is accepted: all rubric fields start as null and acceptance remains pending human review and agreed targets. Failed runs preserve completed case results in the report; do not compare an incomplete run as if it covered all 36 turns.

## Human review rubric

Score each dimension 0, 1 or 2, using the case's `review` guidance and the actual experience sample. Mark a dimension not applicable in reviewer notes rather than inventing a score.

| Dimension           | 0                                       | 1                                              | 2                                                                 |
| ------------------- | --------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Correctness         | Material technical or logical error     | Broadly sound, important qualification missing | Accurate with appropriate assumptions and tradeoffs               |
| Relevant experience | Irrelevant or invented example          | Plausible but weak selection                   | Strong supported example, or correct recognition that none exists |
| Factual support     | Unsupported personal claim              | Evidence and suggestion partly blurred         | Personal claims supported; suggestions clearly distinguished      |
| Readability         | Hard to scan or unusable while speaking | Useful but too long or poorly prioritised      | Direct, concise answer with relevant explanation or examples      |
| Missing information | Invents absent requirements or facts    | Signals uncertainty but gives poor next steps  | Requests the relevant clarification or clearly explains the gap   |

Set `unsupportedPersonalClaims` to true for any invented achievement, metric, role, team ownership or source claim. Treat that case as a quality failure regardless of the total score. Set `usefulOpeningConfirmed` only after reading the opening answer; a fast generic placeholder does not establish usefulness. Set `confusedSuggestionWithSpokenAnswer` to true if the output attributes an earlier generated suggestion to the user's speech or experience; treat this as a quality failure. For sequences, compare the output with that turn's `context`, not just previous generated text. Add specific corrections or observations to `reviewerNotes`.

When an answer contains an executable code example, inspect it before running it in a temporary isolated environment with synthetic inputs. Record the command, result and pass/fail status in `executableExampleCheck`. Do not execute generated code automatically or give it credentials. For conceptual examples without executable code, mark the check not applicable and record the reason. A typecheck of this harness does not verify generated examples.

## Acceptance decision

After the initial PC run, agree numerical targets for warm and cold first-text time, full-response time and rubric scores with the user. Record those targets before declaring the milestone complete. Repeat the same set and sample after a relevant model or prompt change; do not lower expectations to turn a failed comparison into a pass.

Separately, have the user read questions aloud and use the browser panel while answering. Record whether the question and streamed answer can be found quickly and whether the panel is distracting. Script execution cannot establish this interaction criterion.

The harness does not import Notion data. Evaluate retrieval separately in the browser with an explicitly selected personal corpus: record the question, admitted source links, context size, latency and any missing or misleading evidence. IA-3's combined retrieval, context and generation targets cannot be accepted from this empty-corpus run alone. Live question detection and audio latency remain outside this milestone.

## Local verification and remaining checks

The harness dry run passed validation of all 36 input shapes without model calls. A temporary loopback fake Ollama server passed 36 successful turns and 36 provider-failure turns: eight follow-up requests contained explicit prior context, no request contained the generated-output sentinel, every request had tools disabled, and the report retained prompt size, source count and timing fields. Failure runs returned a nonzero exit status with all failures recorded. The fixture used isolated storage and was removed afterward. These checks verify transport and report behavior, not technical correctness or resistance to misleading source text. The Windows PC was unavailable during IA-3 implementation, so real-model scores, GPU memory, model digest, latency targets, executable examples and human spoken-use review remain pending. Evaluate the existing installed model first; compare another local model only after the recorded quality or timing misses agreed targets. No model installation or external service is required by this harness.
