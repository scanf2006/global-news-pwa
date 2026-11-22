const DELETED_IDS_KEY = 'deletedNewsIds';
const READ_IDS_KEY = 'readNewsIds';
const BOOKMARKS_KEY = 'bookmarkedNews';
const MAX_DELETED_IDS = 200;
const MAX_READ_IDS = 500;
const MAX_BOOKMARKS = 100;

function readArray(key, limit) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed.slice(-limit) : [];
    } catch {
        return [];
    }
}

function writeArray(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`保存 ${key} 失败:`, error);
    }
    return value;
}

function appendId(key, id, limit) {
    const next = [...readArray(key, limit).filter((value) => value !== id), id].slice(-limit);
    return writeArray(key, next);
}

export const readDeletedIds = () => readArray(DELETED_IDS_KEY, MAX_DELETED_IDS);
export const addDeletedId = (id) => appendId(DELETED_IDS_KEY, id, MAX_DELETED_IDS);
export const removeDeletedId = (id) =>
    writeArray(DELETED_IDS_KEY, readDeletedIds().filter((value) => value !== id));

export const readReadIds = () => readArray(READ_IDS_KEY, MAX_READ_IDS);
export const addReadId = (id) => appendId(READ_IDS_KEY, id, MAX_READ_IDS);

export const readBookmarks = () => readArray(BOOKMARKS_KEY, MAX_BOOKMARKS);

// 收藏保存完整条目，新闻离开榜单后仍可查看
export function toggleBookmark(item) {
    const bookmarks = readBookmarks();
    const exists = bookmarks.some((bookmark) => bookmark.id === item.id);
    const next = exists
        ? bookmarks.filter((bookmark) => bookmark.id !== item.id)
        : [...bookmarks, item].slice(-MAX_BOOKMARKS);
    return writeArray(BOOKMARKS_KEY, next);
}
