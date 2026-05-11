# Settlement Risk Monitor

Static research dashboard companion to the working paper:

> **"When Resolution Isn't Settlement: Payoff Measurement in Prediction Markets."**
> Hongzhen Du, Kellogg School of Management, Northwestern University.
> Working paper, 2026.

The site reconstructs the multi-stage on-chain settlement process for
**661,949** condition-identifier-linked Polymarket settlement conditions
resolved through UMA's optimistic oracle (November 2022 — April 2026), and
documents three facts:

1. **Trade-feed coverage.** In the matched `pm_trades` extract used for
   pre-proposal scoring, market prices exist for 0.34% of terminal binary
   contracts, almost exclusively the disputed subsample.
2. **Settlement composition.** Within the priced disputed sample, revised
   contracts are 20.6% of contracts but account for ~72% of pooled Brier
   loss. Mean Brier 0.318 (revised) vs 0.032 (confirmed).
3. **Chain-type taxonomy.** Among 2,197 disputed contracts with an
   observed final payoff, 530 (24.1%) revise. 352 of those run through
   Path D (parallel repeated-request), 178 through Path C (DVM
   request-voiding). Fully observable on-chain; absent from the
   settlement description traders see.

A diagnostic benchmark flags **64** candidate rule-divergent revisions
concentrated in Path C. The audit list is in the replication package
and is preliminary pending independent blinded re-coding.

**Live site:** https://rodridu.github.io/polywether/

## Pages

| Path | Purpose |
|---|---|
| `index.html` | Hero search, audience cards, High-risk watchlist |
| `explorer.html` | **Analyze** — filterable table of all 2,221 disputed contracts |
| `contract.html` | Per-contract evidence-first detail (top diagnostic card → settlement chain → evidence → audit → base rates → interpretation notes) |
| `rates.html` | **Risk Map** — paper Table A3 heatmap (chain type × text-classified category) |
| `cases.html` | **Cases** — named public controversies located in the panel; "Locate, do not adjudicate" |
| `analyze.html` | **Rule Check** — paste rule text, get a 7-field clarity screen + suggested rewrite |
| `cite.html` | **Cite check** — 7-question scorecard for journalists, with Brier-loss decomposition |
| `research.html` | **Research & Data** — paper landing + sample funnel + progressive-disclosure sections |
| `docs.html` | Field schema, JSON endpoints, replication checklist, benchmark transparency, snapshot version |
| `blueprints.html` | **Templates** — 5 reference contract designs (shutdown, military, arrest, product launch, sports) |
| `chain.html` | Hand-curated request-by-request timelines for 10 example contracts |
| `audit.html` | 9-flag per-contract auditability checklist |
| `query.html` | In-browser SQL via `duckdb-wasm` on a stripped 10 MB DuckDB |
| `about.html` | Slim coverage / non-claims / data-source / researcher block |

## Data

`data/` is committed to the repo and served as a static API.

| File | Rows | Purpose |
|---|---|---|
| `disputed_contracts.json` | 2,221 | Per-contract record: id, question_text, category, first_proposal, final_payoff, revised, chain_type, candidate_mismatch, settlement_risk_tier, audit{ rule_text_present, named_source_present, fallback_present, edge_cases_present, ... } |
| `settlement_funnel.json` | 9 steps | 661,949 → 2,221 → 2,197 → 530 → 352/178 → 64 |
| `chain_signatures.json` | 23 sig + 3 chain-type summary | Aggregate counts and revision rates per chain pattern |
| `candidate_mismatches.json` | 94 row-level entries | Per-row stratum (55 two_benchmark / 39 frozen), G_i_source, operative_proposed/final, mechanical_final_correct_a1, legacy_final_correct, mismatch_agreed. Paper headline is the 64-case agreed subset (63 in Path C, 1 in Path D) |
| `conditional_revision_paper.json` | 5 buckets × Path C/D | Paper Table A3 (Appendix B.3) text-classified buckets: Sports / Politics-Geopolitics / Crypto / Weather-Nature / Residual |
| `brier_decomposition.json` | 1 main + 4 cells | Paper Table 4 binary-binary cells (N=1,066): revised 20.6% / 72% pooled-loss share; mean Brier 0.318 (revised) vs 0.032 (confirmed) |
| `public_cases.json` | 7 cases | Locator only — no adjudication |
| `risk_map_examples.json` | 4 | Hand-picked (revised + clean) × (Path C + Path D) for the Risk Map "Bucket examples" cards |
| `chain_examples.json` | 10 | Sports-only, both chain types, request-by-request timelines |
| `headline_statistics.json` | scalar | Paper-level headline statistics (richer schema than the funnel) |
| `settlement_explorer.duckdb` | 10 MB | Tables: `contracts` (2,221), `episodes` (2,668), `funnel`, `chain_signatures`, `flip_decomposition` |

