"""Sweep the entire UniEco campus directory through its protected research API."""

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from collections import Counter

ENDPOINT = "https://www.uniecoghana.com/api/internal/campus-feed/research"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_batch(opener, token, offset, dry_run):
    data = json.dumps({"offset": offset, "dryRun": dry_run}).encode()
    request = urllib.request.Request(ENDPOINT, method="POST", data=data, headers={
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    })
    for attempt in range(3):
        try:
            with opener.open(request, timeout=40) as response:
                payload = response.read(64 * 1024 + 1)
                if len(payload) > 64 * 1024:
                    raise ValueError("Research worker response exceeded its limit.")
                return json.loads(payload)
        except urllib.error.HTTPError as error:
            if error.code not in {429, 502, 503, 504} or attempt == 2:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise
        time.sleep(2 ** (attempt + 1))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Scan official sources without writing review items")
    args = parser.parse_args()
    token = os.environ.get("UNIECO_FEED_INGEST_TOKEN", "").strip()
    if len(token) < 32:
        parser.error("The protected UniEco research token is required.")
    opener = urllib.request.build_opener(NoRedirect())
    counts = Counter()
    offset = 0
    try:
        for _ in range(1250):
            batch = request_batch(opener, token, offset, args.dry_run)
            outcomes = batch["report"]
            if not isinstance(outcomes, list) or len(outcomes) > 8:
                raise ValueError("Invalid campus research batch.")
            for row in outcomes:
                counts[row["state"]] += 1
                counts["found_items"] += row["found"]
                counts["recent_dated_items"] += row["datedRecent"]
                counts["queued"] += row["added"]
                counts["queue_errors"] += int(row["error"])
                print(f"{row['school'] or row['source']}: {row['state']}; "
                      f"{row['found']} candidates, {row['added']} queued", flush=True)
            next_offset = batch["nextOffset"]
            if next_offset is None:
                print(json.dumps(dict(counts), sort_keys=True), flush=True)
                return int(counts["queue_errors"] > 0 or not (counts["found"] or counts["no_updates"]))
            if type(next_offset) is not int or next_offset <= offset or next_offset > 10_000:
                raise ValueError("Invalid campus research cursor.")
            offset = next_offset
    except (OSError, ValueError, TypeError, KeyError) as error:
        print(f"Research sweep could not complete ({type(error).__name__}).")
        return 1
    print("Research sweep reached its safety limit.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
