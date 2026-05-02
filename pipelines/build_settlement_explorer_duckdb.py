"""
build_settlement_explorer_duckdb.py

Build a small DuckDB file containing only the data the Settlement Explorer
needs for live in-browser queries. Ships with the static site for use via
duckdb-wasm.

Source: oracle_gov/data/oraclepm.duckdb (production, 19GB)
Target: machine_failure/oracle/data/settlement_explorer.duckdb (~2-5MB target)

Tables:
  contracts       — one row per disputed contract (2,221) with all fields
                    matching disputed_contracts.json + raw question/description
  episodes        — request-by-request rows for each disputed contract
  funnel          — funnel ladder
  chain_signatures— chain-pattern aggregates
"""

from pathlib import Path
import duckdb

ORACLE_GOV = Path("C:/Users/ofs4963/Dropbox/Arojects/oracle_gov")
SRC = ORACLE_GOV / "data" / "oraclepm.duckdb"
ANALYSIS = ORACLE_GOV / "analysis_output"

OUT_DIR = Path("C:/Users/ofs4963/Dropbox/Arojects/machine_failure/oracle/data")
OUT = OUT_DIR / "settlement_explorer.duckdb"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()

    print(f"Build {OUT}")
    src = duckdb.connect(str(SRC), read_only=True)
    src.execute(f"CREATE TEMP TABLE rev3 AS SELECT * FROM read_csv_auto('{ANALYSIS / 'rev3_contract_level_table.csv'}')")

    # Build the contracts table directly via ATTACH-style export
    print("[1/4] Build contracts table")
    contracts_query = """
        WITH base AS (
          SELECT
            r.condition_id,
            r.P_i1 AS first_proposal,
            r.S_i,
            r.terminal_state_type,
            r.Flip_i AS revised,
            r.MultiEpisode_i AS multi_episode,
            r.episode_sequence,
            r.first_proposal_time,
            r.final_settlement_time,
            COALESCE(
              (SELECT m.question FROM pm_markets m WHERE m.condition_id = r.condition_id AND m.question IS NOT NULL AND m.question != '' LIMIT 1),
              (SELECT e.question_text FROM episode_panel e WHERE e.condition_id = r.condition_id AND e.question_text IS NOT NULL AND e.question_text != '' LIMIT 1),
              (SELECT pe.ancillary_data_decoded FROM pm_resolution_events pe WHERE pe.condition_id = r.condition_id AND pe.ancillary_data_decoded IS NOT NULL AND pe.ancillary_data_decoded != '' LIMIT 1)
            ) AS question_text,
            (SELECT e.category FROM episode_panel e WHERE e.condition_id = r.condition_id AND e.category IS NOT NULL AND e.category != '' LIMIT 1) AS category,
            (SELECT json_extract_string(m.raw, '$.description') FROM pm_markets m WHERE m.condition_id = r.condition_id LIMIT 1) AS description,
            CASE WHEN r.episode_sequence LIKE '%dispute_rejected%' THEN 'Request-voiding chain' ELSE 'Repeated adapter-routed request' END AS chain_type,
            CASE
              WHEN r.S_i IN ('Yes','No','Other') THEN r.S_i
              WHEN r.terminal_state_type='clean_yes' THEN 'Yes'
              WHEN r.terminal_state_type='clean_no' THEN 'No'
              WHEN r.terminal_state_type='clean_invalid' THEN 'Invalid'
              WHEN r.terminal_state_type='unresolved' THEN 'Pending'
              ELSE NULL
            END AS final_payoff
          FROM rev3 r WHERE r.D_i = 1
        )
        SELECT * FROM base
    """

    # Build episodes table from episode_panel (only for disputed cond_ids)
    print("[2/4] Build episodes table")
    episodes_query = """
        SELECT
            e.condition_id,
            e.episode_id,
            e.t_proposal,
            e.t_dispute,
            e.t_final,
            e.proposed_outcome AS proposed,
            e.final_outcome AS final,
            e.was_disputed,
            e.outcome_flipped
        FROM episode_panel e
        JOIN rev3 r ON r.condition_id = e.condition_id
        WHERE r.D_i = 1
        ORDER BY e.condition_id, e.t_proposal
    """

    print("[3/4] Build funnel + chain_signatures from CSVs")
    funnel_csv = ANALYSIS / "rev3_contract_level_settlement_funnel.csv"
    sig_csv = ANALYSIS / "rev3_chain_signature_distribution.csv"
    flip_csv = ANALYSIS / "rev3_flip_rate_decomposition_by_chain_type.csv"

    print("[4/4] Write target DuckDB")
    target = duckdb.connect(str(OUT))
    # Move data through SQL — copy-via-attach is simplest
    target.execute(f"ATTACH '{SRC}' AS src (READ_ONLY)")
    target.execute(f"CREATE TEMP TABLE _rev3 AS SELECT * FROM read_csv_auto('{ANALYSIS / 'rev3_contract_level_table.csv'}')")
    target.execute(f"""
        CREATE TEMP TABLE _mm AS
        SELECT condition_id FROM read_csv_auto('{ANALYSIS / 'rev3_final_mismatch_reconciliation.csv'}')
        WHERE classification = 'uncorrected_oracle_error'
    """)

    target.execute(f"""
        CREATE TABLE contracts AS
        WITH base AS (
          SELECT
            r.condition_id,
            r.P_i1 AS first_proposal,
            r.S_i,
            r.terminal_state_type,
            r.Flip_i AS revised,
            r.MultiEpisode_i AS multi_episode,
            r.episode_sequence,
            r.first_proposal_time,
            r.final_settlement_time,
            COALESCE(
              (SELECT m.question FROM src.pm_markets m WHERE m.condition_id = r.condition_id AND m.question IS NOT NULL AND m.question != '' LIMIT 1),
              (SELECT e.question_text FROM src.episode_panel e WHERE e.condition_id = r.condition_id AND e.question_text IS NOT NULL AND e.question_text != '' LIMIT 1),
              (SELECT pe.ancillary_data_decoded FROM src.pm_resolution_events pe WHERE pe.condition_id = r.condition_id AND pe.ancillary_data_decoded IS NOT NULL AND pe.ancillary_data_decoded != '' LIMIT 1)
            ) AS question_text,
            (SELECT e.category FROM src.episode_panel e WHERE e.condition_id = r.condition_id AND e.category IS NOT NULL AND e.category != '' LIMIT 1) AS category,
            (SELECT json_extract_string(m.raw, '$.description') FROM src.pm_markets m WHERE m.condition_id = r.condition_id LIMIT 1) AS description,
            CASE WHEN r.episode_sequence LIKE '%dispute_rejected%' THEN 'Request-voiding chain' ELSE 'Repeated adapter-routed request' END AS chain_type,
            CASE
              WHEN r.S_i IN ('Yes','No','Other') THEN r.S_i
              WHEN r.terminal_state_type='clean_yes' THEN 'Yes'
              WHEN r.terminal_state_type='clean_no' THEN 'No'
              WHEN r.terminal_state_type='clean_invalid' THEN 'Invalid'
              WHEN r.terminal_state_type='unresolved' THEN 'Pending'
              ELSE NULL
            END AS final_payoff,
            (r.condition_id IN (SELECT condition_id FROM _mm)) AS candidate_mismatch
          FROM _rev3 r WHERE r.D_i = 1
        )
        SELECT * FROM base
    """)
    n = target.execute("SELECT COUNT(*) FROM contracts").fetchone()[0]
    print(f"  contracts: {n} rows")

    target.execute("""
        CREATE TABLE episodes AS
        SELECT
            e.condition_id,
            e.episode_id,
            e.t_proposal,
            e.t_dispute,
            e.t_final,
            e.proposed_outcome AS proposed,
            e.final_outcome AS final_outcome,
            e.was_disputed,
            e.outcome_flipped
        FROM src.episode_panel e
        JOIN _rev3 r ON r.condition_id = e.condition_id
        WHERE r.D_i = 1
    """)
    n = target.execute("SELECT COUNT(*) FROM episodes").fetchone()[0]
    print(f"  episodes: {n} rows")

    target.execute(f"CREATE TABLE funnel AS SELECT * FROM read_csv_auto('{funnel_csv}')")
    target.execute(f"CREATE TABLE chain_signatures AS SELECT * FROM read_csv_auto('{sig_csv}')")
    target.execute(f"CREATE TABLE flip_decomposition AS SELECT * FROM read_csv_auto('{flip_csv}')")

    target.execute("DETACH src")
    target.close()

    size = OUT.stat().st_size
    print(f"Done. {OUT} = {size/1024:.1f} KB ({size/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
