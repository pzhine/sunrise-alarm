/**
 * Result from Freesound API search
 */
export interface FreesoundSearchResult {
    id: number;
    name: string;
    tags: string[];
    username: string;
    license: string;
    previews: {
        'preview-hq-mp3': string;
        'preview-lq-mp3': string;
        'preview-hq-ogg': string;
        'preview-lq-ogg': string;
    };
    geotag?: string;
    duration: number;
}
/**
 * Response from Freesound API search
 */
export interface FreesoundSearchResponse {
    count: number;
    results: FreesoundSearchResult[];
    next: string | null;
    previous: string | null;
}
/**
 * Structure for cached search data
 */
export interface CachedSearchData {
    timestamp: number;
    response: FreesoundSearchResponse;
    countrySounds: Record<string, FreesoundSearchResult[]>;
}
/**
 * Structure for sound data to be stored in app state
 */
export interface AlarmSound {
    id: number;
    name: string;
    previewUrl: string;
    duration?: number;
}
