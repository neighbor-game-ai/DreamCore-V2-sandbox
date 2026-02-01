#!/usr/bin/env python3
"""
Run all PoC gate tests and generate a summary report.

Usage:
    python tests/run_all.py

Environment variables required:
    MODAL_ENDPOINT: Base URL for Modal web endpoints
    MODAL_INTERNAL_SECRET: Shared secret for X-Modal-Secret header

Optional:
    ALLOW_NON_GVISOR: Set to "1" to pass gVisor test even if not detected
"""

import os
import sys
import json
import time
import asyncio
import httpx

from helpers import (
    get_modal_endpoint,
    get_internal_secret,
    build_endpoint_url,
    get_auth_headers,
)


def check_env() -> bool:
    """Check required environment variables."""
    endpoint = get_modal_endpoint()
    secret = get_internal_secret()

    if not endpoint:
        print("ERROR: MODAL_ENDPOINT environment variable not set")
        return False

    if not secret:
        print("ERROR: MODAL_INTERNAL_SECRET environment variable not set")
        return False

    return True


def get_url(endpoint_name: str) -> str:
    """Get full URL for endpoint."""
    return build_endpoint_url(get_modal_endpoint(), endpoint_name)


def get_headers() -> dict:
    """Get auth headers."""
    return get_auth_headers()


def is_gvisor_required() -> bool:
    """Check if gVisor is required (ALLOW_NON_GVISOR not set)."""
    return os.environ.get("ALLOW_NON_GVISOR", "").lower() not in ("1", "true")


def test_health() -> bool:
    """Test health endpoint (no auth required)."""
    print("\n" + "=" * 60)
    print("Health Check")
    print("=" * 60)

    url = get_url("health")

    try:
        with httpx.Client(timeout=30) as client:
            response = client.get(url)

        if response.status_code == 200:
            data = response.json()
            print(f"[PASS] Status: {data.get('status')}")
            print(f"       Version: {data.get('version')}")
            return True
        else:
            print(f"[FAIL] Status code: {response.status_code}")
            return False

    except Exception as e:
        print(f"[FAIL] {e}")
        return False


def test_gate_1() -> bool:
    """PoC Gate #1: Sandbox I/O."""
    print("\n" + "=" * 60)
    print("PoC Gate #1: Sandbox I/O (stdin→stdout)")
    print("=" * 60)

    url = get_url("test_sandbox_io")

    try:
        with httpx.Client(timeout=120) as client:
            response = client.post(url, headers=get_headers(), json={})

        if response.status_code != 200:
            print(f"[FAIL] Status code: {response.status_code}")
            return False

        data = response.json()

        if data.get("match"):
            print(f"[PASS] Input: {data.get('input')} → Output: {data.get('output')}")
            return True
        else:
            print(f"[FAIL] Mismatch: {data}")
            return False

    except Exception as e:
        print(f"[FAIL] {e}")
        return False


def test_gate_2() -> bool:
    """PoC Gate #2: Sandbox Isolation Check."""
    print("\n" + "=" * 60)
    print("PoC Gate #2: Sandbox Isolation")
    print("=" * 60)

    url = get_url("test_gvisor")
    gvisor_required = is_gvisor_required()

    try:
        with httpx.Client(timeout=120) as client:
            response = client.post(url, headers=get_headers(), json={})

        if response.status_code != 200:
            print(f"[FAIL] Status code: {response.status_code}")
            return False

        data = response.json()

        print(f"[INFO] /proc/version: {data.get('proc_version', '')[:80]}...")

        if data.get("is_gvisor"):
            print("[PASS] gVisor detected")
            return True
        else:
            if gvisor_required:
                print("[FAIL] gVisor not detected (ALLOW_NON_GVISOR not set)")
                return False
            else:
                print("[PASS] Modal Sandbox isolation (ALLOW_NON_GVISOR=1)")
                return True

    except Exception as e:
        print(f"[FAIL] {e}")
        return False


