"""
Customer/work-order lookups for Customer DB (cdb) mode.

Talks directly to the shared `voice_agent` Postgres database (seeded via
ops/seed/) rather than over HTTP — there is no separate "email-agent"
service reachable from the agent subprocess.
"""

import asyncio
import os
import uuid

import psycopg

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://voice_agent:postgres@postgres:5432/voice_agent"
)

_CUSTOMER_COLUMNS = (
    "id, full_name, phone_number, email, property_address, "
    "apartment_number, language_preference, notes"
)


def _connect():
    return psycopg.connect(DATABASE_URL, connect_timeout=5)


def _row_to_dict(cur, row):
    cols = [d.name for d in cur.description]
    return dict(zip(cols, row))


async def search_customers(query: str) -> list[dict]:
    def _query():
        with _connect() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_CUSTOMER_COLUMNS}
                FROM customers
                WHERE full_name ILIKE %(p)s OR phone_number ILIKE %(p)s OR property_address ILIKE %(p)s
                ORDER BY full_name
                LIMIT 10
                """,
                {"p": f"%{query}%"},
            )
            return [_row_to_dict(cur, row) for row in cur.fetchall()]

    return await asyncio.to_thread(_query)


async def lookup_by_phone(phone: str) -> dict | None:
    """
    Exact caller-ID lookup, bypassing STT entirely. Voice transcription mangles
    spoken digits (missing spaces, misheard numbers) badly enough that fuzzy
    phone-number search over dictated digits is unreliable — this is meant to be
    called with a phone number typed directly into the UI, not one spoken aloud.
    """

    def _query():
        with _connect() as conn, conn.cursor() as cur:
            cur.execute(
                f"SELECT {_CUSTOMER_COLUMNS} FROM customers WHERE phone_number = %s",
                (phone,),
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None

    return await asyncio.to_thread(_query)


async def create_work_order(**fields) -> dict:
    def _insert():
        wo_id = f"wo{uuid.uuid4().hex[:8]}"
        scheduled_time = "within 24 hours"
        with _connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO work_orders (
                    id, property_address, apartment_number, is_common_area, issue_description,
                    permit_master_key, special_notes, caller_phone_number, urgency_level,
                    status, scheduled_time, source, call_category
                ) VALUES (
                    %(id)s, %(property_address)s, %(apartment_number)s, %(is_common_area)s,
                    %(issue_description)s, %(permit_master_key)s, %(special_notes)s,
                    %(caller_phone_number)s, %(urgency_level)s, 'Assigned', %(scheduled_time)s,
                    %(source)s, %(call_category)s
                )
                """,
                {**fields, "id": wo_id, "scheduled_time": scheduled_time},
            )
        return {"id": wo_id, "scheduled_time": scheduled_time, **fields}

    return await asyncio.to_thread(_insert)
