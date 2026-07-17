"""
Builds and (optionally) applies the customers / properties / work_orders seed
data used in production by the email-agent service
(email_agent_app/db/{migrate,seed}.js), from the fixture JSON in ops/seed/data/.

This only populates Postgres — it does not stand up an HTTP API in front of
it. cdb_tools.py still talks to CUSTOMER_API_URL over HTTP; wiring that
endpoint to read from this DB (instead of the currently unreachable
"email-agent" service) is a separate follow-up.

Normally you don't need to run this directly: `ops/seed/init/01_seed_customer_db.sql`
(generated from this same logic) is mounted into the postgres container's
/docker-entrypoint-initdb.d/, so `docker compose up` seeds a fresh volume
automatically. Run this script only to re-apply the seed against an
already-running container (e.g. after manually clearing the tables), or run
it with --write-sql to regenerate the init SQL file after editing the fixtures.

Usage:
    docker compose -f ops/docker-compose.yml up -d postgres
    python ops/seed/seed_customer_db.py              # apply directly via docker exec
    python ops/seed/seed_customer_db.py --write-sql   # regenerate init/01_seed_customer_db.sql
"""

import sys

import json
import subprocess
from pathlib import Path

CONTAINER = "voice_agent_postgres"
DB_USER = "voice_agent"
DB_NAME = "voice_agent"
DATA_DIR = Path(__file__).parent / "data"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS properties (
    id VARCHAR(50) PRIMARY KEY,
    address VARCHAR(255) NOT NULL UNIQUE,
    technician VARCHAR(255) NOT NULL,
    technician_phone VARCHAR(50),
    company VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_orders (
    id VARCHAR(50) PRIMARY KEY,
    property_address VARCHAR(255) NOT NULL,
    apartment_number VARCHAR(50),
    is_common_area BOOLEAN DEFAULT false,
    issue_description TEXT NOT NULL,
    permit_master_key BOOLEAN DEFAULT false,
    special_notes TEXT,
    caller_phone_number VARCHAR(100),
    urgency_level VARCHAR(20) DEFAULT 'Standard',
    technician VARCHAR(255),
    technician_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Assigned',
    scheduled_time VARCHAR(255),
    source VARCHAR(20) DEFAULT 'voice',
    call_category VARCHAR(50) DEFAULT 'fault_report',
    transcript_id VARCHAR(50),
    sender_email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(50) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255),
    property_address VARCHAR(255),
    apartment_number VARCHAR(50),
    language_preference VARCHAR(20) DEFAULT 'Finnish',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_address ON properties(address);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_property ON customers(property_address);
"""


def sql_str(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    return "'" + str(v).replace("'", "''") + "'"


def build_insert(table: str, columns: list[str], rows: list[dict]) -> str:
    if not rows:
        return ""
    values = []
    for row in rows:
        values.append("(" + ", ".join(sql_str(row.get(c)) for c in columns) + ")")
    return (
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES\n"
        + ",\n".join(values)
        + f"\nON CONFLICT (id) DO NOTHING;\n"
    )


def build_full_sql() -> tuple[str, int, int, int]:
    properties = json.loads((DATA_DIR / "properties.json").read_text())
    work_orders = json.loads((DATA_DIR / "work_orders.json").read_text())
    customers = json.loads((DATA_DIR / "customers.json").read_text())

    sql = [SCHEMA_SQL]
    sql.append(build_insert(
        "properties",
        ["id", "address", "technician", "technician_phone", "company"],
        properties,
    ))
    sql.append(build_insert(
        "work_orders",
        ["id", "property_address", "apartment_number", "is_common_area", "issue_description",
         "permit_master_key", "special_notes", "caller_phone_number", "urgency_level",
         "technician", "technician_phone", "status", "scheduled_time", "source",
         "call_category", "transcript_id", "sender_email"],
        work_orders,
    ))
    sql.append(build_insert(
        "customers",
        ["id", "full_name", "phone_number", "email", "property_address",
         "apartment_number", "language_preference", "notes"],
        customers,
    ))

    full_sql = "\n".join(s for s in sql if s)
    return full_sql, len(properties), len(work_orders), len(customers)


def main():
    full_sql, n_props, n_wos, n_custs = build_full_sql()

    if "--write-sql" in sys.argv:
        out_path = Path(__file__).parent / "init" / "01_seed_customer_db.sql"
        out_path.write_text(full_sql)
        print(f"Wrote {out_path} ({n_props} properties, {n_wos} work orders, {n_custs} customers).")
        return

    print(f"Seeding {n_props} properties, {n_wos} work orders, "
          f"{n_custs} customers into {CONTAINER}...")
    result = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-v", "ON_ERROR_STOP=1"],
        input=full_sql,
        text=True,
        capture_output=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
        raise SystemExit(result.returncode)
    print("Seed complete.")


if __name__ == "__main__":
    main()
