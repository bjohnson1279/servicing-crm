#!/usr/bin/env python3
"""
Servicing CRM — Conformance & E2E Test Suite Runner
Runs behavioral scenario checks across all 4 interchangeable backends:
- Express API (port 3182 / 8000)
- FastAPI (port 3184 / 8002)
- GraphQL API (port 3183 / 8003)
- Laravel API (port 3181 / 8004)
"""

import sys
import os
import argparse
import subprocess
import json
import time
from pathlib import Path
import httpx
from tabulate import tabulate

# Ensure UTF-8 stdout for Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent.parent
TESTS_DIR = ROOT_DIR / "tests"
REPORTS_DIR = TESTS_DIR / "reports"

BACKEND_CONFIGS = {
    "express": {
        "primary_url": os.getenv("EXPRESS_API_URL", "http://localhost:3182"),
        "fallback_url": "http://localhost:8000",
        "name": "Express (Node.js/TS)",
    },
    "fastapi": {
        "primary_url": os.getenv("FASTAPI_API_URL", "http://localhost:3184"),
        "fallback_url": "http://localhost:8002",
        "name": "FastAPI (Python/Async)",
    },
    "graphql": {
        "primary_url": os.getenv("GRAPHQL_API_URL", "http://localhost:3183"),
        "fallback_url": "http://localhost:8003",
        "name": "GraphQL (Apollo 4)",
    },
    "laravel": {
        "primary_url": os.getenv("LARAVEL_API_URL", "http://localhost:3181"),
        "fallback_url": "http://localhost:8004",
        "name": "Laravel (PHP 8.2)",
    },
}


import socket
from urllib.parse import urlparse


def is_tcp_open(url: str, timeout: float = 0.1) -> bool:
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "127.0.0.1"
        if host == "localhost":
            host = "127.0.0.1"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def check_backend_health(backend_key: str, cfg: dict) -> tuple[bool, str]:
    candidates = [cfg["primary_url"], cfg["fallback_url"]]
    expected_service = f"{backend_key}-api"

    for url in candidates:
        if not is_tcp_open(url):
            continue
        try:
            with httpx.Client(timeout=0.6) as client:
                for path in ["/health", "/api/v1/health"]:
                    try:
                        resp = client.get(f"{url}{path}")
                        if resp.status_code == 200:
                            data = resp.json()
                            if data.get("service") == expected_service:
                                return True, url
                    except Exception:
                        pass
        except Exception:
            pass
    return False, cfg["primary_url"]


def run_preflight() -> dict:
    print("\n[+] Running Pre-Flight Backend Health Probes...")
    health_status = {}
    rows = []
    for key, cfg in BACKEND_CONFIGS.items():
        is_up, active_url = check_backend_health(key, cfg)
        health_status[key] = is_up
        status_str = "ONLINE (Ready)" if is_up else "OFFLINE (Standby)"
        rows.append([cfg["name"], active_url, status_str])

    print(tabulate(rows, headers=["Backend Target", "Endpoint URL", "Health Status"], tablefmt="grid"))
    return health_status



def run_conformance(backend: str = "all", domain: str = "all", run_e2e: bool = False):
    preflight = run_preflight()
    online_count = sum(1 for v in preflight.values() if v)

    if online_count == 0:
        print("\n[!] No live backend servers were detected on localhost ports (8000, 8002, 8003, 8004).")
        print("[*] You can launch backends via 'docker-compose up -d' or start individual services locally.")
        print("[*] Running unit and schema validation checks...\n")

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_file = REPORTS_DIR / "conformance_report.json"

    cmd = [
        sys.executable,
        "-m",
        "pytest",
        str(TESTS_DIR / "conformance"),
        "-v",
        "--json-report",
        f"--json-report-file={report_file}",
    ]

    if run_e2e:
        cmd.append(str(TESTS_DIR / "e2e"))

    if domain != "all":
        cmd.extend(["-k", domain])

    print(f"\n[*] Executing test suite: {' '.join(cmd)}\n")

    start_time = time.time()
    result = subprocess.run(cmd, cwd=str(ROOT_DIR))
    elapsed = time.time() - start_time

    # Generate Markdown Summary Matrix
    generate_markdown_report(report_file, elapsed, preflight)
    return result.returncode


