// ============================================================
//  MangaBuddy – Mangayomi JavaScript Extension
//  Source : https://mangabuddy1.co.uk
//  Lang   : en
//  Type   : manga (isManga: true)
//  Version: 1.0.0
// ============================================================
//
// HOW TO INSTALL (manual):
//  1. Open Mangayomi → Browse → Extensions → "+" button
//  2. Fill in:
//       Name     : MangaBuddy
//       Base URL : https://mangabuddy1.co.uk
//       Lang     : en
//       isManga  : true
//  3. Save, then open the source → Edit Code → paste this file
//
// IMPLEMENTED METHODS:
//  • getPopular(page)        – /series?page=N  (all series, default sort)
//  • getLatestUpdates(page)  – /latest-updates?page=N
//  • search(query, page, filters) – /series?q=…&status=…&type=…&genre=…&page=N
//  • getDetail(url)          – series page: title, cover, author, genres, status, synopsis, chapters
//  • getPageList(url)        – chapter page: ordered list of image URLs
//  • getFilterList()         – status / type / genre filter groups
// ============================================================

const BASE = "https://mangabuddy1.co.uk";
const CDN_REFERER = "https://cdn1.love4awalk.xyz/";

// ── helpers ────────────────────────────────────────────────

/**
 * Fetch a page and return a Document.
 * Sends a Referer header so the CDN does not block images.
 */
async function fetchDoc(url) {
  const client = new Client();
  const res = await client.get(url, { "Referer": BASE + "/" });
  return new Document(res.body);
}

/**
 * Parse an href that may be absolute or relative,
 * and normalise it to an absolute URL.
 */
function absUrl(href) {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return BASE + (href.startsWith("/") ? href : "/" + href);
}

/**
 * Convert a status string from the site to a Mangayomi integer:
 *   0 = ongoing, 1 = complete, 2 = hiatus, 3 = canceled, 4 = publishingFinished, 5 = unknown
 */
function parseStatus(text) {
  const s = (text || "").toLowerCase().trim();
  if (s === "ongoing")   return 0;
  if (s === "completed" || s === "complete") return 1;
  if (s === "hiatus" || s === "on_hiatus")  return 2;
  if (s === "canceled" || s === "cancelled") return 3;
  if (s === "pending")   return 5;
  return 5;
}

/**
 * Extract manga cards from a list/grid page.
 * Each card looks like:
 *   <a href="/series/slug.ID"> ... <img src="…"> ... title text ... </a>
 *
 * Returns { list: [{url, name, imageUrl}], hasNextPage }
 */
function parseSeriesGrid(doc, pageUrl) {
  const list = [];

  // Cards are <a> tags whose href starts with /series/ and contains a dot-ID
  const links = doc.select("a[href*='/series/']");
  const seen  = new Set();

  for (const a of links) {
    const href = a.attr("href") || "";
    // Only process series detail links (contains a dotted ID like .ZDxx)
    if (!href.match(/\/series\/[^/]+\.[A-Za-z0-9_-]+$/)) continue;
    const url = absUrl(href);
    if (seen.has(url)) continue;
    seen.add(url);

    // Title: prefer the heading inside the card, fallback to link text
    let name = "";
    const h3 = a.selectFirst("h3");
    if (h3) {
      name = h3.text.trim();
    }
    if (!name) {
      name = a.attr("title") || a.text.trim();
    }
    if (!name) continue;

    // Cover image
    let imageUrl = "";
    const img = a.selectFirst("img");
    if (img) {
      imageUrl = img.attr("src") || img.attr("data-src") || "";
    }

    list.push({ url, name, imageUrl });
  }

  // Pagination: look for a "next page" link
  // MangaBuddy uses ?page=N  – check if current page link's next sibling is active
  let hasNextPage = false;
  // Strategy: look for a link whose text is ">" or contains the next page number
  const allLinks = doc.select("a[href*='page=']");
  const currentMatch = pageUrl.match(/page=(\d+)/);
  const currentPage = currentMatch ? parseInt(currentMatch[1]) : 1;

  for (const pl of allLinks) {
    const phref = pl.attr("href") || "";
    const m = phref.match(/page=(\d+)/);
    if (m && parseInt(m[1]) === currentPage + 1) {
      hasNextPage = true;
      break;
    }
  }

  // Fallback: if we got a full grid (≥20 items) assume there is a next page
  if (!hasNextPage && list.length >= 20) hasNextPage = true;

  return { list, hasNextPage };
}

