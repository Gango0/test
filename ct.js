const mangayomiSources = [{
    "name": "Comix",
    "lang": "en",
    "baseUrl": "https://comix.to",
    "apiUrl": "",
    "iconUrl": "https://comix.to/favicon.ico",
    "typeSource": "single",
    "isManga": true,
    "version": "0.0.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "manga/src/en/comix.js"
}];

const WRAPPER_BASE = "https://comix-api.vercel.app";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    parseStatus(text) {
        return {
            'releasing': 0,
            'ongoing': 0,
            'completed': 1,
            'complete': 1,
            'hiatus': 2,
            'on_hiatus': 2,
            'discontinued': 2,
            'canceled': 3,
            'cancelled': 3,
        }[(text ?? "").toLowerCase().trim()] ?? 5;
    }

    unwrap(json) {
        return json && json.result !== undefined ? json.result : json;
    }

    unwrapList(json) {
        const data = this.unwrap(json);
        if (Array.isArray(data)) return { items: data, meta: null };
        return {
            items: data.items ?? data.list ?? data.data ?? [],
            meta: data.meta ?? null,
        };
    }

    hasNextFromMeta(meta) {
        if (!meta) return false;
        if (typeof meta.hasNext === "boolean") return meta.hasNext;
        if (meta.page != null && meta.lastPage != null) return meta.page < meta.lastPage;
        return false;
    }

    idFromLink(link) {
        if (!link) return "";
        const match = link.match(/\/title\/([^/?#]+)/);
        return match ? match[1] : link.replace(/^\/+/, "");
    }

    mapCatalogItem(item) {
        const slug = item.url ? this.idFromLink(item.url)
            : (item.hid ?? (typeof item.id === "string" ? item.id : ""));

        const imageUrl = item.poster?.large ?? item.poster?.medium
            ?? item.img ?? item.image ?? item.cover ?? "";

        return {
            name: item.title ?? item.name ?? "",
            link: `${WRAPPER_BASE}/api/manga/${slug}`,
            imageUrl,
        };
    }

    async fetchMangaList(params, page) {
        const query = [...params, `page=${page}`, `limit=20`].join("&");
        const res = await this.client.get(`${this.source.baseUrl}/api/v1/manga?${query}`);
        const { items, meta } = this.unwrapList(JSON.parse(res.body));

        return {
            list: items.map(item => this.mapCatalogItem(item)),
            hasNextPage: this.hasNextFromMeta(meta),
        };
    }

    async getPopular(page) {
        return await this.fetchMangaList(
            ["content_rating[]=safe", "content_rating[]=suggestive"], page
        );
    }

    async getLatestUpdates(page) {
        return await this.fetchMangaList(
            ["content_rating[]=safe", "content_rating[]=suggestive"], page
        );
    }

    async search(query, page, filters) {
        const trimmed = query?.trim() ?? "";
        const params = [];

        if (trimmed) params.push(`keyword=${encodeURIComponent(trimmed)}`);

        let contentRatingSet = false;
        if (filters?.length > 0) {
            const get = (i) => filters[i]?.values?.[filters[i]?.state]?.value ?? "";
            const status = get(0); if (status) params.push(`status=${encodeURIComponent(status)}`);
            const type = get(1); if (type) params.push(`type[]=${encodeURIComponent(type)}`);
            const contentRating = get(2);
            if (contentRating) { params.push(`content_rating[]=${encodeURIComponent(contentRating)}`); contentRatingSet = true; }
            const genre = get(3); if (genre) params.push(`genres[]=${encodeURIComponent(genre)}`);
        }
        if (!contentRatingSet) {
            params.push("content_rating[]=safe");
            params.push("content_rating[]=suggestive");
        }

        return await this.fetchMangaList(params, page);
    }

    async fetchAllChapters(slug) {
        const chapters = [];
        let page = 1;
        const limit = 100;

        while (page <= 200) {
            const res = await this.client.get(
                `${WRAPPER_BASE}/api/manga/${slug}/chapters?page=${page}&limit=${limit}`
            );
            const { items, meta } = this.unwrapList(JSON.parse(res.body));

            for (const item of items) {
                const chapterId = item.id ?? item.chapterId ?? item.chapter_id ?? "";
                if (!chapterId) continue;

                const chapNum = item.chap ?? item.chapter ?? item.number ?? "";
                const chapName = item.title ?? item.name ?? (chapNum !== "" ? `Chapter ${chapNum}` : "Chapter");

                let dateUpload = null;
                const rawDate = item.created_at ?? item.createdAt ?? item.updated_at ?? item.updatedAt ?? null;
                if (rawDate) {
                    const ts = new Date(rawDate).getTime();
                    if (!isNaN(ts)) dateUpload = ts.toString();
                }

                chapters.push({
                    name: chapName,
                    url: `${WRAPPER_BASE}/api/manga/read?chapterId=${chapterId}`,
                    dateUpload,
                });
            }

            if (!this.hasNextFromMeta(meta) || items.length === 0) break;
            page += 1;
        }

        return chapters;
    }

    async getDetail(url) {
        if (!url || typeof url !== "string") {
            throw new Error("Invalid URL passed to getDetail: " + url);
        }
        const slug = url.substring(url.lastIndexOf("/") + 1);

        const res = await this.client.get(url);
        const data = this.unwrap(JSON.parse(res.body));

        const name = data.title ?? data.name ?? "";

        const imageUrl = data.poster?.large ?? data.poster?.medium
            ?? data.img ?? data.image ?? data.cover ?? "";

        const description = data.description ?? data.synopsis ?? data.summary ?? "";

        const authorsRaw = data.authors ?? data.author ?? [];
        const artistsRaw = data.artists ?? data.artist ?? [];
        const authorList = [
            ...(Array.isArray(authorsRaw) ? authorsRaw : [authorsRaw]),
            ...(Array.isArray(artistsRaw) ? artistsRaw : [artistsRaw]),
        ].map(a => (typeof a === "string" ? a : (a?.name ?? ""))).filter(Boolean);
        const author = [...new Set(authorList)].join(", ");

        const status = this.parseStatus(data.status ?? "");

        const genreSource = data.genres ?? data.themes ?? [];
        const genre = [...new Set(
            genreSource.map(g => (typeof g === "string" ? g : (g?.name ?? ""))).filter(Boolean)
        )];

        const chapters = await this.fetchAllChapters(slug);

        return { name, imageUrl, description, author, status, genre, chapters };
    }

    async getPageList(url) {
        const res = await this.client.get(url);
        const data = this.unwrap(JSON.parse(res.body));
        const images = data.images ?? [];

        return images.map(img => ({
            url: typeof img === "string" ? img : (img.url ?? img.src ?? ""),
        }));
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Releasing", value: "releasing" },
                    { type_name: "SelectOption", name: "Completed", value: "completed" },
                    { type_name: "SelectOption", name: "Hiatus", value: "hiatus" },
                ],
            },
            {
                type_name: "SelectFilter",
                name: "Type",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Manga", value: "manga" },
                    { type_name: "SelectOption", name: "Manhwa", value: "manhwa" },
                    { type_name: "SelectOption", name: "Manhua", value: "manhua" },
                    { type_name: "SelectOption", name: "Webtoon", value: "webtoon" },
                ],
            },
            {
                type_name: "SelectFilter",
                name: "Content Rating",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Safe", value: "safe" },
                    { type_name: "SelectOption", name: "Suggestive", value: "suggestive" },
                    { type_name: "SelectOption", name: "Erotica", value: "erotica" },
                    { type_name: "SelectOption", name: "Pornographic", value: "pornographic" },
                ],
            },
            {
                type_name: "SelectFilter",
                name: "Genre",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Action", value: "action" },
                    { type_name: "SelectOption", name: "Adventure", value: "adventure" },
                    { type_name: "SelectOption", name: "Comedy", value: "comedy" },
                    { type_name: "SelectOption", name: "Drama", value: "drama" },
                    { type_name: "SelectOption", name: "Fantasy", value: "fantasy" },
                    { type_name: "SelectOption", name: "Horror", value: "horror" },
                    { type_name: "SelectOption", name: "Isekai", value: "isekai" },
                    { type_name: "SelectOption", name: "Mystery", value: "mystery" },
                    { type_name: "SelectOption", name: "Romance", value: "romance" },
                    { type_name: "SelectOption", name: "Sci-Fi", value: "sci-fi" },
                    { type_name: "SelectOption", name: "Slice of Life", value: "slice-of-life" },
                    { type_name: "SelectOption", name: "Supernatural", value: "supernatural" },
                    { type_name: "SelectOption", name: "Tragedy", value: "tragedy" },
                ],
            },
        ];
    }

    getSourcePreferences() {
        throw new Error("getSourcePreferences not implemented");
    }
}