# Settlement Risk Monitor

Static research dashboard companion to the working paper:

> **"How Prediction Markets Resolve: Evidence from Polymarket."**
> Hongzhen Du, Kellogg School of Management, Northwestern University.
> Working paper, 2026.

The site is the companion dashboard to a study of the contract-level
settlement process behind **305,766** resolved Polymarket-UMA contracts
(November 2022 — April 2026, drawn from a 661,949-condition full
settlement panel). Three findings:

1. **Contract text predicts disputes.** On 305,766 resolved contracts,
   listing-time language is associated with later dispute incidence.
   Explicit cancellation language: 0.25% dispute rate vs 0.88% without
   (lift 0.28). Multiple-source / "consensus of credible reporting"
   language: 1.36% vs 0.39% (lift 3.50). Reduced-form, not causal.
2. **Text also predicts the enforcement channel.** Conditional on
   dispute (N=1,480), contract text is associated with whether the
   dispute resolves through automatic correction (Path D) or jury
   adjudication (Path C).
3. **Pooling distorts forecast scores.** Of 2,221 disputed contracts,
   530 (23.9%) revise. In the priced disputed sample (N=1,066), revised
   contracts are ~21% of contracts but 30–75% of pooled Brier loss
   depending on price aggregation (~72% under last-trade pricing).
   Mean Brier 0.318 (revised) vs 0.032 (confirmed).

Settlement-path taxonomy: Path C (DVM-voided adjudication) — 1,266
disputed, 178 revised, 14.1%; Path D (non-voided automatic re-request)
— 940 disputed, 352 revised, 37.4%.

An earlier draft coded rule-implied labels to flag "candidate
mismatches." That diagnostic layer is **excluded from the paper's main
analyses** (Appendix B.3) pending independent validation. The
`candidate_mismatch` flag in the data is a screening signal only, not a
paper result.

**Live site:** https://rodridu.github.io/polywether/

## Pages

| Path | Purpose |
|---|---|
| `index.html` | Hero search, audience cards, High-risk watchlist |
| `explorer.html` | **Analyze** — filterable table of all 2,221 disputed contracts |
| `contract.html` | Per-contract evidence-first detail (top diagnostic card → settlement chain → evidence → audit → base rates → interpretation notes) |
| `rates.html` | **Risk Map** — conditional revision-rate heatmap by chain type × category (panel-derived) |
| `cases.html` | **Cases** — named public controversies located in the panel; "Locate, do not adjudicate" |
| `analyze.html` | **Rule Check** — paste rule text, get a 7-field clarity screen + suggested rewrite |
| `cite.html` | **Cite check** — 7-question scorecard for journalists, with Brier-loss decomposition |
| `research.html` | **Research & Data** — paper landing + sample funnel + progressive-disclosure sections |
| `docs.html` | Field schema, JSON endpoints, replication checklist, benchmark transparency, snapshot version |
| `blueprints.html` | **Templates** — 5 reference contract designs (shutdown, military, arrest, product launch, sports) |
| `chain.html` | Hand-curated request-by-request timelines for 10 example contracts |
| `audit.html` | 9-flag per-contract auditability checklist |
| `query.html` | In-browser SQL via `duckdb-wasm` on a stripped 10 MB DuckDB |
| `about.html` | About this monitor — researcher, affiliation, acknowledgment |

## Data

`data/` is committed to the repo and served as a static API.

| File | Rows | Purpose |
|---|---|---|
| `disputed_contracts.json` | 2,221 | Per-contract record: id, question_text, category, first_proposal, final_payoff, revised, chain_type, candidate_mismatch, settlement_risk_tier, audit{ rule_text_present, named_source_present, fallback_present, edge_cases_present, ... } |
| `settlement_funnel.json` | sample-reconciliation layers | 661,949 panel → 606,475 terminal → 305,766 resolved-with-text → 2,221 disputed → 1,480 / 888 / 1,066 sub-samples |
| `chain_signatures.json` | 23 sig + 3 chain-type summary | Aggregate counts and revision rates per chain pattern |
| `candidate_mismatches.json` | 94 row-level entries | Diagnostic rule-implied-label coding. **Excluded from the paper's main analyses** (Appendix B.3) pending independent validation. Screening signal only — not a paper result |
| `conditional_revision_paper.json` | 5 buckets × Path C/D | Panel-derived chain-type × text-classified-category revision rates (Sports / Politics-Geopolitics / Crypto / Weather-Nature / Residual). Derived from the disputed panel, not a table in the current paper draft |
| `brier_decomposition.json` | 1 main + 4 cells | Paper Table 8 binary-binary cells (N=1,066): revised ~21% of sample, 30–75% of pooled Brier loss by price method (~72% last-trade); mean Brier 0.318 (revised) vs 0.032 (confirmed) |
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
