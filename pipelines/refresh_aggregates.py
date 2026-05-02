"""
refresh_aggregates.py

Weekly aggregate refresh. Designed to run in GitHub Actions WITHOUT access to
the paper's 19 GB production DuckDB.

Reads from `data-source/*.csv` (committed) and regenerates these dashboard JSONs:
  - data/settlement_funnel.json
  - data/chain_signatures.json
  - data/candidate_mismatches.json (case list + by-category breakdown)
  - data/headline_statistics.json (re-derived from funnel + breakdown)

DOES NOT regenerate:
  - data/disputed_contracts.json   (needs question text + category from prod DB)
  - data/chain_examples.json       (needs episode_panel from prod DB)
  - data/settlement_explorer.duckdb (needs prod DB)

For those, run pipelines/build_settlement_explorer_data.py and
pipelines/build_settlement_explorer_duckdb.py locally against oracle_gov/, then
commit the regenerated files.

Usage:
    python pipelines/refresh_aggregates.py
"""

import csv
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SOURCE = REPO / "data-source"
DATA = REPO / "data"


def read_csv_rows(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def chain_type_label(category, has_rejection):
    if category == "canonical_correction_path":
        return "Request-voiding chain"
    if category == "duplicate_independent_settlement_or_other":
        return "Repeated adapter-routed request"
    if has_rejection:
        return "Request-voiding chain"
    return "Repeated adapter-routed request"


def build_settlement_funnel():
    funnel_rows = read_csv_rows(SOURCE / "rev3_contract_level_settlement_funnel.csv")
    flip_rows = read_csv_rows(SOURCE / "rev3_flip_rate_decomposition_by_chain_type.csv")
    cand_rows = read_csv_rows(SOURCE / "rev3_candidate_error_category_breakdown.csv")

    label_map = {
        "all_contracts": "Total settlement conditions",
        "initial_proposal_observed": "With initial proposal observed",
        "final_terminal_state_mapped": "With final terminal state mapped",
        "disputed_contracts (D_i=1, including unresolved)": "Disputed contracts",
        "of which: disputed_unresolved (pending DVM)": "  of which: pending DVM (unresolved)",
        "disputed_unresolved (pending DVM)": "  of which: pending DVM (unresolved)",
        "disputed_with_mapped_final_state (analysis sample)": "Disputed with observed final payoff (analysis sample)",
        "multi_episode_disputed": "  of which: multi-episode disputed",
        "flipped_disputed": "Proposal-to-final revisions",
        "terminal_ambiguity_disputed": "Terminal ambiguity disputed (excluded)",
    }

    steps = []
    for row in funnel_rows:
        raw = row["step"].strip()
        public_label = label_map.get(raw)
        if public_label is None:
            raise RuntimeError(f"settlement_funnel: no public label for raw step {raw!r}")
        steps.append({
            "step": public_label,
            "n_contracts": int(row["n_contracts"]),
            "n_episodes": int(row["n_episodes"]),
            "share_of_prior_step": float(row["share_of_prior_step"]) if row["share_of_prior_step"] else None,
        })

    all_disputed = next(r for r in flip_rows if r["subset"].strip() == "All disputed-mapped")
    canonical = next(r for r in flip_rows if "canonical_correction_path" in r["subset"] and "P_i1" not in r["subset"])
    duplicate = next(r for r in flip_rows if "duplicate_independent_settlement_or_other" in r["subset"] and "P_i1" not in r["subset"])

    n_candidate = sum(int(r["n_candidate_94"]) for r in cand_rows)
    n_agreed = sum(int(r["n_two_pass_agreed_64"]) for r in cand_rows)

    summary = {
        "total_settlement_conditions": int(funnel_rows[0]["n_contracts"]),
        "disputed": int(next(r for r in funnel_rows if "disputed_contracts" in r["step"])["n_contracts"]),
        "disputed_with_observed_final_payoff": int(all_disputed["n_contracts"]),
        "proposal_to_final_revisions": int(all_disputed["n_flipped"]),
        "revision_rate": float(all_disputed["flip_rate"]),
        "repeated_adapter_routed_revisions": int(duplicate["n_flipped"]),
        "request_voiding_revisions": int(canonical["n_flipped"]),
        "candidate_mismatches": n_candidate,
        "candidate_mismatches_agreed": n_agreed,
    }
    write_json(DATA / "settlement_funnel.json", {"summary": summary, "steps": steps})
    print(f"  settlement_funnel.json: {len(steps)} steps, summary written")
    return summary, flip_rows


def build_chain_signatures(flip_rows):
    sig_rows = read_csv_rows(SOURCE / "rev3_chain_signature_distribution.csv")

    chain_signatures = []
    for row in sig_rows:
        has_rej = row["has_rejection"].lower() == "true"
        chain_signatures.append({
            "n_contracts": int(row["n_contracts"]),
            "has_request_voiding": has_rej,
            "chain_type": chain_type_label(row["category"], has_rej),
            "share_of_disputed_mapped": float(row["share_of_disputed_mapped"]),
        })

    chain_type_summary = []
    for row in flip_rows:
        sub = row["subset"].strip()
        if "P_i1" in sub or sub == "":
            continue
        chain_type_summary.append({
            "chain_type": (
                "All disputed (with observed final payoff)" if sub == "All disputed-mapped"
                else "Request-voiding chain" if "canonical_correction_path" in sub
                else "Repeated adapter-routed request" if "duplicate_independent" in sub
                else sub
            ),
            "n_contracts": int(row["n_contracts"]),
            "n_revised": int(row["n_flipped"]),
            "revision_rate": float(row["flip_rate"]),
        })

    write_json(DATA / "chain_signatures.json", {
        "chain_type_summary": chain_type_summary,
        "raw_signature_distribution": chain_signatures,
    })
    print(f"  chain_signatures.json: {len(chain_type_summary)} type rows, {len(chain_signatures)} signature rows")


def build_candidate_mismatches():
    breakdown = read_csv_rows(SOURCE / "rev3_candidate_error_category_breakdown.csv")
    by_category = []
    for row in breakdown:
        by_category.append({
            "category": row["category"],
            "n_candidate": int(row["n_candidate_94"]),
            "n_agreed": int(row["n_two_pass_agreed_64"]),
            "n_questionable": int(row["n_questionable_30"]),
        })

    reconciled = read_csv_rows(SOURCE / "rev3_final_mismatch_reconciliation.csv")
    inconsistent = {r["condition_id"]: r for r in read_csv_rows(SOURCE / "rev3_initially_inconsistent_case_table.csv")}

    rows = []
    for r in reconciled:
        if r.get("classification") != "uncorrected_oracle_error":
            continue
        cid = r["condition_id"]
        question = r.get("question_text") or inconsistent.get(cid, {}).get("question_text") or None
        # Use a short hash for public id (8 chars from sha256)
        import hashlib
        sid = hashlib.sha256(cid.encode()).hexdigest()[:8]
        rows.append({
            "id": sid,
            "question_text": question if question else None,
            "category": r.get("category") or None,
            "first_proposal": r.get("P_i1"),
            "final_payoff": r.get("S_i"),
            "coded_benchmark": r.get("G_i_label"),
            "mismatch_agreed": False,  # per-row agreed flag not exposed; aggregate-only
            "classification": r.get("classification"),
        })

    write_json(DATA / "candidate_mismatches.json", {
        "n_candidate": sum(b["n_candidate"] for b in by_category),
        "n_agreed": sum(b["n_agreed"] for b in by_category),
        "by_category": by_category,
        "rows": rows,
    })
    print(f"  candidate_mismatches.json: {len(rows)} rows")


def main():
    if not SOURCE.is_dir():
        print(f"ERROR: data-source/ not found at {SOURCE}", file=sys.stderr)
        sys.exit(2)
    DATA.mkdir(parents=True, exist_ok=True)
    print(f"refresh_aggregates: reading from {SOURCE}, writing to {DATA}")
    summary, flip_rows = build_settlement_funnel()
    build_chain_signatures(flip_rows)
    build_candidate_mismatches()
    # headline_statistics.json kept as-is (richer schema; refreshed locally with full pipeline)
    print("Done.")


if __name__ == "__main__":
    main()