// ── main exported functions ────────────────────────────────

/**
 * Popular manga – Browse the /series page sorted by default (ranking/views).
 */
async function getPopular(page) {
  const url = `${BASE}/series?page=${page}`;
  const doc = await fetchDoc(url);
  return parseSeriesGrid(doc, url);
}

/**
 * Latest updates – /latest-updates sorted by newest chapter.
 */
async function getLatestUpdates(page) {
  const url = `${BASE}/latest-updates?page=${page}`;
  const doc = await fetchDoc(url);

  const list = [];
  const seen = new Set();

  // On the latest-updates page each entry is an <a> pointing to /series/…
  const links = doc.select("a[href*='/series/']");

  for (const a of links) {
    const href = a.attr("href") || "";
    if (!href.match(/\/series\/[^/]+\.[A-Za-z0-9_-]+$/)) continue;
    const url_s = absUrl(href);
    if (seen.has(url_s)) continue;
    seen.add(url_s);

    let name = "";
    const heading = a.selectFirst("h2, h3, h4, .series-title");
    if (heading) name = heading.text.trim();
    if (!name) name = a.attr("title") || "";
    if (!name) {
      // strip chapter links text
      const raw = a.text.trim();
      if (raw.toLowerCase().startsWith("chapter")) continue;
      name = raw;
    }
    if (!name) continue;

    let imageUrl = "";
    const img = a.selectFirst("img");
    if (img) imageUrl = img.attr("src") || img.attr("data-src") || "";

    list.push({ url: url_s, name, imageUrl });
  }

  // Pagination
  let hasNextPage = false;
  const pLinks = doc.select("a[href*='page=']");
  const cMatch = `${BASE}/latest-updates?page=${page}`.match(/page=(\d+)/);
  const cPage  = cMatch ? parseInt(cMatch[1]) : page;
  for (const pl of pLinks) {
    const m = (pl.attr("href") || "").match(/page=(\d+)/);
    if (m && parseInt(m[1]) === cPage + 1) { hasNextPage = true; break; }
  }
  if (!hasNextPage && list.length >= 20) hasNextPage = true;

  return { list, hasNextPage };
}

/**
 * Search – /series?q=QUERY&status=STATUS&type=TYPE&genre=GENRE&page=N
 *
 * filters[0] = StatusFilter  (value: "", "Ongoing", "Completed", "Pending", "Hiatus")
 * filters[1] = TypeFilter    (value: "", "Manga", "Manhwa", "Manhua", "Webtoon", …)
 * filters[2] = GenreFilter   (value: "", "Action", "Romance", …)
 */
async function search(query, page, filters) {
  let url = `${BASE}/series?page=${page}`;

  if (query && query.trim() !== "") {
    url += `&q=${encodeURIComponent(query.trim())}`;
  }

  // Apply filters if provided
  if (filters && filters.length > 0) {
    const status = filters[0] && filters[0].value ? filters[0].value : "";
    const type   = filters[1] && filters[1].value ? filters[1].value : "";
    const genre  = filters[2] && filters[2].value ? filters[2].value : "";

    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (type)   url += `&type=${encodeURIComponent(type)}`;
    if (genre)  url += `&genre=${encodeURIComponent(genre)}`;
  }

  const doc = await fetchDoc(url);
  return parseSeriesGrid(doc, url);
}

/**
 * Detail page – scrapes the /series/slug.ID page.
 * Returns: { title, description, author, genre[], status, imageUrl, chapters[] }
 */
