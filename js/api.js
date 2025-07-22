// js/api.js
import { appState } from './state.js';

// --- UTILITY FUNCTIONS FOR API ---

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

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});


// --- EXPORTED API FUNCTIONS ---

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

export const deleteFileFromGitHub = async (path, sha, message) => {
    if (!appState.syncConfig) return false;
    const { username, repo, pat } = appState.syncConfig;
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
    const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `token ${pat}` },
        body: JSON.stringify({ message, sha })
    });
    return response.ok;
};

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