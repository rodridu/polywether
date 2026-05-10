# data-source/

Source CSVs from the paper's analysis pipeline (`oracle_gov/analysis_output/`).
Committed here so GitHub Actions can regenerate aggregate JSONs without
needing access to the 19 GB production DuckDB.

## Files

| File | Bytes | Source |
|---|---|---|
| `rev3_contract_level_settlement_funnel.csv` | ~580 | Funnel ladder |
| `rev3_chain_signature_distribution.csv` | ~1.9 KB | 23 chain patterns + category |
| `rev3_flip_rate_decomposition_by_chain_type.csv` | ~470 | 7 subset breakdowns |
| `rev3_candidate_error_category_breakdown.csv` | ~250 | 94/64/30 by category |
| `rev3_initially_inconsistent_case_table.csv` | ~75 KB | 352 first-pass flagged cases |
| `rev3_final_mismatch_reconciliation.csv` | ~27 KB | 121 reconciled (94 = uncorrected_oracle_error) |

## Workflow

1. **Refresh source data:** locally re-run the paper's analysis pipeline in
   `oracle_gov/`. This regenerates the rev3_*.csv files in
   `oracle_gov/analysis_output/`.
2. **Copy refreshed CSVs into this directory:**
   ```bash
   cp oracle_gov/analysis_output/rev3_*.csv data-source/
   ```
   (Skip `rev3_contract_level_table.csv` — 87 MB, not needed for aggregate refresh.)
3. **Commit + push.** The `refresh-aggregates` workflow runs automatically
   on push to `data-source/**` and regenerates the dashboard JSONs:
   - `data/settlement_funnel.json`
   - `data/chain_signatures.json`
   - `data/candidate_mismatches.json`
   - `data/headline_statistics.json`

The workflow also runs **weekly on Mondays at 8am UTC** as a safety check
(no-op if source CSVs haven't changed).

## What's NOT in this directory

The full per-contract panel (`rev3_contract_level_table.csv`, 87 MB / 661k rows)
and the production DuckDB (19 GB). These are required to regenerate:
- `data/disputed_contracts.json` (per-contract metadata + 8 audit flags)
- `data/chain_examples.json` (request-by-request timelines)
- `data/settlement_explorer.duckdb` (10 MB stripped DB for duckdb-wasm)

To refresh those, run locally against `oracle_gov/`:

```bash
python pipelines/build_settlement_explorer_data.py
python pipelines/build_settlement_explorer_duckdb.py
git add data/disputed_contracts.json data/chain_examples.json data/settlement_explorer.duckdb
git commit -m "Refresh per-contract data + DuckDB"
git push
```
