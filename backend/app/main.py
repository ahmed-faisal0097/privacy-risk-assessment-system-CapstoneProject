from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os
import json
from typing import Dict, Any

from app.routes.upload import router as upload_router
from app.database import engine
from app.models import Base

try:
    from fastapi.staticfiles import StaticFiles
except Exception:
    StaticFiles = None

try:
    from app.uniqueness import uniqueness_and_rare_combination
except Exception:
    uniqueness_and_rare_combination = None

try:
    from app.generate_report import generate_html, generate_csv
except Exception:
    generate_html = None
    generate_csv = None


app = FastAPI(title="Privacy Risk Assessment API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://privacy-risk-frontend:3000",
        "http://172.18.0.4:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
app.include_router(upload_router, prefix="/api")

# ── Path resolution ────────────────────────────────────────────────────────────
#
# Docker layout (from docker-compose.yml):
#   WORKDIR  /app              (Dockerfile sets this)
#   volume   ./backend -> /app (docker-compose mounts the backend folder as /app)
#
# So uvicorn runs from /app, and os.getcwd() == "/app".
# risk_evaluation.py creates result folders with:
#   os.makedirs("results/r1_uniq_<uuid>_<uuid>")
# which resolves to /app/results/r1_uniq_<uuid>_<uuid>/
#
# Therefore all paths here must be relative to /app (i.e. os.getcwd()).

WORKING_DIR = os.getcwd()  # /app inside Docker, project root locally

results_dir = os.path.join(WORKING_DIR, "results")
webapp_dir  = os.path.join(WORKING_DIR, "..", "frontend", "webpage")

if StaticFiles is not None:
    if os.path.isdir(results_dir):
        app.mount("/results", StaticFiles(directory=results_dir), name="results")
    if os.path.isdir(webapp_dir):
        app.mount("/webapp", StaticFiles(directory=webapp_dir, html=True), name="webapp")


@app.get("/")
def root() -> Dict[str, str]:
    return {"message": "Privacy Risk Assessment API is running"}


@app.get("/api/list-results")
def list_results() -> Dict[str, Any]:
    if not os.path.isdir(results_dir):
        return {"files": []}
    files = [
        f for f in sorted(os.listdir(results_dir))
        if f.lower().endswith(".csv")
    ]
    return {"files": files}


@app.get("/api/run-uniqueness")
def run_uniqueness() -> Dict[str, Any]:
    if uniqueness_and_rare_combination is None:
        return {"success": False, "message": "uniqueness_and_rare_combination not available"}
    result = uniqueness_and_rare_combination()
    return {
        "success": True,
        "uniqueness_score_pct": result.get("uniqueness_score_pct"),
        "rare_combination_score_pct": result.get("rare_combination_score_pct"),
        "result": result,
    }


@app.get("/api/report/html")
def download_report_html(result_dir: str = None):
    """
    Generate and return the HTML audit report as a file download.

    result_dir: relative path from the upload response, e.g.
                "results/r1_uniq_<uuid>_<uuid>"
                This is relative to WORKING_DIR (/app in Docker).
    """
    if generate_html is None:
        raise HTTPException(
            status_code=500,
            detail="Report generator not available — check generate_report.py exists."
        )

    # Resolve the result directory
    if result_dir:
        # result_dir comes from the frontend as-is from the upload response.
        # risk_evaluation.py created it with os.makedirs(result_dir) from /app,
        # so joining with WORKING_DIR gives the correct absolute path.
        abs_result_dir = os.path.join(WORKING_DIR, result_dir)
    else:
        abs_result_dir = results_dir

    summary_path = os.path.join(abs_result_dir, "syn_k_summary.json")

    # Log for debugging — visible in docker compose logs
    print(f"[report/html] WORKING_DIR={WORKING_DIR}")
    print(f"[report/html] result_dir param={result_dir}")
    print(f"[report/html] abs_result_dir={abs_result_dir}")
    print(f"[report/html] summary_path={summary_path}")
    print(f"[report/html] exists={os.path.exists(summary_path)}")

    if not os.path.exists(summary_path):
        # Show what actually exists to help debug
        existing = []
        if os.path.isdir(results_dir):
            existing = os.listdir(results_dir)
        raise HTTPException(
            status_code=404,
            detail=(
                f"syn_k_summary.json not found at: {summary_path}. "
                f"Contents of {results_dir}: {existing}"
            )
        )

    with open(summary_path, encoding="utf-8") as f:
        summary = json.load(f)

    html_out = os.path.join(abs_result_dir, "privacy_risk_report.html")

    try:
        generate_html(summary, html_out)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate HTML report: {str(e)}"
        )

    return FileResponse(
        path=html_out,
        media_type="text/html",
        filename="privacy_risk_report.html",
    )


@app.get("/api/report/csv")
def download_report_csv(result_dir: str = None):
    """
    Generate and return the CSV audit trail as a file download.
    Same path logic as /api/report/html.
    """
    if generate_csv is None:
        raise HTTPException(status_code=500, detail="Report generator not available.")

    if result_dir:
        abs_result_dir = os.path.join(WORKING_DIR, result_dir)
    else:
        abs_result_dir = results_dir

    summary_path = os.path.join(abs_result_dir, "syn_k_summary.json")

    if not os.path.exists(summary_path):
        raise HTTPException(
            status_code=404,
            detail=f"syn_k_summary.json not found at: {summary_path}"
        )

    with open(summary_path, encoding="utf-8") as f:
        summary = json.load(f)

    csv_out = os.path.join(abs_result_dir, "privacy_risk_report_summary.csv")

    try:
        generate_csv(summary, csv_out)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate CSV report: {str(e)}"
        )

    return FileResponse(
        path=csv_out,
        media_type="text/csv",
        filename="privacy_risk_report_summary.csv",
    )


if __name__ == "__main__":
    if uniqueness_and_rare_combination is None:
        print("uniqueness_and_rare_combination not available")
    else:
        s = uniqueness_and_rare_combination()
        print("uniqueness_score_pct:", s["uniqueness_score_pct"])
        print("rare_combination_score_pct:", s["rare_combination_score_pct"])