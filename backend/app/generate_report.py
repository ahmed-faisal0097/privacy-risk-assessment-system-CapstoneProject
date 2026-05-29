"""
M5 — Privacy Risk Assessment Report Generator
==============================================
Reads outputs from the three completed risk evaluation modules and
produces a downloadable HTML report and CSV audit trail.

Input files (located in the run-specific result folder):
  syn_k_summary.json                  — uniqueness / rare-combination results
  linkage_summary.json                — re-identification / linkage results
  attribute_inference_aggregated.csv  — attribute inference results per SA

Output files:
  privacy_risk_report.html
  privacy_risk_report_summary.csv

The QIs and SAs shown in the report are taken directly from the result
files — they reflect whatever the user selected at upload time.

Run from project root:
  python -m backend.app.generate_report
"""
from __future__ import annotations
import os
import json
import csv
from datetime import datetime
from typing import Any

# ── Paths ──────────────────────────────────────────────────────────────────────
_HERE       = os.path.dirname(__file__)
REPO_ROOT   = os.path.abspath(os.path.join(_HERE, "..", ".."))
RESULTS_DIR = os.path.join(REPO_ROOT, "results")

HTML_OUT = os.path.join(RESULTS_DIR, "privacy_risk_report.html")
CSV_OUT  = os.path.join(RESULTS_DIR, "privacy_risk_report_summary.csv")


# ── Formatting helpers ─────────────────────────────────────────────────────────

def _fmt_pct(v: float) -> str:
    return f"{v:.2f}%"

def _fmt_num(v: Any) -> str:
    try:
        return f"{int(v):,}"
    except Exception:
        return str(v)

def _badge(level: str) -> str:
    colours = {"HIGH": "#c53030", "MEDIUM": "#c05621", "LOW": "#276749"}
    icons   = {"HIGH": "⚠", "MEDIUM": "△", "LOW": "✓"}
    colour  = colours.get(level, "#718096")
    icon    = icons.get(level, "")
    return (
        f'<span style="display:inline-block;padding:3px 12px;border-radius:999px;'
        f'background:{colour};color:#fff;font-size:12px;font-weight:700;">'
        f'{icon} {level}</span>'
    )

def _score_card(label: str, value: str, desc: str) -> str:
    return f"""
      <div style="background:#fff;border-left:5px solid #2b6cb0;border-radius:10px;
                  padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                    letter-spacing:0.6px;color:#718096;">{label}</div>
        <div style="font-size:30px;font-weight:800;margin:6px 0 4px;color:#2b6cb0;">{value}</div>
        <div style="font-size:12px;color:#718096;">{desc}</div>
      </div>"""

def _risk_overview_card(label: str, value: str, level: str) -> str:
    bg  = {"HIGH": "#fff5f5", "MEDIUM": "#fffaf0", "LOW": "#f0fff4"}.get(level, "#fff")
    bdr = {"HIGH": "#c53030", "MEDIUM": "#c05621", "LOW": "#276749"}.get(level, "#2b6cb0")
    return f"""
      <div style="background:{bg};border-left:5px solid {bdr};border-radius:10px;
                  padding:14px 16px;box-shadow:0 1px 4px rgba(0,0,0,0.08);
                  min-width:160px;flex:1;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;
                    letter-spacing:0.6px;color:#718096;white-space:nowrap;">{label}</div>
        <div style="font-size:24px;font-weight:800;margin:4px 0 0;color:{bdr};">{value}</div>
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
    thead = "".join(
        f'<th style="padding:11px 16px;text-align:left;font-size:12px;">{h}</th>'
        for h in headers
    )
    tbody = ""
    for i, row in enumerate(rows):
        bg = "#f7fafc" if i % 2 == 0 else "#fff"
        cells = "".join(
            f'<td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;">{c}</td>'
            for c in row
        )
        tbody += f'<tr style="background:{bg};">{cells}</tr>'
    return (
        f'<div style="background:#fff;border-radius:10px;'
        f'box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;margin-top:12px;">'
        f'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
        f'<thead style="background:#2d3748;color:#fff;">{thead}</thead>'
        f'<tbody>{tbody}</tbody>'
        f'</table></div>'
    )


# ── Load results ───────────────────────────────────────────────────────────────

def _find_latest_result_dir() -> str:
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
    Load results from all three risk modules.

    Args:
        result_dir: absolute path to the r1_uniq_* folder for this run.
                    If None, the most recently modified folder is used.
    """
    if result_dir is None:
        result_dir = _find_latest_result_dir()

    attr_dir = result_dir.replace("r1_uniq_", "r2_attr_")

    out = {
        "result_dir": result_dir,
        "uniqueness": {},
        "linkage": {},
        "attribute_inference": [],
        "qi_list": [],
        "sa_list": [],
    }

    uniq_json = os.path.join(result_dir, "syn_k_summary.json")
    if os.path.exists(uniq_json):
        with open(uniq_json, encoding="utf8") as f:
            out["uniqueness"] = json.load(f)
        out["qi_list"] = out["uniqueness"].get("qis_used", [])
        out["sa_list"] = out["uniqueness"].get("sas_used", [])
    else:
        print(f"  WARNING: {uniq_json} not found")

    link_json = os.path.join(result_dir, "linkage_summary.json")
    if os.path.exists(link_json):
        with open(link_json, encoding="utf8") as f:
            out["linkage"] = json.load(f)
    else:
        print(f"  WARNING: {link_json} not found")

    agg_csv = os.path.join(attr_dir, "attribute_inference_aggregated.csv")
    if os.path.exists(agg_csv):
        with open(agg_csv, encoding="utf8") as f:
            out["attribute_inference"] = list(csv.DictReader(f))
    else:
        print(f"  WARNING: {agg_csv} not found")

    return out


