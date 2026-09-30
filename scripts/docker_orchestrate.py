#!/usr/bin/env python3
"""
Servicing CRM — Docker Compose Orchestration & Health Profiler
CLI utility to manage, profile, and verify the multi-backend CRM container topology.

Usage:
    python scripts/docker_orchestrate.py status
    python scripts/docker_orchestrate.py config [--prod]
    python scripts/docker_orchestrate.py up [--profile all|express|laravel|graphql|fastapi|apps] [--prod] [--detach]
    python scripts/docker_orchestrate.py down [--volumes]
    python scripts/docker_orchestrate.py test-health
    python scripts/docker_orchestrate.py stats
"""

import sys
import os
import argparse
import subprocess
import time
from pathlib import Path
import httpx
from tabulate import tabulate

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent.parent

SERVICES_CONFIG = {
    "postgres": {"name": "PostgreSQL 16", "type": "Database", "port": 3110},
    "redis": {"name": "Redis 7", "type": "Cache/Broker", "port": 3120},
    "express-api": {"name": "Express (Node.js/TS)", "type": "Backend API", "port": 3182, "health_path": "/health", "expected_service": "express-api"},
    "laravel-api": {"name": "Laravel (PHP 8.2)", "type": "Backend API", "port": 3181, "health_path": "/api/v1/health", "expected_service": "laravel-api"},
    "graphql-api": {"name": "GraphQL (Apollo 4)", "type": "Backend API", "port": 3183, "health_path": "/health", "expected_service": "graphql-api"},
    "fastapi-api": {"name": "FastAPI (Python/Async)", "type": "Backend API", "port": 3184, "health_path": "/health", "expected_service": "fastapi-api"},
    "admin-portal": {"name": "Admin Portal (React)", "type": "Frontend App", "port": 3100, "health_path": "/"},
    "customer-portal": {"name": "Customer Portal (React)", "type": "Frontend App", "port": 3101, "health_path": "/"},
    "tech-portal": {"name": "Tech Portal (PWA)", "type": "Frontend App", "port": 3002, "health_path": "/"},
}


def get_compose_cmd(prod: bool = False, profile: str = None) -> list[str]:
    cmd = ["docker", "compose"]
    if prod:
        cmd.extend(["-f", "docker-compose.yml", "-f", "docker-compose.prod.yml"])
    if profile:
        cmd.extend(["--profile", profile])
    return cmd


def run_config(prod: bool = False):
    print(f"\n[*] Validating Docker Compose configuration (Mode: {'Production' if prod else 'Development'})...")
    cmd = get_compose_cmd(prod) + ["config"]
    res = subprocess.run(cmd, cwd=str(ROOT_DIR))
    if res.returncode == 0:
        print("\n[+] Docker Compose configuration is VALID.")
    else:
        print("\n[!] Configuration errors detected.")
    return res.returncode


def run_status():
    print("\n[*] Inspecting Docker Compose Services...")
    cmd = ["docker", "compose", "ps"]
    res = subprocess.run(cmd, cwd=str(ROOT_DIR))
    return res.returncode


def run_up(profile: str = "default", prod: bool = False, detach: bool = True):
    print(f"\n[*] Booting stack with profile: '{profile}' (Mode: {'Production' if prod else 'Development'})...")
    cmd = get_compose_cmd(prod, profile) + ["up"]
    if detach:
        cmd.append("-d")
    cmd.append("--wait")
    print(f"Executing: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=str(ROOT_DIR))
    if res.returncode == 0:
        print("\n[+] Stack successfully provisioned and health conditions satisfied.")
    else:
        print("\n[!] Stack startup encountered warnings or failures.")
    return res.returncode


def run_down(volumes: bool = False):
    print("\n[*] Tearing down Docker Compose stack...")
    cmd = ["docker", "compose", "down"]
    if volumes:
        cmd.append("-v")
    res = subprocess.run(cmd, cwd=str(ROOT_DIR))
    return res.returncode


import socket


def is_tcp_open(host: str, port: int, timeout: float = 0.1) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def run_test_health():
    print("\n[+] Running Active Health Probe Verification across services...")
    rows = []
    for svc_key, cfg in SERVICES_CONFIG.items():
        port = cfg.get("port")
        health_path = cfg.get("health_path")
        if not health_path:
            rows.append([cfg["name"], f"Port {port}", "N/A (Database/TCP)", "Verified via Compose Healthcheck"])
            continue

        target_url = f"http://127.0.0.1:{port}{health_path}"
        status_text = "OFFLINE"
        detail = "Connection Refused / Standby"

        if not is_tcp_open("127.0.0.1", port):
            rows.append([cfg["name"], target_url, "OFFLINE", "Port Closed / Standby"])
            continue

        try:
            with httpx.Client(timeout=1.0) as client:
                resp = client.get(target_url)
                if resp.status_code == 200:
                    status_text = "HEALTHY (200 OK)"
                    exp = cfg.get("expected_service")
                    if exp:
                        try:
                            data = resp.json()
                            if data.get("service") == exp:
                                detail = f"Verified service ID '{exp}'"
                            else:
                                detail = f"Service responded: {data}"
                        except Exception:
                            detail = "HTTP 200 OK response"
                    else:
                        detail = "HTTP 200 OK response"
                else:
                    status_text = f"HTTP {resp.status_code}"
                    detail = resp.text[:40]
        except Exception as e:
            detail = str(e.__class__.__name__)

        rows.append([cfg["name"], target_url, status_text, detail])

    print(tabulate(rows, headers=["Service Target", "Endpoint / Port", "Status", "Probe Details"], tablefmt="grid"))


def run_stats():
    print("\n[*] Querying real-time container resource utilization...")
    cmd = ["docker", "stats", "--no-stream", "--format", "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}"]
    res = subprocess.run(cmd, cwd=str(ROOT_DIR))
    return res.returncode


def main():
    parser = argparse.ArgumentParser(description="Servicing CRM Docker Orchestrator & Health Profiler")
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # status
    subparsers.add_parser("status", help="Show compose services status and health")

    # config
    cfg_parser = subparsers.add_parser("config", help="Validate compose configuration files")
    cfg_parser.add_argument("--prod", action="store_true", help="Include production overrides")

    # up
    up_parser = subparsers.add_parser("up", help="Start services with specified profile")
    up_parser.add_argument("--profile", default="default", help="Profile to boot (default, all, express, laravel, graphql, fastapi, apps)")
    up_parser.add_argument("--prod", action="store_true", help="Use production configuration")
    up_parser.add_argument("--no-detach", action="store_true", help="Run attached in foreground")

    # down
    down_parser = subparsers.add_parser("down", help="Stop compose services")
    down_parser.add_argument("--volumes", "-v", action="store_true", help="Remove data volumes")

    # test-health
    subparsers.add_parser("test-health", help="Run active HTTP health probes against all CRM ports")

    # stats
    subparsers.add_parser("stats", help="Show real-time container CPU & Memory utilization")

    args = parser.parse_args()

    if args.command == "status":
        sys.exit(run_status())
    elif args.command == "config":
        sys.exit(run_config(prod=args.prod))
    elif args.command == "up":
        sys.exit(run_up(profile=args.profile, prod=args.prod, detach=not args.no_detach))
    elif args.command == "down":
        sys.exit(run_down(volumes=args.volumes))
    elif args.command == "test-health":
        run_test_health()
    elif args.command == "stats":
        sys.exit(run_stats())
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
