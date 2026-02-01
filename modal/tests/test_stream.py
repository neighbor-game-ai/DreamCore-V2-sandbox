"""
PoC Gate #3: Streaming Test

Verifies that SSE streaming works correctly from Modal to client.
This is critical for real-time game generation feedback.

Expected: Receive 5 chunks at ~1 second intervals
"""

import pytest
import asyncio
import time
import json


@pytest.mark.asyncio
async def test_streaming_sse(async_client, endpoint_url, auth_headers):
    """Test that SSE streaming delivers chunks without buffering."""
    url = endpoint_url("test_stream")

    chunks = []
    timestamps = []

    async with async_client.stream(
        "POST", url, headers=auth_headers, json={}
    ) as response:
        assert response.status_code == 200, f"Unexpected status: {response.status_code}"
        assert "text/event-stream" in response.headers.get("content-type", "")

        async for line in response.aiter_lines():
            if line.startswith("data: "):
                timestamps.append(time.time())
                data = json.loads(line[6:])
                chunks.append(data)

                if data.get("type") == "done":
                    break

    # Verify we got all chunks
    assert len(chunks) == 6, f"Expected 6 chunks (5 counts + done), got {len(chunks)}"

    # Verify chunk content
    for i, chunk in enumerate(chunks[:-1]):
        assert chunk.get("count") == i + 1, f"Chunk {i} has wrong count: {chunk}"

    assert chunks[-1].get("type") == "done", "Last chunk should be done marker"

    # Verify timing (chunks should be ~1 second apart)
    if len(timestamps) >= 2:
        intervals = [
            timestamps[i + 1] - timestamps[i] for i in range(len(timestamps) - 1)
        ]
        avg_interval = sum(intervals) / len(intervals)

        print(f"\n[PASS] Streaming test:")
        print(f"  Chunks received: {len(chunks)}")
        print(f"  Average interval: {avg_interval:.2f}s")
        print(f"  Intervals: {[f'{i:.2f}s' for i in intervals]}")

        # Allow some tolerance for network latency
        assert 0.5 < avg_interval < 2.0, f"Intervals too far from 1s: {avg_interval}"
    else:
        print("[PASS] Streaming test (timing not verified)")


def test_stream_requires_auth(client, endpoint_url):
    """Test that endpoint requires X-Modal-Secret."""
    url = endpoint_url("test_stream")

    response = client.post(url, json={})
    assert response.status_code == 401, "Should require auth"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
