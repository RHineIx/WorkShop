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
 * Converts a File or Blob object to a Base64 string.
 * @param {Blob} file The file or blob to convert.
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
 * @param {Blob} imageBlob The image blob to upload (can be a File or a compressed Blob).
 * @param {string} originalFileName The original name of the file for naming purposes.
 * @returns {Promise<string>} A promise that resolves with the new file's path in the repo.
 * @throws {Error} If the upload fails.
 */
export const uploadImageToGitHub = async (imageBlob, originalFileName) => {
    if (!appState.syncConfig) {
        throw new Error('يجب إعداد المزامنة أولاً لرفع الصور.');
    }
    const base64content = await toBase64(imageBlob);
    const { username, repo, pat } = appState.syncConfig;
    const fileName = `img_${Date.now()}_${originalFileName.replace(/\s/g, '_')}`;
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
        cache: 'no-cache'
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

// =================================================================
// REFACTORING: Centralized function for saving JSON files to GitHub.
// This new helper function encapsulates the repetitive logic for saving
// any JSON file. It handles getting the latest file version (SHA),
// encoding the data, and making the authenticated PUT request.
// This helps us adhere to the DRY (Don't Repeat Yourself) principle.
// =================================================================
async function saveJsonToGitHub(filePath, dataObject, commitMessage) {
    if (!appState.syncConfig) throw new Error("Sync config is not set.");
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;

    // Step 1: Get the latest SHA to avoid conflicts
    let latestSha = null;
    try {
        const remoteFile = await fetch(apiUrl, { headers: { 'Authorization': `token ${pat}` }, cache: 'no-cache' });
        if (remoteFile.ok) {
            latestSha = (await remoteFile.json()).sha;
        }
    } catch (e) {
        // File probably doesn't exist, which is fine. `latestSha` remains null.
    }

    // Step 2: Prepare the request body
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(dataObject, null, 2))));
    const body = {
        message: `${commitMessage} - ${new Date().toISOString()}`,
        content: content,
        sha: latestSha,
    };

    // Step 3: Make the API call
    const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Authorization': `token ${pat}` },
        body: JSON.stringify(body)
    });

    // Step 4: Handle the response
    if (response.status === 409) {
        throw new ConflictError(`Conflict Error: The file '${filePath}' was updated elsewhere.`);
    }
    if (!response.ok) {
        throw new Error(`Failed to save '${filePath}': ${response.statusText}`);
    }

    const responseData = await response.json();
    return responseData.content.sha;
}

/**
 * REFACTORING: Saves the main inventory data.
 * This function now acts as a simple wrapper around the generic saveJsonToGitHub helper.
 */
export const saveToGitHub = async () => {
    appState.fileSha = await saveJsonToGitHub(
        'inventory.json', 
        appState.inventory, 
        'Update inventory data'
    );
};

/**
 * Fetches the sales.json file from the repo.
 * @returns {Promise<{data: Array<Object>, sha: string}>} A promise that resolves with the sales data and file SHA.
 */
export const fetchSales = async () => {
    if (!appState.syncConfig) return null;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/sales.json`;
    const response = await fetch(apiUrl, { 
        headers: { 'Authorization': `token ${pat}` },
        cache: 'no-cache'
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
 * REFACTORING: Saves the sales data.
 * This function is now simplified to a single call to the generic helper.
 */
export const saveSales = async () => {
    appState.salesFileSha = await saveJsonToGitHub(
        'sales.json',
        appState.sales,
        'Update sales data'
    );
};

/**
 * Fetches the suppliers.json file from the repo.
 * @returns {Promise<{data: Array<Object>, sha: string}>} A promise that resolves with the suppliers data and file SHA.
 */
export const fetchSuppliers = async () => {
    if (!appState.syncConfig) return null;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/suppliers.json`;
    const response = await fetch(apiUrl, { 
        headers: { 'Authorization': `token ${pat}` },
        cache: 'no-cache'
    });
    if (response.status === 404) {
        console.log('suppliers.json not found. A new one will be created on save.');
        return { data: [], sha: null };
    }
    if (!response.ok) {
        throw new Error(`Failed to fetch suppliers data: ${response.statusText}`);
    }
    const data = await response.json();
    const decodedContent = decodeURIComponent(escape(window.atob(data.content)));
    return { data: JSON.parse(decodedContent), sha: data.sha };
};

/**
 * REFACTORING: Saves the suppliers data.
 * This function is also simplified to a single call to the generic helper.
 */
export const saveSuppliers = async () => {
    appState.suppliersFileSha = await saveJsonToGitHub(
        'suppliers.json',
        appState.suppliers,
        'Update suppliers data'
    );
};

/**
 * Deletes a file from the GitHub repository.
 * @param {string} path The full path to the file to delete.
 * @param {string} sha The blob SHA of the file to delete.
 * @param {string} message The commit message for the deletion.
 * @returns {Promise<boolean>} A promise that resolves with true on success.
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
 */
export const getGitHubDirectoryListing = async (path) => {
    if (!appState.syncConfig) return [];
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
    const response = await fetch(apiUrl, { 
        headers: { 'Authorization': `token ${pat}` },
        cache: 'no-cache'
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
 */
export const fetchGitHubFile = async (path) => {
    if (!appState.syncConfig) return null;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
    const response = await fetch(apiUrl, { 
        headers: { 'Authorization': `token ${pat}` },
        cache: 'no-cache'
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch file ${path}: ${response.statusText}`);
    }

    const data = await response.json();
    const decodedContent = decodeURIComponent(escape(window.atob(data.content)));
    return JSON.parse(decodedContent);
};