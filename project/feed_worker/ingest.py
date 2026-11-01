"""Fetch a small, allowlisted set of university RSS/Atom feeds for human review.

This worker uses only Python's standard library. It stores short, attributed
metadata and same-source-host media URLs; it never downloads or republishes
full articles/media, and it cannot approve or publish content.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
MAX_FEED_BYTES = 2 * 1024 * 1024
MAX_ITEMS_PER_SOURCE = 25
MAX_BATCH_ITEMS = 80
MAX_AGE_DAYS = 365
REQUEST_TIMEOUT = 12
USER_AGENT = "UniEcoGhanaCampusFeed/1.0 (+https://www.uniecoghana.com/updates)"
CATEGORY_RULES = (
    ("events", re.compile(r"\b(event|ceremony|festival|conference|workshop|webinar|lecture|exhibition)\b", re.I)),
    ("opportunities", re.compile(r"\b(scholarship|vacancy|job|internship|grant|call for|application|admission)\b", re.I)),
    ("research", re.compile(r"\b(research|publication|study|innovation|patent|laboratory)\b", re.I)),
    ("notices", re.compile(r"\b(notice|deadline|closure|timetable|announcement|circular|registration)\b", re.I)),
    ("campus_life", re.compile(r"\b(student|campus|sports|alumni|clubs|community|graduation)\b", re.I)),
)
TRACKING_KEYS = {"fbclid", "gclid", "dclid", "mc_cid", "mc_eid"}


def load_sources() -> list[dict[str, str]]:
    sources = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    if not isinstance(sources, list) or not sources:
        raise ValueError("No trusted feed sources are configured")
    for source in sources:
        parsed = urllib.parse.urlsplit(source["feed_url"])
        if parsed.scheme != "https" or not host_allowed(parsed.hostname or "", source["source_domain"]):
            raise ValueError(f"Unsafe configured feed URL for {source.get('id', 'unknown source')}")
    return sources


def host_allowed(host: str, source_domain: str) -> bool:
    normalized = host.rstrip(".").lower()
    domain = source_domain.rstrip(".").lower()
    return bool(normalized and (normalized == domain or normalized.endswith("." + domain)))


class SameSourceRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, domain: str) -> None:
        super().__init__()
        self.domain = domain

    def redirect_request(self, request: urllib.request.Request, response: Any,
                         code: int, message: str, headers: Any,
                         new_url: str) -> urllib.request.Request | None:
        target = urllib.parse.urlsplit(new_url)
        if (target.scheme != "https" or target.username or target.password
                or target.port not in (None, 443)
                or not host_allowed(target.hostname or "", self.domain)):
            raise urllib.error.HTTPError(new_url, code, "Unsafe feed redirect rejected", headers, None)
        return super().redirect_request(request, response, code, message, headers, new_url)


def fetch_feed(source: dict[str, str]) -> bytes:
    url = urllib.parse.urlsplit(source["feed_url"])
    if url.scheme != "https" or url.username or url.password or url.port not in (None, 443):
        raise ValueError("Feed URL must use HTTPS on the standard port")
    opener = urllib.request.build_opener(SameSourceRedirect(source["source_domain"]))
    request = urllib.request.Request(source["feed_url"], headers={
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
        "User-Agent": USER_AGENT,
    })
    with opener.open(request, timeout=REQUEST_TIMEOUT) as response:
        final = urllib.parse.urlsplit(response.geturl())
        if final.scheme != "https" or not host_allowed(final.hostname or "", source["source_domain"]):
            raise ValueError("Feed response left the trusted HTTPS source")
        data = response.read(MAX_FEED_BYTES + 1)
    if len(data) > MAX_FEED_BYTES:
        raise ValueError("Feed exceeded the 2 MiB safety limit")
    if re.search(br"<!\s*(DOCTYPE|ENTITY)\b", data, re.I):
        raise ValueError("DTD and entity declarations are not accepted")
    return data


class ContentExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.images: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = dict(attrs)
        if tag.lower() in {"script", "style", "noscript"}:
            self.skip_depth += 1
        if tag.lower() == "img" and attrs_map.get("src"):
            self.images.append(attrs_map["src"] or "")
        if tag.lower() in {"br", "p", "div", "li"}:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript"} and self.skip_depth:
            self.skip_depth -= 1
        if tag.lower() in {"p", "div", "li"}:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)


def clean_excerpt(value: str, limit: int = 600) -> str:
    parser = ContentExtractor()
    try:
        parser.feed(value[:20_000])
        parser.close()
        text = " ".join("".join(parser.parts).split())
    except Exception:
        text = re.sub(r"<[^>]*>", " ", value)
    return html.unescape(text).strip()[:limit]


def tag_local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].split(":")[-1].lower()


def child_text(element: ET.Element, names: set[str]) -> str:
    for child in element.iter():
        if child is element:
            continue
        if tag_local_name(child.tag) in names and child.text and child.text.strip():
            return child.text.strip()
    return ""


def article_link(item: ET.Element, feed_url: str, source_domain: str) -> str | None:
    for child in item:
        if tag_local_name(child.tag) != "link":
            continue
        href = child.attrib.get("href") or (child.text or "").strip()
        rel = child.attrib.get("rel", "alternate").lower()
        if not href or rel not in {"alternate", ""}:
            continue
        safe = safe_source_url(href, feed_url, source_domain)
        if safe:
            return safe
    return None


def safe_source_url(value: str, base: str, source_domain: str) -> str | None:
    try:
        url = urllib.parse.urlsplit(urllib.parse.urljoin(base, html.unescape(value.strip())))
        if (url.scheme != "https" or url.username or url.password
                or url.port not in (None, 443)
                or not host_allowed(url.hostname or "", source_domain)):
            return None
        query = [(key, val) for key, val in urllib.parse.parse_qsl(url.query, keep_blank_values=True)
                 if not key.lower().startswith("utm_") and key.lower() not in TRACKING_KEYS]
        return urllib.parse.urlunsplit(("https", url.netloc.lower(), url.path or "/",
                                       urllib.parse.urlencode(query), ""))
    except (ValueError, UnicodeError):
        return None


def parse_date(value: str) -> str | None:
    if not value:
        return None
    try:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    except (ValueError, TypeError, OverflowError):
        return None


def media_candidate(item: ET.Element, description: str, feed_url: str,
                    source_domain: str) -> tuple[str | None, str | None]:
    candidates: list[tuple[str, str | None]] = []
    parser = ContentExtractor()
    try:
        parser.feed(description[:20_000])
        candidates.extend((url, "image") for url in parser.images)
    except Exception:
        pass
    for node in item.iter():
        name = tag_local_name(node.tag)
        if name in {"thumbnail", "content"}:
            url = node.attrib.get("url")
            medium = (node.attrib.get("medium") or "").lower()
            mime = (node.attrib.get("type") or "").lower()
            kind = "video" if medium == "video" or mime.startswith("video/") else "image"
            if url:
                candidates.append((url, kind))
        if name == "enclosure":
            url = node.attrib.get("url")
            mime = (node.attrib.get("type") or "").lower()
            if url and (mime.startswith("image/") or mime.startswith("video/")):
                candidates.append((url, "video" if mime.startswith("video/") else "image"))
    for candidate, kind in candidates:
        safe = safe_source_url(candidate, feed_url, source_domain)
        if safe:
            return safe, kind
    return None, None


def categorize(title: str, excerpt: str) -> str:
    text = f"{title} {excerpt}"
    for category, pattern in CATEGORY_RULES:
        if pattern.search(text):
            return category
    return "news"


def parse_feed(source: dict[str, str], data: bytes, now: datetime | None = None) -> list[dict[str, Any]]:
    if len(data) > MAX_FEED_BYTES or re.search(br"<!\s*(DOCTYPE|ENTITY)\b", data, re.I):
        raise ValueError("Unsafe or oversized XML feed")
    root = ET.fromstring(data)
    entries = [node for node in root.iter() if tag_local_name(node.tag) in {"item", "entry"}]
    now = now or datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in entries[:MAX_ITEMS_PER_SOURCE]:
        title = clean_excerpt(child_text(entry, {"title"}), 220)
        link = article_link(entry, source["feed_url"], source["source_domain"])
        if len(title) < 8 or not link:
            continue
        raw_date = child_text(entry, {"published", "pubdate", "date", "updated", "issued"})
        published_at = parse_date(raw_date)
        if published_at:
            age_days = (now - datetime.fromisoformat(published_at.replace("Z", "+00:00"))).total_seconds() / 86400
            if age_days > MAX_AGE_DAYS or age_days < -2:
                continue
        description = child_text(entry, {"description", "summary", "encoded", "content"})
        excerpt = clean_excerpt(description, 600)
        identity = child_text(entry, {"guid", "id"}) or link + "\n" + title
        key = hashlib.sha256((source["id"] + "\0" + identity).encode("utf-8")).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        media_url, media_type = media_candidate(entry, description, source["feed_url"], source["source_domain"])
        results.append({
            "source_id": source["id"], "source_item_key": key, "title": title,
            "excerpt": excerpt, "canonical_url": link, "published_at": published_at,
            "media_url": media_url, "media_type": media_type,
            "category": categorize(title, excerpt),
        })
    return results


def ingest_url() -> str:
    value = os.environ.get("UNIECO_FEED_INGEST_URL", "https://www.uniecoghana.com/api/internal/campus-feed/ingest").strip()
    parsed = urllib.parse.urlsplit(value)
    allowed = {"www.uniecoghana.com", "uniecoghana.com"}
    if parsed.scheme != "https" or parsed.hostname not in allowed or parsed.path != "/api/internal/campus-feed/ingest" or parsed.query or parsed.fragment:
        raise ValueError("Ingest URL must be the UniEco Ghana HTTPS endpoint")
    return value


def send_items(items: list[dict[str, Any]], token: str, url: str) -> dict[str, Any]:
    payload = json.dumps({"items": items}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(payload) > 160 * 1024:
        raise ValueError("Ingest batch exceeded the request-size limit")
    request = urllib.request.Request(url, data=payload, method="POST", headers={
        "Content-Type": "application/json", "Accept": "application/json",
        "Authorization": f"Bearer {token}", "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
        body = response.read(16_384)
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"Ingest endpoint returned HTTP {response.status}")
    parsed = json.loads(body.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise RuntimeError("Ingest endpoint returned an unexpected response")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Fetch and summarize without sending")
    parser.add_argument("--source", help="Fetch one exact source id from sources.json")
    args = parser.parse_args()
    try:
        sources = load_sources()
        if args.source:
            sources = [source for source in sources if source["id"] == args.source]
            if not sources:
                raise ValueError("Unknown source id")
        all_items: list[dict[str, Any]] = []
        failures = 0
        for source in sources:
            try:
                items = parse_feed(source, fetch_feed(source))
                all_items.extend(items)
                print(f"{source['label']}: {len(items)} candidate(s)")
            except (OSError, ValueError, ET.ParseError, urllib.error.URLError) as error:
                failures += 1
                print(f"{source['label']}: fetch unavailable ({type(error).__name__})", file=sys.stderr)
            time.sleep(0.25)
        all_items = all_items[:MAX_BATCH_ITEMS]
        print(f"Candidates: {len(all_items)}; sources unavailable: {failures}")
        if args.dry_run:
            for item in all_items:
                print(json.dumps({key: item[key] for key in ("source_id", "title", "canonical_url", "category", "media_type")}, ensure_ascii=False))
            return 0 if all_items or failures < len(sources) else 1
        token = os.environ.get("UNIECO_FEED_INGEST_TOKEN", "").strip()
        if not token or len(token) < 32:
            raise ValueError("Set UNIECO_FEED_INGEST_TOKEN (at least 32 characters) before sending")
        if not all_items:
            return 0 if failures < len(sources) else 1
        result = send_items(all_items, token, ingest_url())
        print(f"Submitted for human review: accepted={result.get('accepted', 0)}, ignored={result.get('ignored', 0)}")
        return 0
    except (ValueError, RuntimeError, urllib.error.URLError, json.JSONDecodeError) as error:
        print(f"Feed worker stopped safely: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
