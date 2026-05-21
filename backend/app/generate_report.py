"""
M5 — Privacy Risk Assessment Report Generator
What this file does:
  Reads the JSON summary produced by the risk evaluation pipeline
  (results/syn_k_summary.json) and generates three report files:

  1. results/privacy_risk_report.html
     A professional HTML audit report — coloured, formatted,
     with risk scores, tables, methodology, and recommendation.

  2. results/privacy_risk_report_summary.csv
     A flat structured CSV for audit trail / record keeping.
     Each row has: section, metric name, value, notes.

  3. results/privacy_risk_report.pdf
     A structured PDF report built with reportlab (pure-Python,
     no system dependencies).  Contains risk scores, QI/SA config,
     group statistics, record risk counts, and linkage risk if
     a linkage_summary.json is available in the same result directory.

Dependencies:
  Built-ins: os, json, csv, datetime
  Third-party: reportlab (pip install reportlab) — PDF generation only.
════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations
import os
import json
import csv
from datetime import datetime
from typing import Any

# reportlab is needed only for generate_pdf; imported lazily so the rest
# of the module keeps working even if the package is not yet installed.
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.colors import HexColor, white
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )
    _REPORTLAB_AVAILABLE = True
except ImportError:
    _REPORTLAB_AVAILABLE = False


# FILE PATHS
# __file__ is the path of THIS script.
# We go up two levels (report/ → app/ → backend/) then one more (→ project root)
# to find the results/ folder.
# This means paths work correctly regardless of where you run the command from.

_HERE        = os.path.dirname(__file__)                          # .../backend/app/report/
REPO_ROOT    = os.path.abspath(os.path.join(_HERE, "..", "..", ".."))  # project root
RESULTS_DIR  = os.path.join(REPO_ROOT, "results")                # .../results/
SUMMARY_JSON = os.path.join(RESULTS_DIR, "syn_k_summary.json")   # Rodney's output
HTML_OUT     = os.path.join(RESULTS_DIR, "privacy_risk_report.html")
CSV_OUT      = os.path.join(RESULTS_DIR, "privacy_risk_report_summary.csv")


# HELPER FUNCTIONS

def _risk_level(pct: float) -> str:
    """
    Convert a percentage score to a risk level string.
    Thresholds match what we use in the HTML dashboard.
      >= 20% → HIGH
      >= 10% → MEDIUM
      <  10% → LOW
    """
    return "HIGH" if pct >= 20 else "MEDIUM" if pct >= 10 else "LOW"


def _risk_color(pct: float) -> str:
    """
    Return the hex colour for a given risk percentage.
    Used in the HTML report to colour elements.
    """
    return "#c53030" if pct >= 20 else "#c05621" if pct >= 10 else "#276749"


def _risk_bg(pct: float) -> str:
    """
    Return the light background colour for a given risk percentage.
    Used for card backgrounds in the HTML report.
    """
    return "#fff5f5" if pct >= 20 else "#fffaf0" if pct >= 10 else "#f0fff4"


def _risk_icon(pct: float) -> str:
    """
    Return an icon character for a given risk percentage.
    ⚠ = warning (high), △ = caution (medium), ✓ = ok (low)
    """
    return "⚠" if pct >= 20 else "△" if pct >= 10 else "✓"


def _fmt_pct(v: float) -> str:
    """Format a float as a percentage string. e.g. 5.4802 → '5.48%'"""
    return f"{v:.2f}%"


def _fmt_num(v: Any) -> str:
    """Format a number with commas. e.g. 101766 → '101,766'"""
    try:
        return f"{int(v):,}"
    except Exception:
        return str(v)

#LOAD SUMMARY

def load_summary() -> dict:
    """
    Read Rodney's JSON output file and return it as a Python dictionary.
    Raises FileNotFoundError if M3 hasn't been run yet.
    """
    if not os.path.exists(SUMMARY_JSON):
        raise FileNotFoundError(
            f"Summary JSON not found at: {SUMMARY_JSON}\n"
            "Run M3 first: python -m backend.app.main"
        )
    with open(SUMMARY_JSON, encoding="utf8") as f:
        return json.load(f)


# HTML REPORT GENERATOR

def generate_html(summary: dict, out_path: str) -> None:
    """
    Build a complete HTML audit report from the summary dictionary
    and write it to out_path.

    The HTML is one long string built with Python f-strings.
    All values (scores, counts, QI names etc) come from the summary dict.
    No external libraries — pure Python string formatting.
    """

    # ── Extract values from summary ──────────────────────────────────
    uniq_pct = summary.get("uniqueness_score_pct", 0)
    rare_pct  = summary.get("rare_combination_score_pct", 0)
    k_zero    = summary.get("k_zero_count", 0)
    k_one     = summary.get("k_one_count", 0)
    k_lt5     = summary.get("k_lt_5_count", 0)
    total     = summary.get("total_synthetic_records", 0)
    qis       = summary.get("qis_used", [])    # list of QI column names
    sas       = summary.get("sas_used", [])    # list of SA column names
    gs        = summary.get("qid_group_stats", {})  # group statistics dict

    # ── Calculate derived values ──────────────────────────────────────
    uniq_lvl  = _risk_level(uniq_pct)
    rare_lvl  = _risk_level(rare_pct)
    uniq_clr  = _risk_color(uniq_pct)
    rare_clr  = _risk_color(rare_pct)
    uniq_bg   = _risk_bg(uniq_pct)
    rare_bg   = _risk_bg(rare_pct)

    # Overall score = average of uniqueness and rare combination
    overall_pct = (uniq_pct + rare_pct) / 2
    overall_lvl = _risk_level(overall_pct)
    overall_clr = _risk_color(overall_pct)
    overall_bg  = _risk_bg(overall_pct)

    # When the report was generated
    generated_at = datetime.now().strftime("%d %B %Y, %H:%M")

    # ── Build QI and SA chips (HTML pill elements) ────────────────────
    # These show the column names as coloured pills in the report
    qi_chips = "".join(
        f'<span class="chip qi">{q}</span>' for q in qis
    )
    sa_chips = "".join(
        f'<span class="chip sa">{s}</span>' for s in sas
    )

    # ── Build group stats table rows ──────────────────────────────────
    # These go inside the QI group statistics table in the report
    stats_rows = f"""
    <tr><td>Real dataset rows</td>
        <td class="num">{_fmt_num(gs.get("n_rows", "—"))}</td></tr>
    <tr><td>Unique QI combinations (groups)</td>
        <td class="num">{_fmt_num(gs.get("n_groups", "—"))}</td></tr>
    <tr><td>Smallest group size</td>
        <td class="num">{_fmt_num(gs.get("min_group_size", "—"))}</td></tr>
    <tr><td>Median group size</td>
        <td class="num">{gs.get("median_group_size", "—")}</td></tr>
    <tr><td>Largest group size</td>
        <td class="num">{_fmt_num(gs.get("max_group_size", "—"))}</td></tr>
    <tr><td>Unique real rows (k=1)</td>
        <td class="num">{_fmt_num(gs.get("unique_rows", "—"))}
        ({_fmt_pct(gs.get("unique_row_rate", 0) * 100)})</td></tr>
    <tr><td>Real rows in groups with k&lt;5</td>
        <td class="num">{_fmt_num(gs.get("rows_in_groups_lt_5", "—"))}
        ({_fmt_pct(gs.get("rows_in_groups_lt_5_rate", 0) * 100)})</td></tr>
    """

    # ── Choose recommendation text based on overall risk ─────────────
    # This is the written paragraph at the top of the report.
    # Different wording depending on whether overall risk is HIGH/MEDIUM/LOW.
    if overall_lvl == "HIGH":
        recommendation = (
            "The synthetic dataset presents a <strong>HIGH</strong> privacy risk. "
            "A significant proportion of synthetic records are either unique or rare "
            "in the real dataset, creating substantial re-identification exposure. "
            "<strong>It is strongly recommended that this synthetic dataset is NOT "
            "released</strong> without further privacy-enhancing transformations such "
            "as generalisation, suppression, or differential privacy noise injection."
        )
    elif overall_lvl == "MEDIUM":
        recommendation = (
            "The synthetic dataset presents a <strong>MEDIUM</strong> privacy risk. "
            "While the uniqueness score is within acceptable bounds, the rare-combination "
            "rate indicates a non-trivial number of synthetic records share quasi-identifier "
            "combinations with very few real individuals. "
            "<strong>Caution is advised</strong> — consider applying additional anonymisation "
            "or restricting access before releasing this dataset."
        )
    else:
        recommendation = (
            "The synthetic dataset presents a <strong>LOW</strong> privacy risk "
            "based on the uniqueness and rare-combination metrics. "
            "The majority of synthetic records share their quasi-identifier combinations "
            "with enough real records that re-identification risk is manageable. "
            "<strong>The dataset may be suitable for sharing</strong>, subject to review "
            "of other risk dimensions (attribute inference, re-identification) and "
            "organisational policy."
        )

    # BUILD THE FULL HTML DOCUMENT
    # This is one big f-string. Python f-strings let you insert
    # variable values directly using {variable_name} syntax.
    # The CSS in <style> and the content in <body> are all here.
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Privacy Risk Assessment Report</title>
<style>
  /* ── CSS variables for colours ── */
  :root {{
    --navy:#1a365d; --blue:#2b6cb0; --blue-lt:#ebf4ff;
    --high:#c53030; --high-lt:#fff5f5;
    --med:#c05621;  --med-lt:#fffaf0;
    --low:#276749;  --low-lt:#f0fff4;
    --border:#e2e8f0; --text:#1a202c; --muted:#718096;
    --radius:10px;
  }}

  /* ── Reset ── */
  *, *::before, *::after {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{
    font-family:"Segoe UI",Arial,sans-serif;
    background:#f0f4f8;
    color:var(--text);
    font-size:14px;
    line-height:1.6;
  }}

  /* ── Dark blue report header ── */
  .report-header {{
    background:var(--navy);
    color:#fff;
    padding:36px 48px;
  }}
  .report-header h1 {{ font-size:26px; font-weight:800; }}
  .report-header .sub {{ font-size:14px; opacity:0.75; margin-top:6px; }}
  .header-meta {{
    display:flex; gap:32px;
    margin-top:20px;
    font-size:13px; opacity:0.85;
  }}
  .header-meta span {{ display:flex; flex-direction:column; gap:2px; }}
  .header-meta strong {{ font-size:15px; opacity:1; }}

  /* ── Page body wrapper ── */
  .body {{ max-width:960px; margin:32px auto; padding:0 20px 64px; }}

  /* ── Section headings ── */
  .section {{ margin-top:36px; }}
  .section-title {{
    font-size:13px; font-weight:700;
    text-transform:uppercase; letter-spacing:0.8px;
    color:var(--muted); margin-bottom:12px;
    padding-bottom:6px; border-bottom:2px solid var(--border);
  }}

  /* ── Overall verdict box (big coloured box at top) ── */
  .verdict {{
    background:{overall_bg};
    border:2px solid {overall_clr};
    border-radius:var(--radius);
    padding:24px 28px;
    display:flex; align-items:flex-start; gap:20px;
  }}
  .verdict-icon {{ font-size:40px; line-height:1; }}
  .verdict-level {{ font-size:22px; font-weight:800; color:{overall_clr}; margin-bottom:4px; }}
  .verdict-score {{ font-size:14px; color:var(--muted); margin-bottom:12px; }}
  .verdict-text {{ font-size:14px; line-height:1.7; }}

  /* ── Score cards ── */
  .score-grid {{
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
    gap:16px;
  }}
  .score-card {{
    background:#fff; border-radius:var(--radius);
    padding:20px; box-shadow:0 1px 4px rgba(0,0,0,0.08);
    border-left:5px solid var(--blue);
  }}
  .score-card.high {{ border-left-color:var(--high); background:var(--high-lt); }}
  .score-card.med  {{ border-left-color:var(--med);  background:var(--med-lt);  }}
  .score-card.low  {{ border-left-color:var(--low);  background:var(--low-lt);  }}
  .sc-label {{
    font-size:11px; font-weight:700;
    text-transform:uppercase; letter-spacing:0.6px; color:var(--muted);
  }}
  .sc-value {{ font-size:30px; font-weight:800; margin:6px 0 4px; color:var(--blue); }}
  .score-card.high .sc-value {{ color:var(--high); }}
  .score-card.med  .sc-value {{ color:var(--med);  }}
  .score-card.low  .sc-value {{ color:var(--low);  }}
  .sc-desc {{ font-size:12px; color:var(--muted); }}
  .risk-badge {{
    display:inline-block; margin-top:8px;
    padding:3px 10px; border-radius:999px;
    font-size:11px; font-weight:700; color:#fff;
  }}
  .badge-high {{ background:var(--high); }}
  .badge-med  {{ background:var(--med);  }}
  .badge-low  {{ background:var(--low);  }}

  /* ── Column chips (QI and SA names shown as pills) ── */
  .chip-row {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }}
  .chip {{ border-radius:999px; padding:4px 14px; font-size:12px; font-weight:600; }}
  .chip.qi {{ background:var(--blue-lt); color:var(--blue); border:1px solid #bee3f8; }}
  .chip.sa {{ background:#faf5ff; color:#553c9a; border:1px solid #d6bcfa; }}

  /* ── Tables ── */
  .tbl-wrap {{
    background:#fff; border-radius:var(--radius);
    box-shadow:0 1px 4px rgba(0,0,0,0.08);
    overflow:hidden; margin-top:12px;
  }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  thead tr {{ background:#2d3748; color:#fff; }}
  thead th {{ padding:11px 16px; text-align:left; font-size:12px; font-weight:700; }}
  thead th.right {{ text-align:right; }}
  tbody td {{ padding:10px 16px; border-bottom:1px solid var(--border); }}
  tbody td.num {{ text-align:right; font-family:monospace; }}
  tbody tr:nth-child(even) {{ background:#f7fafc; }}
  tbody tr:last-child td {{ border-bottom:none; }}

  /* ── Methodology box ── */
  .method-box {{
    background:#fff; border-radius:var(--radius);
    padding:20px 24px; box-shadow:0 1px 4px rgba(0,0,0,0.08);
    font-size:13px; line-height:1.8;
  }}
  .method-box h4 {{
    font-size:14px; font-weight:700;
    margin:16px 0 6px; color:var(--navy);
  }}
  .method-box h4:first-child {{ margin-top:0; }}
  code {{
    background:#edf2f7; padding:2px 6px;
    border-radius:4px; font-size:12px; font-family:monospace;
  }}

  /* ── Footer ── */
  .report-footer {{
    background:var(--navy); color:#fff;
    padding:20px 48px; font-size:12px; opacity:0.85;
    display:flex; justify-content:space-between; align-items:center;
  }}

  /* ── Print styles: make it look clean when printed to PDF ── */
  @media print {{
    body {{ background:white; }}
    .body {{ margin:0; padding:20px; }}
    .report-header, .report-footer {{
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    }}
  }}
</style>
</head>
<body>

<!-- HEADER -->
<div class="report-header">
  <h1>🔒 Privacy Risk Assessment Report</h1>
  <div class="sub">
    Uniqueness &amp; Rare-Combination Risk Evaluation — Module 3
  </div>
  <div class="header-meta">
    <span><small>Generated</small>
          <strong>{generated_at}</strong></span>
    <span><small>Dataset</small>
          <strong>Diabetes 130-US Hospitals (1999–2008)</strong></span>
    <span><small>Project</small>
          <strong>Capstone — Western Sydney University</strong></span>
    <span><small>Evaluation</small>
          <strong>k-Anonymity / Uniqueness Analysis</strong></span>
  </div>
</div>

<div class="body">

  <!-- OVERALL VERDICT 
       Big coloured box at the top.
       Colour changes automatically based on risk level.
 -->
  <div class="section">
    <div class="section-title">Overall Privacy Risk Verdict</div>
    <div class="verdict">
      <div class="verdict-icon">{_risk_icon(overall_pct)}</div>
      <div>
        <div class="verdict-level">
          {overall_lvl} RISK — Overall Score: {_fmt_pct(overall_pct)}
        </div>
        <div class="verdict-score">
          Uniqueness: {_fmt_pct(uniq_pct)} ({uniq_lvl}) &nbsp;|&nbsp;
          Rare Combination: {_fmt_pct(rare_pct)} ({rare_lvl})
        </div>
        <div class="verdict-text">{recommendation}</div>
      </div>
    </div>
  </div>

  <!-- SCORE CARDS 
       Four metric cards in a grid.
       Each card class (.high/.med/.low) controls its colour.
 -->
  <div class="section">
    <div class="section-title">Risk Score Breakdown</div>
    <div class="score-grid">

      <div class="score-card {uniq_lvl.lower()}">
        <div class="sc-label">Uniqueness Score</div>
        <div class="sc-value">{_fmt_pct(uniq_pct)}</div>
        <div class="sc-desc">Synthetic records with k=1 in real data</div>
        <span class="risk-badge badge-{uniq_lvl.lower()}">
          {_risk_icon(uniq_pct)} {uniq_lvl} RISK
        </span>
      </div>

      <div class="score-card {rare_lvl.lower()}">
        <div class="sc-label">Rare Combination Score</div>
        <div class="sc-value">{_fmt_pct(rare_pct)}</div>
        <div class="sc-desc">Synthetic records with k&lt;5 in real data</div>
        <span class="risk-badge badge-{rare_lvl.lower()}">
          {_risk_icon(rare_pct)} {rare_lvl} RISK
        </span>
      </div>

      <div class="score-card">
        <div class="sc-label">Not in Real Data (k=0)</div>
        <div class="sc-value">{_fmt_num(k_zero)}</div>
        <div class="sc-desc">No matching real QI combination</div>
      </div>

      <div class="score-card">
        <div class="sc-label">Total Synthetic Records</div>
        <div class="sc-value">{_fmt_num(total)}</div>
        <div class="sc-desc">Total records evaluated</div>
      </div>

    </div>
  </div>

  <!-- COLUMN CONFIGURATION -->
  <div class="section">
    <div class="section-title">Evaluation Configuration</div>
    <div class="tbl-wrap" style="padding:20px 24px;">
      <p style="font-size:13px;color:var(--muted);margin-bottom:8px;">
        <strong>Quasi-Identifiers (QIs)</strong> — columns used to measure risk:
      </p>
      <div class="chip-row">{qi_chips}</div>
      <p style="font-size:13px;color:var(--muted);margin:16px 0 8px;">
        <strong>Sensitive Attributes (SAs)</strong> — columns being protected:
      </p>
      <div class="chip-row">{sa_chips}</div>
    </div>
  </div>

  <!-- QI GROUP STATS TABLE -->
  <div class="section">
    <div class="section-title">QI Group Statistics (Real Dataset)</div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>Metric</th><th class="right">Value</th></tr></thead>
        <tbody>{stats_rows}</tbody>
      </table>
    </div>
  </div>

  <!-- RISK COUNTS TABLE -->
  <div class="section">
    <div class="section-title">Synthetic Record Risk Counts</div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th class="right">Count</th>
            <th class="right">% of Synthetic</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Records with k=0 (no match in real data)</td>
            <td class="num">{_fmt_num(k_zero)}</td>
            <td class="num">{_fmt_pct(k_zero / total * 100 if total else 0)}</td>
            <td><span class="risk-badge badge-high">⚠ HIGH</span></td>
          </tr>
          <tr>
            <td>Records with k=1 (unique — matches exactly 1 real person)</td>
            <td class="num">{_fmt_num(k_one)}</td>
            <td class="num">{_fmt_pct(uniq_pct)}</td>
            <td><span class="risk-badge badge-{uniq_lvl.lower()}">
              {_risk_icon(uniq_pct)} {uniq_lvl}
            </span></td>
          </tr>
          <tr>
            <td>Records with k&lt;5 (rare — fewer than 5 real matches)</td>
            <td class="num">{_fmt_num(k_lt5)}</td>
            <td class="num">{_fmt_pct(rare_pct)}</td>
            <td><span class="risk-badge badge-{rare_lvl.lower()}">
              {_risk_icon(rare_pct)} {rare_lvl}
            </span></td>
          </tr>
          <tr>
            <td>Records with k≥5 (safe — sufficient real matches)</td>
            <td class="num">{_fmt_num(total - k_lt5)}</td>
            <td class="num">{_fmt_pct((total - k_lt5) / total * 100 if total else 0)}</td>
            <td><span class="risk-badge badge-low">✓ LOW</span></td>
          </tr>
          <tr style="font-weight:700;background:#f7fafc;">
            <td>Total synthetic records evaluated</td>
            <td class="num">{_fmt_num(total)}</td>
            <td class="num">100.00%</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- RISK THRESHOLD LEGEND -->
  <div class="section">
    <div class="section-title">Risk Level Thresholds</div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Level</th><th>Score Range</th>
            <th>Meaning</th><th>Recommended Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="risk-badge badge-high">⚠ HIGH</span></td>
            <td class="num">≥ 20%</td>
            <td>Many synthetic records uniquely map to real individuals</td>
            <td>Do NOT release — apply generalisation or DP</td>
          </tr>
          <tr>
            <td><span class="risk-badge badge-med">△ MEDIUM</span></td>
            <td class="num">10%–19.99%</td>
            <td>Some records have limited real-data coverage</td>
            <td>Apply caution — restrict access or add anonymisation</td>
          </tr>
          <tr>
            <td><span class="risk-badge badge-low">✓ LOW</span></td>
            <td class="num">&lt; 10%</td>
            <td>Most records have sufficient real-data coverage</td>
            <td>Generally safe — review other risk dimensions first</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- METHODOLOGY -->
  <div class="section">
    <div class="section-title">Methodology</div>
    <div class="method-box">

      <h4>What is k-Anonymity?</h4>
      <p>
        For each record in the synthetic dataset, we compute
        <code>k(record)</code> — the number of records in the real
        dataset that share identical values across all selected
        quasi-identifier columns. A synthetic record with <code>k=1</code>
        means only one real individual shares that exact combination,
        making that synthetic record effectively a direct reference
        to a real person.
      </p>

      <h4>Uniqueness Score Formula</h4>
      <p>
        <code>
          Uniqueness Score =
          count(synthetic records where k=1) ÷ total synthetic records × 100
        </code><br/>
        Records with <code>k=1</code> are classified as <em>unique</em>.
        Records with <code>k&lt;5</code> are classified as <em>rare</em>.
      </p>

      <h4>Quasi-Identifiers Used</h4>
      <p>
        Quasi-identifiers were selected based on external observability —
        columns an attacker could plausibly know from public records,
        insurance claims, or hospital billing data:
        {", ".join(f"<code>{q}</code>" for q in qis)}.
      </p>

      <h4>Sensitive Attributes Protected</h4>
      <p>
        The following columns contain private health information
        being protected by this evaluation:
        {", ".join(f"<code>{s}</code>" for s in sas)}.
      </p>

      <h4>Dataset</h4>
      <p>
        Real dataset: Diabetes 130-US Hospitals for Years 1999–2008
        (UCI Machine Learning Repository, DOI: 10.24432/C5230J,
        101,766 inpatient records from 130 US hospitals).
        Synthetic dataset: V1_syn.csv (provided by project supervisor).
      </p>

      <h4>Implementation</h4>
      <p>
        Implemented in Python using <code>pandas</code>.
        The algorithm performs a <code>groupby</code> on the real dataset
        across QI columns to count group sizes, then merges those counts
        into the synthetic dataset using a left join, preserving all
        synthetic records including those with no real-data match (k=0).
      </p>

    </div>
  </div>

</div><!-- end .body -->

<!-- FOOTER -->
<div class="report-footer">
  <span>
    Privacy Risk Assessment System &nbsp;·&nbsp;
    Capstone Project &nbsp;·&nbsp;
    Western Sydney University
  </span>
  <span>Generated: {generated_at}</span>
</div>

</body>
</html>
"""

    # Write the HTML string to the output file
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf8") as f:
        f.write(html)
    print(f"HTML report saved -> {out_path}")

