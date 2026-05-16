"""Re-export candidate_mismatches.json with per-row benchmark fields.

Reads data-source/rev3_final_mismatch_reconciliation.csv and produces
data/candidate_mismatches.json with stratum, G_i_source, and
mechanical_final_correct_a1 exposed per row. Supports referee-grade
auditing of the 94 / 64 figures.

Run from polywether-work root:
    python scripts/rebuild_candidate_mismatches.py
"""
import csv, hashlib, json
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-source" / "rev3_final_mismatch_reconciliation.csv"
OUT = ROOT / "data" / "candidate_mismatches.json"

def short_id(raw):
    return hashlib.sha256(raw.encode()).hexdigest()[:8]

with SRC.open(encoding="utf-8") as f:
    src_rows = list(csv.DictReader(f))

# 94 broad candidate mismatches = classification == 'uncorrected_oracle_error'
mismatch_rows = [r for r in src_rows if r["classification"] == "uncorrected_oracle_error"]
assert len(mismatch_rows) == 94, f"expected 94, got {len(mismatch_rows)}"

# Per-row mismatch_agreed: stratum == 'two_benchmark' means both LLM passes
# coded the row; stratum == 'frozen' means the assignment was carried over
# from a single coded pass without independent re-coding.
out_rows = []
for r in mismatch_rows:
    raw = r["condition_id"]
    out_rows.append({
        "id": short_id(raw),
        "raw_condition_id": raw,
        "question_text": r.get("question_text") or None,
        "category": r.get("category") or None,
        "first_proposal": r.get("P_i1") or None,
        "final_payoff":   r.get("S_i") or None,
        "coded_benchmark": r.get("G_i_label") or None,
        "operative_proposed": r.get("operative_proposed") or None,
        "operative_final":    r.get("operative_final") or None,
        "stratum": r.get("stratum") or None,                       # two_benchmark | frozen
        "G_i_source": r.get("G_i_source") or None,
        "mechanical_final_correct_a1": r.get("mechanical_final_correct_a1") or None,
        "legacy_final_correct":        r.get("legacy_final_correct") or None,
        # Per-row "agreed" = stratum 'two_benchmark' (both passes coded this row)
        "mismatch_agreed": r.get("stratum") == "two_benchmark",
        "classification": r["classification"],
    })

n_two_benchmark = sum(1 for o in out_rows if o["stratum"] == "two_benchmark")
n_frozen        = sum(1 for o in out_rows if o["stratum"] == "frozen")

# Category aggregate (preserve old shape)
by_cat = defaultdict(lambda: {"n_candidate": 0, "n_agreed": 0, "n_questionable": 0})
for o in out_rows:
    cat = o["category"] or "uncategorized"
    by_cat[cat]["n_candidate"] += 1
    if o["mismatch_agreed"]:
        by_cat[cat]["n_agreed"] += 1
    else:
        by_cat[cat]["n_questionable"] += 1

by_category = [{"category": k, **v} for k, v in by_cat.items()]

out = {
    "n_candidate": 94,
    "n_agreed_two_benchmark": n_two_benchmark,
    "n_frozen": n_frozen,
    "n_agreed": n_two_benchmark,  # legacy alias
    "schema_note": (
        "94 rows where reconciliation classification == 'uncorrected_oracle_error'. "
        "Per-row mismatch_agreed = (stratum == 'two_benchmark'); "
        "stratum 'frozen' rows carry forward a single coded pass without independent re-coding."
    ),
    "by_category": by_category,
    "rows": out_rows,
}

OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"wrote {OUT}")
print(f"  total: 94 (two_benchmark={n_two_benchmark}, frozen={n_frozen})")