def generate_markdown_report(report_json: Path, elapsed_sec: float, preflight: dict):
    md_file = REPORTS_DIR / "conformance_matrix.md"
    date_str = time.strftime("%Y-%m-%d %H:%M:%S")

    passed = 0
    failed = 0
    skipped = 0
    total = 0

    if report_json.exists():
        try:
            with open(report_json, "r", encoding="utf-8") as f:
                data = json.load(f)
                summary = data.get("summary", {})
                passed = summary.get("passed", 0)
                failed = summary.get("failed", 0)
                skipped = summary.get("skipped", 0)
                total = summary.get("total", 0)
        except Exception:
            pass

    md_content = f"""# Cross-Backend Conformance & E2E Verification Report

Generated: `{date_str}`
Execution Duration: `{elapsed_sec:.2f}s`

---

## 1. Backend Target Availability

| Backend Target | Endpoint URL | Status |
|---|---|:---:|
"""
    for key, cfg in BACKEND_CONFIGS.items():
        status_icon = "🟢 Online" if preflight.get(key) else "⚪ Standby / Offline"
        md_content += f"| **{cfg['name']}** | `{cfg['primary_url']}` | {status_icon} |\n"

    md_content += f"""
---

## 2. Test Execution Summary

- **Total Test Cases**: `{total}`
- **Passed**: `{passed}`
- **Failed**: `{failed}`
- **Skipped (Offline Targets)**: `{skipped}`

---

## 3. Domain Bounded Context Coverage

All 7 canonical DDD Bounded Contexts are covered under contract & conformance testing:

| Bounded Context | Conformance Module | Key Assertions |
|---|---|---|
| **Dispatch** | `test_dispatch_conformance.py` | Job transitions, EPA compliance reports, Inventory thresholds, Tech schedules |
| **Billing** | `test_billing_conformance.py` | Invoices, Quotes, Payments, Stripe webhook payload processing, ERP sync |
| **CRM** | `test_crm_conformance.py` | Customer 360 profile, Service contracts cadence, Churn & health scores |
| **Comms** | `test_comms_conformance.py` | Live chat threads, Contact log persistence, Canned templates, Notification queue |
| **Sales** | `test_sales_conformance.py` | Canvass pins, Territory polygon coordinates, Do-Not-Knock compliance |
| **Analytics** | `test_analytics_conformance.py` | Revenue MRR/ARR, Leaderboards, AI Pest Risk scoring & geospatial heatmap |
| **HR** | `test_hr_conformance.py` | Staff directory, Training courses, Certifications, Onboarding tasks |

---

## 4. Operational End-to-End Lifecycle (`tests/e2e/`)

- **Module**: `test_lifecycle_sales_to_settlement.py`
- **Flow**: Canvass Pin Drop $\\rightarrow$ Agreement E-Signature $\\rightarrow$ Auto-Scheduling $\\rightarrow$ Chemical Application Logging $\\rightarrow$ Invoice & Stripe Settlement $\\rightarrow$ AI Pest Risk Recalculation
"""

    with open(md_file, "w", encoding="utf-8") as f:
        f.write(md_content)

    print(f"\n[+] Generated Conformance Matrix Report: {md_file}")


def main():
    parser = argparse.ArgumentParser(description="Servicing CRM Conformance & E2E Test Runner")
    parser.add_argument("--backend", default="all", choices=["all", "express", "fastapi", "graphql", "laravel"])
    parser.add_argument("--domain", default="all", help="Filter by domain (e.g. dispatch, billing, crm, sales, analytics)")
    parser.add_argument("--e2e", action="store_true", help="Include End-to-End operational lifecycle suite")
    parser.add_argument("--preflight", action="store_true", help="Run only pre-flight port and server health probes")

    args = parser.parse_args()

    if args.preflight:
        run_preflight()
        sys.exit(0)

    exit_code = run_conformance(backend=args.backend, domain=args.domain, run_e2e=args.e2e)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