# CSV REPORT GENERATOR


def generate_csv(summary: dict, out_path: str) -> None:
    """
    Produce a structured CSV audit report from the summary.

    The CSV has 4 columns: SECTION, METRIC, VALUE, NOTES
    Organised into 5 sections: Run Info, Risk Scores,
    Record Counts, QI Group Stats, Recommendation.

    This is useful for:
    - Audit trail / compliance records
    - Loading into Excel for further analysis
    - Comparing results across different synthetic dataset versions
    """
    uniq_pct = summary.get("uniqueness_score_pct", 0)
    rare_pct  = summary.get("rare_combination_score_pct", 0)
    overall   = (uniq_pct + rare_pct) / 2
    gs        = summary.get("qid_group_stats", {})

    # Each inner list is one row: [SECTION, METRIC, VALUE, NOTES]
    rows = [
        # Header row
        ["SECTION", "METRIC", "VALUE", "NOTES"],

        # Section 1: Run metadata 
        ["Run Info", "Generated At",
         datetime.now().strftime("%Y-%m-%d %H:%M:%S"), ""],
        ["Run Info", "Dataset",
         "Diabetes 130-US Hospitals 1999-2008", "UCI ML Repository"],
        ["Run Info", "Synthetic File",
         "V1_syn.csv", "Provided by supervisor"],
        ["Run Info", "Evaluation Module",
         "M3 — Uniqueness & Rare-Combination", ""],
        ["Run Info", "Quasi-Identifiers",
         ", ".join(summary.get("qis_used", [])), ""],
        ["Run Info", "Sensitive Attributes",
         ", ".join(summary.get("sas_used", [])), ""],
        ["", "", "", ""],  # blank row as separator

        # Section 2: Risk scores 
        ["Risk Scores", "Overall Score (average)",
         f"{overall:.4f}%", _risk_level(overall)],
        ["Risk Scores", "Uniqueness Score",
         f"{uniq_pct:.4f}%", _risk_level(uniq_pct)],
        ["Risk Scores", "Rare Combination Score",
         f"{rare_pct:.4f}%", _risk_level(rare_pct)],
        ["Risk Scores", "Overall Risk Level",
         _risk_level(overall), "HIGH>=20%, MEDIUM>=10%, LOW<10%"],
        ["", "", "", ""],

        # Section 3: Record counts 
        ["Record Counts", "Total Synthetic Records",
         summary.get("total_synthetic_records", 0), ""],
        ["Record Counts", "k=0 (no real match)",
         summary.get("k_zero_count", 0), "Synthetic-only combinations"],
        ["Record Counts", "k=1 (unique)",
         summary.get("k_one_count", 0), "Maps to exactly one real person"],
        ["Record Counts", "k<5 (rare)",
         summary.get("k_lt_5_count", 0), "Very few real matches"],
        ["Record Counts", "k>=5 (safe)",
         summary.get("total_synthetic_records", 0)
         - summary.get("k_lt_5_count", 0),
         "Sufficient real coverage"],
        ["", "", "", ""],

        # Section 4: QI group stats 
        ["QI Group Stats", "Real Rows",
         gs.get("n_rows", ""), ""],
        ["QI Group Stats", "Unique QI Groups",
         gs.get("n_groups", ""), "Unique QI combinations"],
        ["QI Group Stats", "Min Group Size",
         gs.get("min_group_size", ""), ""],
        ["QI Group Stats", "Median Group Size",
         gs.get("median_group_size", ""), ""],
        ["QI Group Stats", "Max Group Size",
         gs.get("max_group_size", ""), ""],
        ["QI Group Stats", "Unique Real Rows (k=1)",
         gs.get("unique_rows", ""),
         f"{gs.get('unique_row_rate', 0) * 100:.2f}% of real data"],
        ["QI Group Stats", "Real Rows in k<5 Groups",
         gs.get("rows_in_groups_lt_5", ""),
         f"{gs.get('rows_in_groups_lt_5_rate', 0) * 100:.2f}% of real data"],
        ["", "", "", ""],

        # Section 5: Recommendation 
        ["Recommendation", "Risk Level",
         _risk_level(overall), ""],
        ["Recommendation", "Action",
         "Do NOT release"     if _risk_level(overall) == "HIGH"
         else "Apply caution" if _risk_level(overall) == "MEDIUM"
         else "Generally safe — review other risk dimensions", ""],
    ]

    # Write all rows to the CSV file
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    print(f"CSV report saved  -> {out_path}")

