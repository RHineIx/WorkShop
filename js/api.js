// js/api.js
import { appState } from './state.js';

// --- Custom Error for Handling Race Conditions ---
/**
 * Custom error class to identify when a file update fails due to a
 * version mismatch (409 Conflict from GitHub API).
 */
export class ConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConflictError';
    }
}

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
 * @returns {Promise<{data: Object, sha: string}>} A promise that resolves with the inventory object and file SHA.
 * @throws {Error} If the fetch fails for reasons other than 404.
 */
export const fetchFromGitHub = async () => {
    if (!appState.syncConfig) return null;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/inventory.json`;
    const response = await fetch(apiUrl, { 
        headers: { 'Authorization': `token ${pat}` },
        cache: 'no-cache' // Force re-validation for inventory data as well
    });
    
    if (response.status === 404) {
        console.log('inventory.json not found. A new one will be created on save.');
        return { data: { items: [], lastArchiveTimestamp: null }, sha: null };
    }
    if (!response.ok) {
        throw new Error(`Failed to fetch inventory data: ${response.statusText}`);
    }

    const data = await response.json();
    const decodedContent = decodeURIComponent(escape(window.atob(data.content)));
    let parsedData = JSON.parse(decodedContent);

    if (Array.isArray(parsedData)) {
        parsedData = { items: parsedData, lastArchiveTimestamp: null };
    }

    return { data: parsedData, sha: data.sha };
};

/**
 * Saves the current appState.inventory object to the inventory.json file in the repo.
 * @returns {Promise<void>}
 * @throws {Error} If the save operation fails for a generic reason.
 * @throws {ConflictError} If the save operation fails due to a 409 conflict.
 */
export const saveToGitHub = async () => {
    if (!appState.syncConfig) return;
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

    if (response.status === 409) {
        throw new ConflictError('Inventory file has been updated by another source.');
    }

    if (!response.ok) throw new Error(`Failed to save inventory: ${response.statusText}`);
    const data = await response.json();
    appState.fileSha = data.content.sha;
};

/**
 * Fetches the sales.json file from the repo.
 * @returns {Promise<{data: Array<Object>, sha: string}>} A promise that resolves with the sales data and file SHA.
 * @throws {Error} If the fetch fails for reasons other than 404.
 */
export const fetchSales = async () => {
    if (!appState.syncConfig) return null;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/sales.json`;
    const response = await fetch(apiUrl, { 
        headers: { 'Authorization': `token ${pat}` },
        cache: 'no-cache' // Force re-validation for sales data
    });
    if (response.status === 404) {
        console.log('sales.json not found. A new one will be created on save.');
        return { data: [], sha: null };
    }
    if (!response.ok) {
        throw new Error(`Failed to fetch sales data: ${response.statusText}`);
    }
    const data = await response.json();
    const decodedContent = decodeURIComponent(escape(window.atob(data.content)));
    return { data: JSON.parse(decodedContent), sha: data.sha };
};

/**
 * Saves the current appState.sales to the sales.json file in the repo.
 * @returns {Promise<void>}
 * @throws {Error} If the save operation fails for a generic reason.
 * @throws {ConflictError} If the save operation fails due to a 409 conflict.
 */
export const saveSales = async () => {
    if (!appState.syncConfig) return;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/sales.json`;

    try {
        const remoteFile = await fetch(apiUrl, { headers: { 'Authorization': `token ${pat}` }, cache: 'no-cache' });
        if(remoteFile.ok) {
            const fileData = await remoteFile.json();
            appState.salesFileSha = fileData.sha;
        } else {
             appState.salesFileSha = null;
        }
    } catch(e) {
        appState.salesFileSha = null;
    }

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(appState.sales, null, 2))));
    const body = {
        message: `Update sales data - ${new Date().toISOString()}`,
        content: content,
        sha: appState.salesFileSha,
    };
    const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Authorization': `token ${pat}` },
        body: JSON.stringify(body)
    });

    if (response.status === 409) {
        throw new ConflictError('Sales file has been updated by another source.');
    }

    if (!response.ok) throw new Error(`Failed to save sales: ${response.statusText}`);
    const data = await response.json();
    appState.salesFileSha = data.content.sha;
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
    if (!appState.syncConfig) return [];
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
    const response = await fetch(apiUrl, { 
        headers: { 'Authorization': `token ${pat}` },
        cache: 'no-cache' // **THIS IS THE FIX**
    });
    if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error('فشل الوصول إلى المجلد المحدد.');
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
};

/**
 * Creates a new file on GitHub. Used for creating archive files.
 * @param {string} path The full path for the new file in the repo.
 * @param {string} content The content of the file to create.
 * @param {string} message The commit message.
 * @returns {Promise<void>}
 * @throws {Error} If the file creation fails.
 */
export const createGitHubFile = async (path, content, message) => {
    if (!appState.syncConfig) return;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
    
    const base64Content = btoa(unescape(encodeURIComponent(content)));
    const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Authorization': `token ${pat}` },
        body: JSON.stringify({ message, content: base64Content })
    });
    if (!response.ok) {
        if (response.status !== 422) { // 422 is "Unprocessable Entity", often means file exists
            throw new Error(`Failed to create file ${path}: ${response.statusText}`);
        }
    }
};

/**
 * Fetches the content of a specific file from GitHub.
 * Used for reading archive files.
 * @param {string} path The path to the file in the repo.
 * @returns {Promise<any>} A promise that resolves with the parsed JSON data.
 * @throws {Error} If the fetch fails.
 */
export const fetchGitHubFile = async (path) => {
    if (!appState.syncConfig) return null;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
    const response = await fetch(apiUrl, { 
        headers: { 'Authorization': `token ${pat}` },
        cache: 'no-cache' // Also apply fix here for consistency
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch file ${path}: ${response.statusText}`);
    }

    const data = await response.json();
    const decodedContent = decodeURIComponent(escape(window.atob(data.content)));
    return JSON.parse(decodedContent);
};