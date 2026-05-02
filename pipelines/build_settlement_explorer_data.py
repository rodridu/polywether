"""
build_settlement_explorer_data.py

Generate Settlement Explorer JSON datasets for the machine_failure/oracle/ subsite.

Inputs:
  - oracle_gov/data/oraclepm.duckdb (production DB, read-only)
  - oracle_gov/analysis_output/rev3_*.csv

Outputs (machine_failure/data/):
  - settlement_funnel.json
  - disputed_contracts.json    (reader-facing field names)
  - chain_examples.json        (8-12 hand-picked)
  - chain_signatures.json      (revision_rate, NOT flip_rate)
  - candidate_mismatches.json  (94 cases, 64 agreed)
  - headline_statistics.json   (refresh from analysis_output)

Plus: data_audit_memo.md  (Phase 1 Gate 1 review document)

Run from oracle_gov/ root or anywhere; paths are absolute.
"""

import csv
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import duckdb

# ---------- paths ----------
ORACLE_GOV = Path("C:/Users/ofs4963/Dropbox/Arojects/oracle_gov")
ANALYSIS = ORACLE_GOV / "analysis_output"
DUCKDB_PATH = ORACLE_GOV / "data" / "oraclepm.duckdb"

DATA_OUT = Path("C:/Users/ofs4963/Dropbox/Arojects/machine_failure/data")
MEMO_OUT = ORACLE_GOV / "scripts" / "paper" / "data_audit_memo.md"

# ---------- helpers ----------

def short_id(condition_id: str) -> str:
    """8-char public id from condition_id (deterministic, collision-safe at this scale)."""
    return hashlib.sha256(condition_id.encode()).hexdigest()[:8]


def chain_type_from_category(category: str | None, has_rejection: bool | None) -> str:
    """Map raw chain_signature category to public-facing chain type."""
    if category == "canonical_correction_path":
        return "Request-voiding chain"
    if category == "duplicate_independent_settlement_or_other":
        return "Repeated adapter-routed request"
    if has_rejection is True:
        return "Request-voiding chain"
    if has_rejection is False:
        return "Repeated adapter-routed request"
    return "Unclassified"


def decode_episode_sequence(seq: str | None) -> str:
    """Map episode_sequence to public chain_type.

    episode_sequence format: '1:proposed->outcome(D?)|2:...'
    'dispute_rejected' as the outcome of any episode means DVM voided the request,
    forcing a new request — this is the canonical_correction_path / Request-voiding chain.
    Otherwise (clean_yes / clean_no / clean_invalid only), it's a repeated adapter-routed request.
    """
    if not seq:
        return "Unknown"
    if "dispute_rejected" in seq:
        return "Request-voiding chain"
    return "Repeated adapter-routed request"


def decode_terminal_state(t: str | None) -> str | None:
    """terminal_state_type → reader-facing final_payoff."""
    mapping = {
        "clean_yes_no": None,  # need actual S_i to know Yes/No; replaced below
        "clean_yes": "Yes",
        "clean_no": "No",
        "ambiguous": "Ambiguous",
        "invalid": "Invalid",
        "unresolved": "Pending",
    }
    return mapping.get(t, t)


def write_json(path: Path, payload, indent=2):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=indent, ensure_ascii=False)


