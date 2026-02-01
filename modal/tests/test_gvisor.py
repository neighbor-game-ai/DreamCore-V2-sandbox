"""
PoC Gate #2: Sandbox Isolation Test

Verifies that Modal Sandbox provides isolation.
Checks for gVisor in /proc/version.

Environment:
    ALLOW_NON_GVISOR: Set to "1" to pass even if gVisor not detected
"""

import os
import pytest


def is_gvisor_required() -> bool:
    """Check if gVisor is required (ALLOW_NON_GVISOR not set)."""
    return os.environ.get("ALLOW_NON_GVISOR", "").lower() not in ("1", "true")


def test_sandbox_isolation(client, endpoint_url, auth_headers):
    """Test that Sandbox provides isolation."""
    url = endpoint_url("test_gvisor")

    response = client.post(url, headers=auth_headers, json={})

    assert response.status_code == 200, f"Unexpected status: {response.status_code}"

    data = response.json()

    assert data.get("success") is True, f"Request failed: {data}"

    proc_version = data.get("proc_version", "")
    is_gvisor = data.get("is_gvisor", False)

    print(f"\n[INFO] /proc/version: {proc_version}")
    print(f"[INFO] gVisor detected: {is_gvisor}")

    if is_gvisor:
        print("[PASS] Running under gVisor isolation")
    else:
        if is_gvisor_required():
            pytest.fail(
                f"gVisor not detected and ALLOW_NON_GVISOR not set. "
                f"Got: {proc_version[:100]}..."
            )
        else:
            print("[PASS] Modal Sandbox isolation (ALLOW_NON_GVISOR=1)")


def test_gvisor_requires_auth(client, endpoint_url):
    """Test that endpoint requires X-Modal-Secret."""
    url = endpoint_url("test_gvisor")

    response = client.post(url, json={})
    assert response.status_code == 401, "Should require auth"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
