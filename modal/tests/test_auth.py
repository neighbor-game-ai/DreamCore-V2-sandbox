"""
PoC Gate #5: Authentication Test

Verifies that X-Modal-Secret authentication works correctly.
This is critical for protecting internal API endpoints.

Expected:
- No header → 401
- Wrong secret → 401
- Correct secret → 200
"""

import pytest


def test_auth_without_header(client, endpoint_url):
    """Test that requests without X-Modal-Secret are rejected."""
    url = endpoint_url("test_auth")

    response = client.post(url, json={})

    assert response.status_code == 401, f"Should reject: got {response.status_code}"
    assert response.json().get("error") == "Unauthorized"

    print("\n[PASS] Request without header rejected with 401")


def test_auth_with_wrong_secret(client, endpoint_url):
    """Test that requests with wrong secret are rejected."""
    url = endpoint_url("test_auth")

    response = client.post(
        url, headers={"X-Modal-Secret": "wrong-secret-value"}, json={}
    )

    assert response.status_code == 401, f"Should reject: got {response.status_code}"
    assert response.json().get("error") == "Unauthorized"

    print("[PASS] Request with wrong secret rejected with 401")


def test_auth_with_correct_secret(client, endpoint_url, auth_headers):
    """Test that requests with correct secret are accepted."""
    url = endpoint_url("test_auth")

    response = client.post(url, headers=auth_headers, json={})

    assert response.status_code == 200, f"Should accept: got {response.status_code}"
    assert response.json().get("success") is True

    print("[PASS] Request with correct secret accepted with 200")


def test_auth_empty_secret_header(client, endpoint_url):
    """Test that empty X-Modal-Secret header is rejected."""
    url = endpoint_url("test_auth")

    response = client.post(url, headers={"X-Modal-Secret": ""}, json={})

    assert response.status_code == 401, f"Should reject: got {response.status_code}"

    print("[PASS] Request with empty secret rejected with 401")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
