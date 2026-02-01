"""
PoC Gate #4: Volume Persistence Test

Verifies that data written to Modal Volume persists after commit.
This is critical for storing generated game files.

Expected: File written → committed → read back successfully
"""

import pytest


def test_volume_persistence(client, endpoint_url, auth_headers):
    """Test that Volume data persists after commit."""
    url = endpoint_url("test_volume")

    response = client.post(url, headers=auth_headers, json={})

    assert response.status_code == 200, f"Unexpected status: {response.status_code}"

    data = response.json()

    assert data.get("success") is True, f"Request failed: {data}"
    assert data.get("match") is True, f"Write/Read mismatch: {data}"

    print(f"\n[PASS] Volume persistence test:")
    print(f"  Test ID:  {data.get('test_id')}")
    print(f"  Written:  {data.get('written')}")
    print(f"  Read:     {data.get('read')}")
    print(f"  Match:    {data.get('match')}")


def test_volume_requires_auth(client, endpoint_url):
    """Test that endpoint requires X-Modal-Secret."""
    url = endpoint_url("test_volume")

    response = client.post(url, json={})
    assert response.status_code == 401, "Should require auth"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