# ── HTML report ────────────────────────────────────────────────────────────────

def generate_html(data: dict, out_path: str) -> None:
    generated_at = datetime.now().strftime("%d %B %Y, %H:%M")

    uniq      = data.get("uniqueness", {})
    link      = data.get("linkage", {})
    attr_rows = data.get("attribute_inference", [])
    qi_list   = data.get("qi_list", [])
    sa_list   = data.get("sa_list", [])

    # ── Uniqueness values ──────────────────────────────────────────────────────
    uniq_pct  = float(uniq.get("uniqueness_score_pct", 0))
    rare_pct  = float(uniq.get("rare_combination_score_pct", 0))
    k_zero    = uniq.get("k_zero_count", 0)
    k_one     = uniq.get("k_one_count", 0)
    k_lt5     = uniq.get("k_lt_5_count", 0)
    total_syn = uniq.get("total_synthetic_records", 0)
    k_safe    = total_syn - k_lt5

    uniq_level = "HIGH" if uniq_pct >= 20 else "MEDIUM" if uniq_pct >= 10 else "LOW"
    rare_level = "HIGH" if rare_pct >= 20 else "MEDIUM" if rare_pct >= 10 else "LOW"

    # ── Linkage values ─────────────────────────────────────────────────────────
    exact_pct   = float(link.get("exact_match_score_pct", 0))
    hamming_pct = float(link.get("hamming_score_pct", 0))

    exact_detail   = link.get("exact_match", {})
    hamming_detail = link.get("hamming_nearest_neighbour", {})

    exact_high      = exact_detail.get("exact_unique_match_count", 0)
    exact_medium    = exact_detail.get("exact_small_group_match_count", 0)
    exact_none      = exact_detail.get("exact_no_match_count", 0)
    exact_ambiguous = exact_detail.get("exact_ambiguous_match_count", 0)
    # Ambiguous = matched more than 5 real people (not uniquely linkable = low risk)
    # Merge ambiguous and no-match into one green slice since neither can be pinpointed
    exact_low_total = int(exact_none) + int(exact_ambiguous)

    hamming_high   = hamming_detail.get("hamming_high_risk_close_match_count", 0)
    hamming_medium = hamming_detail.get("hamming_medium_risk_close_match_count", 0)
    hamming_low    = hamming_detail.get("hamming_low_risk_distant_match_count", 0)
    hamming_high_t = hamming_detail.get("hamming_high_threshold", 0.10)
    hamming_med_t  = hamming_detail.get("hamming_medium_threshold", 0.30)

    exact_level   = "HIGH" if exact_pct >= 30 else "MEDIUM" if exact_pct >= 10 else "LOW"
    hamming_level = "HIGH" if hamming_pct >= 30 else "MEDIUM" if hamming_pct >= 10 else "LOW"

    # ── Attribute inference values ─────────────────────────────────────────────
    sa_rows = [r for r in attr_rows if r.get("category") == "sa"]
    attr_max_risk = 0.0
    for r in sa_rows:
        try:
            attr_max_risk = max(attr_max_risk, float(r.get("max_risk", 0)))
        except (ValueError, TypeError):
            pass
    attr_level = "HIGH" if attr_max_risk >= 0.20 else "MEDIUM" if attr_max_risk >= 0.10 else "LOW"

    # ── QI / SA chips ──────────────────────────────────────────────────────────
    qi_chips = _chips(qi_list, "#2b6cb0", "#ebf4ff", "#bee3f8")
    sa_chips = _chips(sa_list, "#553c9a", "#faf5ff", "#d6bcfa")

    # ── Score cards (no risk labels) ───────────────────────────────────────────
    cards = f"""
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:12px;">
      {_score_card("Uniqueness Score", _fmt_pct(uniq_pct), "Records with k=1 in real data")}
      {_score_card("Rare Combination Score", _fmt_pct(rare_pct), "Records with k&lt;5 in real data")}
      {_score_card("Exact Match Score", _fmt_pct(exact_pct), "Records with identical QI match in real data")}
      {_score_card("Hamming NN Score", _fmt_pct(hamming_pct), "Records within high-risk Hamming distance")}
      {_score_card("Attribute Inference Risk", _fmt_pct(attr_max_risk * 100), "Max gain over baseline across sensitive attributes")}
    </div>"""

    # ── Privacy Risk Overview cards (with risk labels) ─────────────────────────
    overview_cards = f"""
    <div style="display:flex;flex-wrap:nowrap;gap:12px;margin-top:12px;overflow-x:auto;">
      {_risk_overview_card("Uniqueness Risk", _fmt_pct(uniq_pct), uniq_level)}
      {_risk_overview_card("Rare Combination Risk", _fmt_pct(rare_pct), rare_level)}
      {_risk_overview_card("Exact Match Risk", _fmt_pct(exact_pct), exact_level)}
      {_risk_overview_card("Hamming Linkage Risk", _fmt_pct(hamming_pct), hamming_level)}
      {_risk_overview_card("Attribute Inference Risk", _fmt_pct(attr_max_risk * 100), attr_level)}
    </div>"""

    # ── Uniqueness results table ───────────────────────────────────────────────
    uniq_table = _table(
        ["Category", "Count", "% of Synthetic", "Risk"],
        [
            ["Records with k=0 (no match in real data)", _fmt_num(k_zero),
             _fmt_pct(k_zero / total_syn * 100 if total_syn else 0),
             _badge("HIGH" if int(k_zero) > 0 else "LOW")],
            ["Records with k=1 (unique, maps to exactly one real person)", _fmt_num(k_one),
             _fmt_pct(uniq_pct), _badge(uniq_level)],
            ["Records with k&lt;5 (rare — fewer than 5 real matches)", _fmt_num(k_lt5),
             _fmt_pct(rare_pct), _badge(rare_level)],
            ["Records with k≥5 (sufficient real coverage)", _fmt_num(k_safe),
             _fmt_pct(k_safe / total_syn * 100 if total_syn else 0), _badge("LOW")],
        ]
    )

    uniq_thresh = _table(
        ["Risk Level", "Score Range", "Meaning", "Recommended Action"],
        [
            [_badge("HIGH"), "≥ 20%",
             "Too many synthetic records are unique. An attacker can directly link them to real individuals.",
             "Do not release"],
            [_badge("MEDIUM"), "10% – 19.99%",
             "Some synthetic records are too similar to real records. Limited privacy coverage in some QI combinations.",
             "Review carefully"],
            [_badge("LOW"), "< 10%",
             "Synthetic records are well covered. Most do not closely resemble any single real person.",
             "Acceptable"],
        ]
    )

    # ── Linkage results table ──────────────────────────────────────────────────
    link_table = _table(
        ["Method", "Metric", "Count / Score", "Risk"],
        [
            ["Exact Match", "Records with a unique exact link (1 real match)",
             _fmt_num(exact_high),
             _badge("HIGH" if int(exact_high) > 0 else "LOW")],
            ["Exact Match", "Records in a small group (2–5 real matches)",
             _fmt_num(exact_medium),
             _badge("MEDIUM" if int(exact_medium) > 0 else "LOW")],
            ["Exact Match", "Records with ambiguous match (more than 5 real matches)",
             _fmt_num(exact_ambiguous),
             _badge("LOW")],
            ["Exact Match", "Records with no exact link found",
             _fmt_num(exact_none),
             _badge("LOW")],
            ["Exact Match", "Overall exact-match score", _fmt_pct(exact_pct),
             _badge(exact_level)],
            ["Hamming NN", f"Records within high-risk distance (≤ {hamming_high_t:.0%})",
             _fmt_num(hamming_high),
             _badge("HIGH" if int(hamming_high) > 0 else "LOW")],
            ["Hamming NN", f"Records within medium-risk distance (≤ {hamming_med_t:.0%})",
             _fmt_num(hamming_medium),
             _badge("MEDIUM" if int(hamming_medium) > 0 else "LOW")],
            ["Hamming NN", "Records beyond medium-risk distance",
             _fmt_num(hamming_low),
             _badge("LOW")],
            ["Hamming NN", "Overall Hamming score", _fmt_pct(hamming_pct),
             _badge(hamming_level)],
        ]
    )

    link_thresh = _table(
        ["Risk Level", "Score Range", "Meaning", "Recommended Action"],
        [
            [_badge("HIGH"), "≥ 30%",
             "Most synthetic records can be closely matched to real individuals. Re-identification is very likely.",
             "Do not release"],
            [_badge("MEDIUM"), "10% – 29.99%",
             "A portion of synthetic records are close enough to real records to be linkable.",
             "Review carefully"],
            [_badge("LOW"), "< 10%",
             "Synthetic records are different enough from real records that linking them is difficult.",
             "Acceptable"],
        ]
    )

    # ── Attribute inference results table ──────────────────────────────────────
    if sa_rows:
        attr_table = _table(
            ["Sensitive Attribute", "Max Risk Score", "Mean Risk Score", "QI Combination Used", "Risk Level"],
            [
                [
                    r.get("id") or "Unknown",
                    f"{float(r.get('max_risk', 0)):.4f}",
                    f"{float(r.get('mean_risk', 0)):.4f}",
                    r.get("top_qid_set") or ", ".join(qi_list),
                    _badge(
                        "HIGH" if float(r.get("max_risk", 0)) >= 0.20
                        else "MEDIUM" if float(r.get("max_risk", 0)) >= 0.10
                        else "LOW"
                    ),
                ]
                for r in sa_rows
            ]
        )
    else:
        attr_table = (
            '<p style="color:#718096;font-size:13px;padding:12px;">'
            'No attribute inference results found.</p>'
        )

    attr_thresh = _table(
        ["Risk Level", "Gain Over Baseline", "Meaning", "Recommended Action"],
        [
            [_badge("HIGH"), "≥ 0.20",
             "Knowing the QI values gives the attacker a strong advantage in guessing the sensitive attribute.",
             "Do not release"],
            [_badge("MEDIUM"), "0.10 – 0.19",
             "The QI values give the attacker some advantage in guessing the sensitive attribute.",
             "Review carefully"],
            [_badge("LOW"), "< 0.10",
             "Knowing the QI values barely helps. The attacker cannot reliably predict the sensitive attribute.",
             "Acceptable"],
        ]
    )

    # ── Chart data for JavaScript ──────────────────────────────────────────────
    # k-distribution chart data
    k_dist_data = [
        {"label": "k=0", "count": int(k_zero), "color": "#ef4444"},
        {"label": "k=1", "count": int(k_one), "color": "#f97316"},
        {"label": "k<5", "count": int(k_lt5 - k_one), "color": "#eab308"},
        {"label": "k≥5", "count": int(k_safe), "color": "#22c55e"},
    ]

    # Exact match pie chart data
    exact_pie_data = [
        {"label": "Unique exact link (HIGH)", "count": int(exact_high), "color": "#ef4444"},
        {"label": "Small group match (MEDIUM)", "count": int(exact_medium), "color": "#f97316"},
        {"label": "No unique link found (LOW)", "count": exact_low_total, "color": "#22c55e"},
    ]

    # Hamming pie chart data
    hamming_pie_data = [
        {"label": f"High risk (≤{hamming_high_t:.0%})", "count": int(hamming_high), "color": "#ef4444"},
        {"label": f"Medium risk (≤{hamming_med_t:.0%})", "count": int(hamming_medium), "color": "#f97316"},
        {"label": "Low risk", "count": int(hamming_low), "color": "#22c55e"},
    ]

    # Attribute inference bar chart data
    attr_chart_data = []
    for r in sa_rows:
        try:
            attr_chart_data.append({
                "label": r.get("id") or "Unknown",
                "max_risk": round(float(r.get("max_risk", 0)) * 100, 4),
                "mean_risk": round(float(r.get("mean_risk", 0)) * 100, 4),
            })
        except (ValueError, TypeError):
            pass

    import json as _json
    k_dist_json      = _json.dumps(k_dist_data)
    exact_pie_json   = _json.dumps(exact_pie_data)
    hamming_pie_json = _json.dumps(hamming_pie_data)
    attr_chart_json  = _json.dumps(attr_chart_data)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Privacy Risk Assessment Report</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  *,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}
  body{{font-family:"Segoe UI",Arial,sans-serif;background:#f0f4f8;
        color:#1a202c;font-size:14px;line-height:1.6;}}
  code{{background:#edf2f7;padding:2px 6px;border-radius:4px;
        font-size:12px;font-family:monospace;}}
  .eq{{background:#f7fafc;border-left:4px solid #2b6cb0;border-radius:6px;
       padding:12px 16px;margin:12px 0;font-family:monospace;font-size:13px;color:#2d3748;}}
  .chart-wrap{{background:#fff;border-radius:10px;padding:20px 24px;
               box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-top:16px;}}
  .chart-title{{font-size:13px;font-weight:700;color:#2d3748;margin-bottom:4px;}}
  .chart-sub{{font-size:12px;color:#718096;margin-bottom:16px;}}
  .charts-grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;}}
  @media(max-width:700px){{.charts-grid{{grid-template-columns:1fr;}}}}
  @media print{{
    body{{background:#fff;}}
    .hdr,.ftr{{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  }}
</style>
</head>
<body>

<div class="hdr" style="background:#1a365d;color:#fff;padding:36px 48px;">
  <h1 style="font-size:26px;font-weight:800;">Privacy Risk Assessment Report</h1>
  <div style="font-size:14px;opacity:0.7;margin-top:6px;">
    Uniqueness &nbsp;·&nbsp; Re-identification &nbsp;·&nbsp; Attribute Inference
  </div>
  <div style="display:flex;gap:32px;margin-top:20px;font-size:13px;opacity:0.85;flex-wrap:wrap;">
    <span><small>Generated</small><br/><strong>{generated_at}</strong></span>
    <span><small>Project</small><br/><strong>Privacy Risk Assessment System — Western Sydney University</strong></span>
  </div>
</div>

<div style="max-width:1000px;margin:32px auto;padding:0 20px 64px;">

  <!-- ANALYSIS CONFIGURATION -->
  {_section_title("Analysis Configuration")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <p style="font-size:13px;color:#718096;margin-bottom:8px;">
      <strong>Quasi-Identifiers (QIs)</strong> — selected by the user as known attacker inputs:
    </p>
    <div>{qi_chips if qi_chips else "<em>None recorded</em>"}</div>
    <p style="font-size:13px;color:#718096;margin:16px 0 8px;">
      <strong>Sensitive Attributes (SAs)</strong> — columns selected for protection:
    </p>
    <div>{sa_chips if sa_chips else "<em>None recorded</em>"}</div>
  </div>

  <!-- PRIVACY RISK OVERVIEW -->
  {_section_title("Privacy Risk Overview")}
  <div style="background:#fff;border-radius:10px;padding:16px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;
              color:#4a5568;margin-bottom:16px;">
    Risk levels are determined independently for each metric using its own thresholds.
    A single metric rated HIGH is sufficient reason to withhold release of the synthetic dataset.
  </div>
  {overview_cards}

  <!-- SECTION 1: UNIQUENESS -->
  {_section_title("1. Uniqueness and Rare-Combination Risk")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;line-height:1.8;">
    For each synthetic record, the number of real records sharing the same
    quasi-identifier values is counted. This count is referred to as <code>k</code>.
    A record with <code>k=1</code> maps to exactly one real individual, which
    represents a direct re-identification risk. Records with <code>k&lt;5</code>
    are classified as rare combinations with elevated risk.<br/><br/>
    <strong>Uniqueness Score equation:</strong>
    <div class="eq">Uniqueness Score (%) = (Number of synthetic records with k=1) ÷ (Total synthetic records) × 100</div>
    <strong>Rare Combination Score equation:</strong>
    <div class="eq">Rare Combination Score (%) = (Number of synthetic records with k&lt;5) ÷ (Total synthetic records) × 100</div>
  </div>
  <div class="chart-wrap" style="margin-top:16px;">
    <div class="chart-title">Synthetic Record k-Value Distribution</div>
    <div class="chart-sub">
      Each bar shows how many synthetic records fall into each k category.
      k=0 means no real match exists. k=1 means only one real person shares those values.
      k&lt;5 means fewer than 5 real people share those values. k≥5 is considered safe.
    </div>
    <canvas id="kDistChart" height="100"></canvas>
  </div>
  <div style="margin-top:16px;">{uniq_table}</div>
  <div style="margin-top:20px;">{_section_title("Uniqueness Risk Thresholds")}</div>
  {uniq_thresh}

  <!-- SECTION 2: RE-IDENTIFICATION -->
  {_section_title("2. Re-identification Risk")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;line-height:1.8;">
    Two separate linkage methods are applied to measure re-identification risk.<br/><br/>
    <strong>Exact-match linkage</strong> checks whether a synthetic record has an
    identical match in the real dataset across all selected QI columns. A unique
    exact match (k=1) means only one real person shares those values.<br/>
    <div class="eq">Exact Match Score (%) = (Synthetic records with exactly 1 real match) ÷ (Total synthetic records) × 100</div>
    <strong>Hamming nearest-neighbour linkage</strong> finds the closest real record
    to each synthetic record by measuring how many QI values differ between them.
    A distance of 0.0 is identical; 1.0 is completely different.<br/>
    <div class="eq">Hamming Distance = (Number of differing QI values) ÷ (Total number of QIs)</div>
    <div class="eq">Hamming Score (%) = (Synthetic records with Hamming distance ≤ {hamming_high_t:.2f}) ÷ (Total synthetic records) × 100</div>
    Records within <code>{hamming_high_t:.0%}</code> Hamming distance of a real
    record are flagged as high risk.
  </div>
  <div class="charts-grid" style="margin-top:16px;">
    <div class="chart-wrap">
      <div class="chart-title">Exact Match Linkage — Record Distribution</div>
      <div class="chart-sub">
        Shows how many synthetic records have a unique exact match, a small group match,
        or no match at all in the real dataset based on QI values.
      </div>
      <canvas id="exactPieChart" height="200"></canvas>
    </div>
    <div class="chart-wrap">
      <div class="chart-title">Hamming Nearest-Neighbour — Record Distribution</div>
      <div class="chart-sub">
        Shows how many synthetic records are within high, medium, or low Hamming distance
        of their nearest real record. Closer distance means higher re-identification risk.
      </div>
      <canvas id="hammingPieChart" height="200"></canvas>
    </div>
  </div>
  <div style="margin-top:16px;">{link_table}</div>
  <div style="margin-top:20px;">{_section_title("Re-identification Risk Thresholds")}</div>
  {link_thresh}

  <!-- SECTION 3: ATTRIBUTE INFERENCE -->
  {_section_title("3. Attribute Inference Risk")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;line-height:1.8;">
    A majority-label attack is simulated for each sensitive attribute. The attacker
    uses the selected QI columns to look up the most common value of that sensitive
    attribute in the real dataset for each QI combination, then predicts that value
    for synthetic records.<br/><br/>
    <strong>Gain over baseline</strong> measures how much better the attack performs
    compared to always predicting the single most common overall value:
    <div class="eq">Gain over Baseline = Attack Accuracy − Baseline Accuracy</div>
    <strong>Risk Score</strong> combines coverage (how many records the attack can target)
    with the gain:
    <div class="eq">Risk Score = Coverage Rate × Gain over Baseline</div>
    A high gain indicates that the QI columns reveal information about the sensitive
    attribute. Results are shown separately for each sensitive attribute.
  </div>
  <div class="chart-wrap" style="margin-top:16px;">
    <div class="chart-title">Attribute Inference Risk by Sensitive Attribute</div>
    <div class="chart-sub">
      Max and mean risk score (%) per sensitive attribute.
      Risk score = coverage rate × gain over baseline. Threshold: HIGH ≥ 20%, MEDIUM ≥ 10%, LOW &lt; 10%.
    </div>
    <canvas id="attrChart" height="100"></canvas>
  </div>
  <div style="margin-top:16px;">{attr_table}</div>
  <div style="margin-top:20px;">{_section_title("Attribute Inference Risk Thresholds")}</div>
  {attr_thresh}

</div>

<div class="ftr" style="background:#1a365d;color:#fff;padding:20px 48px;
     font-size:12px;display:flex;justify-content:space-between;align-items:center;opacity:0.9;">
  <span>Privacy Risk Assessment System &nbsp;·&nbsp; Western Sydney University</span>
  <span>Generated: {generated_at}</span>
</div>

<script>
// ── k-distribution bar chart ──────────────────────────────────────────────────
(function() {{
  const data = {k_dist_json};
  const ctx = document.getElementById('kDistChart').getContext('2d');
  new Chart(ctx, {{
    type: 'bar',
    data: {{
      labels: data.map(d => d.label),
      datasets: [{{
        label: 'Number of Records',
        data: data.map(d => d.count),
        backgroundColor: data.map(d => d.color),
        borderRadius: 4,
      }}]
    }},
    options: {{
      responsive: true,
      plugins: {{
        legend: {{ display: false }},
        tooltip: {{
          callbacks: {{
            label: ctx => ' ' + ctx.parsed.y.toLocaleString() + ' records'
          }}
        }}
      }},
      scales: {{
        x: {{ grid: {{ display: false }} }},
        y: {{
          beginAtZero: true,
          ticks: {{ callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v }}
        }}
      }}
    }}
  }});
}})();

// ── Exact match pie chart ─────────────────────────────────────────────────────
(function() {{
  const allData = {exact_pie_json};
  const total = allData.reduce((s, d) => s + d.count, 0);
  // Filter out zero-count slices to avoid white gaps
  const data = total > 0 ? allData.filter(d => d.count > 0) : allData;
  const ctx = document.getElementById('exactPieChart').getContext('2d');
  new Chart(ctx, {{
    type: 'pie',
    data: {{
      labels: data.map(d => d.label),
      datasets: [{{
        data: data.map(d => d.count),
        backgroundColor: data.map(d => d.color),
        borderWidth: 0,
      }}]
    }},
    options: {{
      responsive: true,
      plugins: {{
        legend: {{ position: 'bottom', labels: {{ font: {{ size: 11 }},
          filter: (item, chart) => chart.datasets[0].data[item.index] > 0
        }} }},
        tooltip: {{
          callbacks: {{
            label: ctx => {{
              const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(2) : 0;
              return ' ' + ctx.parsed.toLocaleString() + ' records (' + pct + '%)';
            }}
          }}
        }}
      }}
    }}
  }});
}})();

// ── Hamming pie chart ─────────────────────────────────────────────────────────
(function() {{
  const allData = {hamming_pie_json};
  const total = allData.reduce((s, d) => s + d.count, 0);
  // Filter out zero-count slices to avoid white gaps
  const data = allData.filter(d => d.count > 0);
  const ctx = document.getElementById('hammingPieChart').getContext('2d');
  new Chart(ctx, {{
    type: 'pie',
    data: {{
      labels: data.map(d => d.label),
      datasets: [{{
        data: data.map(d => d.count),
        backgroundColor: data.map(d => d.color),
        borderWidth: 0,
      }}]
    }},
    options: {{
      responsive: true,
      plugins: {{
        legend: {{ position: 'bottom', labels: {{ font: {{ size: 11 }},
          filter: (item, chart) => chart.datasets[0].data[item.index] > 0
        }} }},
        tooltip: {{
          callbacks: {{
            label: ctx => {{
              const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(2) : 0;
              return ' ' + ctx.parsed.toLocaleString() + ' records (' + pct + '%)';
            }}
          }}
        }}
      }}
    }}
  }});
}})();

// ── Attribute inference grouped bar chart ─────────────────────────────────────
(function() {{
  const data = {attr_chart_json};
  if (!data.length) return;
  const ctx = document.getElementById('attrChart').getContext('2d');
  new Chart(ctx, {{
    type: 'bar',
    data: {{
      labels: data.map(d => d.label),
      datasets: [
        {{
          label: 'Max Risk Score (%)',
          data: data.map(d => d.max_risk),
          backgroundColor: data.map(d =>
            d.max_risk >= 20 ? '#ef4444' : d.max_risk >= 10 ? '#f97316' : '#22c55e'
          ),
          borderRadius: 4,
        }},
        {{
          label: 'Mean Risk Score (%)',
          data: data.map(d => d.mean_risk),
          backgroundColor: data.map(d =>
            d.mean_risk >= 20 ? '#c53030' : d.mean_risk >= 10 ? '#c05621' : '#276749'
          ),
          borderRadius: 4,
        }}
      ]
    }},
    options: {{
      responsive: true,
      plugins: {{
        legend: {{ position: 'top' }},
        tooltip: {{
          callbacks: {{
            label: ctx => ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(4) + '%'
          }}
        }}
      }},
      scales: {{
        x: {{ grid: {{ display: false }} }},
        y: {{
          beginAtZero: true,
          title: {{ display: true, text: 'Risk Score (%)' }}
        }}
      }}
    }}
  }});
}})();
</script>

</body>
</html>"""

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf8") as f:
        f.write(html)
    print(f"HTML report saved → {out_path}")


# ── CSV report ─────────────────────────────────────────────────────────────────

def generate_csv(data: dict, out_path: str) -> None:
    uniq      = data.get("uniqueness", {})
    link      = data.get("linkage", {})
    attr_rows = [r for r in data.get("attribute_inference", []) if r.get("category") == "sa"]
    qi_list   = data.get("qi_list", [])
    sa_list   = data.get("sa_list", [])

    uniq_pct    = float(uniq.get("uniqueness_score_pct", 0))
    rare_pct    = float(uniq.get("rare_combination_score_pct", 0))
    exact_pct   = float(link.get("exact_match_score_pct", 0))
    hamming_pct = float(link.get("hamming_score_pct", 0))

    uniq_level    = "HIGH" if uniq_pct >= 20 else "MEDIUM" if uniq_pct >= 10 else "LOW"
    rare_level    = "HIGH" if rare_pct >= 20 else "MEDIUM" if rare_pct >= 10 else "LOW"
    exact_level   = "HIGH" if exact_pct >= 30 else "MEDIUM" if exact_pct >= 10 else "LOW"
    hamming_level = "HIGH" if hamming_pct >= 30 else "MEDIUM" if hamming_pct >= 10 else "LOW"

    k_zero       = uniq.get("k_zero_count", 0)
    k_zero_level = "HIGH" if int(k_zero) > 0 else "LOW"

    rows = [
        ["SECTION", "METRIC", "VALUE", "RISK LEVEL", "NOTES"],

        ["Run Info", "Generated At", datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "", ""],
        ["Run Info", "Quasi-Identifiers", ", ".join(qi_list), "", "User-selected"],
        ["Run Info", "Sensitive Attributes", ", ".join(sa_list), "", "User-selected"],
        ["", "", "", "", ""],

        ["Uniqueness Risk", "Uniqueness Score (k=1)", f"{uniq_pct:.4f}%", uniq_level,
         "Formula: (records with k=1 / total synthetic) x 100. Threshold: HIGH>=20%, MEDIUM>=10%, LOW<10%"],
        ["Uniqueness Risk", "Rare Combination Score (k<5)", f"{rare_pct:.4f}%", rare_level,
         "Formula: (records with k<5 / total synthetic) x 100. Threshold: HIGH>=20%, MEDIUM>=10%, LOW<10%"],
        ["Uniqueness Risk", "Records k=0", str(uniq.get("k_zero_count", 0)), k_zero_level,
         "No match found in real data"],
        ["Uniqueness Risk", "Records k=1", str(uniq.get("k_one_count", 0)), uniq_level,
         "Unique match to one real person"],
        ["Uniqueness Risk", "Records k<5", str(uniq.get("k_lt_5_count", 0)), rare_level,
         "Rare combination"],
        ["Uniqueness Risk", "Total Synthetic Records",
         str(uniq.get("total_synthetic_records", 0)), "", ""],
        ["", "", "", "", ""],

        ["Re-identification Risk", "Exact Match Score", f"{exact_pct:.4f}%", exact_level,
         "Formula: (records with 1 real match / total synthetic) x 100. Threshold: HIGH>=30%, MEDIUM>=10%, LOW<10%"],
        ["Re-identification Risk", "Hamming NN Score", f"{hamming_pct:.4f}%", hamming_level,
         "Formula: (records with Hamming distance <= threshold / total synthetic) x 100. Threshold: HIGH>=30%, MEDIUM>=10%, LOW<10%"],
        ["", "", "", "", ""],

        *[
            ["Attribute Inference Risk", f"SA: {r.get('id') or 'Unknown'}",
             f"max_risk={float(r.get('max_risk', 0)):.4f}  mean_risk={float(r.get('mean_risk', 0)):.4f}",
             "HIGH" if float(r.get("max_risk", 0)) >= 0.20
             else "MEDIUM" if float(r.get("max_risk", 0)) >= 0.10 else "LOW",
             f"Formula: coverage_rate x gain_over_baseline. QI combination: {r.get('top_qid_set') or ', '.join(qi_list)} | Threshold: HIGH>=0.20, MEDIUM>=0.10, LOW<0.10"]
            for r in attr_rows
        ],
    ]

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf8") as f:
        csv.writer(f).writerows(rows)
    print(f"CSV report saved  → {out_path}")


# ── Entry point ────────────────────────────────────────────────────────────────

def generate_all() -> None:
    print("Loading results...")
    data = load_all_results()
    print(f"  Result dir : {data['result_dir']}")
    print(f"  Uniqueness : {data['uniqueness'].get('uniqueness_score_pct', 'N/A')}%")
    print(f"  Linkage    : exact={data['linkage'].get('exact_match_score_pct', 'N/A')}%"
          f"  hamming={data['linkage'].get('hamming_score_pct', 'N/A')}%")
    print(f"  Attr rows  : {len(data['attribute_inference'])}")
    generate_html(data, HTML_OUT)
    generate_csv(data, CSV_OUT)
    print("Done.")


if __name__ == "__main__":
    generate_all()