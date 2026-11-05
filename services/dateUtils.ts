/**
 * Utility functions for consistent date formatting across the app.
 */

/**
 * Formats a Date object to an ISO 8601 string preserving the local timezone offset
 * e.g. "2026-10-12T18:30:00-06:00"
 * This prevents the date from shifting to tomorrow when using standard .toISOString() (UTC)
 * in timezones behind UTC (such as Mexico/America -06:00).
 */
export const formatToLocalISO = (date: Date = new Date()): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    const tzOffset = -date.getTimezoneOffset(); // in minutes, e.g. -360 for UTC-6
    const sign = tzOffset >= 0 ? '+' : '-';
    const absOffset = Math.abs(tzOffset);
    const offsetHours = pad(Math.floor(absOffset / 60));
    const offsetMinutes = pad(absOffset % 60);

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
};

/**
 * Returns the current or given date formatted as "YYYY-MM-DD" in local time.
 * Avoids the UTC-offset bug where .toISOString().split('T')[0] shifts to tomorrow in the evening.
 */
export const getLocalDateString = (date: Date = new Date()): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    return `${year}-${month}-${day}`;
};

/**
 * Safely formats a date string (YYYY-MM-DD, ISO, or datetime) for display in local format (DD/MM/YYYY).
 * Prevents timezone shifting (e.g., UTC date-only strings parsed as midnight UTC shifting to the day before).
 */
export const formatDisplayDate = (dateStr: string | null | undefined, fallback: string = 'Sin fecha'): string => {
    if (!dateStr || typeof dateStr !== 'string') return fallback;
    const clean = dateStr.trim();
    if (!clean) return fallback;

    // Direct YYYY-MM-DD match (with optional time after)
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean);
    if (match) {
        const [_, y, m, d] = match;
        return `${d}/${m}/${y}`;
    }

    // Try standard Date parsing
    const safeStr = clean.replace(' ', 'T');
    const d = new Date(safeStr);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString();
};

/**
 * Safely converts a date string to a timestamp for sorting,
 * avoiding negative timezone shifts for date-only strings.
 */
export const getSafeTimestamp = (dateStr: string | null | undefined): number => {
    if (!dateStr || typeof dateStr !== 'string') return 0;
    const clean = dateStr.trim();
    if (!clean) return 0;

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
    if (match) {
        const [_, y, m, d] = match;
        return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0).getTime();
    }

    const safe = clean.replace(' ', 'T');
    const t = new Date(safe).getTime();
    return isNaN(t) ? 0 : t;
};
