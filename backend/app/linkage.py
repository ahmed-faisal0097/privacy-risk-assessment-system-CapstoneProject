"""
Linkage / Re-identification Risk Evaluation

This module calculates linkage risk using:

1. Exact-match linkage:
   Checks whether synthetic records exactly match real records based on selected QIs.

2. Hamming nearest-neighbour linkage:
   Checks whether synthetic records are very similar to real records by counting
   how many selected QI values are different.

Hamming distance:
    0.0 = exactly same
    1.0 = completely different
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def _read_dataset(path: str) -> pd.DataFrame:
    logger.info("Reading dataset from %s", path)
    if not os.path.exists(path):
        logger.error("Dataset file does not exist: %s", path)
        raise FileNotFoundError(path)

    ext = os.path.splitext(path)[1].lower()

    if ext == ".csv":
        return pd.read_csv(path, low_memory=False)

    if ext == ".xlsx":
        return pd.read_excel(path)

    raise ValueError(f"Unsupported file format: {ext}")


def _risk_level_from_score(score_pct: float) -> str:
    # Thresholds aligned with the rest of the system (upload.py, frontend):
    # HIGH ≥ 20%, MEDIUM ≥ 10%, LOW otherwise.
    if score_pct >= 20:
        return "HIGH"
    if score_pct >= 10:
        return "MEDIUM"
    return "LOW"


def _exact_linkage_label(match_count: int) -> str:
    if match_count == 0:
        return "No Exact Link"
    if match_count == 1:
        return "High Risk - Unique Exact Link"
    if match_count <= 5:
        return "Medium Risk - Small Group Exact Link"
    return "Low Risk - Ambiguous Exact Link"


def _hamming_linkage_label(distance: float, high_threshold: float, medium_threshold: float) -> str:
    if distance <= high_threshold:
        return "High Risk - Very Similar Record"
    if distance <= medium_threshold:
        return "Medium Risk - Similar Record"
    return "Low Risk - Dissimilar Record"


def _prepare_qi_frames(
    real_df: pd.DataFrame,
    syn_df: pd.DataFrame,
    qis: List[str],
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    logger.info(
        "Preparing quasi-identifiers for linkage. qis=%s real_columns=%d synthetic_columns=%d",
        qis,
        len(real_df.columns),
        len(syn_df.columns),
    )
    missing_real = [col for col in qis if col not in real_df.columns]
    missing_syn = [col for col in qis if col not in syn_df.columns]

    if missing_real:
        logger.error("QIs missing in real dataset: %s", missing_real)
        raise ValueError(f"QIs missing in real dataset: {missing_real}")

    if missing_syn:
        logger.error("QIs missing in synthetic dataset: %s", missing_syn)
        raise ValueError(f"QIs missing in synthetic dataset: {missing_syn}")

    real_qi = real_df[qis].copy()
    # real_qi = real_qi.drop_duplicates().reset_index(drop=True)
    syn_qi = syn_df[qis].copy()

    real_qi = real_qi.fillna("__MISSING__").astype(str)
    syn_qi = syn_qi.fillna("__MISSING__").astype(str)

    return real_qi, syn_qi


def exact_match_linkage(
    real_df: pd.DataFrame,
    syn_df: pd.DataFrame,
    qis: List[str],
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    logger.info(
        "Starting exact-match linkage. real_rows=%d synthetic_rows=%d qis=%s",
        len(real_df),
        len(syn_df),
        qis,
    )
    real_qi, syn_qi = _prepare_qi_frames(real_df, syn_df, qis)

    real_counts = (
        real_qi
        .groupby(qis, dropna=False)
        .size()
        .reset_index(name="exact_real_match_count")
    )

    exact_result = syn_qi.merge(real_counts, on=qis, how="left")
    exact_result["exact_real_match_count"] = (
        exact_result["exact_real_match_count"]
        .fillna(0)
        .astype(int)
    )

    exact_result = exact_result.reset_index(drop=True)
    exact_result.insert(0, "synthetic_row_number", range(1, len(exact_result) + 1))

    exact_result["exact_linkage_label"] = exact_result["exact_real_match_count"].apply(
        _exact_linkage_label
    )

    total = len(exact_result)
    unique_exact_count = int((exact_result["exact_real_match_count"] == 1).sum())
    no_exact_count = int((exact_result["exact_real_match_count"] == 0).sum())
    small_group_count = int(
        (
            (exact_result["exact_real_match_count"] >= 2)
            & (exact_result["exact_real_match_count"] <= 5)
        ).sum()
    )
    ambiguous_count = int((exact_result["exact_real_match_count"] > 5).sum())

    exact_score_pct = float(unique_exact_count / total * 100) if total else 0.0

    summary = {
        "exact_total_synthetic_records": int(total),
        "exact_no_match_count": no_exact_count,
        "exact_unique_match_count": unique_exact_count,
        "exact_small_group_match_count": small_group_count,
        "exact_ambiguous_match_count": ambiguous_count,
        "exact_match_score_pct": exact_score_pct,
    }

    logger.info(
        "Exact match linkage completed. total=%d unique=%d no_match=%d ambiguous=%d score=%.2f",
        total,
        unique_exact_count,
        no_exact_count,
        ambiguous_count,
        exact_score_pct,
    )

    return exact_result, summary


def hamming_nearest_neighbour_linkage(
    real_df: pd.DataFrame,
    syn_df: pd.DataFrame,
    qis: List[str],
    high_threshold: float = 0.10,
    medium_threshold: float = 0.30,
    chunk_size: int = 1500,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Calculate nearest-neighbour linkage risk using Hamming distance.

    Hamming distance = number of different QI values / number of QIs.

    This implementation processes synthetic records in chunks to reduce memory usage.
    """

    real_qi, syn_qi = _prepare_qi_frames(real_df, syn_df, qis)

    logger.info(
        "Starting Hamming nearest-neighbour linkage. real_qi_rows=%d syn_qi_rows=%d qis=%d chunk_size=%d",
        len(real_qi),
        len(syn_qi),
        len(qis),
        chunk_size,
    )

    real_qi_unique = real_qi.drop_duplicates().reset_index(drop=True)

    real_array = real_qi_unique.to_numpy(dtype=str)
    # real_array = real_qi.to_numpy(dtype=str)
    syn_array = syn_qi.to_numpy(dtype=str)

    logger.info(
        "Hamming arrays prepared. real_array_shape=%s syn_array_shape=%s",
        real_array.shape,
        syn_array.shape,
    )

    n_qis = len(qis)
    if n_qis == 0:
        logger.error("Hamming linkage failed: no quasi-identifiers")
        raise ValueError("At least one quasi-identifier is required")

    rows = []

    for start in range(0, len(syn_array), chunk_size):
        end = min(start + chunk_size, len(syn_array))
        syn_chunk = syn_array[start:end]

        logger.info(
            "Processing Hamming chunk rows %d-%d of %d",
            start + 1,
            end,
            len(syn_array),
        )

        for local_idx, syn_row in enumerate(syn_chunk):
            # Compare one synthetic row against all real rows.
            # True means different value.
            differences = real_array != syn_row

            # Hamming distance = different columns / total QI columns.
            distances = differences.sum(axis=1) / n_qis

            nearest_index = int(np.argmin(distances))
            nearest_distance = float(distances[nearest_index])

            synthetic_row_number = start + local_idx + 1

            rows.append(
                {
                    "synthetic_row_number": synthetic_row_number,
                    "nearest_real_row_number": nearest_index + 1,
                    "nearest_hamming_distance": nearest_distance,
                    "hamming_linkage_label": _hamming_linkage_label(
                        nearest_distance,
                        high_threshold,
                        medium_threshold,
                    ),
                }
            )

    hamming_result = pd.DataFrame(rows)

    total = len(hamming_result)

    high_close_count = int(
        (hamming_result["nearest_hamming_distance"] <= high_threshold).sum()
    )

    medium_close_count = int(
        (
            (hamming_result["nearest_hamming_distance"] > high_threshold)
            & (hamming_result["nearest_hamming_distance"] <= medium_threshold)
        ).sum()
    )

    low_close_count = int(
        (hamming_result["nearest_hamming_distance"] > medium_threshold).sum()
    )

    hamming_score_pct = float(high_close_count / total * 100) if total else 0.0

    summary = {
        "hamming_total_synthetic_records": int(total),
        "hamming_high_risk_close_match_count": high_close_count,
        "hamming_medium_risk_close_match_count": medium_close_count,
        "hamming_low_risk_distant_match_count": low_close_count,
        "hamming_score_pct": hamming_score_pct,
        "hamming_high_threshold": high_threshold,
        "hamming_medium_threshold": medium_threshold,
    }

    logger.info(
        "Hamming linkage completed. total=%d high=%d medium=%d low=%d score=%.2f",
        total,
        high_close_count,
        medium_close_count,
        low_close_count,
        hamming_score_pct,
    )

    return hamming_result, summary


