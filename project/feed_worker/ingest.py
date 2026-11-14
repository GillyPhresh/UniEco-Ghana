"""Fetch a small, allowlisted set of university RSS/Atom feeds for human review.

This worker uses only Python's standard library. It stores short, attributed
metadata and same-source-host media URLs; it never downloads or republishes
full articles/media, and it cannot approve or publish content.
"""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
import hashlib
import html
import json
import os
import re
import random
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
MAX_FEED_BYTES = 2 * 1024 * 1024
MAX_ITEMS_PER_SOURCE = 25
MAX_BATCH_ITEMS = 80
MAX_CONFIGURED_SOURCES = 250
MAX_AGE_DAYS = 365
REQUEST_TIMEOUT = 6
USER_AGENT = "UniEcoGhanaCampusFeed/1.0 (+https://www.uniecoghana.com/updates)"
CATEGORY_RULES = (
    ("events", re.compile(r"\b(event|ceremony|festival|conference|workshop|webinar|lecture|exhibition)\b", re.I)),
    ("opportunities", re.compile(r"\b(scholarship|vacancy|job|internship|grant|call for|application|admission)\b", re.I)),
    ("research", re.compile(r"\b(research|publication|study|innovation|patent|laboratory)\b", re.I)),
    ("notices", re.compile(r"\b(notice|deadline|closure|timetable|announcement|circular|registration)\b", re.I)),
    ("campus_life", re.compile(r"\b(student|campus|sports|alumni|clubs|community|graduation)\b", re.I)),
)
TRACKING_KEYS = {"fbclid", "gclid", "dclid", "mc_cid", "mc_eid"}


def has_unsafe_xml_declarations(data: bytes) -> bool:
    """Permit ordinary HTML doctypes while rejecting XML DTD/entity payloads."""
    if re.search(br"<!\s*ENTITY\b", data, re.I):
        return True
    if not re.search(br"<!\s*DOCTYPE\b", data, re.I):
        return False
    # A standard <!doctype html> is common on official news pages. Any other
    # doctype remains blocked before XML parsing to prevent external entities.
    return not bool(re.search(br"<!\s*DOCTYPE\s+html(?:\s|>)", data[:8192], re.I))


def load_sources() -> list[dict[str, str]]:
    token = os.environ.get("UNIECO_FEED_INGEST_TOKEN", "").strip()
    if token:
        sources = fetch_configured_sources(token)
    else:
        # Local development without credentials stays limited to the checked-in
        # sample list; production uses the authenticated database allowlist.
        sources = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    if not isinstance(sources, list) or not sources or len(sources) > MAX_CONFIGURED_SOURCES:
        raise ValueError("No trusted feed sources are configured")
    for source in sources:
        if not isinstance(source, dict) or any(not isinstance(source.get(key), str) or not source[key].strip()
                                               for key in ("id", "label", "university_name", "feed_url", "source_domain")):
            raise ValueError("Trusted source entry is incomplete")
        if not re.fullmatch(r"[a-z0-9-]{2,48}", source["id"]):
            raise ValueError("Trusted source id is invalid")
        parsed = urllib.parse.urlsplit(source["feed_url"])
        if (parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443)
                or not host_allowed(parsed.hostname or "", source["source_domain"])):
            raise ValueError(f"Unsafe configured feed URL for {source.get('id', 'unknown source')}")
    return sources


def sources_url() -> str:
    value = os.environ.get("UNIECO_FEED_INGEST_URL", "https://www.uniecoghana.com/api/internal/campus-feed/ingest").strip()
    parsed = urllib.parse.urlsplit(value)
    allowed = {"www.uniecoghana.com", "uniecoghana.com"}
    if parsed.scheme != "https" or parsed.hostname not in allowed or parsed.path != "/api/internal/campus-feed/ingest" or parsed.query or parsed.fragment:
        raise ValueError("Source directory URL must be the UniEco Ghana HTTPS endpoint")
    return value