async function getDetail(url) {
  const doc = await fetchDoc(url);

  // ── title ─────────────────────────────────────────────
  let title = "";
  const h1 = doc.selectFirst("h1");
  if (h1) title = h1.text.trim();

  // ── cover image ────────────────────────────────────────
  let imageUrl = "";
  // The cover <img> is typically inside a figure/div with class containing "cover" or "thumb"
  const coverImg =
    doc.selectFirst("img.series-cover, img[class*='cover'], img[class*='thumb'], figure img")
    || doc.selectFirst("img[src*='thumb']");
  if (coverImg) imageUrl = coverImg.attr("src") || coverImg.attr("data-src") || "";

  // ── description / synopsis ─────────────────────────────
  let description = "";
  const synopsisEl =
    doc.selectFirst(".synopsis, .description, [class*='synopsis'], [class*='description'], p.summary");
  if (synopsisEl) description = synopsisEl.text.trim();

  // ── metadata fields (Author, Status, Type, …) ─────────
  // MangaBuddy renders them as labeled sections: "# Status\n[value]"
  // In the parsed HTML they appear as text nodes near headings.
  // We scrape the full text of info sections and look for keywords.

  let author = "";
  let status = 5; // unknown
  const genres = [];

  // Try direct selectors first
  const allText = doc.select("*");

  // Author: look for a link to /author/
  const authorLink = doc.selectFirst("a[href*='/author/']");
  if (authorLink) author = authorLink.text.trim();

  // Status: look for a link to /series?status= or text matching status keywords
  const statusLink = doc.selectFirst("a[href*='?status='], a[href*='/series?status']");
  if (statusLink) status = parseStatus(statusLink.text.trim());

  // If not found, try scanning heading siblings
  if (status === 5) {
    const headings = doc.select("h2, h3, h4, strong, b");
    for (const h of headings) {
      const txt = h.text.trim().toLowerCase();
      if (txt === "status") {
        // Try the next sibling text
        const parent = h.selectFirst("~ a, ~ span, + *");
        if (parent) {
          status = parseStatus(parent.text.trim());
          break;
        }
      }
    }
  }

  // Genres: links to /series?genre= or /genre/
  const genreLinks = doc.select("a[href*='?genre='], a[href*='/genre/'], a[href*='/tag/']");
  for (const g of genreLinks) {
    const gt = g.text.trim();
    if (gt && gt.length > 0 && gt.length < 40) {
      genres.push(gt);
    }
  }
  // Deduplicate
  const uniqueGenres = [...new Set(genres)];

  // ── chapter list ───────────────────────────────────────
  // Chapter links pattern: /series/slug.ID/chapter-N
  const chapLinks = doc.select("a[href*='/chapter-']");
  const chapters  = [];
  const seenChap  = new Set();

  for (const a of chapLinks) {
    const href = a.attr("href") || "";
    if (!href.match(/\/chapter-[\d.]+$/)) continue;
    const chapUrl = absUrl(href);
    if (seenChap.has(chapUrl)) continue;
    seenChap.add(chapUrl);

    // Chapter name: e.g. "Chapter 19" or "Chapter 19.5"
    let chapName = a.text.trim();
    // Strip extra whitespace/newlines
    chapName = chapName.replace(/\s+/g, " ").trim();
    // If the link text is empty, derive name from URL
    if (!chapName) {
      const m = href.match(/chapter-([\d.]+)$/);
      chapName = m ? `Chapter ${m[1]}` : href;
    }

    // Date: a sibling or sub-element may contain a relative date string
    // MangaBuddy renders dates like "22 minute ago", "1 week ago", "2023-01-15"
    let dateText = "";
    const dateEl = a.selectFirst("span.date, span.time, time, [class*='date'], [class*='time']");
    if (dateEl) dateText = dateEl.attr("datetime") || dateEl.text.trim();

    // We leave dateUpload null – the app uses the current date as fallback.
    // Relative dates like "22 minute ago" are hard to parse without Date.now() math.
    // If the site ever shows absolute dates we can convert them here.

    chapters.push({
      url:      chapUrl,
      name:     chapName,
      // scanlator: "",   // MangaBuddy does not expose a scanlator field
      dateUpload: null,
    });
  }

  // MangaBuddy lists chapters newest-first in the DOM; Mangayomi expects the same
  // (most recent first), so no reversal needed.

  return {
    title,
    description,
    author,
    genre:    uniqueGenres,
    status,
    imageUrl,
    chapters,
  };
}

/**
 * Page list – scrapes image URLs from a chapter page.
 * Images are served from cdn1.love4awalk.xyz and require a Referer header.
 *
 * Returns an array of { url: string, headers: { Referer: string } }
 */
