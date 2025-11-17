const mangayomiSources = [{
    "name": "AnimeWorld",
    "lang": "it",
    "baseUrl": "https://animeworld.ac/",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/cranci1/Ryu/d48d716ec6c5ef9ae7b3711c117f920b0c7eb1ce/Ryu/Assets.xcassets/Sources/AnimeWorld.imageset/animeworld.png",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.4",
    "pkgPath": "animeworld.js"
}];

class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://animeworld.ac";
    }

    getHeaders() {
        return {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
            'Connection': 'keep-alive',
            'DNT': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
    }

    async getPopular(page) {
        throw new Error("getPopular not implemented");
    }

    get supportsLatest() {
        return false;
    }

    async getLatestUpdates(page) {
        throw new Error("getLatestUpdates not implemented");
    }

    async search(query, page) {
        try {
            const url = `${this.baseUrl}/search?keyword=${encodeURIComponent(query)}`;
            const resp = await this.client.get(url, { headers: this.getHeaders() });
            const html = resp.body;

            const filmListRegex = /<div class="film-list">([\s\S]*?)<div class="clearfix"><\/div>\s*<\/div>/;
            const filmListMatch = html.match(filmListRegex);

            if (!filmListMatch) {
                return { list: [], hasNextPage: false };
            }

            const filmListContent = filmListMatch[1];
            const itemRegex = /<div class="item">[\s\S]*?<\/div>[\s]*<\/div>/g;
            const items = filmListContent.match(itemRegex) || [];

            const animeList = [];

            for (const itemHtml of items) {
                const imgMatch = itemHtml.match(/src="([^"]+)"/);
                let imageUrl = imgMatch ? imgMatch[1] : "";

                const titleMatch = itemHtml.match(/class="name">([^<]+)</);
                const title = titleMatch ? titleMatch[1].trim() : "";

                const hrefMatch = itemHtml.match(/href="([^"]+)"/);
                let href = hrefMatch ? hrefMatch[1] : "";

                if (imageUrl && title && href) {
                    if (!imageUrl.startsWith("https")) {
                        imageUrl = imageUrl.startsWith("/") ? this.baseUrl + imageUrl : this.baseUrl + "/" + imageUrl;
                    }
                    if (!href.startsWith("https")) {
                        href = href.startsWith("/") ? this.baseUrl + href : this.baseUrl + "/" + href;
                    }

                    animeList.push({
                        link: href,
                        name: title,
                        imageUrl: imageUrl,
                        description: ''
                    });
                }
            }

            return {
                list: animeList,
                hasNextPage: false
            };
        } catch (error) {
            throw error;
        }
    }

    async getDetail(url) {
        try {
            const resp = await this.client.get(url, { headers: this.getHeaders() });
            const html = resp.body;

            const descriptionMatch = html.match(/<div class="desc">([\s\S]*?)<\/div>/);
            const description = descriptionMatch ? descriptionMatch[1].trim() : "";

            const aliasesMatch = html.match(/<h2 class="title" data-jtitle="([^"]+)">/);
            const aliases = aliasesMatch ? aliasesMatch[1] : "";

            const titleMatch = html.match(/<h2 class="title"[^>]*>([^<]+)</);
            const title = titleMatch ? titleMatch[1].trim() : "";

            const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]+class="cover"/);
            let imageUrl = imgMatch ? imgMatch[1] : "";
            if (imageUrl && !imageUrl.startsWith("https")) {
                imageUrl = imageUrl.startsWith("/") ? this.baseUrl + imageUrl : this.baseUrl + "/" + imageUrl;
            }

            // Extract episodes
            const serverActiveRegex = /<div class="server active"[^>]*>([\s\S]*?)<\/ul>\s*<\/div>/;
            const serverActiveMatch = html.match(serverActiveRegex);

            const chapters = [];
            if (serverActiveMatch) {
                const serverActiveContent = serverActiveMatch[1];
                const episodeRegex = /<li class="episode">\s*<a[^>]*?href="([^"]+)"[^>]*?>([^<]+)<\/a>/g;
                let match;

                while ((match = episodeRegex.exec(serverActiveContent)) !== null) {
                    let href = match[1];
                    const number = match[2].trim();

                    if (!href.startsWith("https")) {
                        href = href.startsWith("/") ? this.baseUrl + href : this.baseUrl + "/" + href;
                    }

                    chapters.push({
                        name: `Episodio ${number}`,
                        url: href
                    });
                }
            }

            return {
                link: url,
                name: title || aliases,
                imageUrl: imageUrl,
                description: description,
                chapters: chapters.reverse()
            };
        } catch (error) {
            throw error;
        }
    }

    async getHtmlContent(url) {
        throw new Error("getHtmlContent not implemented");
    }

    async cleanHtmlContent(html) {
        throw new Error("cleanHtmlContent not implemented");
    }

    async getVideoList(url) {
        try {
            const resp = await this.client.get(url, { headers: this.getHeaders() });
            const html = resp.body;

            const idRegex = /<a[^>]+href="([^"]+)"[^>]*id="alternativeDownloadLink"/;
            const match = html.match(idRegex);
            
            if (!match) {
                return [];
            }

            const streamUrl = match[1];

            return [{
                url: streamUrl,
                quality: "1080p",
                originalUrl: streamUrl,
                headers: {
                    'Referer': this.baseUrl + '/',
                    'Origin': this.baseUrl
                }
            }];
        } catch (error) {
            throw error;
        }
    }

    async getPageList(url) {
        throw new Error("getPageList not implemented");
    }

    getFilterList() {
        throw new Error("getFilterList not implemented");
    }

    getSourcePreferences() {
        throw new Error("getSourcePreferences not implemented");
    }
}