def fetch_configured_sources(token: str) -> list[dict[str, str]]:
    request = urllib.request.Request(sources_url(), headers={
        "Accept": "application/json", "Authorization": f"Bearer {token}", "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
        if response.status != 200:
            raise RuntimeError(f"Trusted source directory returned HTTP {response.status}")
        payload = response.read(256 * 1024 + 1)
    if len(payload) > 256 * 1024:
        raise ValueError("Trusted source directory exceeded the size limit")
    parsed = json.loads(payload.decode("utf-8"))
    sources = parsed.get("sources") if isinstance(parsed, dict) else None
    if not isinstance(sources, list) or not sources or len(sources) > MAX_CONFIGURED_SOURCES:
        raise ValueError("Trusted source directory returned an invalid source list")
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


def fetch_feed(source: dict[str, str]) -> tuple[bytes, str]:
    def fetch_url(value: str) -> bytes:
        url = urllib.parse.urlsplit(value)
        if url.scheme != "https" or url.username or url.password or url.port not in (None, 443) or not host_allowed(url.hostname or "", source["source_domain"]):
            raise ValueError("Feed URL must remain on its trusted HTTPS source")
        opener = urllib.request.build_opener(SameSourceRedirect(source["source_domain"]))
        request = urllib.request.Request(value, headers={
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8",
            "User-Agent": USER_AGENT,
        })
        with opener.open(request, timeout=REQUEST_TIMEOUT) as response:
            final = urllib.parse.urlsplit(response.geturl())
            if final.scheme != "https" or not host_allowed(final.hostname or "", source["source_domain"]):
                raise ValueError("Feed response left the trusted HTTPS source")
            final_url = response.geturl()
            data = response.read(MAX_FEED_BYTES + 1)
        if len(data) > MAX_FEED_BYTES:
            raise ValueError("Feed exceeded the 2 MiB safety limit")
        if has_unsafe_xml_declarations(data):
            raise ValueError("DTD and entity declarations are not accepted")
        return data, final_url

    initial, initial_url = fetch_url(source["feed_url"])
    if is_feed_document(initial):
        return initial, initial_url

    parser = AdvertisedFeedParser()
    parser.feed(initial[:600_000].decode("utf-8", errors="replace"))
    for candidate in parser.urls[:3]:
        try:
            data, final_url = fetch_url(urllib.parse.urljoin(initial_url, candidate))
            if is_feed_document(data):
                return data, final_url
        except (OSError, ValueError, urllib.error.URLError):
            continue
    if source.get("source_kind") == "opportunities":
        return initial, initial_url

    sections = NewsSectionParser()
    sections.feed(initial[:600_000].decode("utf-8", errors="replace"))
    for candidate in sections.urls[:3]:
        try:
            data, final_url = fetch_url(urllib.parse.urljoin(initial_url, candidate))
            if not is_feed_document(data) and NewsArticleParser.has_articles(data):
                return data, final_url
        except (OSError, ValueError, urllib.error.URLError):
            continue
    return initial, initial_url


class AdvertisedFeedParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "link":
            return
        values = {key.lower(): (value or "") for key, value in attrs}
        rel = {part.lower() for part in values.get("rel", "").split()}
        content_type = values.get("type", "").lower()
        href = values.get("href", "").strip()
        if "alternate" not in rel or not href:
            return
        if any(token in content_type for token in ("rss", "atom", "xml")) or re.search(r"/(feed|rss|atom)(\.xml)?/?(?:\?|$)", href, re.I):
            if href not in self.urls:
                self.urls.append(href)


class NewsSectionParser(HTMLParser):
    """Find only same-site navigation links that look like news or event sections."""

    SECTION_PATH = re.compile(r"/(news|events?|updates|announcements|notices|research|campus[-/]life|student[-/]life)(?:/|$)", re.I)

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.urls: list[str] = []
        self.href: str | None = None
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag.lower() == "a" and values.get("href"):
            self.href = values["href"] or ""
            self.parts = []

    def handle_data(self, data: str) -> None:
        if self.href is not None:
            self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or self.href is None:
            return
        title = " ".join(" ".join(self.parts).split()).lower()
        if self.SECTION_PATH.search(urllib.parse.urlsplit(self.href).path) or re.search(r"\b(news|events|updates|announcements|notices|research|campus life)\b", title):
            if self.href not in self.urls:
                self.urls.append(self.href)
        self.href = None
        self.parts = []


class NewsArticleParser(HTMLParser):
    """Extract brief candidate headlines and same-site media from official listings."""

    ARTICLE_PATH = re.compile(r"/(news|events?|updates|announcements|notices|research|campus[-/]life|student[-/]life)/", re.I)
    GENERIC_HEADLINE = re.compile(r"^(?:view|explore|read|learn|apply|contact|student lounge|application info|opportunities|news|events|fees|forms|payments|admissions)\b", re.I)

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.articles: list[dict[str, str | None]] = []
        self.article_depth = 0
        self.current: dict[str, str | None] | None = None
        self.active_href: str | None = None
        self.active_text: list[str] = []
        self.active_heading = False
        self.heading_depth = 0
        self.active_time: str | None = None
        self.active_image: str | None = None
        self.text_parts: list[str] = []
        self.fallback_links: list[dict[str, str | None]] = []

    @classmethod
    def has_articles(cls, data: bytes) -> bool:
        parser = cls()
        parser.feed(data[:600_000].decode("utf-8", errors="replace"))
        return bool(parser.results())

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        values = dict(attrs)
        if tag == "article":
            if self.article_depth == 0:
                self.current = {"title": "", "href": None, "excerpt": "", "date": None, "image": None}
            self.article_depth += 1
        if self.article_depth and self.current is not None:
            if tag in {"h1", "h2", "h3", "h4"}:
                self.heading_depth += 1
            if tag == "a" and values.get("href"):
                self.active_href = values["href"] or ""
                self.active_text = []
                self.active_heading = self.heading_depth > 0
            if tag == "time":
                self.active_time = values.get("datetime") or values.get("date")
                if self.active_time:
                    self.current["date"] = self.active_time
            if tag == "img" and not self.current.get("image"):
                self.current["image"] = values.get("src") or values.get("data-src")
        elif tag == "a" and values.get("href"):
            self.active_href = values["href"] or ""
            self.active_text = []
            self.active_heading = False

    def handle_data(self, data: str) -> None:
        if self.active_href is not None:
            self.active_text.append(data)
        if self.article_depth and self.current is not None:
            self.text_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "a" and self.active_href is not None:
            title = " ".join(" ".join(self.active_text).split())
            item = {"title": title, "href": self.active_href, "date": (self.current.get("date") if self.current else None) or self.active_time, "image": self.current.get("image") if self.current else None}
            if self.article_depth and self.current is not None:
                if title and (self.active_heading or not self.current.get("href")):
                    self.current["title"] = title
                    self.current["href"] = self.active_href
            elif title:
                self.fallback_links.append(item)
            self.active_href = None
            self.active_text = []
            self.active_heading = False
        if tag in {"h1", "h2", "h3", "h4"} and self.heading_depth:
            self.heading_depth -= 1
        if tag == "article" and self.article_depth:
            self.article_depth -= 1
            if self.article_depth == 0 and self.current is not None:
                self.current["excerpt"] = " ".join(" ".join(self.text_parts).split())
                self.articles.append(self.current)
                self.current = None
                self.text_parts = []

    def results(self) -> list[dict[str, str | None]]:
        values = [item for item in self.articles if item.get("title") and item.get("href")]
        if not values:
            values = [item for item in self.fallback_links
                      if self.ARTICLE_PATH.search(urllib.parse.urlsplit(item["href"] or "").path)
                      and len(item.get("title") or "") >= 24
                      and not self.GENERIC_HEADLINE.search(item.get("title") or "")]
        return values


class OpportunityLinkParser(HTMLParser):
    """Extract only visible, relevant links from an official opportunity site."""

    KEYWORDS = re.compile(
        r"\b(scholarship\w*|bursar\w*|grant\w*|internship\w*|job\w*|vacanc\w*|fund\w*|business\w*|"
        r"entrepreneur\w*|youth\w*|train\w*|application\w*|opportunit\w*|call for|student\w*|seed)\b",
        re.I,
    )

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._parts: list[str] = []
        self._depth = 0
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        values = dict(attrs)
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        if tag == "a" and self._skip_depth == 0 and values.get("href"):
            self._href = values["href"] or ""
            self._parts = []
            self._depth = 1
        elif self._depth and tag == "a":
            self._depth += 1

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1
        if tag == "a" and self._depth:
            self._depth -= 1
            if self._depth == 0 and self._href:
                title = clean_excerpt(" ".join(self._parts), 220)
                if len(title) >= 12 and self.KEYWORDS.search(title):
                    self.links.append((self._href, title))
                self._href = None
                self._parts = []

    def handle_data(self, data: str) -> None:
        if self._depth and not self._skip_depth:
            self._parts.append(data)


def parse_official_opportunities(source: dict[str, str], data: bytes, page_url: str | None = None) -> list[dict[str, Any]]:
    if len(data) > MAX_FEED_BYTES or has_unsafe_xml_declarations(data):
        raise ValueError("Unsafe or oversized opportunity page")
    parser = OpportunityLinkParser()
    parser.feed(data.decode("utf-8", errors="replace"))
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for href, title in parser.links:
        link = safe_source_url(href, page_url or source["feed_url"], source["source_domain"])
        if not link or link in seen:
            continue
        seen.add(link)
        key = hashlib.sha256((source["id"] + "\0" + link + "\n" + title).encode("utf-8")).hexdigest()
        results.append({
            "source_id": source["id"], "source_item_key": key, "title": title,
            "excerpt": "Official opportunity lead. Confirm current eligibility, closing date, and application details at the source before acting.",
            "canonical_url": link, "published_at": None, "media_url": None,
            "media_type": None, "category": "opportunities",
        })
        if len(results) >= MAX_ITEMS_PER_SOURCE:
            break
    return results


def is_feed_document(data: bytes) -> bool:
    sample = data[:4096].lstrip(b"\xef\xbb\xbf\x00\t\r\n ").lower()
    return not has_unsafe_xml_declarations(data) and bool(
        re.search(br"<(rss|feed|rdf:rdf)(?:\s|>)", sample)
    )


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


def parse_official_news_page(source: dict[str, str], data: bytes, page_url: str, now: datetime | None = None) -> list[dict[str, Any]]:
    if len(data) > MAX_FEED_BYTES or has_unsafe_xml_declarations(data):
        raise ValueError("Unsafe or oversized official news page")
    parser = NewsArticleParser()
    parser.feed(data[:600_000].decode("utf-8", errors="replace"))
    now = now or datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in parser.results()[:MAX_ITEMS_PER_SOURCE]:
        title = clean_excerpt(entry.get("title") or "", 220)
        link = safe_source_url(entry.get("href") or "", page_url, source["source_domain"])
        if (len(title) < 24 or NewsArticleParser.GENERIC_HEADLINE.search(title)
                or not link or link == page_url or link in seen):
            continue
        published_at = parse_date(entry.get("date") or "")
        if published_at:
            age_days = (now - datetime.fromisoformat(published_at.replace("Z", "+00:00"))).total_seconds() / 86400
            if age_days > MAX_AGE_DAYS or age_days < -2:
                continue
        excerpt = clean_excerpt(entry.get("excerpt") or "", 600)
        media_url = safe_source_url(entry.get("image") or "", page_url, source["source_domain"])
        seen.add(link)
        results.append({
            "source_id": source["id"],
            "source_item_key": hashlib.sha256((source["id"] + "\0" + link + "\n" + title).encode("utf-8")).hexdigest(),
            "title": title,
            "excerpt": excerpt,
            "canonical_url": link,
            "published_at": published_at,
            "media_url": media_url,
            "media_type": "image" if media_url else None,
            "category": categorize(title, excerpt),
        })
    return results


def parse_feed(source: dict[str, str], data: bytes, now: datetime | None = None, content_url: str | None = None) -> list[dict[str, Any]]:
    if len(data) > MAX_FEED_BYTES or has_unsafe_xml_declarations(data):
        raise ValueError("Unsafe or oversized XML feed")
    if not is_feed_document(data):
        if source.get("source_kind") == "opportunities":
            return parse_official_opportunities(source, data, content_url)
        return parse_official_news_page(source, data, content_url or source["feed_url"], now)
    root = ET.fromstring(data)
    entries = [node for node in root.iter() if tag_local_name(node.tag) in {"item", "entry"}]
    now = now or datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in entries[:MAX_ITEMS_PER_SOURCE]:
        title = clean_excerpt(child_text(entry, {"title"}), 220)
        base_url = content_url or source["feed_url"]
        link = article_link(entry, base_url, source["source_domain"])
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
        media_url, media_type = media_candidate(entry, description, base_url, source["source_domain"])
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


def balanced_batch(source_items: list[list[dict[str, Any]]], limit: int = MAX_BATCH_ITEMS) -> list[dict[str, Any]]:
    """Take a round-robin sample so a few busy schools cannot crowd out others."""
    output: list[dict[str, Any]] = []
    for item_index in range(MAX_ITEMS_PER_SOURCE):
        for items in source_items:
            if item_index < len(items):
                output.append(items[item_index])
                if len(output) >= limit:
                    return output
    return output


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
        def collect(source: dict[str, str]) -> tuple[dict[str, str], list[dict[str, Any]], Exception | None]:
            try:
                page, content_url = fetch_feed(source)
                return source, parse_feed(source, page, content_url=content_url), None
            except (OSError, ValueError, ET.ParseError, urllib.error.URLError) as error:
                return source, [], error

        with ThreadPoolExecutor(max_workers=10) as pool:
            outcomes = list(pool.map(collect, sources))
        failures = sum(error is not None for _, _, error in outcomes)
        for source, items, error in outcomes:
            if error:
                print(f"{source['label']}: fetch unavailable ({type(error).__name__})", file=sys.stderr)
            else:
                print(f"{source['label']}: {len(items)} candidate(s)")

        successful = [items for _, items, error in outcomes if error is None and items]
        random.Random(datetime.now(timezone.utc).strftime("%Y-%j-%H")).shuffle(successful)
        all_items = balanced_batch(successful)
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
