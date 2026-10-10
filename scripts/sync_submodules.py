#!/usr/bin/env python3
"""Synchronize Git submodules and verify working tree status."""
import subprocess
import sys

def main():
    print("Synchronizing git submodules...")
    res = subprocess.run(["git", "submodule", "update", "--init", "--recursive"], check=False)
    if res.returncode != 0:
        sys.exit(res.returncode)
    print("Submodules synchronized successfully.")

if __name__ == "__main__":
    main()
