"""
Pytest configuration and shared fixtures for Modal PoC tests.

Usage:
    pytest tests/ -v

Environment variables required:
    MODAL_ENDPOINT: Base URL for Modal web endpoints
    MODAL_INTERNAL_SECRET: Shared secret for X-Modal-Secret header
"""

import pytest
import httpx

from helpers import (
    get_env_or_skip,
    build_endpoint_url,
    get_auth_headers,
    get_modal_endpoint,
)


@pytest.fixture
def client():
    """HTTP client with extended timeout for Modal calls."""
    with httpx.Client(timeout=120.0) as c:
        yield c


@pytest.fixture
async def async_client():
    """Async HTTP client with extended timeout for streaming."""
    async with httpx.AsyncClient(timeout=120.0) as c:
        yield c


@pytest.fixture
def auth_headers():
    """Headers with X-Modal-Secret for authenticated requests."""
    return get_auth_headers()


@pytest.fixture
def endpoint_url():
    """Factory fixture to get endpoint URLs."""
    base_url = get_modal_endpoint()
    if not base_url:
        pytest.skip("MODAL_ENDPOINT environment variable not set")

    def _get_url(endpoint_name: str) -> str:
        return build_endpoint_url(base_url, endpoint_name)

    return _get_url
