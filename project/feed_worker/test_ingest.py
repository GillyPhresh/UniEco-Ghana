import importlib.util
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("ingest.py")
SPEC = importlib.util.spec_from_file_location("unieco_feed_ingest", MODULE_PATH)
ingest = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(ingest)


class FeedParserTests(unittest.TestCase):
    def setUp(self):
        self.source = {
            "id": "knust", "label": "KNUST", "university_name": "KNUST",
            "feed_url": "https://www.knust.edu.gh/rss.xml", "source_domain": "knust.edu.gh",
        }
        self.now = datetime(2026, 11, 1, tzinfo=timezone.utc)

    def test_rss_extracts_short_attributed_item_and_official_image(self):
        xml = b'''<?xml version="1.0"?><rss><channel><item>
          <title>KNUST announces research workshop</title>
          <guid>story-1</guid><link>https://www.knust.edu.gh/news/workshop?utm_source=test</link>
          <pubDate>Sat, 31 Oct 2026 12:00:00 GMT</pubDate>
          <description><![CDATA[<p>Join researchers.</p><script>ignore me</script><img src="https://www.knust.edu.gh/files/workshop.jpg">]]></description>
        </item></channel></rss>'''
        [item] = ingest.parse_feed(self.source, xml, self.now)
        self.assertEqual(item["category"], "events")
        self.assertEqual(item["canonical_url"], "https://www.knust.edu.gh/news/workshop")
        self.assertEqual(item["media_type"], "image")
        self.assertEqual(item["media_url"], "https://www.knust.edu.gh/files/workshop.jpg")
        self.assertNotIn("ignore me", item["excerpt"])
        self.assertEqual(len(item["source_item_key"]), 64)

    def test_atom_feed_uses_alternate_link_and_skips_off_domain_media(self):
        xml = b'''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:m="http://search.yahoo.com/mrss/">
          <entry><title>New campus research programme</title><id>tag:knust.edu.gh,2026:77</id>
          <link rel="alternate" href="https://knust.edu.gh/programmes/research"/>
          <updated>2026-10-31T10:00:00Z</updated><summary>Research opportunities for students.</summary>
          <m:thumbnail url="https://example.net/outside.jpg"/></entry></feed>'''
        [item] = ingest.parse_feed(self.source, xml, self.now)
        self.assertEqual(item["canonical_url"], "https://knust.edu.gh/programmes/research")
        self.assertIsNone(item["media_url"])
        self.assertIsNone(item["media_type"])

    def test_external_article_link_is_never_queued(self):
        xml = b'''<rss><channel><item><title>University news headline</title>
        <guid>bad-1</guid><link>https://evil.example/collect</link><description>Text</description></item></channel></rss>'''
        self.assertEqual(ingest.parse_feed(self.source, xml, self.now), [])

    def test_old_and_far_future_items_are_skipped(self):
        xml = b'''<rss><channel>
        <item><title>Old university notice</title><guid>old</guid><link>https://knust.edu.gh/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
        <item><title>Future university notice</title><guid>future</guid><link>https://knust.edu.gh/future</link><pubDate>Tue, 01 Dec 2026 00:00:00 GMT</pubDate></item>
        </channel></rss>'''
        self.assertEqual(ingest.parse_feed(self.source, xml, self.now), [])

    def test_unsafe_xml_declarations_are_rejected(self):
        with self.assertRaises(ValueError):
            ingest.parse_feed(self.source, b'<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', self.now)

    def test_feed_config_is_fixed_and_uses_only_https_source_hosts(self):
        sources = ingest.load_sources()
        self.assertGreaterEqual(len(sources), 4)
        for source in sources:
            self.assertTrue(source["feed_url"].startswith("https://"))
            self.assertTrue(ingest.host_allowed(__import__("urllib.parse").parse.urlsplit(source["feed_url"]).hostname, source["source_domain"]))

    def test_url_cleaning_removes_tracking_and_rejects_non_https(self):
        safe = ingest.safe_source_url("/news?a=1&utm_campaign=x&fbclid=y#section", "https://atu.edu.gh/feed/", "atu.edu.gh")
        self.assertEqual(safe, "https://atu.edu.gh/news?a=1")
        self.assertIsNone(ingest.safe_source_url("http://atu.edu.gh/news", "https://atu.edu.gh/feed/", "atu.edu.gh"))


if __name__ == "__main__":
    unittest.main()