## Replication

Every headline number on the site traces to a single source file or
query. See [`docs.html#replication`](https://rodridu.github.io/polywether/docs.html#replication)
for the per-number map, [`docs.html#benchmark-transparency`](https://rodridu.github.io/polywether/docs.html#benchmark-transparency)
for the LLM-coding protocol, and [`docs.html#snapshot`](https://rodridu.github.io/polywether/docs.html#snapshot)
for the data-snapshot version.

Source CSVs live under [`data-source/`](data-source/) and feed both
the aggregate-JSON refresh workflow and the local pipeline scripts.

## Refresh data

Two paths, by what changed.

### A. Aggregate refresh (auto, weekly + on push)

Aggregate JSONs (`settlement_funnel`, `chain_signatures`,
`candidate_mismatches`) regenerate automatically via
[`.github/workflows/refresh-aggregates.yml`](.github/workflows/refresh-aggregates.yml).

Triggers: weekly cron (Mondays 8am UTC), on push to `data-source/**`,
or manual via the *Run workflow* button.

```bash
cp /path/to/oracle_gov/analysis_output/rev3_*.csv data-source/
git add data-source/
git commit -m "Refresh source CSVs"
git push
# workflow runs automatically; site updates within ~1 min
```

### B. Per-contract / DuckDB refresh (manual, when the paper's disputed panel grows)

These need the production DuckDB (19 GB), so they don't fit in a workflow.
Run locally:

```bash
python pipelines/build_settlement_explorer_data.py
python pipelines/build_settlement_explorer_duckdb.py
git add data/disputed_contracts.json data/chain_examples.json \
        data/settlement_explorer.duckdb data/headline_statistics.json
git commit -m "Refresh per-contract data + DuckDB"
git push
```

Both scripts read from `oracle_gov/data/oraclepm.duckdb` and
`oracle_gov/analysis_output/rev3_*.csv`. Output paths are hard-coded;
edit the `Path(...)` constants at the top of each script if the paper
repo is elsewhere.

## Limitations carried into the dashboard

- **Sample frame.** The disputed-contract panel is the
  condition-identifier-linked subset of Polymarket markets. The
  negRisk-umbrella family (high-frequency auto-resolved daily-temperature
  and per-game sports markets that share one umbrella event across many
  per-outcome rows) is underrepresented. All rates are linked-panel
  rates; the chain-type and revision analyses are conditional on the
  linked settlement-condition panel.

- **Question-text coverage is 79.1%** (1,756 / 2,221). The other 465
  condition_ids are visible in the rev3 settlement panel but absent from
  Polymarket-side metadata (typically off-Polymarket UMA requests,
  condition_id schema drift, or metadata purged before the snapshot).
  Affected rows show `[question text missing]` in the Explorer; chain
  type and final payoff are still observed.

- **Auditability flags** for rule text / named source / fallback /
  edge cases are heuristic regex over a noisy text corpus — they tag
  whether the relevant language *appears*, not whether the contract
  was correctly designed.

- **Settlement-risk tier** is a screening flag, not a prediction. It
  identifies contracts whose payoff depends on discretionary or
  ambiguous interpretation. It does not predict whether the final
  payoff is correct.

- **Cases page** uses keyword matching on `pm_markets.question`. Three
  of seven curated cases match the market panel but not the
  disputed-analysis sample.

## Acknowledgment

The site scaffolding (page structure, CSS conventions, static-data /
JSON-endpoint pattern, vanilla-JS rendering) is adapted from the
**Bellwether** project's open-source platform code
([elliotjames-paschal/bellwether-platform](https://github.com/elliotjames-paschal/bellwether-platform)),
built by Andrew B. Hall (Stanford GSB / Hoover Institution) and
Elliot Paschal. Bellwether tracks **price robustness** in prediction
markets; this site is a separate research artifact tracking
**settlement robustness** for disputed Polymarket-UMA contracts.
The paper positions the two as complementary infrastructure layers
on the same broader question of "what does a market price mean."

The substantive content (paper, data pipeline, candidate-mismatch
benchmark, paper Table A3 cross-tab, rule-linter regex, settlement-risk
tier rule) is independent work by the author. Any errors in the
adaptation are mine.

## Affiliation

Hongzhen Du, Kellogg School of Management, Northwestern University.
Independent and not formally affiliated with Bellwether or the Hoover
Institution.

## License

Code: MIT. Data: paper draft and replication package retain the
licensing terms in the paper's distribution.
