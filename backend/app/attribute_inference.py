"""Attribute inference evaluation helper.

This module exposes a single function `attribute_inference_evaluation` which
computes a simple majority-label attack for one or more QID sets and writes a
CSV summary to `results/attribute_inference/attribute_inference_summary.csv` by
default.

The summary CSV contains one row per QID set with the following columns:
 - qid_set: comma-separated QID columns used by the attacker
 - known_columns: same as qid_set (keeps parity with other outputs)
 - target_column: the attribute being inferred
 - n_real_eval_rows: number of rows in the real dataset (rows used to build the attack)
 - coverage_rate: fraction of synthetic rows for which the QID combination exists in the real data
 - attack_accuracy_on_covered: accuracy of the majority-label attack on covered synthetic rows
 - overall_accuracy_with_baseline_fallback: accuracy when uncovered rows use the global baseline label
 - baseline_accuracy: accuracy of always predicting the global baseline label on all synthetic rows
 - gain_over_baseline: difference between overall_accuracy_with_baseline_fallback and baseline_accuracy
 - baseline_label: the global majority label in the real dataset for the target column

The implementation is intentionally simple (majority-label mapping) and is
meant to provide a baseline attribute-inference risk estimate.
"""
from __future__ import annotations
import os
from typing import List, Sequence, Optional, Dict, Any

import pandas as pd


