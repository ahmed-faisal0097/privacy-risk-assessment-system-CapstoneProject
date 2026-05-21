"""Uniqueness and rare-combination evaluation helper.

This module exposes a single function `uniqueness_and_rare_combination` which
computes k(record) for synthetic records against a real dataset and returns a
summary. It also optionally writes a minimal CSV and JSON summary.
"""
from __future__ import annotations
import os
import json
from typing import List, Dict, Any, Optional

import pandas as pd

# Pull defaults from a central validation module. Use robust imports so the
# module can be run both as a package and directly via the importlib fallback
# loader used by `main.py`.
# try:
#     # Normal package import
#     from backend.app.validation import DEFAULT_QIS, DEFAULT_SAS
# except Exception:  # pragma: no cover - fallback paths exercised in different runtimes
#     try:
#         # Relative import when package context is available
#         from .validation import DEFAULT_QIS, DEFAULT_SAS
#     except Exception:
#         # Last-resort: load the file by path
#         import importlib.util

#         _val_path = os.path.join(os.path.dirname(__file__), "validation.py")
#         spec = importlib.util.spec_from_file_location("backend.app.validation", _val_path)
#         _mod = importlib.util.module_from_spec(spec)
#         assert spec.loader is not None
#         spec.loader.exec_module(_mod)
#         DEFAULT_QIS = getattr(_mod, "DEFAULT_QIS")
#         DEFAULT_SAS = getattr(_mod, "DEFAULT_SAS")


# def uniqueness_and_rare_combination(
#     real_path: str = "datasets/sample_data/diabetic_data.csv",
#     synthetic_path: str = "datasets/sample_data/V1_syn.csv",
#     qis: List[str] = DEFAULT_QIS,
#     sas: List[str] = DEFAULT_SAS,
#     out_csv: Optional[str] = "results/syn_flags.csv",
#     out_full_csv: Optional[str] = "results/syn_per_record.csv",
#     out_json: Optional[str] = "results/syn_k_summary.json",
#     out_qid_stats_csv: Optional[str] = "results/qid_group_stats.csv",
#     rare_threshold: int = 5,
# ) -> Dict[str, Any]:
    