def linkage_reidentification_risk(
    real_path: str,
    synthetic_path: str,
    qis: List[str],
    out_per_record_csv: Optional[str] = "results/linkage_per_record.csv",
    out_json: Optional[str] = "results/linkage_summary.json",
    hamming_high_threshold: float = 0.10,
    hamming_medium_threshold: float = 0.30,
) -> Dict[str, Any]:
    """
    Calculate linkage / re-identification risk using:
    - Exact-match linkage
    - Hamming nearest-neighbour linkage
    """

    logger.info(
        "Starting linkage re-identification risk evaluation. real_path=%s synthetic_path=%s qis=%s",
        real_path,
        synthetic_path,
        qis,
    )

    real_df = _read_dataset(real_path)
    syn_df = _read_dataset(synthetic_path)

    if not qis:
        logger.error("Linkage evaluation failed: missing quasi-identifiers")
        raise ValueError("At least one quasi-identifier is required")

    exact_df, exact_summary = exact_match_linkage(
        real_df=real_df,
        syn_df=syn_df,
        qis=qis,
    )

    hamming_df, hamming_summary = hamming_nearest_neighbour_linkage(
        real_df=real_df,
        syn_df=syn_df,
        qis=qis,
        high_threshold=hamming_high_threshold,
        medium_threshold=hamming_medium_threshold,
    )

    per_record = exact_df[
        [
            "synthetic_row_number",
            "exact_real_match_count",
            "exact_linkage_label",
        ]
    ].merge(
        hamming_df,
        on="synthetic_row_number",
        how="left",
    )

    total = int(len(per_record))

    exact_score_pct = float(exact_summary["exact_match_score_pct"])
    hamming_score_pct = float(hamming_summary["hamming_score_pct"])

    overall_linkage_score_pct = max(exact_score_pct, hamming_score_pct)
    risk_level = _risk_level_from_score(overall_linkage_score_pct)

    risk_summary = (
        f"{overall_linkage_score_pct:.2f}% overall linkage risk detected. "
        f"Exact-match unique link risk is {exact_score_pct:.2f}%, and "
        f"Hamming nearest-neighbour close-match risk is {hamming_score_pct:.2f}% "
        f"based on the selected quasi-identifiers."
    )

    summary: Dict[str, Any] = {
        "risk_type": "Linkage / Re-identification Risk",
        "total_synthetic_records": total,
        "qis_used": qis,
        "exact_match": exact_summary,
        "hamming_nearest_neighbour": hamming_summary,
        "exact_match_score_pct": exact_score_pct,
        "hamming_score_pct": hamming_score_pct,
        "overall_linkage_score_pct": overall_linkage_score_pct,
        "risk_level": risk_level,
        "risk_summary": risk_summary,
    }

    if out_per_record_csv:
        os.makedirs(os.path.dirname(out_per_record_csv) or ".", exist_ok=True)
        per_record.to_csv(out_per_record_csv, index=False)
        logger.info("Wrote linkage per-record CSV to %s", out_per_record_csv)

    if out_json:
        os.makedirs(os.path.dirname(out_json) or ".", exist_ok=True)
        with open(out_json, "w", encoding="utf8") as f:
            json.dump(summary, f, indent=2)
        logger.info("Wrote linkage summary JSON to %s", out_json)

    logger.info(
        "Linkage re-identification risk evaluation complete. total_synthetic_records=%d overall_score=%.2f risk_level=%s",
        total,
        overall_linkage_score_pct,
        risk_level,
    )

    return summary