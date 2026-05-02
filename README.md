# polywether — Settlement Explorer

Static research dashboard on settlement-state construction in disputed
Polymarket contracts resolved through UMA's Optimistic Oracle.

Companion to the working paper *"Settlement-State Construction in
Prediction-Market Contracts."*

**Live site:** https://rodridu.github.io/polywether/ (after Pages enabled)

## Pages

- `index.html` — **Funnel.** 661,949 → 2,221 → 530 (24.1%) → 352 / 178 / 94 ladder + framing
- `explorer.html` — **Contract Explorer.** Filterable table of all 2,221 disputed contracts
- `chain.html` — **Chain View.** Request-by-request timelines for 10 hand-curated examples (5 voiding + 5 repeated)
- `audit.html` — **Settlement Auditability.** 8-item transparent checklist, aggregate bars, per-contract picker
- `cases.html` — **Public Case Locator.** 7 named cases with "Locate, do not adjudicate" banner
- `query.html` — **Live SQL Query.** duckdb-wasm + 10 MB stripped DuckDB; in-browser SQL on `contracts` / `episodes` / `funnel` / `chain_signatures`
- `about.html` — Scope, headline facts, non-claims, limitations
- `legacy/research.html` — Older "governance value-add" framing, banner-flagged as superseded

## Data

`data/` contains the JSON datasets the dashboard loads. Source is `oracle_gov/`
(the paper's research repo, not in this repo). Refresh by running the pipelines.

| File | Rows | Notes |
|---|---|---|
| `settlement_funnel.json` | 9 steps | Paper Table 1 ladder |
| `disputed_contracts.json` | 2,221 | Reader-facing field names + 8-item audit flags |
| `chain_examples.json` | 10 | Hand-curated, sports-only, both chain types |
| `chain_signatures.json` | 23 sig + 7 summary | revision_rate not flip_rate |
| `candidate_mismatches.json` | 94 candidate / 64 agreed (category-level) | Diagnostic, not error count |
| `public_cases.json` | 7 cases | Locator only — no adjudication |
| `headline_statistics.json` | scalar | Refreshed from analysis_output |
| `settlement_explorer.duckdb` | 10 MB | Tables: `contracts` (2,221), `episodes` (2,668), `funnel`, `chain_signatures`, `flip_decomposition` |

## Refresh data

```bash
python pipelines/build_settlement_explorer_data.py
python pipelines/build_settlement_explorer_duckdb.py
```

Both scripts read from `oracle_gov/data/oraclepm.duckdb` (production research DB)
and `oracle_gov/analysis_output/rev3_*.csv`. Output paths are hard-coded; edit
the `Path(...)` constants at the top of each script if the paper repo is elsewhere.

The `build_settlement_explorer_data.py` script also writes a data-audit memo to
`oracle_gov/scripts/paper/data_audit_memo.md` documenting paper-consistency
checks, join coverage, public-label mappings, and per-flag distributions.

## Limitations

- **Question-text coverage is 79.1%** (1,756 / 2,221). 465 condition_ids appear in
  the rev3 settlement panel but have no recoverable question text on the
  Polymarket side (likely Kalshi-only or deprecated). Affected rows show
  `[question text missing]` in the Explorer; chain type and final payoff are
  still observed.
- **Auditability flags 1–4** (rule text / named source / fallback / edge cases)
  are heuristic regex over a noisy text corpus — they tag whether the relevant
  language *appears*, not whether the contract was correctly designed.
- **Public Case Locator** uses keyword matching on `pm_markets.question`. Three
  of seven cases (Venezuela / Iran-Khamenei / Lebanon) match the market panel
  but not the disputed-analysis sample — likely because the relevant contract
  was excluded from the paper's sample-construction rules or the public dispute
  attached to a Kalshi-side market not visible here.

## License & affiliation

Hongzhen Du, Northwestern University. Companion to the paper "Settlement-State
Construction in Prediction-Market Contracts."

The Bellwether project (Andrew Hall, Stanford GSB / Hoover Institution; Elliot
Paschal) is referenced as a complementary infrastructure layer; this repo is
not affiliated with Bellwether.