def uniqueness_and_rare_combination(
    real_path: str,
    synthetic_path: str,
    qis: List[str],
    sas: List[str],
    out_csv: Optional[str] = "results/syn_flags.csv",
    out_full_csv: Optional[str] = "results/syn_per_record.csv",
    out_json: Optional[str] = "results/syn_k_summary.json",
    out_qid_stats_csv: Optional[str] = "results/qid_group_stats.csv",
    rare_threshold: int = 5,
) -> Dict[str, Any]:
    """Compute k(record) for synthetic records w.r.t. a real dataset and return a summary.

    Returns a summary dictionary containing counts, percentages and metadata.
    """
    # High-level contract:
    # - Inputs: paths to real and synthetic CSVs, optional lists of QIs and SAs
    # - Outputs: summary dict + optional written CSVs/JSON
    # - Behavior: for each synthetic record, compute k_real = number of real
    #   records that match exactly on the chosen QIs. From k_real we derive
    #   binary flags and dataset-level summaries.
    # `qis` and `sas` default to the values from `validation.py` at
    # function-definition time. They are expected to be concrete lists of
    # column names and are required for correct operation.

    if not os.path.exists(real_path):
        raise FileNotFoundError(real_path)
    if not os.path.exists(synthetic_path):
        raise FileNotFoundError(synthetic_path)

    def _read_file(path: str) -> pd.DataFrame:
        ext = os.path.splitext(path)[1].lower()
        if ext == ".xlsx":
            return pd.read_excel(path)
        return pd.read_csv(path, low_memory=False)

    real_df = _read_file(real_path)
    syn_df = _read_file(synthetic_path)

    # At this point we have two DataFrames: `real_df` (the baseline) and
    # `syn_df` (the synthetic records to evaluate). All downstream computations
    # are deterministic pandas operations based on these two frames.

    # Use the QIs as provided by `validation.py`. The project guarantees
    # these QIs exist in both datasets; we therefore do not perform extra
    # intersection checks here.
    used_qis = qis

    # Compute k_real for each synthetic row. We derive counts of real records
    # per unique QI combination (real_counts) and then merge those counts
    # into the synthetic dataframe. Any synthetic combination that does not
    # appear in the real data will receive a k_real of 0.
    # (Assumption: `used_qis` is a non-empty list provided by validation.py.)
    real_counts = real_df.groupby(used_qis).size().reset_index(name="real_count")
    # Merge the real_counts into the synthetic records. Use a left join so
    # every synthetic row is preserved even if there is no matching real QI
    # combination.
    syn_with_k = syn_df.merge(real_counts, on=used_qis, how="left")
    # Missing matches will be NaN; replace with 0 and convert to int.
    syn_with_k["real_count"] = syn_with_k["real_count"].fillna(0).astype(int)
    syn_with_k = syn_with_k.rename(columns={"real_count": "k_real"})

    # Add bookkeeping columns
    # - synthetic_row_number: a 1-based index to make row references readable
    # - is_unique: binary flag indicating k_real == 1
    # - is_rare_lt_5: binary flag indicating k_real < rare_threshold
    syn_with_k = syn_with_k.reset_index(drop=True)
    syn_with_k.insert(0, "synthetic_row_number", range(1, len(syn_with_k) + 1))
    syn_with_k["is_unique"] = (syn_with_k["k_real"] == 1).astype(int)
    syn_with_k["is_rare_lt_5"] = (syn_with_k["k_real"] < rare_threshold).astype(int)

    total = len(syn_with_k)
    k_series = syn_with_k["k_real"]

    # Build a compact summary dictionary with counts and percentages for
    # quick reporting. The percentages are computed relative to the total
    # number of synthetic records.
    summary: Dict[str, Any] = {
        "total_synthetic_records": int(total),
        "k_zero_count": int((k_series == 0).sum()),
        "k_one_count": int((k_series == 1).sum()),
        "k_lt_5_count": int((k_series < rare_threshold).sum()),
        "uniqueness_score_pct": float((k_series == 1).sum() / total * 100) if total else 0.0,
        "rare_combination_score_pct": float((k_series < rare_threshold).sum() / total * 100) if total else 0.0,
        "qis_requested": qis,
        "qis_used": used_qis,
        "sas_used": sas,
    }

    # Compute group statistics on the real dataset for the used QIs and
    # optionally write a small CSV with those metrics. These describe the
    # population-level distribution of QI combinations in the real data and
    # are useful for understanding the exposure risk independent of the
    # specific synthetic records.
    qid_stats: Dict[str, Any] = {}
    n_rows = len(real_df)
    # Compute the group sizes for every unique QI combination in the real
    # dataset. (Assumption: `used_qis` is non-empty.)
    group_series = real_df.groupby(used_qis).size()

    n_groups = int(len(group_series))
    min_group_size = int(group_series.min()) if n_groups else 0
    median_group_size = float(group_series.median()) if n_groups else 0.0
    max_group_size = int(group_series.max()) if n_groups else 0
    unique_groups = int((group_series == 1).sum())
    unique_rows = int(unique_groups)  # groups of size 1 correspond to one row each
    unique_row_rate = float(unique_rows / n_rows) if n_rows else 0.0
    rows_in_groups_lt_5 = int(group_series[group_series < rare_threshold].sum())
    rows_in_groups_lt_5_rate = float(rows_in_groups_lt_5 / n_rows) if n_rows else 0.0

    qid_stats = {
        "qid_columns": ",".join(used_qis),
        "n_rows": int(n_rows),
        "n_groups": n_groups,
        "min_group_size": min_group_size,
        "median_group_size": median_group_size,
        "max_group_size": max_group_size,
        "unique_rows": unique_rows,
        "unique_row_rate": unique_row_rate,
        "rows_in_groups_lt_5": rows_in_groups_lt_5,
        "rows_in_groups_lt_5_rate": rows_in_groups_lt_5_rate,
    }

    # Merge into the main summary
    summary.update({"qid_group_stats": qid_stats})

    if out_qid_stats_csv:
        os.makedirs(os.path.dirname(out_qid_stats_csv) or ".", exist_ok=True)
        # Write a single-row CSV with the requested columns. Columns are:
        # qid_columns, n_rows, n_groups, min_group_size, median_group_size,
        # max_group_size, unique_rows, unique_row_rate, rows_in_groups_lt_5,
        # rows_in_groups_lt_5_rate
        import csv

        with open(out_qid_stats_csv, "w", encoding="utf8", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "qid_columns",
                    "n_rows",
                    "n_groups",
                    "min_group_size",
                    "median_group_size",
                    "max_group_size",
                    "unique_rows",
                    "unique_row_rate",
                    "rows_in_groups_lt_5",
                    "rows_in_groups_lt_5_rate",
                ],
            )
            writer.writeheader()
            writer.writerow(qid_stats)

    # Optionally write CSV with only the requested minimal columns.
    # This file contains one row per synthetic record with the canonical
    # k_real and two binary flags. It's intended for quick filtering.
    if out_csv:
        os.makedirs(os.path.dirname(out_csv) or ".", exist_ok=True)
        syn_with_k[["synthetic_row_number", "k_real", "is_unique", "is_rare_lt_5"]].to_csv(out_csv, index=False)

    # Optionally write a per-record CSV containing only the three requested
    # columns (synthetic_row_number, uniqueness_rate, rare_combination_rate).
    # This is *not* a dump of all synthetic columns; it intentionally keeps
    # the per-record output minimal and focused on the disclosure indicators.
    if out_full_csv:
        os.makedirs(os.path.dirname(out_full_csv) or ".", exist_ok=True)
        # Write a minimal per-record CSV containing only:
        # - synthetic_row_number
        # - uniqueness_rate (1.0 for unique, 0.0 otherwise)
        # - rare_combination_rate (1.0 for k < rare_threshold, 0.0 otherwise)
        per_rec = syn_with_k[["synthetic_row_number", "is_unique", "is_rare_lt_5"]].copy()
        per_rec = per_rec.rename(
            columns={"is_unique": "uniqueness_rate", "is_rare_lt_5": "rare_combination_rate"}
        )
        # Use floats so downstream tools treat these as rates (1.0/0.0)
        per_rec["uniqueness_rate"] = per_rec["uniqueness_rate"].astype(float)
        per_rec["rare_combination_rate"] = per_rec["rare_combination_rate"].astype(float)
        per_rec.to_csv(out_full_csv, index=False)

    # Optionally write JSON summary
    if out_json:
        os.makedirs(os.path.dirname(out_json) or ".", exist_ok=True)
        with open(out_json, "w", encoding="utf8") as f:
            json.dump(summary, f, indent=2)

    return summary
