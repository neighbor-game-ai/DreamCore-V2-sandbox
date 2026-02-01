"""
DreamCore Test Helpers

Common utilities for Modal PoC tests.
"""

import os
import json
from typing import AsyncIterator, Callable, Any


def get_env_or_skip(name: str, skip_func: Callable) -> str:
    """
    Get environment variable or skip test.

    Args:
        name: Environment variable name
        skip_func: pytest.skip function

    Returns:
        Environment variable value
    """
    value = os.environ.get(name)
    if not value:
        skip_func(f"{name} environment variable not set")
    return value


def get_modal_endpoint() -> str:
    """Get Modal endpoint base URL from environment."""
    return os.environ.get("MODAL_ENDPOINT", "")


def get_internal_secret() -> str:
    """Get internal secret from environment."""
    return os.environ.get("MODAL_INTERNAL_SECRET", "")


def build_endpoint_url(base_url: str, endpoint_name: str) -> str:
    """
    Build full Modal endpoint URL.

    Args:
        base_url: Base URL (e.g., https://notef-neighbor--dreamcore)
        endpoint_name: Endpoint name (e.g., test_auth)

    Returns:
        Full URL (e.g., https://notef-neighbor--dreamcore-test-auth.modal.run)
    """
    # Modal URL format: {base}-{endpoint}.modal.run
    endpoint_snake = endpoint_name.replace("_", "-")
    return f"{base_url.rstrip('/')}-{endpoint_snake}.modal.run"


def get_auth_headers() -> dict:
    """Get headers with X-Modal-Secret for authenticated requests."""
    return {"X-Modal-Secret": get_internal_secret()}


async def read_sse_stream(response) -> AsyncIterator[dict]:
    """
    Read SSE stream from response.

    Args:
        response: httpx streaming response

    Yields:
        Parsed JSON data from each SSE event
    """
    async for line in response.aiter_lines():
        if line.startswith("data: "):
            data = json.loads(line[6:])
            yield data


def parse_sse_line(line: str) -> dict | None:
    """
    Parse a single SSE line.

    Args:
        line: Raw SSE line

    Returns:
        Parsed JSON data or None if not a data line
    """
    if line.startswith("data: "):
        return json.loads(line[6:])
    return None


def assert_success_response(response, expected_status: int = 200) -> dict:
    """
    Assert response is successful and return JSON body.

    Args:
        response: httpx response
        expected_status: Expected HTTP status code

    Returns:
        Parsed JSON response body

    Raises:
        AssertionError: If status code doesn't match
    """
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: "
        f"{response.text}"
    )
    return response.json()


def assert_error_response(response, expected_status: int = 401) -> dict:
    """
    Assert response is an error with expected status.

    Args:
        response: httpx response
        expected_status: Expected HTTP status code

    Returns:
        Parsed JSON response body

    Raises:
        AssertionError: If status code doesn't match
    """
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}"
    )
    return response.json()