# PDF REPORT GENERATOR


def generate_pdf(
    summary: dict,
    out_path: str,
    linkage_data: dict | None = None,
) -> None:
    """
    Build a professional single-page PDF privacy risk report using reportlab.

    Parameters
    ----------
    summary      : dict loaded from syn_k_summary.json
    out_path     : absolute path where the .pdf file should be written
    linkage_data : dict loaded from linkage_summary.json (optional).
                   When provided, a Linkage Risk section is appended.
    """
    if not _REPORTLAB_AVAILABLE:
        raise RuntimeError(
            "reportlab is not installed. Add 'reportlab' to requirements.txt "
            "and run: pip install reportlab"
        )

    # ── Page geometry ─────────────────────────────────────────────────────────
    LEFT = RIGHT = TOP = BOTTOM = 2 * cm
    PAGE_W = A4[0] - LEFT - RIGHT          # usable width ≈ 17.0 cm

    # ── Extract values ────────────────────────────────────────────────────────
    uniq_pct = float(summary.get("uniqueness_score_pct", 0))
    rare_pct = float(summary.get("rare_combination_score_pct", 0))
    k_zero   = int(summary.get("k_zero_count", 0))
    k_one    = int(summary.get("k_one_count", 0))
    k_lt5    = int(summary.get("k_lt_5_count", 0))
    total    = int(summary.get("total_synthetic_records", 0))
    qis      = summary.get("qis_used", [])
    sas      = summary.get("sas_used", [])
    gs       = summary.get("qid_group_stats", {})

    overall_pct = (uniq_pct + rare_pct) / 2
    overall_lvl = _risk_level(overall_pct)
    generated_at = datetime.now().strftime("%d %B %Y, %H:%M")

    # ── Colour palette ────────────────────────────────────────────────────────
    C_NAVY   = HexColor("#1a365d")
    C_HIGH   = HexColor("#c53030")
    C_MED    = HexColor("#c05621")
    C_LOW    = HexColor("#276749")
    C_MUTED  = HexColor("#718096")
    C_BORDER = HexColor("#e2e8f0")
    C_BG     = HexColor("#f7fafc")
    C_EDF    = HexColor("#edf2f7")
    C_WHITE  = white

    def _clr(pct: float):
        return C_HIGH if pct >= 20 else C_MED if pct >= 10 else C_LOW

    def _bg(pct: float):
        return (HexColor("#fff5f5") if pct >= 20
                else HexColor("#fffaf0") if pct >= 10
                else HexColor("#f0fff4"))

    # ── Paragraph styles ──────────────────────────────────────────────────────
    def _ps(name, **kw):
        # Defaults that callers can override by passing the same key in kw
        defaults = dict(fontName="Helvetica", fontSize=10, leading=14,
                        textColor=HexColor("#1a202c"))
        defaults.update(kw)
        return ParagraphStyle(name, **defaults)

    s_hdr  = _ps("Hdr",  fontName="Helvetica-Bold", fontSize=16,
                 textColor=C_WHITE, leading=20)
    s_sub  = _ps("Sub",  fontSize=9, textColor=HexColor("#a0aec0"), leading=12)
    s_sec  = _ps("Sec",  fontName="Helvetica-Bold", fontSize=11,
                 textColor=C_NAVY, spaceBefore=14, spaceAfter=6)
    s_body = _ps("Body", spaceAfter=4)
    s_bold = _ps("Bold", fontName="Helvetica-Bold")
    s_th   = _ps("TH",   fontName="Helvetica-Bold", fontSize=9,
                 textColor=C_WHITE)
    s_td   = _ps("TD",   fontSize=9, leading=12)
    s_td_r = _ps("TDR",  fontSize=9, leading=12, alignment=TA_RIGHT)

    def _risk_style(name, pct):
        return _ps(name, fontName="Helvetica-Bold", fontSize=9,
                   textColor=_clr(pct))

    def _tbl_style(n_rows: int, last_bold: bool = False) -> TableStyle:
        """Navy header + alternating data rows + optional bold last row."""
        cmds = [
            ("BACKGROUND",   (0, 0), (-1, 0),  C_NAVY),
            ("GRID",         (0, 0), (-1, -1),  0.5, C_BORDER),
            ("VALIGN",       (0, 0), (-1, -1),  "MIDDLE"),
            ("LEFTPADDING",  (0, 0), (-1, -1),  10),
            ("RIGHTPADDING", (0, 0), (-1, -1),  10),
            ("TOPPADDING",   (0, 0), (-1, -1),  6),
            ("BOTTOMPADDING",(0, 0), (-1, -1),  6),
        ]
        for i in range(1, n_rows):
            cmds.append(("BACKGROUND", (0, i), (-1, i),
                         C_WHITE if i % 2 == 1 else C_BG))
        if last_bold and n_rows > 1:
            cmds.append(("BACKGROUND", (0, n_rows - 1), (-1, n_rows - 1), C_EDF))
        return TableStyle(cmds)

    # ── Story ─────────────────────────────────────────────────────────────────
    story: list = []

    dir_path = os.path.dirname(out_path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)

    doc = SimpleDocTemplate(
        out_path,
        pagesize=A4,
        leftMargin=LEFT, rightMargin=RIGHT,
        topMargin=TOP,   bottomMargin=BOTTOM,
        title="Privacy Risk Assessment Report",
        author="Privacy Risk Assessment System",
    )

    # 1 ── Header ──────────────────────────────────────────────────────────────
    hdr_tbl = Table(
        [
            [Paragraph("Privacy Risk Assessment Report", s_hdr)],
            [Paragraph(
                f"Generated: {generated_at}  ·  "
                "Capstone Project — Western Sydney University", s_sub)],
        ],
        colWidths=[PAGE_W],
    )
    hdr_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_NAVY),
        ("LEFTPADDING",   (0, 0), (-1, -1), 18),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 18),
        ("TOPPADDING",    (0, 0), (-1, 0),  14),
        ("BOTTOMPADDING", (0, 0), (-1, 0),  4),
        ("BOTTOMPADDING", (0, 1), (-1, 1),  14),
    ]))
    story.append(hdr_tbl)
    story.append(Spacer(1, 0.35 * cm))

    # 2 ── Overall verdict ─────────────────────────────────────────────────────
    story.append(Paragraph("Overall Privacy Risk Verdict", s_sec))

    v_color = _clr(overall_pct)
    v_bg    = _bg(overall_pct)
    verdict_tbl = Table(
        [[
            Paragraph(
                f"<b>{overall_lvl} RISK</b>",
                _ps("VT", fontName="Helvetica-Bold", fontSize=13,
                    textColor=v_color, leading=16)
            ),
            Paragraph(
                f"Overall Score: <b>{overall_pct:.2f}%</b><br/>"
                f"Uniqueness: {uniq_pct:.2f}% ({_risk_level(uniq_pct)})  |  "
                f"Rare Combination: {rare_pct:.2f}% ({_risk_level(rare_pct)})",
                _ps("VD", fontSize=10, leading=14,
                    textColor=HexColor("#1a202c"))
            ),
        ]],
        colWidths=[3.8 * cm, PAGE_W - 3.8 * cm],
    )
    verdict_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), v_bg),
        ("LINEABOVE",    (0, 0), (-1, 0),   2, v_color),
        ("LINEBELOW",    (0, -1),(-1, -1),  2, v_color),
        ("LINEBEFORE",   (0, 0), (0, -1),   2, v_color),
        ("LINEAFTER",    (-1, 0),(-1, -1),  2, v_color),
        ("VALIGN",       (0, 0), (-1, -1),  "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1),  14),
        ("RIGHTPADDING", (0, 0), (-1, -1),  14),
        ("TOPPADDING",   (0, 0), (-1, -1),  10),
        ("BOTTOMPADDING",(0, 0), (-1, -1),  10),
    ]))
    story.append(verdict_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # 3 ── Risk score breakdown ────────────────────────────────────────────────
    story.append(Paragraph("Risk Score Breakdown", s_sec))

    score_rows = [
        [Paragraph("Metric", s_th), Paragraph("Score", s_th),
         Paragraph("Level", s_th)],
        [Paragraph("Uniqueness Score", s_td),
         Paragraph(f"{uniq_pct:.2f}%", s_td_r),
         Paragraph(_risk_level(uniq_pct), _risk_style("SU", uniq_pct))],
        [Paragraph("Rare Combination Score", s_td),
         Paragraph(f"{rare_pct:.2f}%", s_td_r),
         Paragraph(_risk_level(rare_pct), _risk_style("SR", rare_pct))],
    ]
    if linkage_data:
        l_score = float(linkage_data.get("overall_linkage_score_pct", 0))
        l_level = linkage_data.get("risk_level", _risk_level(l_score))
        score_rows.append([
            Paragraph("Linkage / Re-identification Score", s_td),
            Paragraph(f"{l_score:.2f}%", s_td_r),
            Paragraph(l_level, _risk_style("SL", l_score)),
        ])
    score_rows.append([
        Paragraph("<b>Overall Risk Score</b>", s_bold),
        Paragraph(f"<b>{overall_pct:.2f}%</b>",
                  _ps("OP", fontName="Helvetica-Bold", fontSize=9,
                      alignment=TA_RIGHT)),
        Paragraph(f"<b>{overall_lvl}</b>",
                  _ps("OL", fontName="Helvetica-Bold", fontSize=9,
                      textColor=v_color)),
    ])

    score_tbl = Table(
        score_rows,
        colWidths=[PAGE_W * 0.56, PAGE_W * 0.24, PAGE_W * 0.20],
    )
    score_tbl.setStyle(_tbl_style(len(score_rows), last_bold=True))
    story.append(score_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # 4 ── Evaluation configuration ────────────────────────────────────────────
    story.append(Paragraph("Evaluation Configuration", s_sec))
    story.append(Paragraph(
        f"<b>Quasi-Identifiers:</b>  {', '.join(qis) if qis else '—'}",
        s_body))
    story.append(Paragraph(
        f"<b>Sensitive Attributes:</b>  {', '.join(sas) if sas else '—'}",
        s_body))
    story.append(Spacer(1, 0.15 * cm))

    # 5 ── QI group statistics ─────────────────────────────────────────────────
    story.append(Paragraph("QI Group Statistics (Real Dataset)", s_sec))

    u_rate = gs.get("unique_row_rate", 0)
    g_lt5_rate = gs.get("rows_in_groups_lt_5_rate", 0)
    gs_rows = [
        [Paragraph("Metric", s_th), Paragraph("Value", s_th)],
        [Paragraph("Real dataset rows", s_td),
         Paragraph(_fmt_num(gs.get("n_rows", "—")), s_td_r)],
        [Paragraph("Unique QI combinations (groups)", s_td),
         Paragraph(_fmt_num(gs.get("n_groups", "—")), s_td_r)],
        [Paragraph("Smallest group size", s_td),
         Paragraph(_fmt_num(gs.get("min_group_size", "—")), s_td_r)],
        [Paragraph("Median group size", s_td),
         Paragraph(str(gs.get("median_group_size", "—")), s_td_r)],
        [Paragraph("Largest group size", s_td),
         Paragraph(_fmt_num(gs.get("max_group_size", "—")), s_td_r)],
        [Paragraph("Unique real rows (k=1)", s_td),
         Paragraph(
             f"{_fmt_num(gs.get('unique_rows', '—'))} "
             f"({float(u_rate) * 100:.2f}%)", s_td_r)],
        [Paragraph("Real rows in groups with k<5", s_td),
         Paragraph(
             f"{_fmt_num(gs.get('rows_in_groups_lt_5', '—'))} "
             f"({float(g_lt5_rate) * 100:.2f}%)", s_td_r)],
    ]
    gs_tbl = Table(gs_rows, colWidths=[PAGE_W * 0.65, PAGE_W * 0.35])
    gs_tbl.setStyle(_tbl_style(len(gs_rows)))
    story.append(gs_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # 6 ── Synthetic record risk counts ────────────────────────────────────────
    story.append(Paragraph("Synthetic Record Risk Counts", s_sec))

    k_safe = total - k_lt5
    cnt_rows = [
        [Paragraph("Category", s_th), Paragraph("Count", s_th),
         Paragraph("% of Total", s_th), Paragraph("Risk", s_th)],
        [Paragraph("k=0  No match in real data", s_td),
         Paragraph(_fmt_num(k_zero), s_td_r),
         Paragraph(_fmt_pct(k_zero / total * 100 if total else 0), s_td_r),
         Paragraph("HIGH", _ps("CH", fontName="Helvetica-Bold",
                               fontSize=9, textColor=C_HIGH))],
        [Paragraph("k=1  Unique (maps to exactly 1 real person)", s_td),
         Paragraph(_fmt_num(k_one), s_td_r),
         Paragraph(_fmt_pct(uniq_pct), s_td_r),
         Paragraph(_risk_level(uniq_pct), _risk_style("CU", uniq_pct))],
        [Paragraph("k<5  Rare (fewer than 5 real matches)", s_td),
         Paragraph(_fmt_num(k_lt5), s_td_r),
         Paragraph(_fmt_pct(rare_pct), s_td_r),
         Paragraph(_risk_level(rare_pct), _risk_style("CR", rare_pct))],
        [Paragraph("k>=5  Safe (sufficient real coverage)", s_td),
         Paragraph(_fmt_num(k_safe), s_td_r),
         Paragraph(_fmt_pct(k_safe / total * 100 if total else 0), s_td_r),
         Paragraph("LOW", _ps("CL", fontName="Helvetica-Bold",
                              fontSize=9, textColor=C_LOW))],
        [Paragraph("<b>Total synthetic records evaluated</b>", s_bold),
         Paragraph(f"<b>{_fmt_num(total)}</b>",
                   _ps("CT", fontName="Helvetica-Bold", fontSize=9,
                       alignment=TA_RIGHT)),
         Paragraph("<b>100.00%</b>",
                   _ps("CT2", fontName="Helvetica-Bold", fontSize=9,
                       alignment=TA_RIGHT)),
         Paragraph("—", s_td)],
    ]
    cnt_tbl = Table(
        cnt_rows,
        colWidths=[PAGE_W * 0.44, PAGE_W * 0.15,
                   PAGE_W * 0.15, PAGE_W * 0.26],
    )
    cnt_tbl.setStyle(_tbl_style(len(cnt_rows), last_bold=True))
    story.append(cnt_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # 7 ── Linkage risk (optional) ─────────────────────────────────────────────
    if linkage_data:
        story.append(Paragraph("Linkage / Re-identification Risk", s_sec))
        l_total_r = int(linkage_data.get("total_synthetic_records", 0))
        l_score = float(linkage_data.get("overall_linkage_score_pct", 0))
        l_level = linkage_data.get("risk_level", _risk_level(l_score))
        l_sum   = linkage_data.get("risk_summary", "")
        if l_sum:
            story.append(Paragraph(l_sum, s_body))

        exact   = linkage_data.get("exact_match", {})
        hamming = linkage_data.get("hamming_nearest_neighbour", {})
        lnk_rows = [
            [Paragraph("Method", s_th), Paragraph("Score", s_th),
             Paragraph("Risk", s_th)],
        ]
        if exact:
            e_s = float(exact.get("exact_match_score_pct", 0))
            lnk_rows.append([
                Paragraph("Exact Match Linkage", s_td),
                Paragraph(f"{e_s:.2f}%", s_td_r),
                Paragraph(_risk_level(e_s), _risk_style("LE", e_s)),
            ])
        if hamming:
            h_s = float(hamming.get("hamming_score_pct", 0))
            lnk_rows.append([
                Paragraph("Hamming Nearest-Neighbour Linkage", s_td),
                Paragraph(f"{h_s:.2f}%", s_td_r),
                Paragraph(_risk_level(h_s), _risk_style("LH", h_s)),
            ])
        lnk_rows.append([
            Paragraph("<b>Overall Linkage Score</b>", s_bold),
            Paragraph(f"<b>{l_score:.2f}%</b>",
                      _ps("LO", fontName="Helvetica-Bold", fontSize=9,
                          alignment=TA_RIGHT)),
            Paragraph(f"<b>{l_level}</b>",
                      _ps("LL", fontName="Helvetica-Bold", fontSize=9,
                          textColor=_clr(l_score))),
        ])
        lnk_tbl = Table(
            lnk_rows,
            colWidths=[PAGE_W * 0.56, PAGE_W * 0.24, PAGE_W * 0.20],
        )
        lnk_tbl.setStyle(_tbl_style(len(lnk_rows), last_bold=True))
        story.append(lnk_tbl)
        story.append(Spacer(1, 0.3 * cm))

    # 8 ── Risk level thresholds ───────────────────────────────────────────────
    story.append(Paragraph("Risk Level Thresholds", s_sec))
    thr_rows = [
        [Paragraph("Level", s_th), Paragraph("Range", s_th),
         Paragraph("Meaning", s_th), Paragraph("Recommended Action", s_th)],
        [Paragraph("HIGH",   _ps("TH", fontName="Helvetica-Bold",
                                 fontSize=9, textColor=C_HIGH)),
         Paragraph(">= 20%", s_td_r),
         Paragraph("Many synthetic records uniquely map to real individuals",
                   s_td),
         Paragraph("Do NOT release — apply generalisation or DP", s_td)],
        [Paragraph("MEDIUM", _ps("TM", fontName="Helvetica-Bold",
                                 fontSize=9, textColor=C_MED)),
         Paragraph("10–19.99%", s_td_r),
         Paragraph("Some records have limited real-data coverage", s_td),
         Paragraph("Apply caution — restrict access or anonymise", s_td)],
        [Paragraph("LOW",    _ps("TL", fontName="Helvetica-Bold",
                                 fontSize=9, textColor=C_LOW)),
         Paragraph("< 10%", s_td_r),
         Paragraph("Most records have sufficient real-data coverage", s_td),
         Paragraph("Generally safe — review other risk dimensions", s_td)],
    ]
    thr_tbl = Table(
        thr_rows,
        colWidths=[PAGE_W * 0.10, PAGE_W * 0.12,
                   PAGE_W * 0.38, PAGE_W * 0.40],
    )
    thr_tbl.setStyle(_tbl_style(len(thr_rows)))
    story.append(thr_tbl)
    story.append(Spacer(1, 0.5 * cm))

    # 9 ── Footer ─────────────────────────────────────────────────────────────
    ftr_tbl = Table(
        [[Paragraph(
            "Privacy Risk Assessment System  ·  Capstone Project  ·  "
            "Western Sydney University",
            _ps("Ftr", fontSize=8, textColor=C_WHITE)
        )]],
        colWidths=[PAGE_W],
    )
    ftr_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_NAVY),
        ("LEFTPADDING",   (0, 0), (-1, -1), 18),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(ftr_tbl)

    doc.build(story)
    print(f"PDF report saved -> {out_path}")


# MAIN ENTRY POINT


def generate_all() -> None:
    """
    Load M3 results and generate both reports.
    Called when you run: python -m backend.app.report.generate_report
    Also called by the FastAPI endpoint /api/generate-report
    """
    print("Loading results from M3…")
    summary = load_summary()

    # Print the two scores so you can see them in the terminal
    print(f"  Uniqueness:       {summary.get('uniqueness_score_pct', 0):.2f}%")
    print(f"  Rare Combination: {summary.get('rare_combination_score_pct', 0):.2f}%")
    print()

    generate_html(summary, HTML_OUT)
    generate_csv(summary, CSV_OUT)

    print()
    print("Done! Both reports saved to results/ folder:")
    print(f"  HTML -> {HTML_OUT}")
    print(f"  CSV  -> {CSV_OUT}")
    print()
    print("View HTML report in browser:")
    print("  http://localhost:8000/api/report/html")  
    print("  OR just double-click results/privacy_risk_report.html")


# This block only runs when you call the file directly.
# It does NOT run when main.py imports generate_all from this file.
if __name__ == "__main__":
    generate_all()