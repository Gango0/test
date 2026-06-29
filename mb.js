const mangayomiSources = [{
    "name": "MangaBuddy",
    "lang": "en",
    "baseUrl": "https://mangabuddy1.co.uk",
    "apiUrl": "",
    "iconUrl": "https://mangabuddy1.co.uk/assets/mangabuddy1couk/images/logo/mangabuddy.png",
    "typeSource": "single",
    "isManga": true,
    "version": "0.0.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "manga/src/en/mangabuddy.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    parseStatus(text) {
        return {
            'ongoing': 0,
            'completed': 1,
            'complete': 1,
            'hiatus': 2,
            'on_hiatus': 2,
            'canceled': 3,
            'cancelled': 3,
            'pending': 5,
        }[text.toLowerCase().trim()] ?? 5;
    }

    // Parse the series grid used by /series and /latest-updates.
    // Returns { list, hasNextPage }.
    parseSeriesList(res) {
        const doc = new Document(res.body);
        const list = [];
        const seen = new Set();

        // Every card is an <a> pointing to /series/{slug}.{ID}
        // We only want the "root" series link, not chapter sub-links.
        const links = doc.select("a[href*='/series/']");
        for (const a of links) {
            const href = a.attr("href") ?? "";
            // Must end with the dotted ID (e.g. .ZDNLGQ) and have NO /chapter- after it
            if (!href.match(/\/series\/[^/]+\.[A-Za-z0-9_-]+$/) ) continue;
            const url = href.startsWith("http") ? href : "https://mangabuddy1.co.uk" + href;
            if (seen.has(url)) continue;
            seen.add(url);

            // Title: prefer the <h2> or <h3> inside the card; fallback to alt/title attr
            let name = "";
            const h = a.selectFirst("h2, h3");
            if (h) name = h.text.trim();
            if (!name) name = (a.attr("title") ?? "").trim();
            if (!name) name = a.text.trim();
            if (!name) continue;

            // Cover: img inside the card
            let imageUrl = "";
            const img = a.selectFirst("img");
            if (img) imageUrl = img.attr("src") ?? img.attr("data-src") ?? "";

            list.push({ url, name, imageUrl });
        }

        // Next-page cursor link: "Next" link in the pagination row
        const nextLink = doc.selectFirst("a[href*='cursor=']");
        const hasNextPage = !!nextLink && list.length > 0;

        return { list, hasNextPage };
    }

    async getPopular(page) {
        // /series uses cursor-based pagination; page 1 has no cursor.
        // We store the cursor in a simple way: page=1 → no cursor, otherwise
        // we cannot fetch arbitrary pages without knowing the cursor chain.
        // For now we always fetch page 1 (browse entry point) — the app will
        // follow hasNextPage by calling with increasing page values, but we
        // can only provide page 1 reliably without cursor persistence.
        const res = await this.client.get(`${this.source.baseUrl}/series`);
        return this.parseSeriesList(res);
    }

    async getLatestUpdates(page) {
        const res = await this.client.get(`${this.source.baseUrl}/latest-updates`);
        return this.parseSeriesList(res);
    }

    async search(query, page, filters) {
        let url = `${this.source.baseUrl}/series`;
        const params = [];

        if (query && query.trim() !== "") {
            params.push(`q=${encodeURIComponent(query.trim())}`);
        }

        if (filters && filters.length > 0) {
            const status = filters[0]?.values?.[filters[0]?.state]?.value ?? "";
            const type   = filters[1]?.values?.[filters[1]?.state]?.value ?? "";
            const genre  = filters[2]?.values?.[filters[2]?.state]?.value ?? "";
            if (status) params.push(`status=${encodeURIComponent(status)}`);
            if (type)   params.push(`type=${encodeURIComponent(type)}`);
            if (genre)  params.push(`genre=${encodeURIComponent(genre)}`);
        }

        if (params.length > 0) url += "?" + params.join("&");

        const res = await this.client.get(url);
        return this.parseSeriesList(res);
    }

    async getDetail(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);

        // Title: first <h1>
        const title = (doc.selectFirst("h1")?.text ?? "").trim();

        // Cover: the CDN thumb URL is predictable from the slug
        // It also appears in the og:image meta or directly in an <img>
        let imageUrl = (doc.selectFirst("meta[property='og:image']")?.attr("content") ?? "").trim();
        // og:image on the detail page points to the CDN thumb — perfect
        if (!imageUrl) {
            const img = doc.selectFirst("img[src*='love4awalk.xyz/thumb']");
            imageUrl = img?.attr("src") ?? "";
        }

        // Description: the "Summary" paragraph that comes after the genre links
        let description = "";
        const paras = doc.select("p");
        for (const p of paras) {
            const t = p.text.trim();
            if (t.length > 40) { description = t; break; }
        }

        // Author: links to /author/
        const authorLinks = doc.select("a[href*='/author/']");
        const authors = [...new Set(
            authorLinks.map(a => a.text.trim()).filter(t => t && t !== "Updating")
        )];
        const author = authors.join(", ");

        // Status: link to ?status=
        const statusLink = doc.selectFirst("a[href*='?status=']");
        const status = this.parseStatus(statusLink?.text ?? "");

        // Genres: links to /genre/
        const genreLinks = doc.select("a[href*='/genre/']");
        const genre = [...new Set(genreLinks.map(a => a.text.trim()).filter(Boolean))];

        // Chapters: every link containing /chapter- that belongs to this series
        const chapLinks = doc.select(`a[href*='${url.replace("https://mangabuddy1.co.uk", "")}/chapter-']`);
        const chapters = [];
        const seenChap = new Set();

        for (const a of chapLinks) {
            const href = a.attr("href") ?? "";
            if (!href.match(/\/chapter-[\d.]+$/)) continue;
            const chapUrl = href.startsWith("http") ? href : "https://mangabuddy1.co.uk" + href;
            if (seenChap.has(chapUrl)) continue;
            seenChap.add(chapUrl);

            // Name: the link text often duplicates itself ("Chapter 448 Chapter 448")
            // Take only the first occurrence by splitting on repeated text
            let name = a.text.trim().replace(/\s+/g, " ");
            // Deduplicate "Chapter N Chapter N" → "Chapter N"
            name = name.replace(/^(.+?)\s+\1$/, "$1");
            if (!name) {
                const m = href.match(/chapter-([\d.]+)$/);
                name = m ? `Chapter ${m[1]}` : href;
            }

            chapters.push({ name, url: chapUrl });
        }

        return { name: title, imageUrl, description, author, status, genre, chapters };
    }

    async getPageList(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);

        // All <img> on the CDN that are NOT the discord banner or the cover thumb
        const imgs = doc.select("img[src*='love4awalk.xyz']");
        const pages = [];
        const seen = new Set();

        for (const img of imgs) {
            const src = img.attr("src") ?? "";
            if (!src) continue;
            if (src.includes("/thumb/")) continue;   // cover, not a page
            if (src.includes("discord")) continue;
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
                    { type_name: "SelectOption", name: "All",        value: "" },
                    { type_name: "SelectOption", name: "Ongoing",    value: "Ongoing" },
                    { type_name: "SelectOption", name: "Completed",  value: "Completed" },
                    { type_name: "SelectOption", name: "Pending",    value: "Pending" },
                    { type_name: "SelectOption", name: "Hiatus",     value: "Hiatus" },
                    { type_name: "SelectOption", name: "On Hiatus",  value: "On_hiatus" },
                ],
            },
            {
                type_name: "SelectFilter",
                name: "Type",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All",       value: "" },
                    { type_name: "SelectOption", name: "Manga",     value: "Manga" },
                    { type_name: "SelectOption", name: "Manhwa",    value: "Manhwa" },
                    { type_name: "SelectOption", name: "Manhua",    value: "Manhua" },
                    { type_name: "SelectOption", name: "Webtoon",   value: "Webtoon" },
                    { type_name: "SelectOption", name: "Doujinshi", value: "Doujinshi" },
                    { type_name: "SelectOption", name: "One-shot",  value: "One-shot" },
                    { type_name: "SelectOption", name: "Novel",     value: "Novel" },
                ],
            },
            {
                type_name: "SelectFilter",
                name: "Genre",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All",           value: "" },
                    { type_name: "SelectOption", name: "Action",        value: "Action" },
                    { type_name: "SelectOption", name: "Adventure",     value: "Adventure" },
                    { type_name: "SelectOption", name: "Boys Love",     value: "Boys+Love" },
                    { type_name: "SelectOption", name: "Comedy",        value: "Comedy" },
                    { type_name: "SelectOption", name: "Drama",         value: "Drama" },
                    { type_name: "SelectOption", name: "Ecchi",         value: "Ecchi" },
                    { type_name: "SelectOption", name: "Fantasy",       value: "Fantasy" },
                    { type_name: "SelectOption", name: "Full Color",    value: "Full+Color" },
                    { type_name: "SelectOption", name: "Girls Love",    value: "Girls+Love" },
                    { type_name: "SelectOption", name: "Harem",         value: "Harem" },
                    { type_name: "SelectOption", name: "Historical",    value: "Historical" },
                    { type_name: "SelectOption", name: "Horror",        value: "Horror" },
                    { type_name: "SelectOption", name: "Isekai",        value: "Isekai" },
                    { type_name: "SelectOption", name: "Josei",         value: "Josei" },
                    { type_name: "SelectOption", name: "Magic",         value: "Magic" },
                    { type_name: "SelectOption", name: "Martial Arts",  value: "Martial+Arts" },
                    { type_name: "SelectOption", name: "Mature",        value: "Mature" },
                    { type_name: "SelectOption", name: "Mystery",       value: "Mystery" },
                    { type_name: "SelectOption", name: "Psychological", value: "Psychological" },
                    { type_name: "SelectOption", name: "Romance",       value: "Romance" },
                    { type_name: "SelectOption", name: "School Life",   value: "School+life" },
                    { type_name: "SelectOption", name: "Sci-Fi",        value: "Sci-Fi" },
                    { type_name: "SelectOption", name: "Seinen",        value: "Seinen" },
                    { type_name: "SelectOption", name: "Shoujo",        value: "Shoujo" },
                    { type_name: "SelectOption", name: "Shounen",       value: "Shounen" },
                    { type_name: "SelectOption", name: "Slice of Life", value: "Slice+of+Life" },
                    { type_name: "SelectOption", name: "Sports",        value: "Sports" },
                    { type_name: "SelectOption", name: "Supernatural",  value: "Supernatural" },
                    { type_name: "SelectOption", name: "Thriller",      value: "Thriller" },
                    { type_name: "SelectOption", name: "Tragedy",       value: "Tragedy" },
                    { type_name: "SelectOption", name: "Yaoi",          value: "Yaoi" },
                ],
            },
        ];
    }

    getSourcePreferences() {
        throw new Error("getSourcePreferences not implemented");
    }
}