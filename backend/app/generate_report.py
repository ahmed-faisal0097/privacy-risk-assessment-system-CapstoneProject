"""
M5 — Privacy Risk Assessment Report Generator (Updated)
==========================================================
Reads results from all three completed risk evaluation modules:
  1. Uniqueness / Rare-Combination  → syn_k_summary.json
  2. Linkage / Re-identification    → linkage_summary.json
  3. Attribute Inference            → attribute_inference_aggregated.csv

Generates:
  results/privacy_risk_report.html  — full HTML audit report
  results/privacy_risk_report_summary.csv — flat CSV audit trail

Changes from previous version (per supervisor feedback):
  - Removed overall combined risk score (meaningless across different metrics)
  - Removed governor's distance reference
  - Each risk now has its OWN threshold table explaining what High/Medium/Low means
  - All three risk sections now present in the report
  - QIs and SAs shown clearly at the top

How to run (from project ROOT):
  python -m backend.app.generate_report

Dependencies: None — only Python standard library.
"""
from __future__ import annotations
import os
import json
import csv
from datetime import datetime
from typing import Any

# ── FILE PATHS ─────────────────────────────────────────────────────────────────
_HERE       = os.path.dirname(__file__)                               # .../backend/app/
REPO_ROOT   = os.path.abspath(os.path.join(_HERE, "..", ".."))        # project root
RESULTS_DIR = os.path.join(REPO_ROOT, "results")

HTML_OUT = os.path.join(RESULTS_DIR, "privacy_risk_report.html")
CSV_OUT  = os.path.join(RESULTS_DIR, "privacy_risk_report_summary.csv")


# ── HELPERS ────────────────────────────────────────────────────────────────────

def _fmt_pct(v: float) -> str:
    return f"{v:.2f}%"

def _fmt_num(v: Any) -> str:
    try:
        return f"{int(v):,}"
    except Exception:
        return str(v)

def _risk_badge_html(level: str) -> str:
    colours = {"HIGH": "#c53030", "MEDIUM": "#c05621", "LOW": "#276749"}
    icons   = {"HIGH": "⚠", "MEDIUM": "△", "LOW": "✓"}
    colour  = colours.get(level, "#718096")
    icon    = icons.get(level, "?")
    return (
        f'<span style="display:inline-block;padding:3px 12px;border-radius:999px;'
        f'background:{colour};color:#fff;font-size:12px;font-weight:700;">'
        f'{icon} {level}</span>'
    )

def _score_card(label: str, value: str, desc: str, level: str) -> str:
    bg  = {"HIGH": "#fff5f5", "MEDIUM": "#fffaf0", "LOW": "#f0fff4"}.get(level, "#fff")
    bdr = {"HIGH": "#c53030", "MEDIUM": "#c05621", "LOW": "#276749"}.get(level, "#2b6cb0")
    clr = bdr
    return f"""
      <div style="background:{bg};border-left:5px solid {bdr};border-radius:10px;
                  padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                    letter-spacing:0.6px;color:#718096;">{label}</div>
        <div style="font-size:30px;font-weight:800;margin:6px 0 4px;color:{clr};">{value}</div>
        <div style="font-size:12px;color:#718096;">{desc}</div>
        <div style="margin-top:8px;">{_risk_badge_html(level)}</div>
      </div>"""

def _chips(names: list, colour: str, bg: str, border: str) -> str:
    return "".join(
        f'<span style="border-radius:999px;padding:4px 14px;font-size:12px;font-weight:600;'
        f'background:{bg};color:{colour};border:1px solid {border};margin:3px 4px 3px 0;'
        f'display:inline-block;">{n}</span>'
        for n in names
    )

def _section_title(text: str) -> str:
    return (
        f'<div style="font-size:13px;font-weight:700;text-transform:uppercase;'
        f'letter-spacing:0.8px;color:#718096;margin:36px 0 12px;'
        f'padding-bottom:6px;border-bottom:2px solid #e2e8f0;">{text}</div>'
    )

def _table(headers: list, rows: list) -> str:
    thead = "".join(f'<th style="padding:11px 16px;text-align:left;font-size:12px;">{h}</th>' for h in headers)
    tbody = ""
    for i, row in enumerate(rows):
        bg = "#f7fafc" if i % 2 == 0 else "#fff"
        cells = "".join(
            f'<td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;">{c}</td>'
            for c in row
        )
        tbody += f'<tr style="background:{bg};">{cells}</tr>'
    return (
        f'<div style="background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.08);'
        f'overflow:hidden;margin-top:12px;">'
        f'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
        f'<thead style="background:#2d3748;color:#fff;">{thead}</thead>'
        f'<tbody>{tbody}</tbody>'
        f'</table></div>'
    )


