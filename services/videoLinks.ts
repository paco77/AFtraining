// ─── External video link helpers (YouTube, Instagram, TikTok, etc.) ─────────

export type VideoPlatform = 'YouTube' | 'Instagram' | 'TikTok' | 'Facebook' | 'Vimeo' | 'Enlace';

export interface VideoPlatformInfo {
    platform: VideoPlatform;
    color: string;
}

const DIRECT_MEDIA_REGEX = /\.(mp4|mov|m4v|webm|gif|jpe?g|png|webp)(\?|#|$)/i;

/** Normalizes user input: trims and prepends https:// when missing. */
export const normalizeVideoLink = (raw: string): string => {
    const value = raw.trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return `https://${value}`;
};

/** Returns true if the value looks like a valid web URL. */
export const isValidWebUrl = (raw: string): boolean => {
    const value = normalizeVideoLink(raw);
    return /^https?:\/\/[^\s/$.?#].[^\s]*\.[^\s]{2,}/i.test(value);
};

/**
 * True when the URL points to an external page (YouTube, Instagram, ...) rather
 * than a direct media file that can be rendered inline (mp4, gif, jpg...).
 */
export const isExternalVideoLink = (url?: string | null): boolean => {
    if (!url) return false;
    const value = url.trim();
    if (!/^https?:\/\//i.test(value)) return false;
    return !DIRECT_MEDIA_REGEX.test(value);
};

export const getVideoPlatform = (url: string): VideoPlatformInfo => {
    const u = url.toLowerCase();
    if (u.includes('youtube.com') || u.includes('youtu.be')) return { platform: 'YouTube', color: '#FF0033' };
    if (u.includes('instagram.com') || u.includes('instagr.am')) return { platform: 'Instagram', color: '#E1306C' };
    if (u.includes('tiktok.com')) return { platform: 'TikTok', color: '#25F4EE' };
    if (u.includes('facebook.com') || u.includes('fb.watch')) return { platform: 'Facebook', color: '#1877F2' };
    if (u.includes('vimeo.com')) return { platform: 'Vimeo', color: '#1AB7EA' };
    return { platform: 'Enlace', color: '#BFFF0A' };
};

export const getYouTubeId = (url: string): string | null => {
    const match = url.match(
        /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/i,
    );
    return match ? match[1] : null;
};

/** Thumbnail image for the link when the platform exposes one publicly. */
export const getVideoThumbnail = (url: string): string | null => {
    const ytId = getYouTubeId(url);
    if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    return null;
};
