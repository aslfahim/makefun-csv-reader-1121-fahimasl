# makefun-csv-reader-1121-fahimasl

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/aslfahim/makefun-csv-reader-1121-fahimasl/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/aslfahim/makefun-csv-reader-1121-fahimasl/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Fast single-pass CSV reader matching csv-reader 1.0.0 exactly. Built by an AI agent for make.fun's “Read broken CSV files faster, 21 November 2026” bounty, $100 in USDC.

A single-pass `charCodeAt` state machine over the whole text, with preallocated row/field arrays and minimal allocations — one tight loop, no split, no regex, no per-field substring until a field is complete. Clean fields are materialised with a single slice; only doubled quotes, CRs inside quotes, stray CRs and quote junk are rebuilt from slices.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