async def test_gate_3() -> bool:
    """PoC Gate #3: Streaming."""
    print("\n" + "=" * 60)
    print("PoC Gate #3: SSE Streaming")
    print("=" * 60)

    url = get_url("test_stream")

    try:
        chunks = []
        timestamps = []

        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST", url, headers=get_headers(), json={}
            ) as response:
                if response.status_code != 200:
                    print(f"[FAIL] Status code: {response.status_code}")
                    return False

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        timestamps.append(time.time())
                        data = json.loads(line[6:])
                        chunks.append(data)
                        print(f"       Received: {data}")
                        if data.get("type") == "done":
                            break

        if len(chunks) >= 5:
            intervals = [
                timestamps[i + 1] - timestamps[i]
                for i in range(len(timestamps) - 1)
            ]
            avg = sum(intervals) / len(intervals) if intervals else 0

            print(f"[PASS] Received {len(chunks)} chunks")
            print(f"       Average interval: {avg:.2f}s")
            return True
        else:
            print(f"[FAIL] Only received {len(chunks)} chunks")
            return False

    except Exception as e:
        print(f"[FAIL] {e}")
        return False


def test_gate_4() -> bool:
    """PoC Gate #4: Volume Persistence."""
    print("\n" + "=" * 60)
    print("PoC Gate #4: Volume Persistence")
    print("=" * 60)

    url = get_url("test_volume")

    try:
        with httpx.Client(timeout=120) as client:
            response = client.post(url, headers=get_headers(), json={})

        if response.status_code != 200:
            print(f"[FAIL] Status code: {response.status_code}")
            return False

        data = response.json()

        if data.get("match"):
            print(f"[PASS] Written: {data.get('written')}")
            print(f"       Read:    {data.get('read')}")
            return True
        else:
            print(f"[FAIL] Mismatch: {data}")
            return False

    except Exception as e:
        print(f"[FAIL] {e}")
        return False


def test_gate_5() -> bool:
    """PoC Gate #5: Authentication."""
    print("\n" + "=" * 60)
    print("PoC Gate #5: X-Modal-Secret Authentication")
    print("=" * 60)

    url = get_url("test_auth")

    try:
        with httpx.Client(timeout=30) as client:
            # Test without header
            r1 = client.post(url, json={})
            if r1.status_code != 401:
                print(f"[FAIL] No header should return 401, got {r1.status_code}")
                return False
            print("[PASS] No header → 401")

            # Test with wrong secret
            r2 = client.post(
                url, headers={"X-Modal-Secret": "wrong"}, json={}
            )
            if r2.status_code != 401:
                print(f"[FAIL] Wrong secret should return 401, got {r2.status_code}")
                return False
            print("[PASS] Wrong secret → 401")

            # Test with correct secret
            r3 = client.post(url, headers=get_headers(), json={})
            if r3.status_code != 200:
                print(f"[FAIL] Correct secret should return 200, got {r3.status_code}")
                return False
            print("[PASS] Correct secret → 200")

            return True

    except Exception as e:
        print(f"[FAIL] {e}")
        return False


def main():
    """Run all tests and print summary."""
    print("=" * 60)
    print("DreamCore Modal PoC Test Suite")
    print("=" * 60)

    if not check_env():
        sys.exit(1)

    print(f"\nEndpoint: {get_modal_endpoint()}")

    if not is_gvisor_required():
        print("Note: ALLOW_NON_GVISOR=1 (gVisor check relaxed)")

    results = {}

    # Run tests
    results["health"] = test_health()
    results["gate_1"] = test_gate_1()
    results["gate_2"] = test_gate_2()
    results["gate_3"] = asyncio.run(test_gate_3())
    results["gate_4"] = test_gate_4()
    results["gate_5"] = test_gate_5()

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    all_passed = True
    for name, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"  {name}: {status}")
        if not passed:
            all_passed = False

    print()

    if all_passed:
        print("[SUCCESS] All PoC gates passed!")
        print("          Ready to proceed to Phase 2.")
        sys.exit(0)
    else:
        print("[FAILURE] Some tests failed.")
        print("          Review failures before proceeding.")
        sys.exit(1)


if __name__ == "__main__":
    main()
