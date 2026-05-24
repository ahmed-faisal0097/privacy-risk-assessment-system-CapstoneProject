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

    # Attribute inference results live in the matching r2_attr_* folder
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

    # Uniqueness
    uniq_pct  = float(uniq.get("uniqueness_score_pct", 0))
    rare_pct  = float(uniq.get("rare_combination_score_pct", 0))
    k_zero    = uniq.get("k_zero_count", 0)
    k_one     = uniq.get("k_one_count", 0)
    k_lt5     = uniq.get("k_lt_5_count", 0)
    total_syn = uniq.get("total_synthetic_records", 0)

    uniq_level = "HIGH" if uniq_pct >= 20 else "MEDIUM" if uniq_pct >= 10 else "LOW"
    rare_level = "HIGH" if rare_pct >= 20 else "MEDIUM" if rare_pct >= 10 else "LOW"

    # Linkage
    exact_pct   = float(link.get("exact_match_score_pct", 0))
    hamming_pct = float(link.get("hamming_score_pct", 0))

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

    # Attribute inference
    sa_rows = [r for r in attr_rows if r.get("category") == "sa"]
    attr_max_risk = 0.0
    for r in sa_rows:
        try:
            attr_max_risk = max(attr_max_risk, float(r.get("max_risk", 0)))
        except (ValueError, TypeError):
            pass

    # QI / SA chips
    qi_chips = _chips(qi_list, "#2b6cb0", "#ebf4ff", "#bee3f8")
    sa_chips = _chips(sa_list, "#553c9a", "#faf5ff", "#d6bcfa")

    # Summary score cards — no risk labels, scores only
    cards = f"""
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:12px;">
      {_score_card("Uniqueness Score", _fmt_pct(uniq_pct), "Records with k=1 in real data")}
      {_score_card("Rare Combination Score", _fmt_pct(rare_pct), "Records with k&lt;5 in real data")}
      {_score_card("Exact Match Score", _fmt_pct(exact_pct), "Records with identical QI match in real data")}
      {_score_card("Hamming NN Score", _fmt_pct(hamming_pct), "Records within high-risk Hamming distance")}
      {_score_card("Attribute Inference Risk", _fmt_pct(attr_max_risk * 100), "Max gain over baseline across sensitive attributes")}
    </div>"""

    # Uniqueness detail table
    uniq_table = _table(
        ["Category", "Count", "% of Synthetic", "Risk"],
        [
            ["Records with k=0 (no match in real data)", _fmt_num(k_zero),
             _fmt_pct(k_zero / total_syn * 100 if total_syn else 0),
             _badge("HIGH" if k_zero > 0 else "LOW")],
            ["Records with k=1 (unique — maps to exactly one real person)", _fmt_num(k_one),
             _fmt_pct(uniq_pct), _badge(uniq_level)],
            ["Records with k&lt;5 (rare — fewer than 5 real matches)", _fmt_num(k_lt5),
             _fmt_pct(rare_pct), _badge(rare_level)],
            ["Records with k≥5 (sufficient real coverage)", _fmt_num(total_syn - k_lt5),
             _fmt_pct((total_syn - k_lt5) / total_syn * 100 if total_syn else 0), _badge("LOW")],
        ]
    )

    uniq_thresh = _table(
        ["Risk Level", "Score Range", "Meaning", "Recommended Action"],
        [
            [_badge("HIGH"), "≥ 20%",
             "A large portion of synthetic records map uniquely to real individuals",
             "Do not release — apply generalisation or suppression"],
            [_badge("MEDIUM"), "10% – 19.99%",
             "Some records have limited coverage in the real dataset",
             "Review carefully — consider restricting access"],
            [_badge("LOW"), "< 10%",
             "Most records have sufficient real-data coverage",
             "Acceptable — verify the other risk dimensions as well"],
        ]
    )

    # Linkage detail table — Exact Match and Hamming shown separately, no combined row
    link_table = _table(
        ["Method", "Metric", "Count / Score", "Risk"],
        [
            ["Exact Match", "Records with a unique exact link (1 real match)",
             _fmt_num(exact_high),
             _badge("HIGH" if int(exact_high) > 0 else "LOW")],
            ["Exact Match", "Records in a small group (2–5 real matches)",
             _fmt_num(exact_medium),
             _badge("MEDIUM" if int(exact_medium) > 0 else "LOW")],
            ["Exact Match", "Records with no exact link found",
             _fmt_num(exact_none),
             _badge("LOW")],
            ["Exact Match", "Overall exact-match score", _fmt_pct(exact_pct),
             _badge("HIGH" if exact_pct >= 30 else "MEDIUM" if exact_pct >= 10 else "LOW")],
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
             _badge("HIGH" if hamming_pct >= 30 else "MEDIUM" if hamming_pct >= 10 else "LOW")],
        ]
    )

    link_thresh = _table(
        ["Risk Level", "Score Range", "Meaning", "Recommended Action"],
        [
            [_badge("HIGH"), "≥ 30%",
             "A large share of synthetic records closely match real individuals",
             "Do not release — re-identification is likely"],
            [_badge("MEDIUM"), "10% – 29.99%",
             "Some records are linkable to real individuals",
             "Apply caution — consider noise addition or suppression"],
            [_badge("LOW"), "< 10%",
             "Synthetic records are sufficiently distinct from real ones",
             "Acceptable — verify the other risk dimensions as well"],
        ]
    )

    # Attribute inference table — one row per sensitive attribute
    if sa_rows:
        attr_table = _table(
            ["Sensitive Attribute", "Max Risk Score", "Mean Risk Score", "QI Combination Used", "Risk Level"],
            [
                [
                    r.get("id", "—"),
                    f"{float(r.get('max_risk', 0)):.4f}",
                    f"{float(r.get('mean_risk', 0)):.4f}",
                    r.get("top_qid_set", "—"),
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
             "The attacker gains 20%+ accuracy above random guessing — the attribute is predictable",
             "Do not release — sensitive attributes are inferrable from QIs"],
            [_badge("MEDIUM"), "0.10 – 0.19",
             "Moderate advantage — the attribute is partially predictable",
             "Review carefully — consider removing high-risk QI combinations"],
            [_badge("LOW"), "< 0.10",
             "The attacker barely outperforms random guessing",
             "Acceptable — monitor if the QI set changes"],
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

<div style="max-width:960px;margin:32px auto;padding:0 20px 64px;">

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

  {_section_title("Score Summary")}
  {cards}

  {_section_title("1. Uniqueness and Rare-Combination Risk")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;line-height:1.8;">
    For each synthetic record, the number of real records sharing the same
    quasi-identifier values is counted. This count is referred to as <code>k</code>.
    A record with <code>k=1</code> maps to exactly one real individual, which
    represents a direct re-identification risk. Records with <code>k&lt;5</code>
    are classified as rare. The uniqueness score is the percentage of synthetic
    records where <code>k=1</code>.
  </div>
  <div style="margin-top:16px;">{uniq_table}</div>
  <div style="margin-top:20px;">{_section_title("Uniqueness Risk Thresholds")}</div>
  {uniq_thresh}

  {_section_title("2. Re-identification Risk")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;line-height:1.8;">
    Two separate linkage methods are used.<br/><br/>
    <strong>Exact-match linkage</strong> checks whether a synthetic record has
    an identical match in the real dataset across all selected QI columns.
    A unique exact match means only one real person shares those values.<br/><br/>
    <strong>Hamming nearest-neighbour linkage</strong> finds the closest real
    record to each synthetic record using Hamming distance across QI columns.
    A distance of 0.0 is identical; 1.0 is completely different. Records within
    <code>{hamming_high_t:.0%}</code> Hamming distance are flagged as high risk.
  </div>
  <div style="margin-top:16px;">{link_table}</div>
  <div style="margin-top:20px;">{_section_title("Re-identification Risk Thresholds")}</div>
  {link_thresh}

  {_section_title("3. Attribute Inference Risk")}
  <div style="background:#fff;border-radius:10px;padding:20px 24px;
              box-shadow:0 1px 4px rgba(0,0,0,0.08);font-size:13px;line-height:1.8;">
    A majority-label attack is simulated for each sensitive attribute. The attacker
    uses the selected QI columns to look up the most common value of that sensitive
    attribute in the real dataset for each QI combination, then predicts that value
    for synthetic records. The <strong>gain over baseline</strong> measures how much
    better this attack performs compared to always predicting the single most common
    overall value. A high gain indicates that the QI columns reveal information about
    the sensitive attribute. Results are shown separately for each sensitive attribute.
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

    uniq_level = "HIGH" if uniq_pct >= 20 else "MEDIUM" if uniq_pct >= 10 else "LOW"
    rare_level = "HIGH" if rare_pct >= 20 else "MEDIUM" if rare_pct >= 10 else "LOW"

    k_zero = uniq.get("k_zero_count", 0)
    k_zero_level = "HIGH" if int(k_zero) > 0 else "LOW"

    rows = [
        ["SECTION", "METRIC", "VALUE", "RISK LEVEL", "NOTES"],

        ["Run Info", "Generated At", datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "", ""],
        ["Run Info", "Quasi-Identifiers", ", ".join(qi_list), "", "User-selected"],
        ["Run Info", "Sensitive Attributes", ", ".join(sa_list), "", "User-selected"],
        ["", "", "", "", ""],

        ["Uniqueness Risk", "Uniqueness Score (k=1)", f"{uniq_pct:.4f}%", uniq_level,
         "Threshold: HIGH>=20%, MEDIUM>=10%, LOW<10%"],
        ["Uniqueness Risk", "Rare Combination Score (k<5)", f"{rare_pct:.4f}%", rare_level,
         "Threshold: HIGH>=20%, MEDIUM>=10%, LOW<10%"],
        ["Uniqueness Risk", "Records k=0", str(uniq.get("k_zero_count", 0)), k_zero_level,
         "No match found in real data"],
        ["Uniqueness Risk", "Records k=1", str(uniq.get("k_one_count", 0)), uniq_level,
         "Unique match to one real person"],
        ["Uniqueness Risk", "Records k<5", str(uniq.get("k_lt_5_count", 0)), rare_level,
         "Rare combination"],
        ["Uniqueness Risk", "Total Synthetic Records",
         str(uniq.get("total_synthetic_records", 0)), "", ""],
        ["", "", "", "", ""],

        ["Re-identification Risk", "Exact Match Score", f"{exact_pct:.4f}%",
         "HIGH" if exact_pct >= 30 else "MEDIUM" if exact_pct >= 10 else "LOW",
         "Threshold: HIGH>=30%, MEDIUM>=10%, LOW<10%"],
        ["Re-identification Risk", "Hamming NN Score", f"{hamming_pct:.4f}%",
         "HIGH" if hamming_pct >= 30 else "MEDIUM" if hamming_pct >= 10 else "LOW",
         "Threshold: HIGH>=30%, MEDIUM>=10%, LOW<10%"],
        ["", "", "", "", ""],

        *[
            ["Attribute Inference Risk", f"SA: {r.get('id', '—')}",
             f"max_risk={float(r.get('max_risk', 0)):.4f}  mean_risk={float(r.get('mean_risk', 0)):.4f}",
             "HIGH" if float(r.get("max_risk", 0)) >= 0.20
             else "MEDIUM" if float(r.get("max_risk", 0)) >= 0.10 else "LOW",
             f"QI combination: {r.get('top_qid_set', '—')}  |  Threshold: HIGH>=0.20, MEDIUM>=0.10, LOW<0.10"]
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