async function getPageList(url) {
  const doc = await fetchDoc(url);

  const pages = [];
  const seen  = new Set();

  // Chapter images: <img> tags whose src points to the CDN
  // Pattern: https://cdn1.love4awalk.xyz/{slug}/{chapter}/{index}.webp
  const imgs = doc.select("img[src*='love4awalk.xyz'], img[data-src*='love4awalk.xyz']");

  for (const img of imgs) {
    let src = img.attr("src") || img.attr("data-src") || "";
    // Skip the Discord banner or other non-page images
    if (src.includes("discord")) continue;
    if (!src) continue;
    if (seen.has(src)) continue;
    seen.add(src);

    pages.push({
      url:     src,
      headers: { "Referer": CDN_REFERER },
    });
  }

  // Fallback: try lazy-load attributes
  if (pages.length === 0) {
    const lazyImgs = doc.select("img[data-lazy-src], img[data-original]");
    for (const img of lazyImgs) {
      const src = img.attr("data-lazy-src") || img.attr("data-original") || "";
      if (!src || seen.has(src)) continue;
      if (src.includes("discord")) continue;
      seen.add(src);
      pages.push({ url: src, headers: { "Referer": CDN_REFERER } });
    }
  }

  return pages;
}

/**
 * Filter list – defines the dropdowns shown in the search screen.
 */
function getFilterList() {
  return [
    {
      type_name: "SelectFilter",
      name: "Status",
      values: [
        { name: "All",       value: "" },
        { name: "Ongoing",   value: "Ongoing" },
        { name: "Completed", value: "Completed" },
        { name: "Pending",   value: "Pending" },
        { name: "Hiatus",    value: "Hiatus" },
        { name: "On Hiatus", value: "On_hiatus" },
      ],
    },
    {
      type_name: "SelectFilter",
      name: "Type",
      values: [
        { name: "All",       value: "" },
        { name: "Manga",     value: "Manga" },
        { name: "Manhwa",    value: "Manhwa" },
        { name: "Manhua",    value: "Manhua" },
        { name: "Webtoon",   value: "Webtoon" },
        { name: "Doujinshi", value: "Doujinshi" },
        { name: "One-shot",  value: "One-shot" },
        { name: "Novel",     value: "Novel" },
      ],
    },
    {
      type_name: "SelectFilter",
      name: "Genre",
      values: [
        { name: "All",          value: "" },
        { name: "Action",       value: "Action" },
        { name: "Adventure",    value: "Adventure" },
        { name: "Boys Love",    value: "Boys+Love" },
        { name: "Comedy",       value: "Comedy" },
        { name: "Drama",        value: "Drama" },
        { name: "Ecchi",        value: "Ecchi" },
        { name: "Fantasy",      value: "Fantasy" },
        { name: "Full Color",   value: "Full+Color" },
        { name: "Girls Love",   value: "Girls+Love" },
        { name: "Harem",        value: "Harem" },
        { name: "Historical",   value: "Historical" },
        { name: "Horror",       value: "Horror" },
        { name: "Isekai",       value: "Isekai" },
        { name: "Josei",        value: "Josei" },
        { name: "Magic",        value: "Magic" },
        { name: "Martial Arts", value: "Martial+Arts" },
        { name: "Mature",       value: "Mature" },
        { name: "Mystery",      value: "Mystery" },
        { name: "Psychological",value: "Psychological" },
        { name: "Romance",      value: "Romance" },
        { name: "School Life",  value: "School+life" },
        { name: "Sci-Fi",       value: "Sci-Fi" },
        { name: "Seinen",       value: "Seinen" },
        { name: "Shoujo",       value: "Shoujo" },
        { name: "Shounen",      value: "Shounen" },
        { name: "Slice of Life",value: "Slice+of+Life" },
        { name: "Sports",       value: "Sports" },
        { name: "Supernatural", value: "Supernatural" },
        { name: "Thriller",     value: "Thriller" },
        { name: "Tragedy",      value: "Tragedy" },
        { name: "Yaoi",         value: "Yaoi" },
      ],
    },
  ];
}