"""
HTTP bridge from the voice agent to the email agent's customer/work-order API.

In production both containers share the docker-compose network, so the
email agent is reachable at its service name. For local (non-docker) dev,
override CUSTOMER_API_URL to point at wherever email_agent_app/server.js
is running.
"""

import os
from urllib.parse import quote

import httpx

CUSTOMER_API_URL = os.environ.get("CUSTOMER_API_URL", "http://email-agent:3001")


async def search_customers(query: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.get(f"{CUSTOMER_API_URL}/api/customers", params={"search": query})
        r.raise_for_status()
        return r.json()


async def lookup_by_phone(phone: str) -> dict | None:
    """
    Exact caller-ID lookup, bypassing STT entirely. Voice transcription mangles
    spoken digits (missing spaces, misheard numbers) badly enough that fuzzy
    phone-number search over dictated digits is unreliable — this is meant to be
    called with a phone number typed directly into the UI, not one spoken aloud.
    """
    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.get(f"{CUSTOMER_API_URL}/api/customers/by-phone/{quote(phone, safe='')}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
        return data.get("customer")


async def create_work_order(**fields) -> dict:
    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.post(f"{CUSTOMER_API_URL}/api/work-orders", json=fields)
        r.raise_for_status()
        return r.json()
