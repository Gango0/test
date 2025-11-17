const mangayomiSources = [{
    "name": "Anymex Special #3",
    "lang": "en",
    "baseUrl": "https://www.cineby.app/",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/RyanYuuki/AnymeX/main/assets/images/logo.png",
    "typeSource": "multi",
    "itemType": 1,
    "version": "0.0.3",
    "pkgPath": "anymex_special_3.js"
}];

class DefaultExtension extends MProvider {

    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders() {
        return {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'DNT': '1',
            'Host': 'api.videasy.net',
            'Priority': 'u=0, i',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Sec-GPC': '1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0'
        };
    }


    async getPopular(page) {
        throw new Error("getPopular not implemented");
    }
    get supportsLatest() {
        throw new Error("supportsLatest not implemented");
    }
    async getLatestUpdates(page) {
        throw new Error("getLatestUpdates not implemented");
    }

    async search(query, page) {
        try {
            const url = 'https://api.videasy.net/hianime/search?keyword=' + encodeURIComponent(query);
            const resp = await this.client.get(url);
            const json = JSON.parse(resp.body);

            var animeList = [];
            for (const anime of json) {
                console.log(anime);
                animeList.push({
                    link: anime.id,
                    name: anime.title,
                    imageUrl: anime.poster,
                    description: 'Empty',
                });
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
        const newUrl = 'https://api.videasy.net/hianime/sources-with-id?providerId=' + url;
        const resp = await this.client.get(newUrl);
        const json = JSON.parse(resp.body);

        var chapters = [];
        for (const ep of json.details.episodes) {
            const idUrl = `https://api.videasy.net/hianime/sources-with-id?providerId=${url}&episodeId=${ep.episode}`;
            chapters.push({
                name: ep.title,
                url: idUrl,
            });
        }

        return {
            link: url,
            name: json.details.title,
            imageUrl: json.details.thumbnail,
            description: json.details.description,
            chapters: chapters.reverse(),
        };
    }
    // For novel html content
    async getHtmlContent(url) {
        throw new Error("getHtmlContent not implemented");
    }
    // Clean html up for reader
    async cleanHtmlContent(html) {
        throw new Error("cleanHtmlContent not implemented");
    }
    // For anime episode video list
    async getVideoList(url) {
        const [subResp, dubResp] = await Promise.all([
            this.client.get(url + '&dub=false'),
            this.client.get(url + '&dub=true')
        ]);

        const subData = JSON.parse(subResp.body);
        const dubData = JSON.parse(dubResp.body);

        var videoList = [];

        for (const video of subData.mediaSources.sources) {
            videoList.push({
                url: video.url,
                quality: `${video.quality} - Sub`,
                originalUrl: video.url,
                subtitles: subData.mediaSources.subtitles.map((e) => ({
                    label: e.language,
                    file: e.url
                })),
                headers: {
                    'Referer': 'https://www.cineby.app/',
                    'Origin': 'https://www.cineby.app'
                }
            });
        }

        for (const video of dubData.mediaSources.sources) {
            videoList.push({
                url: video.url,
                quality: `${video.quality} - Dub`,
                originalUrl: video.url,
                subtitles: dubData.mediaSources.subtitles.map((e) => ({
                    label: e.language,
                    file: e.url
                })),
                headers: {
                    'Referer': 'https://www.cineby.app/',
                    'Origin': 'https://www.cineby.app'
                }
            });
        }

        return videoList;
    }
    // For manga chapter pages
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