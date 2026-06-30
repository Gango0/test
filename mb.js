const mangayomiSources = [{
    "name": "MangaBuddy",
    "lang": "en",
    "baseUrl": "https://mangabuddy1.co.uk",
    "apiUrl": "",
    "iconUrl": "https://mangabuddy1.co.uk/assets/mangabuddy1couk/images/logo/mangabuddy.png",
    "typeSource": "single",
    "isManga": true,
    "version": "0.0.6",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "manga/src/en/mangabuddy.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this._cursors = {};
    }

    parseStatus(text) {
        return {
            'ongoing': 0,
            'completed': 1,
            'complete': 1,
            'hiatus': 2,
            'on_hiatus': 2,
            'discontinued': 2,
            'canceled': 3,
            'cancelled': 3,
            'pending': 5,
        }[(text ?? "").toLowerCase().trim()] ?? 5;
    }

    // Extract slug from a series URL:
    // "https://mangabuddy1.co.uk/series/the-demon-king-who-lost-his-job.ZDNLGQ"
    // → "the-demon-king-who-lost-his-job"
    slugFromUrl(url) {
        const match = url.match(/\/series\/([^/]+)\.[A-Za-z0-9_-]+$/);
        return match ? match[1] : "";
    }

    // ── series list pages ──────────────────────────────────────────────────────

    parseSeriesList(res) {
        const doc = new Document(res.body);
        const list = [];
        const seen = new Set();

        for (const a of doc.select("a[href*='/series/']")) {
            const href = a.attr("href") ?? "";
            // Prende solo /series/slug.ID senza /chapter-xxx
            if (!href.match(/\/series\/[^/]+\.[A-Za-z0-9_-]+$/)) continue;
            if (href.includes("/chapter-")) continue;

            const url = href.startsWith("http") ? href : `${this.source.baseUrl}${href}`;
            if (seen.has(url)) continue;
            seen.add(url);

            if (!url.startsWith("http")) continue;

            let name = (a.selectFirst("h2, h3")?.text ?? "").trim();
            if (!name) name = (a.attr("title") ?? a.text ?? "").trim();
            if (!name) continue;

            const img = a.selectFirst("img");
            const imageUrl = img?.attr("src") ?? img?.attr("data-src") ?? "";

            list.push({ link: url, name, imageUrl });
        }

        const nextLink = doc.selectFirst("a[href*='cursor=']");
        const cursorMatch = (nextLink?.attr("href") ?? "").match(/cursor=([^&]+)/);
        const nextCursor = cursorMatch ? cursorMatch[1] : "";

        return { list, hasNextPage: !!nextCursor && list.length > 0, nextCursor };
    }

    async fetchSeriesPage(baseParams, page) {
        const cacheKey = `${baseParams}:${page}`;
        let url = `${this.source.baseUrl}/series`;
        if (baseParams) url += `?${baseParams}`;

        if (page > 1) {
            const prevKey = `${baseParams}:${page - 1}`;
            let cursor = this._cursors[prevKey];

            if (!cursor) {
                let walkUrl = `${this.source.baseUrl}/series${baseParams ? `?${baseParams}` : ""}`;
                for (let i = 1; i < page; i++) {
                    const r = await this.client.get(walkUrl);
                    const p = this.parseSeriesList(r);
                    this._cursors[`${baseParams}:${i}`] = p.nextCursor;
                    if (!p.nextCursor) break;
                    const sep = baseParams ? "&" : "?";
                    walkUrl = `${this.source.baseUrl}/series${baseParams ? `?${baseParams}` : ""}${sep}cursor=${p.nextCursor}`;
                }
                cursor = this._cursors[prevKey] ?? "";
            }

            if (cursor) {
                const sep = baseParams ? "&" : "?";
                url += `${sep}cursor=${cursor}`;
            }
        }

        const res = await this.client.get(url);
        const parsed = this.parseSeriesList(res);
        this._cursors[cacheKey] = parsed.nextCursor;
        return parsed;
    }

    // ── public API ─────────────────────────────────────────────────────────────

    async getPopular(page) {
        console.log("baseUrl:", this.source.baseUrl);
        return await this.fetchSeriesPage("", page);
    }

    async getLatestUpdates(page) {
        const res = await this.client.get(`${this.source.baseUrl}/latest-updates`);
        return this.parseSeriesList(res);
    }

    async search(query, page, filters) {
        console.log("search raw query:", query);

        const trimmed = query?.trim() ?? "";
        const params = new URLSearchParams();

        if (trimmed) params.set("search", trimmed);
        params.set("per_page", "18");
        params.set("page", String(page));

        if (filters?.length > 0) {
            const get = (i) => filters[i]?.values?.[filters[i]?.state]?.value ?? "";
            const status = get(0); if (status) params.set("status", status);
            const type = get(1); if (type) params.set("type", type);
            const genre = get(2); if (genre) params.set("genres", genre);
        }

        const res = await this.client.get(`${this.source.baseUrl}/api/search?${params.toString()}`);
        const data = JSON.parse(res.body);
        const comics = data.comics ?? [];

        const list = comics.map(c => ({
            name: c.title ?? "",
            link: `${this.source.baseUrl}/series/${c.slug_hash}`,
            imageUrl: c.image ?? "",
        }));

        return {
            list,
            hasNextPage: data.pagination?.has_next_page ?? false,
        };
    }

    async getDetail(url) {
        console.log("getDetail called with url:", url);
        if (!url || typeof url !== "string" || !url.startsWith("http")) {
            throw new Error("Invalid URL passed to getDetail: " + url);
        }
        const res = await this.client.get(url);

        const doc = new Document(res.body);

        const name = (doc.selectFirst("h1")?.text ?? "").trim();

        let imageUrl = (doc.selectFirst("meta[property='og:image']")?.attr("content") ?? "").trim();
        if (!imageUrl) {
            imageUrl = doc.selectFirst("img[src*='love4awalk.xyz/thumb']")?.attr("src") ?? "";
        }

        let description = "";
        for (const p of doc.select("p")) {
            const t = p.text.trim();
            if (t.length > 40) { description = t; break; }
        }

        const skipAuthors = new Set(["Unknown", "Updating"]);
        const author = [...new Set(
            doc.select("a[href*='/author/']")
                .map(a => a.text.trim())
                .filter(t => t && !skipAuthors.has(t))
        )].join(", ");

        const status = this.parseStatus(doc.selectFirst("a[href*='?status=']")?.text ?? "");

        const genre = [...new Set(
            doc.select("a[href*='/genre/']").map(a => a.text.trim()).filter(Boolean)
        )];

        // Fetch ALL chapters from the dedicated JSON endpoint
        const slug = this.slugFromUrl(url);
        const chapters = [];

        if (slug) {
            try {
                const chapRes = await this.client.get(
                    `${this.source.baseUrl}/get-chapter-list?slug=${slug}`
                );

                // Response: { success: true, total: N, data: [ { chapter_name, chapter_slug, updated_at, ... } ] }
                const data = JSON.parse(chapRes.body);
                const items = data.data ?? [];

                for (const item of items) {
                    const chapSlug = item.chapter_slug ?? "";
                    if (!chapSlug) continue;

                    const chapUrl = `${url}/${chapSlug}`;
                    const chapName = item.chapter_name ?? chapSlug;

                    let dateUpload = null;
                    if (item.updated_at) {
                        const ts = new Date(item.updated_at).getTime();
                        if (!isNaN(ts)) dateUpload = ts.toString();
                    }

                    chapters.push({ name: chapName, url: chapUrl, dateUpload });
                }
            } catch (e) {
                // API failed — fall back to the ≤20 chapters visible in the HTML
                const seriesPath = url.replace(this.source.baseUrl, "");
                const seenChap = new Set();
                for (const a of doc.select(`a[href*='${seriesPath}/chapter-']`)) {
                    const href = a.attr("href") ?? "";
                    if (!href.match(/\/chapter-[\d.]+$/)) continue;
                    const chapUrl = href.startsWith("http") ? href : `${this.source.baseUrl}${href}`;
                    if (seenChap.has(chapUrl)) continue;
                    seenChap.add(chapUrl);
                    const raw = a.text.trim().replace(/\s+/g, " ");
                    const chapName = raw.replace(/^(Chapter [\d.]+)\s+\1.*$/, "$1");
                    chapters.push({ name: chapName, url: chapUrl });
                }
            }
        }

        return { name, imageUrl, description, author, status, genre, chapters };
    }

    async getPageList(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);

        const pages = [];
        const seen = new Set();

        for (const img of doc.select("img[src*='love4awalk.xyz']")) {
            const src = img.attr("src") ?? "";
            if (!src || src.includes("/thumb/") || src.includes("discord")) continue;
            if (seen.has(src)) continue;
            seen.add(src);
            pages.push({ url: src, headers: { "Referer": "https://cdn1.love4awalk.xyz/" } });
        }

        return pages;
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Ongoing", value: "Ongoing" },
                    { type_name: "SelectOption", name: "Completed", value: "Completed" },
                    { type_name: "SelectOption", name: "Pending", value: "Pending" },
                    { type_name: "SelectOption", name: "Hiatus", value: "Hiatus" },
                    { type_name: "SelectOption", name: "On Hiatus", value: "On_hiatus" },
                    { type_name: "SelectOption", name: "Discontinued", value: "Discontinued" },
                ],
            },
            {
                type_name: "SelectFilter",
                name: "Type",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Manga", value: "Manga" },
                    { type_name: "SelectOption", name: "Manhwa", value: "Manhwa" },
                    { type_name: "SelectOption", name: "Manhua", value: "Manhua" },
                    { type_name: "SelectOption", name: "Webtoon", value: "Webtoon" },
                    { type_name: "SelectOption", name: "Doujinshi", value: "Doujinshi" },
                    { type_name: "SelectOption", name: "One-shot", value: "One-shot" },
                    { type_name: "SelectOption", name: "Novel", value: "Novel" },
                ],
            },
            {
                type_name: "SelectFilter",
                name: "Genre",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Action", value: "Action" },
                    { type_name: "SelectOption", name: "Adventure", value: "Adventure" },
                    { type_name: "SelectOption", name: "Boys Love", value: "Boys+Love" },
                    { type_name: "SelectOption", name: "Comedy", value: "Comedy" },
                    { type_name: "SelectOption", name: "Drama", value: "Drama" },
                    { type_name: "SelectOption", name: "Ecchi", value: "Ecchi" },
                    { type_name: "SelectOption", name: "Fantasy", value: "Fantasy" },
                    { type_name: "SelectOption", name: "Full Color", value: "Full+Color" },
                    { type_name: "SelectOption", name: "Girls Love", value: "Girls+Love" },
                    { type_name: "SelectOption", name: "Harem", value: "Harem" },
                    { type_name: "SelectOption", name: "Historical", value: "Historical" },
                    { type_name: "SelectOption", name: "Horror", value: "Horror" },
                    { type_name: "SelectOption", name: "Isekai", value: "Isekai" },
                    { type_name: "SelectOption", name: "Josei", value: "Josei" },
                    { type_name: "SelectOption", name: "Magic", value: "Magic" },
                    { type_name: "SelectOption", name: "Martial Arts", value: "Martial+Arts" },
                    { type_name: "SelectOption", name: "Mature", value: "Mature" },
                    { type_name: "SelectOption", name: "Mystery", value: "Mystery" },
                    { type_name: "SelectOption", name: "Psychological", value: "Psychological" },
                    { type_name: "SelectOption", name: "Romance", value: "Romance" },
                    { type_name: "SelectOption", name: "School Life", value: "School+life" },
                    { type_name: "SelectOption", name: "Sci-Fi", value: "Sci-Fi" },
                    { type_name: "SelectOption", name: "Seinen", value: "Seinen" },
                    { type_name: "SelectOption", name: "Shoujo", value: "Shoujo" },
                    { type_name: "SelectOption", name: "Shounen", value: "Shounen" },
                    { type_name: "SelectOption", name: "Slice of Life", value: "Slice+of+Life" },
                    { type_name: "SelectOption", name: "Sports", value: "Sports" },
                    { type_name: "SelectOption", name: "Supernatural", value: "Supernatural" },
                    { type_name: "SelectOption", name: "Thriller", value: "Thriller" },
                    { type_name: "SelectOption", name: "Tragedy", value: "Tragedy" },
                    { type_name: "SelectOption", name: "Yaoi", value: "Yaoi" },
                ],
            },
        ];
    }

    getSourcePreferences() {
        throw new Error("getSourcePreferences not implemented");
    }
}