import os
import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict
import pandas as pd

from app.uniqueness import uniqueness_and_rare_combination
from app.linkage import linkage_reidentification_risk

from app.attribute_inference import attribute_inference_evaluation

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[int, int, str], Awaitable[None]]


async def risk_evaluation(
    real_uuid: str,
    synthetic_uuid: str,
    qi_list: list[str],
    sa_list: list[str],
    real_path: str,
    synthetic_path: str,
    progress_callback: ProgressCallback | None = None,
) -> Dict[str, Any]:
    """
    Performs privacy risk evaluation on uploaded real and synthetic datasets.

    This function currently runs:
    1. Uniqueness and rare-combination risk
    2. Linkage / re-identification risk

    Args:
        real_uuid: UUID of the real dataset file.
        synthetic_uuid: UUID of the synthetic dataset file.
        qi_list: List of quasi-identifiers.
        sa_list: List of sensitive attributes.
        real_path: File path of the uploaded real dataset.
        synthetic_path: File path of the uploaded synthetic dataset.

    Returns:
        Dictionary containing risk evaluation results and generated file paths.
    """

    # Prefix the result directory name so uniqueness runs are easily identifiable
    # Example: results/r1_uniq_<real_uuid>_<synthetic_uuid>
    result_dir = os.path.join("results", f"r1_uniq_{real_uuid}_{synthetic_uuid}")
    logger.info(
        "Creating result directory for risk evaluation: %s",
        result_dir,
    )
    os.makedirs(result_dir, exist_ok=True)

    # uniqueness and rare-combination output files.
    out_csv = os.path.join(result_dir, "syn_flags.csv")
    out_full_csv = os.path.join(result_dir, "syn_per_record.csv")
    out_json = os.path.join(result_dir, "syn_k_summary.json")
    out_qid_stats_csv = os.path.join(result_dir, "qid_group_stats.csv")

    # linkage / re-identification output files.
    linkage_per_record_csv = os.path.join(result_dir, "linkage_per_record.csv")
    linkage_summary_json = os.path.join(result_dir, "linkage_summary.json")

    # uniqueness risk evaluation 
    if progress_callback:
        await progress_callback(
            1,
            5,
            "Running uniqueness and rare combination risk evaluation.",
        )

    logger.info(
        "Starting uniqueness evaluation for real_path=%s synthetic_path=%s",
        real_path,
        synthetic_path,
    )
    uniqueness_result = await asyncio.to_thread(
        uniqueness_and_rare_combination,
        real_path=real_path,
        synthetic_path=synthetic_path,
        qis=qi_list,
        sas=sa_list,
        out_csv=out_csv,
        out_full_csv=out_full_csv,
        out_json=out_json,
        out_qid_stats_csv=out_qid_stats_csv,
    )
    logger.info(
        "Uniqueness evaluation complete. outputs=%s, %s, %s, %s",
        out_csv,
        out_full_csv,
        out_json,
        out_qid_stats_csv,
    )
    if progress_callback:
        await progress_callback(
            1,
            100,
            "Uniqueness and rare combination risk evaluation complete.",
        )

    # linkage / re-identification risk evaluation
    if progress_callback:
        await progress_callback(
            2,
            5,
            "Running linkage and re-identification risk evaluation.",
        )

    logger.info(
        "Starting linkage risk evaluation for real_path=%s synthetic_path=%s qis=%s",
        real_path,
        synthetic_path,
        qi_list,
    )
    linkage_result = await asyncio.to_thread(
        linkage_reidentification_risk,
        real_path=real_path,
        synthetic_path=synthetic_path,
        qis=qi_list,
        out_per_record_csv=linkage_per_record_csv,
        out_json=linkage_summary_json,
    )
    logger.info(
        "Linkage evaluation complete. outputs=%s, %s",
        linkage_per_record_csv,
        linkage_summary_json,
    )
    if progress_callback:
        await progress_callback(
            2,
            100,
            "Linkage and re-identification risk evaluation complete.",
        )

    # Ensure attribute-inference result directory exists early so it is present
    # even if some attributes fail during evaluation. This mirrors the
    # r1_uniq_<...> naming convention used above.
    attr_result_dir = os.path.join("results", f"r2_attr_{real_uuid}_{synthetic_uuid}")
    os.makedirs(attr_result_dir, exist_ok=True)
    logger.info("Ensured attribute-inference result dir exists: %s", attr_result_dir)

    attr_files: Dict[str, str] = {}
    attr_summaries: Dict[str, Any] = {}

    if progress_callback:
        await progress_callback(
            3,
            5,
            "Preparing attribute inference risk evaluation.",
        )

    # Read only headers once to validate sensitive attributes (target columns)
    # cheaply before launching potentially expensive evaluations. We read
    # zero rows (nrows=0) so only the CSV header is parsed.
    try:
        real_columns = pd.read_csv(real_path, nrows=0).columns.tolist()
        syn_columns = pd.read_csv(synthetic_path, nrows=0).columns.tolist()
    except Exception as e:
        # If we cannot read headers, record the error for every SA and
        # return early so callers can see the failure without intermittent
        # missing files.
        logger.exception("Failed to read dataset headers for attribute-inference: %s", str(e))
        for sa in sa_list:
            out_attr_csv = os.path.join(attr_result_dir, f"attribute_inference_{sa}.csv")
            attr_files[sa] = out_attr_csv
            attr_summaries[sa] = {"error": f"Failed to read dataset headers: {str(e)}"}

        if progress_callback:
            await progress_callback(
                3,
                100,
                "Attribute inference risk evaluation finished with header errors.",
            )

        return {
            "real_uuid": real_uuid,
            "synthetic_uuid": synthetic_uuid,
            "qi_list": qi_list,
            "sa_list": sa_list,
            "result_dir": result_dir,
            "files": {
                # uniqueness files.
                "syn_flags": out_csv,
                "syn_per_record": out_full_csv,
                "summary_json": out_json,
                "qid_group_stats": out_qid_stats_csv,
                # linkage files.
                "linkage_per_record": linkage_per_record_csv,
                "linkage_summary": linkage_summary_json,
                "attribute_inference_files": attr_files,
            },
            "uniqueness_and_rare_combination": uniqueness_result,
            "linkage_reidentification": linkage_result,
            "attribute_inference_summary": attr_summaries,
        }

    # For each sensitive attribute, run a simple majority-label attack using
    # the provided QI list as the known columns. The helper writes a CSV
    # summarising metrics per QID set and returns a list of dicts. We wrap
    # each call in try/except to ensure one failing attribute doesn't stop
    # the whole evaluation and the directory is always created.
    total_sensitive_attributes = max(len(sa_list), 1)
    for index, sa in enumerate(sa_list):
        if progress_callback:
            start_progress = 5 + round((index / total_sensitive_attributes) * 85)
            await progress_callback(
                3,
                start_progress,
                f"Running attribute inference risk for {sa}.",
            )

        out_attr_csv = os.path.join(attr_result_dir, f"attribute_inference_{sa}.csv")
        # Validate target column exists in both real and synthetic headers
        if sa not in real_columns:
            msg = f"target column '{sa}' not present in real dataset headers"
            logger.warning(msg)
            attr_files[sa] = out_attr_csv
            attr_summaries[sa] = {"error": msg}
            continue
        if sa not in syn_columns:
            msg = f"target column '{sa}' not present in synthetic dataset headers"
            logger.warning(msg)
            attr_files[sa] = out_attr_csv
            attr_summaries[sa] = {"error": msg}
            continue
        try:
            logger.info("Starting attribute-inference for %s (train: synthetic, test: real)", sa)
            # Train on synthetic (real_path param) and test on real (synthetic_path param)
            summary = await asyncio.to_thread(
                attribute_inference_evaluation,
                real_path=synthetic_path,
                synthetic_path=real_path,
                qid_sets=[qi_list],
                target_column=sa,
                out_csv=out_attr_csv,
            )
            attr_files[sa] = out_attr_csv
            attr_summaries[sa] = summary
            logger.info("Completed attribute-inference for %s, output=%s", sa, out_attr_csv)
        except Exception as e:
            # Record the error in the summary and continue
            logger.exception("Attribute-inference failed for %s: %s", sa, str(e))
            attr_files[sa] = out_attr_csv
            attr_summaries[sa] = {"error": str(e)}

        if progress_callback:
            end_progress = 5 + round(((index + 1) / total_sensitive_attributes) * 85)
            await progress_callback(
                3,
                min(end_progress, 95),
                f"Attribute inference risk processed for {sa}.",
            )

    # Aggregate per-SA / per-QID metrics into a single CSV for easy reporting.
    # Collect all successful per-QID rows returned by attribute_inference_evaluation
    aggregated_csv = None
    try:
        rows_all = []
        for sa, summ in attr_summaries.items():
            if isinstance(summ, dict) and summ.get("error"):
                continue
            # summ is expected to be a list of per-QID-set dicts
            for r in summ:
                row = dict(r)
                # ensure we have the SA recorded
                row["sensitive_attribute"] = sa
                rows_all.append(row)

        if rows_all:
            df_all = pd.DataFrame(rows_all)
            # ensure numeric risk_score exists
            if "risk_score" not in df_all.columns:
                df_all["risk_score"] = df_all["coverage_rate"] * df_all["gain_over_baseline"]

            # Per-SA aggregation: max and mean risk_score, and top QID set
            per_sa_rows = []
            for sa_name, g in df_all.groupby("sensitive_attribute"):
                max_idx = g["risk_score"].idxmax()
                top_qid = g.loc[max_idx, "qid_set"] if pd.notna(max_idx) else None
                per_sa_rows.append({
                    "category": "sa",
                    "id": sa_name,
                    "max_risk": float(g["risk_score"].max()),
                    "mean_risk": float(g["risk_score"].mean()),
                    "top_qid_set": top_qid,
                })

            # Per-QID aggregation across SAs: max and mean risk_score, and top SA
            per_qid_rows = []
            for qid_name, g in df_all.groupby("qid_set"):
                max_idx = g["risk_score"].idxmax()
                top_sa = g.loc[max_idx, "sensitive_attribute"] if pd.notna(max_idx) else None
                per_qid_rows.append({
                    "category": "qid",
                    "id": qid_name,
                    "max_risk": float(g["risk_score"].max()),
                    "mean_risk": float(g["risk_score"].mean()),
                    "top_sensitive_attribute": top_sa,
                })

            agg_rows = per_sa_rows + per_qid_rows
            agg_df = pd.DataFrame(agg_rows)
            aggregated_csv = os.path.join(attr_result_dir, "attribute_inference_aggregated.csv")
            agg_df.to_csv(aggregated_csv, index=False)
    except Exception:
        aggregated_csv = None

    if progress_callback:
        await progress_callback(
            3,
            100,
            "Attribute inference risk evaluation complete.",
        )

    return {
        "real_uuid": real_uuid,
        "synthetic_uuid": synthetic_uuid,
        "qi_list": qi_list,
        "sa_list": sa_list,
        "result_dir": result_dir,
        "files": {
            # uniqueness files.
            "syn_flags": out_csv,
            "syn_per_record": out_full_csv,
            "summary_json": out_json,
            "qid_group_stats": out_qid_stats_csv,

            # linkage files.
            "linkage_per_record": linkage_per_record_csv,
            "linkage_summary": linkage_summary_json,
            "attribute_inference_files": attr_files,
        },
        "summary": {
            "uniqueness_and_rare_combination": uniqueness_result,
            "linkage_reidentification": linkage_result,
            "attribute_inference_summary": attr_summaries,
        },
    }
