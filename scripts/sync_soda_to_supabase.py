#!/usr/bin/env python3
"""
Bulk sync Edmonton fire incident data from SODA API to Supabase.
Usage: python3 scripts/sync_soda_to_supabase.py [--full | --incremental]
"""

import requests
import json
import sys
import time

# --- Config ---
SODA_BASE = "https://data.edmonton.ca/resource/7hsn-idqi.json"
SODA_BATCH = 50000

SUPABASE_URL = "https://ocylcvzqhpsfoxjgkeys.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jeWxjdnpxaHBzZm94amdrZXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNTQ3NTksImV4cCI6MjA4NzgzMDc1OX0.1Z46-veNdHJ-_2un4qP3uXQb1AhjbqQsLqgRKJKuCR0"
INSERT_BATCH = 500

FIRE_TYPES = "('FIRE','OUTSIDE FIRE','VEHICLE FIRE','ALARMS')"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",  # upsert on event_number
}


def fetch_soda(offset=0, where_extra=""):
    """Fetch a batch of records from SODA API."""
    where = f"event_description in{FIRE_TYPES}"
    if where_extra:
        where += f" AND {where_extra}"
    params = {
        "$where": where,
        "$limit": SODA_BATCH,
        "$offset": offset,
        "$order": "dispatch_datetime ASC",
    }
    resp = requests.get(SODA_BASE, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def transform(record):
    """Transform a SODA record to Supabase row format."""
    row = {
        "event_number": record.get("event_number"),
        "dispatch_datetime": record.get("dispatch_datetime"),
        "dispatch_year": int(record["dispatch_year"]) if record.get("dispatch_year") else None,
        "dispatch_month": int(record["dispatch_month"]) if record.get("dispatch_month") else None,
        "dispatch_day": int(record["dispatch_day"]) if record.get("dispatch_day") else None,
        "dispatch_dayofweek": record.get("dispatch_dayofweek"),
        "dispatch_time": record.get("dispatch_time"),
        "event_type_group": record.get("event_type_group"),
        "event_description": record.get("event_description"),
        "event_close_datetime": record.get("event_close_datetime"),
        "event_duration_mins": int(record["event_duration_mins"]) if record.get("event_duration_mins") else None,
        "neighbourhood_id": record.get("neighbourhood_id"),
        "neighbourhood_name": record.get("neighbourhood_name"),
        "approximate_location": record.get("approximate_location"),
        "equipment_assigned": record.get("equipment_assigned"),
        "response_code": record.get("response_code"),
        "latitude": float(record["latitude"]) if record.get("latitude") else None,
        "longitude": float(record["longitude"]) if record.get("longitude") else None,
    }
    return row


def upsert_batch(rows):
    """Upsert a batch of rows into Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/fire_incidents?on_conflict=event_number"
    resp = requests.post(url, headers=HEADERS, json=rows, timeout=30)
    if resp.status_code not in (200, 201):
        print(f"  ERROR {resp.status_code}: {resp.text[:200]}")
        return False
    return True


def get_latest_datetime():
    """Get the most recent dispatch_datetime in Supabase for incremental sync."""
    url = f"{SUPABASE_URL}/rest/v1/fire_incidents?select=dispatch_datetime&order=dispatch_datetime.desc&limit=1"
    resp = requests.get(url, headers=HEADERS, timeout=10)
    if resp.status_code == 200 and resp.json():
        return resp.json()[0]["dispatch_datetime"]
    return None


def get_count():
    """Get current row count in Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/fire_incidents?select=id"
    head_headers = {**HEADERS, "Prefer": "count=exact", "Range": "0-0"}
    resp = requests.get(url, headers=head_headers, timeout=10)
    content_range = resp.headers.get("Content-Range", "")
    if "/" in content_range:
        return int(content_range.split("/")[1])
    return 0


def main():
    mode = "full"
    if len(sys.argv) > 1 and sys.argv[1] == "--incremental":
        mode = "incremental"

    print(f"=== Edmonton Fire → Supabase Sync ({mode}) ===\n")

    where_extra = ""
    if mode == "incremental":
        latest = get_latest_datetime()
        if latest:
            where_extra = f"dispatch_datetime > '{latest}'"
            print(f"Incremental: fetching records after {latest}")
        else:
            print("No existing data — falling back to full sync")

    total_fetched = 0
    total_inserted = 0
    offset = 0

    while True:
        print(f"Fetching SODA batch at offset {offset}...")
        records = fetch_soda(offset=offset, where_extra=where_extra)

        if not records:
            print("  No more records.")
            break

        total_fetched += len(records)
        print(f"  Got {len(records)} records (total: {total_fetched})")

        # Transform all (skip records missing required fields)
        rows = [transform(r) for r in records if r.get("event_number") and r.get("dispatch_datetime")]

        # Upsert in sub-batches
        for i in range(0, len(rows), INSERT_BATCH):
            batch = rows[i : i + INSERT_BATCH]
            ok = upsert_batch(batch)
            if ok:
                total_inserted += len(batch)
                print(f"  Upserted {total_inserted} rows...", end="\r")
            else:
                print(f"  Failed at batch {i}-{i+len(batch)}")
                time.sleep(1)
                # Retry once
                if upsert_batch(batch):
                    total_inserted += len(batch)

        if len(records) < SODA_BATCH:
            break
        offset += SODA_BATCH
        time.sleep(0.5)  # brief pause between large fetches

    print(f"\n\nDone! Fetched {total_fetched}, upserted {total_inserted}")
    print(f"Total rows in Supabase: {get_count()}")


if __name__ == "__main__":
    main()