# ── LOAD RESULTS ───────────────────────────────────────────────────────────────

def _find_latest_result_dir() -> str:
    """
    Find the most recently modified r1_uniq_* subfolder under results/.
    Falls back to results/ itself if none found.
    """
    if not os.path.isdir(RESULTS_DIR):
        raise FileNotFoundError(f"Results directory not found: {RESULTS_DIR}")

    candidates = [
        os.path.join(RESULTS_DIR, d)
        for d in os.listdir(RESULTS_DIR)
        if d.startswith("r1_uniq_") and os.path.isdir(os.path.join(RESULTS_DIR, d))
    ]

    if candidates:
        return max(candidates, key=os.path.getmtime)

    return RESULTS_DIR


def load_all_results(result_dir: str = None) -> dict:
    """
    Load results from all three risk evaluation modules.
    
    Args:
        result_dir: absolute path to the result folder (e.g. /app/results/r1_uniq_<uuid>_<uuid>).
                    If None, finds the most recently modified result folder automatically.
    
    Returns dict with keys: uniqueness, linkage, attribute_inference, qi_list, sa_list.
    """
    # If no folder given, find the latest one automatically
    if result_dir is None:
        result_dir = _find_latest_result_dir()

    # Derive attribute-inference dir from uniqueness dir
    # r1_uniq_<uuid>_<uuid>  →  r2_attr_<uuid>_<uuid>
    attr_dir = result_dir.replace("r1_uniq_", "r2_attr_")

    out = {
        "result_dir": result_dir,
        "uniqueness": {},
        "linkage": {},
        "attribute_inference": [],
        "qi_list": [],
        "sa_list": [],
    }

    # 1. Uniqueness JSON
    uniq_json = os.path.join(result_dir, "syn_k_summary.json")
    if os.path.exists(uniq_json):
        with open(uniq_json, encoding="utf8") as f:
            out["uniqueness"] = json.load(f)
        out["qi_list"] = out["uniqueness"].get("qis_used", [])
        out["sa_list"] = out["uniqueness"].get("sas_used", [])
    else:
        print(f"  WARNING: Uniqueness JSON not found at {uniq_json}")

    # 2. Linkage JSON
    link_json = os.path.join(result_dir, "linkage_summary.json")
    if os.path.exists(link_json):
        with open(link_json, encoding="utf8") as f:
            out["linkage"] = json.load(f)
    else:
        print(f"  WARNING: Linkage JSON not found at {link_json}")

    # 3. Attribute inference aggregated CSV
    agg_csv = os.path.join(attr_dir, "attribute_inference_aggregated.csv")
    if os.path.exists(agg_csv):
        rows = []
        with open(agg_csv, encoding="utf8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
        out["attribute_inference"] = rows
    else:
        print(f"  WARNING: Attribute inference aggregated CSV not found at {agg_csv}")

    return out


# ── HTML REPORT ────────────────────────────────────────────────────────────────

def generate_html(data: dict, out_path: str) -> None:
    generated_at = datetime.now().strftime("%d %B %Y, %H:%M")

    uniq      = data.get("uniqueness", {})
    link      = data.get("linkage", {})
    attr_rows = data.get("attribute_inference", [])
    qi_list   = data.get("qi_list", [])
    sa_list   = data.get("sa_list", [])

    # ── Uniqueness values ───────────────────────────────────────────────
    uniq_pct  = float(uniq.get("uniqueness_score_pct", 0))
    rare_pct  = float(uniq.get("rare_combination_score_pct", 0))
    k_zero    = uniq.get("k_zero_count", 0)
    k_one     = uniq.get("k_one_count", 0)
    k_lt5     = uniq.get("k_lt_5_count", 0)
    total_syn = uniq.get("total_synthetic_records", 0)

    uniq_level = "HIGH" if uniq_pct >= 20 else "MEDIUM" if uniq_pct >= 10 else "LOW"
    rare_level = "HIGH" if rare_pct >= 20 else "MEDIUM" if rare_pct >= 10 else "LOW"

    # ── Linkage values ──────────────────────────────────────────────────
    exact_pct        = float(link.get("exact_match_score_pct", 0))
    hamming_pct      = float(link.get("hamming_score_pct", 0))
    overall_link_pct = float(link.get("overall_linkage_score_pct", 0))
    link_level       = link.get("risk_level", "LOW")

    exact_detail   = link.get("exact_match", {})
    hamming_detail = link.get("hamming_nearest_neighbour", {})

    exact_high   = exact_detail.get("exact_unique_link_count", 0)
    exact_medium = exact_detail.get("exact_small_group_count", 0)
    exact_none   = exact_detail.get("exact_no_link_count", 0)

    hamming_high   = hamming_detail.get("hamming_high_risk_close_match_count", 0)
    hamming_medium = hamming_detail.get("hamming_medium_risk_close_match_count", 0)
    hamming_low    = hamming_detail.get("hamming_low_risk_distant_match_count", 0)
    hamming_high_t = hamming_detail.get("hamming_high_threshold", 0.10)
    hamming_med_t  = hamming_detail.get("hamming_medium_threshold", 0.30)

    # ── Attribute inference values ──────────────────────────────────────
    sa_rows = [r for r in attr_rows if r.get("category") == "sa"]
    attr_max_risk = 0.0
    for r in sa_rows:
        try:
            attr_max_risk = max(attr_max_risk, float(r.get("max_risk", 0)))
        except (ValueError, TypeError):
            pass
    attr_level = "HIGH" if attr_max_risk >= 0.20 else "MEDIUM" if attr_max_risk >= 0.10 else "LOW"

    # ── Build HTML pieces ───────────────────────────────────────────────
    qi_chip_html = _chips(qi_list, "#2b6cb0", "#ebf4ff", "#bee3f8")
    sa_chip_html = _chips(sa_list, "#553c9a", "#faf5ff", "#d6bcfa")

    cards_html = f"""
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:12px;">
      {_score_card("Uniqueness Score", _fmt_pct(uniq_pct), "Synthetic records with k=1 in real data", uniq_level)}
      {_score_card("Rare Combination Score", _fmt_pct(rare_pct), "Synthetic records with k&lt;5 in real data", rare_level)}
      {_score_card("Re-identification Score", _fmt_pct(overall_link_pct), "Max of exact-match and Hamming linkage", link_level)}
      {_score_card("Attribute Inference Risk", _fmt_pct(attr_max_risk * 100), "Max gain over baseline across sensitive attributes", attr_level)}
    </div>"""

    uniq_table = _table(
        ["Category", "Count", "% of Synthetic", "Risk"],
        [
            ["Records with k=0 (no match in real data)", _fmt_num(k_zero),
             _fmt_pct(k_zero / total_syn * 100 if total_syn else 0), _risk_badge_html("HIGH")],
            ["Records with k=1 (unique — matches exactly 1 real person)", _fmt_num(k_one),
             _fmt_pct(uniq_pct), _risk_badge_html(uniq_level)],
            ["Records with k&lt;5 (rare — fewer than 5 real matches)", _fmt_num(k_lt5),
             _fmt_pct(rare_pct), _risk_badge_html(rare_level)],
            ["Records with k≥5 (sufficient real coverage)", _fmt_num(total_syn - k_lt5),
             _fmt_pct((total_syn - k_lt5) / total_syn * 100 if total_syn else 0), _risk_badge_html("LOW")],
        ]
    )

    uniq_thresh = _table(
        ["Risk Level", "Score Range", "Meaning", "Recommended Action"],
        [
            [_risk_badge_html("HIGH"), "≥ 20%",
             "Many synthetic records uniquely map to real individuals",
             "Do NOT release — apply generalisation or differential privacy"],
            [_risk_badge_html("MEDIUM"), "10% – 19.99%",
             "Some records have limited real-data coverage",
             "Apply caution — restrict access or add anonymisation"],
            [_risk_badge_html("LOW"), "< 10%",
             "Most records have sufficient real-data coverage",
             "Generally acceptable — verify other risk dimensions"],
        ]
    )

    link_table = _table(
        ["Method", "Metric", "Count / Score", "Risk"],
        [
            ["Exact Match", "Unique exact link (1 real match)", _fmt_num(exact_high), _risk_badge_html("HIGH")],
            ["Exact Match", "Small group link (2–5 real matches)", _fmt_num(exact_medium), _risk_badge_html("MEDIUM")],
            ["Exact Match", "No exact link found", _fmt_num(exact_none), _risk_badge_html("LOW")],
            ["Exact Match", "Overall exact-match score", _fmt_pct(exact_pct),
             _risk_badge_html("HIGH" if exact_pct >= 30 else "MEDIUM" if exact_pct >= 10 else "LOW")],
            ["Hamming NN", f"High risk (distance ≤ {hamming_high_t:.0%})", _fmt_num(hamming_high), _risk_badge_html("HIGH")],
            ["Hamming NN", f"Medium risk (distance ≤ {hamming_med_t:.0%})", _fmt_num(hamming_medium), _risk_badge_html("MEDIUM")],
            ["Hamming NN", "Low risk (distant record)", _fmt_num(hamming_low), _risk_badge_html("LOW")],
            ["Hamming NN", "Overall Hamming score", _fmt_pct(hamming_pct),
             _risk_badge_html("HIGH" if hamming_pct >= 30 else "MEDIUM" if hamming_pct >= 10 else "LOW")],
            ["Combined", "Overall linkage score (max of above)", _fmt_pct(overall_link_pct), _risk_badge_html(link_level)],
        ]
    )

    link_thresh = _table(
        ["Risk Level", "Score Range", "Meaning", "Recommended Action"],
        [
            [_risk_badge_html("HIGH"), "≥ 30%",
             "Large proportion of synthetic records closely match real individuals",
             "Do NOT release — data contains re-identifiable records"],
            [_risk_badge_html("MEDIUM"), "10% – 29.99%",
             "Moderate linkage risk — some records linkable to real individuals",
             "Apply caution — consider suppression or noise addition"],
            [_risk_badge_html("LOW"), "< 10%",
             "Low linkage risk — synthetic records are sufficiently different",
             "Generally acceptable — verify other risk dimensions"],
        ]
    )

    if sa_rows:
        attr_table = _table(
            ["Sensitive Attribute", "Max Risk Score", "Mean Risk Score", "Top QID Set", "Risk Level"],
            [
                [
                    r.get("id", "—"),
                    f"{float(r.get('max_risk', 0)):.4f}",
                    f"{float(r.get('mean_risk', 0)):.4f}",
                    r.get("top_qid_set", "—"),
                    _risk_badge_html(
                        "HIGH" if float(r.get("max_risk", 0)) >= 0.20
                        else "MEDIUM" if float(r.get("max_risk", 0)) >= 0.10
                        else "LOW"
                    ),
                ]
                for r in sa_rows
            ]
        )
    else:
        attr_table = '<p style="color:#718096;font-size:13px;padding:12px;">No attribute inference results found.</p>'

    attr_thresh = _table(
        ["Risk Level", "Gain Over Baseline", "Meaning", "Recommended Action"],
        [
            [_risk_badge_html("HIGH"), "≥ 0.20",
             "Attacker gains 20%+ accuracy above random guessing — strong inference possible",
             "Do NOT release — sensitive attributes are predictable from QIs"],
            [_risk_badge_html("MEDIUM"), "0.10 – 0.19",
             "Moderate inference advantage — some attributes partially predictable",
             "Apply caution — consider generalising or removing high-risk QI combinations"],
            [_risk_badge_html("LOW"), "< 0.10",
             "Minimal inference advantage — attacker barely outperforms baseline",
             "Generally acceptable — monitor if QI set changes"],
        ]
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Privacy Risk Assessment Report</title>
<style>
  *,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}
  body{{font-family:"Segoe UI",Arial,sans-serif;background:#f0f4f8;
        color:#1a202c;font-size:14px;line-height:1.6;}}
  code{{background:#edf2f7;padding:2px 6px;border-radius:4px;
        font-size:12px;font-family:monospace;}}
  @media print{{
    body{{background:white;}}
    .body{{margin:0;padding:20px;}}
    .hdr,.ftr{{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  }}
</style>
</head>
<body>

<div class="hdr" style="background:#1a365d;color:#fff;padding:36px 48px;">
  <h1 style="font-size:26px;font-weight:800;">🔒 Privacy Risk Assessment Report</h1>
  <div style="font-size:14px;opacity:0.75;margin-top:6px;">
    Full Evaluation — Uniqueness · Re-identification · Attribute Inference
  </div>
  <div style="display:flex;gap:32px;margin-top:20px;font-size:13px;opacity:0.85;flex-wrap:wrap;">
    <span><small>Generated</small><br/><strong>{generated_at}</strong></span>
    <span><small>Dataset</small><br/><strong>Diabetes 130-US Hospitals (1999–2008)</strong></span>
    <span><small>Project</small><br/><strong>Capstone — Western Sydney University</strong></span>
  </div>
</div>

<div class="body" style="max-width:960px;margin:32px auto;padding:0 20px 64px;">

  {_section_title("Evaluation Configuration")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <p style="font-size:13px;color:#718096;margin-bottom:8px;">
      <strong>Quasi-Identifiers (QIs)</strong> — columns used as known attacker inputs:
    </p>
    <div>{qi_chip_html if qi_chip_html else "<em>None recorded</em>"}</div>
    <p style="font-size:13px;color:#718096;margin:16px 0 8px;">
      <strong>Sensitive Attributes (SAs)</strong> — columns being protected:
    </p>
    <div>{sa_chip_html if sa_chip_html else "<em>None recorded</em>"}</div>
  </div>

  {_section_title("Risk Score Summary")}
  {cards_html}

  {_section_title("1. Uniqueness / Rare-Combination Risk")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;line-height:1.8;">
    <strong>What this measures:</strong>
    For each synthetic record, we count how many real records share the same values
    across all quasi-identifier columns — this count is called <code>k</code>.
    A synthetic record with <code>k=1</code> maps to exactly one real person,
    creating direct re-identification exposure. Records with <code>k&lt;5</code>
    are considered rare and carry elevated risk.
    The uniqueness score is the percentage of synthetic records with <code>k=1</code>.
  </div>
  <div style="margin-top:16px;">{uniq_table}</div>
  <div style="margin-top:20px;">{_section_title("Uniqueness Risk Thresholds")}</div>
  {uniq_thresh}

  {_section_title("2. Re-identification / Linkage Risk")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;line-height:1.8;">
    <strong>What this measures:</strong>
    Two linkage methods are applied.
    <strong>Exact-match linkage</strong> checks whether a synthetic record has an identical
    match in the real dataset across all QI columns.
    <strong>Hamming nearest-neighbour linkage</strong> measures how similar each synthetic
    record is to its closest real record — a Hamming distance of 0.0 means identical,
    1.0 means completely different. Records within the high-risk threshold
    (<code>≤ {hamming_high_t:.0%}</code> Hamming distance) are flagged as high risk.
    The overall linkage score is the higher of the two method scores.
  </div>
  <div style="margin-top:16px;">{link_table}</div>
  <div style="margin-top:20px;">{_section_title("Re-identification Risk Thresholds")}</div>
  {link_thresh}

  {_section_title("3. Attribute Inference Risk")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;line-height:1.8;">
    <strong>What this measures:</strong>
    A majority-label attack is simulated: the attacker uses the quasi-identifier
    columns to look up the most common sensitive attribute value in the real dataset
    for each QI combination, then predicts that value for synthetic records.
    The <strong>gain over baseline</strong> measures how much better this attack
    performs compared to always predicting the most common overall value.
    A high gain means the QI columns are strongly predictive of the sensitive attribute.
    Results are shown per sensitive attribute.
  </div>
  <div style="margin-top:16px;">{attr_table}</div>
  <div style="margin-top:20px;">{_section_title("Attribute Inference Risk Thresholds")}</div>
  {attr_thresh}

  {_section_title("Dataset & Implementation Notes")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;line-height:1.8;">
    <strong>Real dataset:</strong>
    Diabetes 130-US Hospitals for Years 1999–2008 (UCI Machine Learning Repository,
    DOI: 10.24432/C5230J, 101,766 inpatient records from 130 US hospitals).<br/>
    <strong>Synthetic dataset:</strong> V1_syn.csv (provided by project supervisor).<br/>
    <strong>Implementation:</strong> Python — pandas for data processing,
    majority-label classifier for attribute inference, exact and Hamming-distance
    matching for linkage. All thresholds are hard-coded and documented above.
  </div>

</div>

<div class="ftr" style="background:#1a365d;color:#fff;padding:20px 48px;
     font-size:12px;opacity:0.85;display:flex;justify-content:space-between;align-items:center;">
  <span>Privacy Risk Assessment System &nbsp;·&nbsp; Capstone Project &nbsp;·&nbsp; Western Sydney University</span>
  <span>Generated: {generated_at}</span>
</div>

</body>
</html>"""

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf8") as f:
        f.write(html)
    print(f"HTML report saved → {out_path}")


# ── CSV REPORT ─────────────────────────────────────────────────────────────────

def generate_csv(data: dict, out_path: str) -> None:
    uniq      = data.get("uniqueness", {})
    link      = data.get("linkage", {})
    attr_rows = [r for r in data.get("attribute_inference", []) if r.get("category") == "sa"]
    qi_list   = data.get("qi_list", [])
    sa_list   = data.get("sa_list", [])

    uniq_pct     = float(uniq.get("uniqueness_score_pct", 0))
    rare_pct     = float(uniq.get("rare_combination_score_pct", 0))
    overall_link = float(link.get("overall_linkage_score_pct", 0))
    exact_pct    = float(link.get("exact_match_score_pct", 0))
    hamming_pct  = float(link.get("hamming_score_pct", 0))
    link_level   = link.get("risk_level", "UNKNOWN")
    uniq_level   = "HIGH" if uniq_pct >= 20 else "MEDIUM" if uniq_pct >= 10 else "LOW"
    rare_level   = "HIGH" if rare_pct >= 20 else "MEDIUM" if rare_pct >= 10 else "LOW"

    rows = [
        ["SECTION", "METRIC", "VALUE", "RISK LEVEL", "NOTES"],

        ["Run Info", "Generated At", datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "", ""],
        ["Run Info", "Dataset", "Diabetes 130-US Hospitals 1999-2008", "", "UCI ML Repository"],
        ["Run Info", "Quasi-Identifiers", ", ".join(qi_list), "", ""],
        ["Run Info", "Sensitive Attributes", ", ".join(sa_list), "", ""],
        ["", "", "", "", ""],

        ["Uniqueness Risk", "Uniqueness Score (k=1)", f"{uniq_pct:.4f}%", uniq_level,
         "Threshold: HIGH>=20%, MEDIUM>=10%, LOW<10%"],
        ["Uniqueness Risk", "Rare Combination Score (k<5)", f"{rare_pct:.4f}%", rare_level,
         "Threshold: HIGH>=20%, MEDIUM>=10%, LOW<10%"],
        ["Uniqueness Risk", "Records k=0", str(uniq.get("k_zero_count", 0)), "HIGH", "No real match"],
        ["Uniqueness Risk", "Records k=1", str(uniq.get("k_one_count", 0)), uniq_level, "Unique"],
        ["Uniqueness Risk", "Records k<5", str(uniq.get("k_lt_5_count", 0)), rare_level, "Rare"],
        ["Uniqueness Risk", "Total Synthetic Records", str(uniq.get("total_synthetic_records", 0)), "", ""],
        ["", "", "", "", ""],

        ["Linkage Risk", "Exact Match Score", f"{exact_pct:.4f}%",
         "HIGH" if exact_pct >= 30 else "MEDIUM" if exact_pct >= 10 else "LOW",
         "Threshold: HIGH>=30%, MEDIUM>=10%, LOW<10%"],
        ["Linkage Risk", "Hamming NN Score", f"{hamming_pct:.4f}%",
         "HIGH" if hamming_pct >= 30 else "MEDIUM" if hamming_pct >= 10 else "LOW",
         "Threshold: HIGH>=30%, MEDIUM>=10%, LOW<10%"],
        ["Linkage Risk", "Overall Linkage Score (max)", f"{overall_link:.4f}%", link_level,
         "Max of exact-match and Hamming scores"],
        ["", "", "", "", ""],

        *[
            ["Attribute Inference Risk", f"SA: {r.get('id', '—')}",
             f"max_risk={float(r.get('max_risk', 0)):.4f} mean_risk={float(r.get('mean_risk', 0)):.4f}",
             "HIGH" if float(r.get("max_risk", 0)) >= 0.20
             else "MEDIUM" if float(r.get("max_risk", 0)) >= 0.10 else "LOW",
             f"Top QID: {r.get('top_qid_set', '—')} — Threshold: HIGH>=0.20, MEDIUM>=0.10, LOW<0.10"]
            for r in attr_rows
        ],
    ]

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf8") as f:
        csv.writer(f).writerows(rows)
    print(f"CSV report saved  → {out_path}")


# ── ENTRY POINT ────────────────────────────────────────────────────────────────

def generate_all() -> None:
    print("Loading results from all three risk modules…")
    data = load_all_results()
    print(f"  Result dir:  {data['result_dir']}")
    print(f"  Uniqueness:  {data['uniqueness'].get('uniqueness_score_pct', 'N/A')}%")
    print(f"  Linkage:     {data['linkage'].get('overall_linkage_score_pct', 'N/A')}%")
    print(f"  Attr rows:   {len(data['attribute_inference'])} rows")
    print()
    generate_html(data, HTML_OUT)
    generate_csv(data, CSV_OUT)
    print()
    print("Done. Both reports saved to results/ folder.")


if __name__ == "__main__":
    generate_all()