def attribute_inference_evaluation(
    real_path: str,
    synthetic_path: str,
    qid_sets: Sequence[Sequence[str]],
    target_column: str,
    out_csv: Optional[str] = "results/attribute_inference/attribute_inference_summary.csv",
) -> List[Dict[str, Any]]:
    """Evaluate attribute inference risk for one or more QID sets.

    Parameters
    - real_path: path to the real CSV used to build the attacker model
    - synthetic_path: path to the synthetic CSV to evaluate attacks against
    - qid_sets: a sequence of QID column lists (each QID set is a sequence of column names)
    - target_column: the column name in both dataframes that the attacker tries to infer
    - out_csv: optional path where a summary CSV will be written (one row per QID set)

    Returns a list of dictionaries (one per QID set) containing the summary metrics.
    """

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

    if target_column not in real_df.columns:
        raise KeyError(f"target_column '{target_column}' not found in real data")
    if target_column not in syn_df.columns:
        raise KeyError(f"target_column '{target_column}' not found in synthetic data")

    # Normalize qid_sets: allow passing a single list of column names as well
    normalized_qid_sets: List[List[str]] = []
    for q in qid_sets:
        # if user passed a single flat list of strings (columns) inside an outer list,
        # it will still be treated as one qid set; if they passed a tuple/list per set,
        # this also works.
        normalized_qid_sets.append(list(q))

    results: List[Dict[str, Any]] = []

    # Baseline: global majority label computed from the real dataset
    baseline_label = None
    try:
        baseline_label = real_df[target_column].mode(dropna=True).iloc[0]
    except Exception:
        # If mode cannot be computed (empty column), fallback to None
        baseline_label = None

    n_real = int(len(real_df))
    n_syn = int(len(syn_df))

    # Write a small CSV containing the global majority (baseline) label and
    # counts so callers can easily see the fallback prediction and its support.
    try:
        out_dir_base = os.path.dirname(out_csv) or "results"
        os.makedirs(out_dir_base, exist_ok=True)
        baseline_count = 0
        baseline_freq = 0.0
        if baseline_label is not None and n_real:
            try:
                baseline_count = int((real_df[target_column] == baseline_label).sum())
                baseline_freq = float(baseline_count / n_real)
            except Exception:
                baseline_count = 0
                baseline_freq = 0.0

        baseline_rows = [{
            "target_column": target_column,
            "baseline_label": str(baseline_label),
            "baseline_count": baseline_count,
            "n_training_rows": n_real,
            "baseline_frequency": baseline_freq,
        }]

        baseline_df = pd.DataFrame(baseline_rows)
        baseline_csv = os.path.join(out_dir_base, f"baseline_{target_column}.csv")
        baseline_df.to_csv(baseline_csv, index=False)
    except Exception:
        # Non-fatal: if baseline CSV can't be written, continue silently
        baseline_csv = None

    for qcols in normalized_qid_sets:
        # Validate qcols exist
        for c in qcols:
            if c not in real_df.columns or c not in syn_df.columns:
                raise KeyError(f"QID column '{c}' not found in both datasets")

        qid_name = ",".join(qcols)

        # Build mapping from real QID combination -> majority target label and counts
        # Build mapping from real QID combination -> majority target label and counts
        group = real_df.groupby(qcols)[target_column]
        # group_counts: number of rows per QID group in the training data
        group_counts = real_df.groupby(qcols).size()
        # For each group, get the most common label (mode)
        mapping: Dict[tuple, Any] = {}
        for keys, ser in group:
            # keys may be a scalar when qcols has length 1; normalize to tuple
            if len(qcols) == 1:
                key = (keys,)
            else:
                key = tuple(keys)
            # mode may return multiple values; pick the first
            try:
                maj_label = ser.mode(dropna=True).iloc[0]
            except Exception:
                maj_label = None
            mapping[key] = maj_label

        # Write a mapping CSV into the same directory as out_csv so it's visible
        try:
            out_dir = os.path.dirname(out_csv) or "results"
            os.makedirs(out_dir, exist_ok=True)
            mapping_rows = []
            for key, count in group_counts.items():
                # normalize key to tuple
                if isinstance(key, tuple):
                    key_vals = tuple(key)
                else:
                    key_vals = (key,)
                # ensure key_vals length matches qcols
                # if lengths differ, pad/truncate conservatively
                if len(key_vals) != len(qcols):
                    # represent as single string in fallback column
                    row = {"group_key": str(key_vals), "group_size": int(count), "mode": mapping.get(key_vals)}
                else:
                    row = {col: val for col, val in zip(qcols, key_vals)}
                    row.update({"group_size": int(count), "mode": mapping.get(key_vals)})
                mapping_rows.append(row)

            if mapping_rows:
                mapping_df = pd.DataFrame(mapping_rows)
                safe_qid_name = qid_name.replace(",", "_").replace(" ", "_")
                mapping_csv = os.path.join(out_dir, f"qid_mapping_{safe_qid_name}_{target_column}.csv")
                mapping_df.to_csv(mapping_csv, index=False)
            else:
                mapping_csv = None
        except Exception:
            # If writing mapping fails, continue without breaking the evaluation
            mapping_csv = None

        # Apply mapping to synthetic rows
        def _make_key(row):
            if len(qcols) == 1:
                return (row[qcols[0]],)
            return tuple(row[c] for c in qcols)

    # Determine coverage: whether synthetic qid key exists in mapping
        syn_keys = syn_df.apply(_make_key, axis=1)
        covered_mask = syn_keys.isin(mapping.keys())
        coverage_count = int(covered_mask.sum())
        coverage_rate = float(coverage_count / n_syn) if n_syn else 0.0

        # Predictions on covered rows
        covered_idx = syn_df[covered_mask].index
        correct_covered = 0
        for idx in covered_idx:
            key = syn_keys.loc[idx]   # .loc keeps label-based access safe for any index type
            predicted = mapping.get(key, None)
            actual = syn_df.at[idx, target_column]
            if pd.isna(predicted) and pd.isna(actual):
                correct_covered += 1
            elif predicted == actual:
                correct_covered += 1

        attack_accuracy_on_covered = float(correct_covered / coverage_count) if coverage_count else 0.0

        # Fallback predictions for uncovered rows use baseline_label
        uncovered_count = n_syn - coverage_count
        correct_fallback = 0
        if uncovered_count > 0 and baseline_label is not None:
            # Count synthetic rows (uncovered) whose actual equals baseline_label
            uncovered_idx = syn_df[~covered_mask].index
            for idx in uncovered_idx:
                actual = syn_df.at[idx, target_column]
                if actual == baseline_label:
                    correct_fallback += 1

        overall_correct = correct_covered + correct_fallback
        overall_accuracy_with_baseline_fallback = float(overall_correct / n_syn) if n_syn else 0.0

        # Baseline accuracy measured on synthetic rows (always predicting baseline_label)
        baseline_correct = 0
        if baseline_label is not None and n_syn:
            baseline_correct = int((syn_df[target_column] == baseline_label).sum())
        baseline_accuracy = float(baseline_correct / n_syn) if n_syn else 0.0

        gain_over_baseline = overall_accuracy_with_baseline_fallback - baseline_accuracy
        # Compute per-group mode accuracy by joining mapping to the synthetic rows
        top_risky_csv = None
        try:
            if mapping_csv is not None:
                map_df = pd.read_csv(mapping_csv)
                # identify qid columns in mapping (exclude group_size, mode, group_key)
                qid_cols_in_map = [c for c in map_df.columns if c not in ("group_size", "mode", "group_key")]
                # join synthetic rows to mapping to compute correctness per group
                if qid_cols_in_map:
                    joined = syn_df.merge(map_df, on=qid_cols_in_map, how="left")
                else:
                    # fallback when mapping used group_key
                    joined = syn_df.copy()
                    joined["group_key"] = syn_keys.apply(lambda k: str(k))
                    joined = joined.merge(map_df, on="group_key", how="left")

                joined["_pred_mode"] = joined["mode"]
                joined["_actual"] = joined[target_column]
                joined["_correct"] = joined["_pred_mode"] == joined["_actual"]

                # compute per-group accuracy
                if qid_cols_in_map:
                    group_acc = joined.groupby(qid_cols_in_map)["_correct"].mean().reset_index().rename(columns={"_correct": "mode_accuracy"})
                    # merge accuracy into mapping_df
                    mapping_df = map_df.merge(group_acc, on=qid_cols_in_map, how="left")
                else:
                    group_acc = joined.groupby("group_key")["_correct"].mean().reset_index().rename(columns={"_correct": "mode_accuracy"})
                    mapping_df = map_df.merge(group_acc, on="group_key", how="left")

                # fill NaN accuracies with 0.0
                if "mode_accuracy" in mapping_df.columns:
                    mapping_df["mode_accuracy"] = mapping_df["mode_accuracy"].fillna(0.0)

                # write back mapping with accuracy
                mapping_df.to_csv(mapping_csv, index=False)

                # produce top risky groups: small group_size with high mode_accuracy
                if "group_size" in mapping_df.columns and "mode_accuracy" in mapping_df.columns:
                    top_risky = mapping_df.sort_values(["mode_accuracy", "group_size"], ascending=[False, True]).head(50)
                else:
                    top_risky = mapping_df.head(50)

                safe_target = str(target_column).replace(" ", "_")
                top_risky_csv = os.path.join(out_dir, f"top_risky_groups_{safe_qid_name}_{safe_target}.csv")
                top_risky.to_csv(top_risky_csv, index=False)
        except Exception:
            top_risky_csv = None

        raw_risk_score = coverage_rate * gain_over_baseline
        # risk_score_pct: convert the raw 0-1 product to a 0-100 percentage scale so it
        # is directly comparable with uniqueness_score_pct and overall_linkage_score_pct.
        # We clamp to [0, 100] because gain_over_baseline can theoretically exceed 1.
        risk_score_pct = float(min(max(raw_risk_score * 100, 0.0), 100.0))

        row: Dict[str, Any] = {
            "qid_set": qid_name,
            "known_columns": qid_name,
            "target_column": target_column,
            "n_real_eval_rows": n_real,
            "n_qid_groups": len(mapping),
            "coverage_rate": coverage_rate,
            "attack_accuracy_on_covered": attack_accuracy_on_covered,
            "overall_accuracy_with_baseline_fallback": overall_accuracy_with_baseline_fallback,
            "baseline_accuracy": baseline_accuracy,
            "gain_over_baseline": gain_over_baseline,
            "baseline_label": str(baseline_label),
            # additional artifacts and risk score/label
            "mapping_csv": mapping_csv,
            "baseline_csv": baseline_csv,
            "top_risky_groups_csv": top_risky_csv,
            "risk_score": raw_risk_score,          # raw 0-1 product (kept for backward compat)
            "risk_score_pct": risk_score_pct,      # explicit 0-100 percentage scale
            "qualitative_label": (
                "High" if (coverage_rate >= 0.5 and gain_over_baseline >= 0.05) else
                "Moderate" if (coverage_rate >= 0.2 and gain_over_baseline >= 0.02) else
                "Low"
            ),
        }

        results.append(row)

    # Write summary CSV
    if out_csv:
        out_dir = os.path.dirname(out_csv) or "results"
        os.makedirs(out_dir, exist_ok=True)
        df_out = pd.DataFrame(results)
        df_out.to_csv(out_csv, index=False)

    return results