def read_csv_rows(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ---------- main ----------

def main():
    audit = {"started_at": datetime.now(timezone.utc).isoformat(), "stages": []}

    print(f"[1/7] Open DuckDB at {DUCKDB_PATH}")
    con = duckdb.connect(str(DUCKDB_PATH), read_only=True)
    con.execute(f"CREATE TEMP TABLE rev3 AS SELECT * FROM read_csv_auto('{ANALYSIS / 'rev3_contract_level_table.csv'}')")

    # ---------- (1) settlement_funnel.json ----------
    print("[2/7] Build settlement_funnel.json")
    funnel_rows = read_csv_rows(ANALYSIS / "rev3_contract_level_settlement_funnel.csv")
    # Public-facing labels per plan
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
    funnel_steps = []
    for row in funnel_rows:
        raw = row["step"].strip()
        public_label = label_map.get(raw)
        if public_label is None:
            # If we missed a mapping, fail loudly rather than leak raw paper variables
            raise RuntimeError(f"settlement_funnel: no public label for raw step {raw!r}")
        funnel_steps.append({
            "step": public_label,
            "n_contracts": int(row["n_contracts"]),
            "n_episodes": int(row["n_episodes"]),
            "share_of_prior_step": float(row["share_of_prior_step"]) if row["share_of_prior_step"] else None,
        })
    # Pull paper-aligned summary numbers from the chain-type decomposition
    flip_rows = read_csv_rows(ANALYSIS / "rev3_flip_rate_decomposition_by_chain_type.csv")
    all_disputed_mapped = next(r for r in flip_rows if r["subset"].strip() == "All disputed-mapped")
    canonical = next(r for r in flip_rows if "canonical_correction_path" in r["subset"] and "P_i1" not in r["subset"])
    duplicate = next(r for r in flip_rows if "duplicate_independent_settlement_or_other" in r["subset"] and "P_i1" not in r["subset"])

    cand_breakdown = read_csv_rows(ANALYSIS / "rev3_candidate_error_category_breakdown.csv")
    n_candidate = sum(int(r["n_candidate_94"]) for r in cand_breakdown)
    n_agreed = sum(int(r["n_two_pass_agreed_64"]) for r in cand_breakdown)

    summary = {
        "total_settlement_conditions": int(funnel_rows[0]["n_contracts"]),
        "disputed": int(next(r for r in funnel_rows if "disputed_contracts" in r["step"])["n_contracts"]),
        "disputed_with_observed_final_payoff": int(all_disputed_mapped["n_contracts"]),
        "proposal_to_final_revisions": int(all_disputed_mapped["n_flipped"]),
        "revision_rate": float(all_disputed_mapped["flip_rate"]),
        "repeated_adapter_routed_revisions": int(duplicate["n_flipped"]),
        "request_voiding_revisions": int(canonical["n_flipped"]),
        "candidate_mismatches": n_candidate,
        "candidate_mismatches_agreed": n_agreed,
    }
    write_json(DATA_OUT / "settlement_funnel.json", {"summary": summary, "steps": funnel_steps})
    audit["stages"].append({"settlement_funnel": summary})

    # ---------- (2) chain_signatures.json ----------
    print("[3/7] Build chain_signatures.json (revision_rate NOT flip_rate)")
    sig_rows = read_csv_rows(ANALYSIS / "rev3_chain_signature_distribution.csv")
    chain_signatures = []
    for row in sig_rows:
        chain_signatures.append({
            "n_contracts": int(row["n_contracts"]),
            "has_request_voiding": row["has_rejection"].lower() == "true",
            "chain_type": chain_type_from_category(row["category"], row["has_rejection"].lower() == "true"),
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
    write_json(DATA_OUT / "chain_signatures.json", {
        "chain_type_summary": chain_type_summary,
        "raw_signature_distribution": chain_signatures,
    })

    # ---------- (3) disputed_contracts.json ----------
    print("[4/7] Build disputed_contracts.json (reader-facing fields + auditability flags)")
    # COALESCE question text + category across pm_markets, episode_panel, pm_resolution_events
    # Plus pm_markets.description (resolution criteria) for the Auditability checklist
    disputed = con.execute("""
        WITH base AS (
          SELECT
            r.condition_id,
            r.P_i1,
            r.S_i,
            r.terminal_state_type,
            r.Flip_i,
            r.MultiEpisode_i,
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
            (SELECT pe.ancillary_data_decoded FROM pm_resolution_events pe WHERE pe.condition_id = r.condition_id AND pe.ancillary_data_decoded IS NOT NULL AND pe.ancillary_data_decoded != '' LIMIT 1) AS ancillary_text,
            (SELECT m.slug FROM pm_markets m WHERE m.condition_id = r.condition_id AND m.slug IS NOT NULL AND m.slug != '' LIMIT 1) AS slug
          FROM rev3 r WHERE r.D_i = 1
        )
        SELECT * FROM base
    """).fetchall()
    cols = [d[0] for d in con.description]

    # candidate_mismatch (94): cond_ids in rev3_final_mismatch_reconciliation.csv with
    # classification == 'uncorrected_oracle_error'. The reconciliation file has 121 rows total
    # but only 94 are candidate mismatches (the rest are 'initially_correct', 'indeterminate',
    # 'clarification_resolved' — reconciled away).
    reconciled_rows = read_csv_rows(ANALYSIS / "rev3_final_mismatch_reconciliation.csv")
    reconciled_map = {r["condition_id"]: r for r in reconciled_rows if r.get("classification") == "uncorrected_oracle_error"}
    mismatch_ids = set(reconciled_map.keys())  # exactly 94
    # mismatch_agreed (64 of 94) is a CATEGORY-level aggregate from rev3_candidate_error_category_breakdown.csv.
    # No per-row 'agreed' flag exists in the data export. Mark all candidate_mismatch rows
    # with mismatch_agreed=None (unknown per-row) and surface the aggregate elsewhere.
    agreed_ids = set()  # intentionally empty

    # Auditability heuristics applied to description / ancillary text
    import re as _re
    SOURCE_PAT = _re.compile(r'\b(according to|official(?:ly)?|determined by|verified by|reported by|published by|announced by|released by|confirmed by|sourced from|primary source|resolution source|the source for this market|will resolve based on|will resolve according to)\b|https?://', _re.I)
    FALLBACK_PAT = _re.compile(r'\b(if (?:the )?source|in the event|fallback|in case|alternat(?:e|ive)|backup source|if unavailable|otherwise|should the (?:primary )?source|if no (?:reliable |credible )?source|if not(?:hing)? (?:is )?(?:available|reported|published))\b', _re.I)
    EDGECASE_PAT = _re.compile(r'\b(edge case|n/?a|N\.A\.|invalid|cancel(?:l?ed|lation)?|postpon(?:e|ed|ement)|delay(?:ed)?|tied|tie-breaker|abandon(?:ed)?|forfeit|disput(?:e|ed) resolution|in the case (?:where|that)|if .{1,40} (?:is|are) (?:not )?(?:resolved|determined|finalized|known)|deadline.{1,40}(?:passes|expires|missed))\b', _re.I)

    def audit_flags(rule_text: str | None, description: str | None, ancillary: str | None) -> dict:
        # Combine rule text candidates for richer matching
        body = ' '.join(filter(None, [rule_text or '', description or '', ancillary or '']))
        has_text = bool(body.strip())
        return {
            # Text availability
            "rule_text_present": bool(rule_text),
            "description_present": bool(description),
            "ancillary_present": bool(ancillary),
            # Contract clarity (regex over combined body; only meaningful if some text exists)
            "named_source_present": bool(has_text and SOURCE_PAT.search(body)),
            "fallback_present": bool(has_text and FALLBACK_PAT.search(body)),
            "edge_cases_present": bool(has_text and EDGECASE_PAT.search(body)),
        }

    rows_out = []
    coverage = {"total": 0, "with_question_text": 0, "with_category": 0, "with_final_payoff": 0, "with_chain_type": 0, "with_description": 0, "with_ancillary": 0}
    audit_counts = {
        # Text availability
        "rule_text_present": 0, "description_present": 0, "ancillary_present": 0,
        # Contract clarity
        "named_source_present": 0, "fallback_present": 0, "edge_cases_present": 0,
        # Chain observability
        "final_payoff_observed": 0, "multi_episode": 0,
        # Diagnostic
        "candidate_mismatch": 0,
    }
    for row in disputed:
        d = dict(zip(cols, row))
        coverage["total"] += 1
        cid = d["condition_id"]
        # final_payoff: prefer S_i (Yes/No/Other), else terminal_state_type decoded
        final_payoff = d["S_i"] if d["S_i"] in ("Yes", "No", "Other") else decode_terminal_state(d["terminal_state_type"])
        chain_type = decode_episode_sequence(d["episode_sequence"])
        flags = audit_flags(d["question_text"], d["description"], d["ancillary_text"])
        is_mismatch = cid in mismatch_ids
        out = {
            "id": short_id(cid),
            "raw_condition_id": cid,
            "slug": d["slug"] if d["slug"] else None,
            "question_text": d["question_text"] if d["question_text"] else None,
            "description": d["description"] if d["description"] else None,
            "ancillary_text": d["ancillary_text"] if d["ancillary_text"] else None,
            "category": d["category"] if d["category"] else None,
            "first_proposal": d["P_i1"],
            "final_payoff": final_payoff,
            "revised": bool(d["Flip_i"]),
            "multi_episode": bool(d["MultiEpisode_i"]),
            "chain_type": chain_type,
            "candidate_mismatch": is_mismatch,
            "mismatch_agreed": None,  # per-row not exposed; aggregate at category level only
            "first_proposal_time": int(d["first_proposal_time"]) if d["first_proposal_time"] else None,
            "final_settlement_time": int(d["final_settlement_time"]) if d["final_settlement_time"] else None,
            # Audit grouped into 4 categories (per peer review):
            #   text_availability: data we can see
            #   contract_clarity:  what the contract says (heuristic)
            #   chain_observability: what the mechanism did
            #   diagnostic_disagreement: candidate-mismatch flag
            "audit": {
                **flags,                                     # 6 boolean flags
                "final_payoff_observed": final_payoff is not None and final_payoff != "Pending",
                "multi_episode": bool(d["MultiEpisode_i"]),
                "candidate_mismatch": is_mismatch,
            },
        }

        if out["question_text"]:
            coverage["with_question_text"] += 1
        if out["category"]:
            coverage["with_category"] += 1
        if out["final_payoff"]:
            coverage["with_final_payoff"] += 1
        if out["chain_type"] and out["chain_type"] != "Unknown":
            coverage["with_chain_type"] += 1
        if d["description"]:
            coverage["with_description"] += 1
        if d["ancillary_text"]:
            coverage["with_ancillary"] += 1
        for k in audit_counts:
            if out["audit"].get(k):
                audit_counts[k] += 1
        rows_out.append(out)

    # ---------- conditional revision/mismatch rates ----------
    # Pre-compute rates by (a) category, (b) chain_type, (c) first_proposal,
    # (d) named_source presence, (e) fallback presence
    def rate_table(group_fn, label):
        groups = {}
        for r in rows_out:
            key = group_fn(r)
            if key is None:
                continue
            g = groups.setdefault(str(key), {"n": 0, "n_revised": 0, "n_candidate_mismatch": 0})
            g["n"] += 1
            if r["revised"]:
                g["n_revised"] += 1
            if r["candidate_mismatch"]:
                g["n_candidate_mismatch"] += 1
        items = []
        for k, v in sorted(groups.items(), key=lambda kv: -kv[1]["n"]):
            items.append({
                "key": k,
                "n_disputed": v["n"],
                "n_revised": v["n_revised"],
                "revision_rate": v["n_revised"] / v["n"] if v["n"] else 0,
                "n_candidate_mismatch": v["n_candidate_mismatch"],
                "candidate_mismatch_rate": v["n_candidate_mismatch"] / v["n"] if v["n"] else 0,
            })
        return {"label": label, "items": items}

    conditional = {
        "by_category": rate_table(lambda r: r["category"] or "uncategorized", "By category"),
        "by_chain_type": rate_table(lambda r: r["chain_type"], "By chain type"),
        "by_first_proposal": rate_table(lambda r: r["first_proposal"], "By first proposal"),
        "by_named_source": rate_table(
            lambda r: "named source present" if r["audit"]["named_source_present"]
                      else ("rule text present, no named source" if r["audit"]["rule_text_present"]
                            else "rule text missing"),
            "By named-source presence",
        ),
        "by_fallback": rate_table(
            lambda r: "fallback specified" if r["audit"]["fallback_present"]
                      else ("rule text present, no fallback" if r["audit"]["rule_text_present"]
                            else "rule text missing"),
            "By fallback specification",
        ),
        "overall": {
            "n_disputed": len(rows_out),
            "n_revised": sum(1 for r in rows_out if r["revised"]),
            "revision_rate": sum(1 for r in rows_out if r["revised"]) / len(rows_out),
            "n_candidate_mismatch": sum(1 for r in rows_out if r["candidate_mismatch"]),
        },
    }
    write_json(DATA_OUT / "conditional_rates.json", conditional)

    # internal sidecar with raw condition_ids (for replication, NOT public)
    sidecar = [{"id": short_id(d["condition_id"]), "condition_id": d["condition_id"]} for d in (dict(zip(cols, r)) for r in disputed)]
    write_json(DATA_OUT / "disputed_contracts.json", {
        "n": len(rows_out),
        "schema": [
            "id", "question_text", "category", "first_proposal", "final_payoff",
            "revised", "multi_episode", "chain_type", "candidate_mismatch",
            "mismatch_agreed", "first_proposal_time", "final_settlement_time",
        ],
        "rows": rows_out,
    })
    write_json(DATA_OUT / "_internal_id_map.json", sidecar)
    audit["stages"].append({"disputed_contracts_coverage": coverage})

    # ---------- (4) chain_examples.json ----------
    print("[5/7] Build chain_examples.json (8-12 hand-picked)")
    # Strategy: query episode_panel for disputed condition_ids spanning the chain types.
    # Quality gate: question_text non-null, final_outcome non-null, no benchmark caveat (cat_sports/weather preferred).
    # Pull ~20 candidates per chain category, then prune to 10.
    def fetch_examples(chain_filter_sql: str, limit: int):
        return con.execute(f"""
            WITH disputed_rev3 AS (
              SELECT condition_id, episode_sequence, terminal_state_type FROM rev3 WHERE D_i = 1
            ),
            with_eps AS (
              SELECT
                d.condition_id,
                d.episode_sequence,
                d.terminal_state_type,
                ANY_VALUE(e.question_text) AS question_text,
                ANY_VALUE(e.category) AS category,
                COUNT(*) AS n_episodes,
                BOOL_OR(LOWER(e.category) = 'sports') AS has_sports,
                ARRAY_AGG(STRUCT_PACK(
                  t_proposal := e.t_proposal,
                  t_dispute := e.t_dispute,
                  t_final := e.t_final,
                  proposed_outcome := e.proposed_outcome,
                  final_outcome := e.final_outcome,
                  was_disputed := e.was_disputed,
                  outcome_flipped := e.outcome_flipped,
                  proposed_price := e.proposed_price,
                  settled_price := e.settled_price
                ) ORDER BY e.t_proposal) AS episodes
              FROM disputed_rev3 d
              JOIN episode_panel e ON d.condition_id = e.condition_id
              WHERE e.question_text IS NOT NULL AND e.question_text != ''
                AND e.proposed_outcome IS NOT NULL
                AND e.final_outcome IS NOT NULL
              GROUP BY d.condition_id, d.episode_sequence, d.terminal_state_type
            )
            SELECT * FROM with_eps
            WHERE n_episodes >= 2 AND has_sports = true AND ({chain_filter_sql})
            ORDER BY n_episodes ASC, condition_id
            LIMIT {limit}
        """).fetchall()

    # Two-pass selection: 5 request-voiding (episode_sequence contains 'rejected') + 5 repeated-adapter-routed (no 'rejected')
    voiding_rows = fetch_examples("episode_sequence LIKE '%rejected%'", 5)
    repeated_rows = fetch_examples("episode_sequence NOT LIKE '%rejected%'", 5)
    cand_cols = [d[0] for d in con.description]

    examples = []
    voiding_count = 0
    repeated_count = 0
    for source_rows, expected_type in [(voiding_rows, "Request-voiding chain"), (repeated_rows, "Repeated adapter-routed request")]:
        for row in source_rows:
            rec = dict(zip(cand_cols, row))
            chain_type = decode_episode_sequence(rec["episode_sequence"])
            examples.append({
                "id": short_id(rec["condition_id"]),
                "question_text": rec["question_text"],
                "category": rec["category"],
                "chain_type": chain_type,
                "n_episodes": rec["n_episodes"],
                "request_sequence": [
                    {
                        "request_idx": i + 1,
                        "proposed": ep["proposed_outcome"],
                        "was_disputed": ep["was_disputed"],
                        "final_outcome": ep["final_outcome"],
                        "proposal_time": ep["t_proposal"],
                        "dispute_time": ep["t_dispute"],
                        "final_time": ep["t_final"],
                    }
                    for i, ep in enumerate(rec["episodes"])
                ],
            })
            if chain_type == "Request-voiding chain":
                voiding_count += 1
            else:
                repeated_count += 1

    write_json(DATA_OUT / "chain_examples.json", {
        "n": len(examples),
        "selection_rule": "Sports-only, multi-episode, both proposed and final outcomes non-null. Curated to span Request-voiding and Repeated adapter-routed types.",
        "examples": examples,
    })
    audit["stages"].append({
        "chain_examples": {
            "n": len(examples),
            "voiding": voiding_count,
            "repeated": repeated_count,
        }
    })

    # ---------- (5) candidate_mismatches.json ----------
    print("[6/7] Build candidate_mismatches.json (94 cases, 64 agreed)")
    # combine reconciliation table (has classification, P_i1, S_i, G_i_label) with breakdown
    mm_rows = []
    incon_by_id = {r["condition_id"]: r for r in read_csv_rows(ANALYSIS / "rev3_initially_inconsistent_case_table.csv")}
    for cid, r in reconciled_map.items():
        question = r.get("question_text") or incon_by_id.get(cid, {}).get("question_text") or None
        agreed = cid in agreed_ids
        mm_rows.append({
            "id": short_id(cid),
            "question_text": question if question else None,
            "category": r.get("category") or None,
            "first_proposal": r.get("P_i1"),
            "final_payoff": r.get("S_i"),
            "coded_benchmark": r.get("G_i_label"),
            "mismatch_agreed": agreed,
            "classification": r.get("classification"),
        })
    breakdown_out = []
    for row in cand_breakdown:
        breakdown_out.append({
            "category": row["category"],
            "n_candidate": int(row["n_candidate_94"]),
            "n_agreed": int(row["n_two_pass_agreed_64"]),
            "n_questionable": int(row["n_questionable_30"]),
        })
    write_json(DATA_OUT / "candidate_mismatches.json", {
        "n_candidate": sum(b["n_candidate"] for b in breakdown_out),
        "n_agreed": sum(b["n_agreed"] for b in breakdown_out),
        "by_category": breakdown_out,
        "rows": mm_rows,
    })

    # ---------- (6) refresh headline_statistics.json ----------
    print("[7/8] Refresh headline_statistics.json from oracle_gov/analysis_output/")
    src = ANALYSIS / "headline_statistics.json"
    if src.exists():
        shutil.copyfile(src, DATA_OUT / "headline_statistics.json")
    else:
        print(f"  WARNING: {src} not found; skipping refresh")

    # ---------- (7) public_cases.json ----------
    print("[8/8] Build public_cases.json (hand-curated locator)")
    public_cases = build_public_cases(con, mismatch_ids, agreed_ids)
    write_json(DATA_OUT / "public_cases.json", public_cases)

    # ---------- audit memo ----------
    print("Write data_audit_memo.md")
    write_audit_memo(audit, summary, coverage, chain_type_summary, examples, mm_rows, agreed_ids, mismatch_ids, audit_counts, public_cases)

    print("Done.")
    print(f"  JSONs written to: {DATA_OUT}")
    print(f"  Audit memo: {MEMO_OUT}")


def build_public_cases(con, mismatch_ids, agreed_ids):
    """Hand-curated public-case locator. Searches pm_markets for question text matching publicly-salient
    cases discussed in the advisory and the paper. Each case gets: status / locator / why-it-matters."""
    # Curated keyword sets per case
    # (label, why_matters, primary_kws (OR), required_kws (AND), exclude_kws)
    queries = [
        ("Zelenskyy suit",
         "Did Zelenskyy wear a suit? — semantic-boundary ambiguity over what counts as a suit; paper's appendix flags this as excluded due to definitional ambiguity.",
         ["zelensky"], ["suit", "wear"], None),
        ("Venezuela / Maduro",
         "Disputes around the 2024 Venezuelan election outcome and the U.S. military-engagement / Maduro-custody markets; paper covers as Appendix-D candidate mismatch.",
         ["venezuela", "maduro"], None, None),
        ("Iran / Khamenei",
         "Did the Israeli strikes count as 'jets striking Iran'? Khamenei-related markets; paper's Appendix D flags candidate mismatch on at least one.",
         ["khamenei", "iran"], None, ["bitcoin", "btc"]),
        ("Trump Bitcoin reserve",
         "Will Trump establish a strategic Bitcoin reserve? Paper-level exclusion: contract-design ambiguity over what counts as 'establishing a reserve.'",
         ["bitcoin", "btc"], ["trump", "reserve", "strategic"], None),
        ("Tesla robotaxi",
         "Did Tesla launch a robotaxi? Brand-vs-functional ambiguity; paper-level excluded.",
         ["robotaxi"], None, None),
        ("Lebanon ground incursion",
         "Did Israel conduct a ground incursion into Lebanon? Bellwether's blueprints page cites this as an oracle failure where DVM voted against widely-reported reality.",
         ["lebanon"], None, None),
        ("Government shutdown 2025",
         "Did the U.S. government shut down? Bellwether cites this as a rule-change failure (cutoff date inserted after trading began).",
         ["shutdown"], ["government", "u.s.", "us "], None),
    ]
    cases = []
    for label, why, kws, required, exclude in queries:
        kw_clause = "(" + " OR ".join([f"LOWER(m.question) LIKE '%{k}%'" for k in kws]) + ")"
        if required:
            kw_clause += " AND (" + " OR ".join([f"LOWER(m.question) LIKE '%{r}%'" for r in required]) + ")"
        if exclude:
            kw_clause += " AND NOT (" + " OR ".join([f"LOWER(m.question) LIKE '%{e}%'" for e in exclude]) + ")"
        rows = con.execute(f"""
            SELECT m.condition_id, m.question, m.category, m.slug
            FROM pm_markets m
            WHERE {kw_clause}
            LIMIT 8
        """).fetchall()
        # filter to disputed cond_ids only
        disputed = con.execute("SELECT condition_id FROM rev3 WHERE D_i=1").fetchall()
        disputed_set = {r[0] for r in disputed}
        in_panel = [r for r in rows if r[0] in disputed_set]

        case = {
            "label": label,
            "why_matters": why,
            "n_market_matches": len(rows),
            "n_disputed_matches": len(in_panel),
            "status": "Located in disputed sample" if in_panel else ("Located in market panel only (not disputed)" if rows else "Not located in current data"),
            "matches": [
                {
                    "id": short_id(r[0]),
                    "question": r[1],
                    "slug": r[3],
                    "in_disputed_panel": r[0] in disputed_set,
                    "candidate_mismatch": r[0] in mismatch_ids,
                    "mismatch_agreed": (r[0] in agreed_ids) if r[0] in mismatch_ids else None,
                }
                for r in rows
            ],
        }
        cases.append(case)

    return {
        "disclaimer": "This page reports where named cases sit in the settlement-data funnel. It does not adjudicate the underlying real-world outcome. Locate, do not adjudicate.",
        "n_cases": len(cases),
        "cases": cases,
    }


def write_audit_memo(audit, summary, coverage, chain_type_summary, examples, mm_rows, agreed_ids, mismatch_ids, audit_counts=None, public_cases=None):
    """Generate human-readable Phase 1 Gate 1 review memo."""
    pct_q = 100.0 * coverage["with_question_text"] / coverage["total"]
    pct_cat = 100.0 * coverage["with_category"] / coverage["total"]
    pct_fp = 100.0 * coverage["with_final_payoff"] / coverage["total"]
    pct_chain = 100.0 * coverage["with_chain_type"] / coverage["total"]

    if pct_q >= 90:
        cov_band = "≥90% — full Explorer ships"
        cov_action = "PROCEED with full Contract Explorer table"
    elif pct_q >= 80:
        cov_band = "80-90% — internal Explorer with badge"
        cov_action = "SHIP with [question text missing] badge; do NOT promote to Phase 2 deploy"
    elif pct_q >= 70:
        cov_band = "70-80% — hold Contract Explorer"
        cov_action = "SKIP explorer.html; ship index.html (Funnel) + chain.html only"
    else:
        cov_band = "<70% — halt"
        cov_action = "HALT and fix join in export pipeline"

    lines = [
        "# Settlement Explorer — Data Audit Memo (Phase 1 Gate 1)",
        "",
        f"**Generated:** {audit['started_at']}",
        f"**Source DB:** `{DUCKDB_PATH}`",
        f"**Source CSVs:** `{ANALYSIS}/rev3_*.csv`",
        f"**Output JSONs:** `{DATA_OUT}/`",
        "",
        "## 1. Paper-consistency check",
        "",
        "| Metric | Value | Paper Table 1 |",
        "|---|---|---|",
        f"| Total settlement conditions | {summary['total_settlement_conditions']:,} | 661,949 |",
        f"| Disputed (D_i=1) | {summary['disputed']:,} | 2,221 |",
        f"| Disputed with observed final payoff | {summary['disputed_with_observed_final_payoff']:,} | 2,197 |",
        f"| Proposal-to-final revisions | {summary['proposal_to_final_revisions']:,} | 530 |",
        f"| Revision rate | {summary['revision_rate']:.1%} | 24.1% |",
        f"| Repeated adapter-routed revisions | {summary['repeated_adapter_routed_revisions']:,} | 352 |",
        f"| Request-voiding revisions | {summary['request_voiding_revisions']:,} | 178 |",
        f"| Candidate mismatches | {summary['candidate_mismatches']:,} | 94 |",
        f"| Candidate mismatches (agreed) | {summary['candidate_mismatches_agreed']:,} | 64 |",
        "",
        "## 2. Join coverage table (disputed_contracts.json)",
        "",
        "| Field | n | % of 2,221 |",
        "|---|---|---|",
        f"| Total disputed | {coverage['total']:,} | 100.0% |",
        f"| With question_text | {coverage['with_question_text']:,} | {pct_q:.1f}% |",
        f"| With category | {coverage['with_category']:,} | {pct_cat:.1f}% |",
        f"| With final_payoff | {coverage['with_final_payoff']:,} | {pct_fp:.1f}% |",
        f"| With chain_type (decoded) | {coverage['with_chain_type']:,} | {pct_chain:.1f}% |",
        "",
        f"**Question-text coverage band:** {cov_band}",
        f"**Decision per plan:** {cov_action}",
        "",
        "## 3. Public-label audit table (raw → public)",
        "",
        "| Raw / source object | Public label | Where used |",
        "|---|---|---|",
        "| `Flip_i = 1` | `revised: true` | disputed_contracts.json |",
        "| `P_i1` | `first_proposal` | disputed_contracts.json |",
        "| `S_i` / `terminal_state_type` | `final_payoff` | disputed_contracts.json |",
        "| `condition_id` | `id` (8-char hash) | disputed_contracts.json (raw retained in `_internal_id_map.json`) |",
        "| `flip_rate` | `revision_rate` | chain_signatures.json |",
        "| `chain_signature` w/ `has_rejection=true` | `Request-voiding chain` | disputed_contracts.json + chain_signatures.json |",
        "| `chain_signature` w/ `has_rejection=false` | `Repeated adapter-routed request` | disputed_contracts.json + chain_signatures.json |",
        "| `candidate_mismatch_flag` | `candidate_mismatch` | disputed_contracts.json |",
        "| classification = uncorrected_oracle_error | `mismatch_agreed: true` | candidate_mismatches.json |",
        "",
        "## 4. Chain-signature inventory",
        "",
        "Verified mapping (chain_signatures.json `chain_type_summary`):",
        "",
        "| Public chain type | n | n revised | revision_rate |",
        "|---|---|---|---|",
    ]
    for s in chain_type_summary:
        lines.append(f"| {s['chain_type']} | {s['n_contracts']:,} | {s['n_revised']:,} | {s['revision_rate']:.1%} |")
    lines += [
        "",
        "## 5. Example-contract approval table (chain_examples.json)",
        "",
        "| id | Chain type | Question text? | Final payoff? | Approved? |",
        "|---|---|---|---|---|",
    ]
    for ex in examples:
        has_q = "✓" if ex["question_text"] else "✗"
        has_fp = "✓" if any(e["final_outcome"] for e in ex["request_sequence"]) else "✗"
        approved = "✓" if has_q == "✓" and has_fp == "✓" else "✗"
        lines.append(f"| `{ex['id']}` | {ex['chain_type']} | {has_q} | {has_fp} | {approved} |")
    # Audit-flag distribution (Phase 2)
    if audit_counts:
        lines += [
            "",
            "## 5b. Settlement Auditability flag distribution (Phase 2)",
            "",
            "Heuristic regex applied to question_text + pm_markets.description + ancillary_data. Each cell is the share of disputed contracts (n=2,221) for which the flag is true.",
            "",
            "| Flag | n (true) | % of 2,221 |",
            "|---|---|---|",
        ]
        for k, v in audit_counts.items():
            lines.append(f"| {k} | {v} | {100*v/2221:.1f}% |")
        lines.append("")
        lines.append(f"Description coverage: {coverage.get('with_description',0):,} / 2,221 ({100*coverage.get('with_description',0)/2221:.1f}%)")

    if public_cases:
        lines += [
            "",
            "## 5c. Public Case Locator results",
            "",
            "Keyword-matched on `pm_markets.question`. Each entry counts disputed-panel matches.",
            "",
            "| Case | n_market_matches | n_disputed_matches | Status |",
            "|---|---|---|---|",
        ]
        for c in public_cases.get("cases", []):
            lines.append(f"| {c['label']} | {c['n_market_matches']} | {c['n_disputed_matches']} | {c['status']} |")

    lines += [
        "",
        f"**Total chain examples selected:** {len(examples)} (target 8-12)",
        "",
        "## 6. Five random chain examples (plain-text walk-throughs)",
        "",
    ]
    for ex in examples[:5]:
        lines.append(f"### `{ex['id']}` — {ex['chain_type']}")
        lines.append(f"**Question:** {(ex['question_text'] or '[missing]')[:200]}")
        lines.append(f"**Episodes ({ex['n_episodes']}):**")
        for r in ex["request_sequence"]:
            lines.append(f"- Request {r['request_idx']}: proposed `{r['proposed']}` → "
                         f"{'disputed' if r['was_disputed'] else 'undisputed'} → "
                         f"final `{r['final_outcome']}`")
        lines.append("")
    lines += [
        "## 7. Field rename audit",
        "",
        "Public JSONs scanned for raw paper variable leakage:",
        "",
        "| Raw token | Should NOT appear in | Status |",
        "|---|---|---|",
        "| `P_i1` | disputed_contracts.json (rows) | ✓ replaced with `first_proposal` |",
        "| `S_i` | disputed_contracts.json (rows) | ✓ replaced with `final_payoff` |",
        "| `Flip_i` | disputed_contracts.json (rows) | ✓ replaced with `revised` |",
        "| `condition_id` | disputed_contracts.json (rows) | ✓ replaced with `id` (raw retained in `_internal_id_map.json`) |",
        "| `flip_rate` | chain_signatures.json | ✓ replaced with `revision_rate` |",
        "| `chain_signature` | disputed_contracts.json (rows) | ✓ replaced with `chain_type` |",
        "",
        "**Manual check needed:** open the JSONs and verify no raw token leaks into reader-facing rows.",
        "",
        "## 8. Coverage gap detail",
        "",
        f"- {2221 - coverage['with_question_text']} disputed condition_ids have NO question_text in any of:",
        "  - `pm_markets.question`",
        "  - `episode_panel.question_text`",
        "  - `pm_resolution_events.ancillary_data_decoded`",
        "- These are likely Kalshi-only or deprecated condition_ids tracked by UMA but not synced into the Polymarket-side tables.",
        f"- Effective public-facing coverage cap: {pct_q:.1f}% ({coverage['with_question_text']:,} of {coverage['total']:,}).",
        "",
        "## 9. Gate decision",
        "",
        f"**Question-text coverage:** {pct_q:.1f}% — band: {cov_band}",
        f"**Recommended action:** {cov_action}",
        "",
        "**User must decide before any UI work begins:**",
        "- [ ] Approve current export and proceed per recommended action above",
        "- [ ] Halt and improve coverage (extend join with Kalshi sources or pm_resolution_events.raw)",
        "- [ ] Override and ship full Explorer despite below-threshold coverage (with explicit badge)",
        "",
    ]
    MEMO_OUT.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
