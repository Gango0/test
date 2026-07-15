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
            'discontinued': 2,
            'canceled': 3,
            'cancelled': 3,
            'pending': 5,
        }[(text ?? "").toLowerCase().trim()] ?? 5;
    }

    idFromLink(link) {
        if (!link) return "";
        const match = link.match(/\/title\/([^/?#]+)/);
        return match ? match[1] : link;
    }

    mapListItem(item) {
        const id = item.id ?? this.idFromLink(item.link);
        const link = item.link
            ? (item.link.startsWith("http") ? item.link : `https://comix.to${item.link}`)
            : `https://comix.to/title/${id}`;

        return {
            name: item.title ?? item.name ?? "",
            link,
            imageUrl: item.img ?? item.image ?? item.poster ?? item.cover ?? "",
        };
    }

    async getPopular(page) {
        const res = await this.client.get(`${this.source.baseUrl}/api/manga/home`);
        const data = JSON.parse(res.body);
        const list = (data.popular ?? []).map(item => this.mapListItem(item));
        return { list, hasNextPage: false };
    }

    async getLatestUpdates(page) {
        const res = await this.client.get(`${this.source.baseUrl}/api/manga/home`);
        const data = JSON.parse(res.body);
        const list = (data.latest ?? []).map(item => this.mapListItem(item));
        return { list, hasNextPage: false };
    }

    async search(query, page, filters) {
        const trimmed = query?.trim() ?? "";
        const res = await this.client.get(
            `${this.source.baseUrl}/api/manga/search?q=${encodeURIComponent(trimmed)}`
        );
        const data = JSON.parse(res.body);
        const results = data.results ?? data.data ?? data.list ?? [];
        const list = results.map(item => this.mapListItem(item));

        return { list, hasNextPage: false };
    }

    async getDetail(url) {
        if (!url || typeof url !== "string") {
            throw new Error("Invalid URL passed to getDetail: " + url);
        }
        const id = this.idFromLink(url);

        const res = await this.client.get(`${this.source.baseUrl}/api/manga/${id}`);
        const data = JSON.parse(res.body);

        const name = data.title ?? data.name ?? "";

        const imageUrl = data.img ?? data.image ?? data.poster ?? data.cover ?? "";

        const description = data.description ?? data.synopsis ?? data.summary ?? "";

        const authorRaw = data.author ?? data.authors ?? [];
        const author = Array.isArray(authorRaw) ? authorRaw.join(", ") : (authorRaw ?? "");

        const status = this.parseStatus(data.status ?? "");

        const genre = Array.isArray(data.genres)
            ? data.genres.map(g => (typeof g === "string" ? g : (g.name ?? ""))).filter(Boolean)
            : [];

        const rawChapters = data.chapters ?? data.chapterList ?? [];
        const chapters = rawChapters.map(item => {
            const chapterId = item.id ?? item.hid ?? item.chapterId ?? item.chapter_id ?? "";
            const chapName = item.title ?? item.name ?? item.chapter ?? `Chapter ${item.chap ?? ""}`;

            let dateUpload = null;
            const rawDate = item.updated_at ?? item.date ?? item.createdAt ?? null;
            if (rawDate) {
                const ts = new Date(rawDate).getTime();
                if (!isNaN(ts)) dateUpload = ts.toString();
            }

            return {
                name: chapName,
                url: `${this.source.baseUrl}/api/manga/read?chapterId=${chapterId}`,
                dateUpload,
            };
        });

        return { name, imageUrl, description, author, status, genre, chapters };
    }

    async getPageList(url) {
        const res = await this.client.get(url);
        const data = JSON.parse(res.body);
        const images = data.images ?? [];

        return images.map(img => {
            const src = typeof img === "string" ? img : (img.url ?? img.src ?? "");
            return { url: src };
        });
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        throw new Error("getSourcePreferences not implemented");
    }
}