
import { MediaClient } from './MediaClient';
import { EmbyItem, EmbyLibrary, FeedType, ServerConfig, VideoResponse } from '../types';

export class PlexClient extends MediaClient {
    
    private getCleanUrl() {
        return this.config.url.replace(/\/$/, "");
    }

    private getHeaders() {
        return {
            'Accept': 'application/json',
            'X-Plex-Token': this.config.token
        };
    }

    async authenticate(username: string, password: string): Promise<ServerConfig> {
        const token = password; 
        
        const response = await fetch(`${this.getCleanUrl()}/identity`, {
            headers: { 'Accept': 'application/json', 'X-Plex-Token': token }
        });

        if (!response.ok) {
            throw new Error('Plex Connection Failed. Please ensure you are using a valid X-Plex-Token as the password.');
        }

        const data = await response.json();
        
        return {
            url: this.config.url,
            username: username || 'Plex User',
            userId: '1', 
            token: token,
            serverType: 'plex'
        };
    }

    async getLibraries(): Promise<EmbyLibrary[]> {
        const response = await fetch(`${this.getCleanUrl()}/library/sections`, { headers: this.getHeaders() });
        if (!response.ok) throw new Error('Failed to fetch Plex libraries');
        const data = await response.json();
        
        return data.MediaContainer.Directory.map((d: any) => ({
            Id: d.key,
            Name: d.title,
            CollectionType: d.type
        }));
    }

    async getVerticalVideos(parentId: string | undefined, libraryName: string, feedType: FeedType, skip: number, limit: number): Promise<VideoResponse> {
        if (!parentId) {
            return { items: [], nextStartIndex: 0, totalCount: 0 };
        }

        const start = skip;
        const size = feedType === 'random' ? 80 : 50; 
        
        let sort = 'addedAt:desc';
        if (feedType === 'random') sort = 'random';
        
        const params = new URLSearchParams({
            type: '1', 
            sort: sort,
            'X-Plex-Container-Start': start.toString(),
            'X-Plex-Container-Size': size.toString()
        });

        const response = await fetch(`${this.getCleanUrl()}/library/sections/${parentId}/all?${params.toString()}`, {
            headers: this.getHeaders()
        });

        if (!response.ok) throw new Error('Failed to fetch Plex videos');
        const data = await response.json();
        const items = data.MediaContainer.Metadata || [];
        const totalSize = data.MediaContainer.totalSize || 0;

        const mappedItems: EmbyItem[] = items.map((p: any) => {
             const media = p.Media?.[0];
             return {
                 Id: p.ratingKey,
                 Name: p.title,
                 Type: p.type,
                 MediaType: 'Video',
                 Overview: p.summary,
                 ProductionYear: p.year,
                 Width: media?.width,
                 Height: media?.height,
                 RunTimeTicks: p.duration ? p.duration * 10000 : undefined, 
                 ImageTags: {
                     Primary: p.thumb ? 'true' : undefined 
                 },
                 _PlexThumb: p.thumb,
                 _PlexKey: media?.Part?.[0]?.key
             };
        });

        const filtered = mappedItems.filter(item => {
            const w = item.Width || 0;
            const h = item.Height || 0;
            return h >= w * 0.8 && w > 0;
        });

        return {
            items: filtered,
            nextStartIndex: start + items.length, 
            totalCount: totalSize
        };
    }

    getVideoUrl(item: EmbyItem): string {
        // Fix for Android/PC: Prioritize Direct Play if Part Key exists.
        // This links directly to the .mp4 file instead of HLS stream.
        const plexItem = item as any;
        if (plexItem._PlexKey) {
            return `${this.getCleanUrl()}${plexItem._PlexKey}?X-Plex-Token=${this.config.token}`;
        }

        // Fallback to Transcode Universal (HLS)
        return `${this.getCleanUrl()}/video/:/transcode/universal/start?path=${encodeURIComponent('/library/metadata/' + item.Id)}&mediaIndex=0&partIndex=0&protocol=hls&offset=0&fastSeek=1&directPlay=0&directStream=1&subtitleSize=100&audioBoost=100&X-Plex-Token=${this.config.token}`;
    }

    getImageUrl(itemId: string, tag?: string, type?: 'Primary' | 'Backdrop'): string {
        const cleanUrl = this.getCleanUrl();
        const urlParam = `/library/metadata/${itemId}/thumb`; 
        return `${cleanUrl}/photo/:/transcode?url=${encodeURIComponent(urlParam)}&width=800&height=1200&X-Plex-Token=${this.config.token}`;
    }

    async getFavorites(libraryName: string): Promise<Set<string>> {
        return new Set();
    }

    async toggleFavorite(itemId: string, isFavorite: boolean, libraryName: string): Promise<void> {
        console.warn("Favorites not yet supported for Plex");
    }
}
