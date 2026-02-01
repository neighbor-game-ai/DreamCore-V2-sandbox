"""
PoC Gate #1: Sandbox I/O Test

Verifies that stdin→stdout works correctly in Modal Sandbox.
This is critical for Claude CLI which reads prompts from stdin.

Expected: echo "test" | cat returns "test"
"""

import pytest


def test_sandbox_stdin_stdout(client, endpoint_url, auth_headers):
    """Test that stdin data is correctly passed through to stdout."""
    url = endpoint_url("test_sandbox_io")

    response = client.post(url, headers=auth_headers, json={})

    assert response.status_code == 200, f"Unexpected status: {response.status_code}"

    data = response.json()

    assert data.get("success") is True, f"Request failed: {data}"
    assert data.get("input") == "hello", f"Input mismatch: {data}"
    assert data.get("match") is True, f"stdin→stdout failed: {data}"

    print(f"\n[PASS] Sandbox I/O test:")
    print(f"  Input:  {data.get('input')}")
    print(f"  Output: {data.get('output')}")
    print(f"  Match:  {data.get('match')}")


def test_sandbox_io_requires_auth(client, endpoint_url):
    """Test that endpoint requires X-Modal-Secret."""
    url = endpoint_url("test_sandbox_io")

    # No auth header
    response = client.post(url, json={})
    assert response.status_code == 401, "Should require auth"

    # Wrong auth header
    response = client.post(
        url, headers={"X-Modal-Secret": "wrong-secret"}, json={}
    )
    assert response.status_code == 401, "Should reject wrong secret"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
