// js/api.js
import { appState } from './state.js';

// --- Internal API Helper Functions ---

/**
 * Converts a Base64 string to a Blob object.
 * @param {string} b64Data The Base64 encoded data.
 * @param {string} contentType The content type of the Blob.
 * @returns {Blob}
 */
const b64toBlob = (b64Data, contentType = '', sliceSize = 512) => {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
};

/**
 * Converts a File object to a Base64 string.
 * @param {File} file The file to convert.
 * @returns {Promise<string>} A promise that resolves with the Base64 encoded string.
 */
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});


// --- Exported GitHub API Functions ---

/**
 * Fetches an image from the GitHub repo and returns a local Blob URL.
 * Caches the result to avoid redundant fetches.
 * @param {string} path The full path to the image file in the repo.
 * @returns {Promise<string|null>} A promise that resolves with the Blob URL or null on failure.
 */
export const fetchImageWithAuth = async (path) => {
    if (appState.imageCache.has(path)) {
        return appState.imageCache.get(path);
    }
    if (!appState.syncConfig || !path) return null;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
    try {
        const response = await fetch(apiUrl, { headers: { 'Authorization': `token ${pat}` } });
        if (!response.ok) throw new Error('Failed to fetch image');
        const data = await response.json();
        const blob = b64toBlob(data.content, 'image/jpeg');
        const url = URL.createObjectURL(blob);
        appState.imageCache.set(path, url);
        return url;
    } catch (error) {
        console.error(`Failed to fetch image ${path}:`, error);
        return null;
    }
};

/**
 * Uploads a new image file to the /images directory in the GitHub repo.
 * @param {File} file The image file to upload.
 * @returns {Promise<string>} A promise that resolves with the new file's path in the repo.
 * @throws {Error} If the upload fails.
 */
export const uploadImageToGitHub = async (file) => {
    if (!appState.syncConfig) {
        throw new Error('يجب إعداد المزامنة أولاً لرفع الصور.');
    }
    const base64content = await toBase64(file);
    const { username, repo, pat } = appState.syncConfig;
    const fileName = `img_${Date.now()}_${file.name.replace(/\s/g, '_')}`;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/images/${fileName}`;
    const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Authorization': `token ${pat}` },
        body: JSON.stringify({ message: `Upload image: ${fileName}`, content: base64content })
    });
    if (!response.ok) throw new Error(`Image upload failed: ${response.statusText}`);
    const data = await response.json();
    return data.content.path;
};

/**
 * Fetches the main inventory.json file from the repo.
 * @returns {Promise<{inventory: Array<Object>, sha: string}>} A promise that resolves with the inventory data and file SHA.
 * @throws {Error} If the fetch fails for reasons other than 404.
 */
export const fetchFromGitHub = async () => {
    if (!appState.syncConfig) return null;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/inventory.json`;
    
    const response = await fetch(apiUrl, { headers: { 'Authorization': `token ${pat}` } });
    if (response.status === 404) {
        console.log('inventory.json not found. A new one will be created on save.');
        return { inventory: [], sha: null };
    }
    if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
    }
    const data = await response.json();
    const decodedContent = decodeURIComponent(escape(window.atob(data.content)));
    return { inventory: JSON.parse(decodedContent), sha: data.sha };
};

/**
 * Saves the current appState.inventory to the inventory.json file in the repo.
 * This function handles both creating and updating the file.
 * @returns {Promise<void>}
 * @throws {Error} If the save operation fails.
 */
export const saveToGitHub = async () => {
    if (!appState.syncConfig || appState.isSyncing) return;
    appState.isSyncing = true;
    
    try {
        const { username, repo, pat } = appState.syncConfig;
        const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/inventory.json`;
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(appState.inventory, null, 2))));
        const body = {
            message: `Update inventory data - ${new Date().toISOString()}`,
            content: content,
            sha: appState.fileSha,
        };
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: { 'Authorization': `token ${pat}` },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`Failed to save: ${response.statusText}`);
        const data = await response.json();
        appState.fileSha = data.content.sha;
    } finally {
        appState.isSyncing = false;
    }
};

/**
 * Deletes a file from the GitHub repository.
 * @param {string} path The full path to the file to delete.
 * @param {string} sha The blob SHA of the file to delete.
 * @param {string} message The commit message for the deletion.
 * @returns {Promise<boolean>} A promise that resolves with true on success.
 * @throws {Error} If the delete operation fails.
 */
export const deleteFileFromGitHub = async (path, sha, message) => {
    if (!appState.syncConfig) return false;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
    const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `token ${pat}` },
        body: JSON.stringify({ message, sha })
    });
    if (!response.ok) {
        throw new Error(`Failed to delete ${path}: ${response.statusText}`);
    }
    return response.ok;
};

/**
 * Fetches the contents of a directory from the GitHub repo.
 * @param {string} path The path to the directory.
 * @returns {Promise<Array<Object>>} A promise that resolves with an array of file objects.
 * @throws {Error} If the directory fetch fails.
 */
export const getGitHubDirectoryListing = async (path) => {
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
    const response = await fetch(apiUrl, { headers: { 'Authorization': `token ${pat}` } });
    if (!response.ok) {
        if (response.status === 404) return []; // Folder not found is not an error
        throw new Error('فشل الوصول إلى مجلد الصور.');
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
};