#!/usr/bin/env python3
"""Load Edmonton fire stations into Supabase from Open Data."""

import requests

SODA_URL = "https://data.edmonton.ca/resource/b4y7-zhnz.json"
SUPABASE_URL = "https://ocylcvzqhpsfoxjgkeys.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jeWxjdnpxaHBzZm94amdrZXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNTQ3NTksImV4cCI6MjA4NzgzMDc1OX0.1Z46-veNdHJ-_2un4qP3uXQb1AhjbqQsLqgRKJKuCR0"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


def main():
    print("Fetching fire stations from Edmonton Open Data...")
    resp = requests.get(SODA_URL, params={"$limit": 100}, timeout=30)
    resp.raise_for_status()
    stations = resp.json()
    print(f"  Got {len(stations)} stations")

    # Inspect first record to understand field names
    if stations:
        print(f"  Fields: {list(stations[0].keys())}")

    rows = []
    for s in stations:
        # Handle different possible field names from SODA
        lat = None
        lng = None

        # Try geometry_point first (common in Edmonton open data)
        if "geometry_point" in s:
            gp = s["geometry_point"]
            if isinstance(gp, dict) and "coordinates" in gp:
                lng, lat = gp["coordinates"]
            elif isinstance(gp, dict):
                lat = float(gp.get("latitude", 0)) or None
                lng = float(gp.get("longitude", 0)) or None
        # Try direct lat/lng fields
        if lat is None and "latitude" in s:
            lat = float(s["latitude"])
        if lng is None and "longitude" in s:
            lng = float(s["longitude"])

        # Try to extract station number from name
        name = s.get("station_name", s.get("name", s.get("station", "")))
        number = s.get("station_number", s.get("station_no", ""))
        address = s.get("address", s.get("location", ""))

        rows.append({
            "station_name": name,
            "station_number": str(number) if number else None,
            "address": address,
            "latitude": lat,
            "longitude": lng,
            "metadata": {k: v for k, v in s.items() if k not in ("geometry_point", "location")},
        })

    # Upsert
    url = f"{SUPABASE_URL}/rest/v1/fire_stations?on_conflict=station_number"
    resp = requests.post(url, headers=HEADERS, json=rows, timeout=30)
    if resp.status_code in (200, 201):
        print(f"  Inserted {len(rows)} stations")
    else:
        print(f"  ERROR {resp.status_code}: {resp.text[:500]}")


if __name__ == "__main__":
    main()
