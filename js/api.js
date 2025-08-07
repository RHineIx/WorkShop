// js/api.js
import { appState } from "./state.js";
import { getImage, storeImage, addToSyncQueue } from "./db.js";
import { updateRateLimitDisplay } from "./ui.js";

// --- Custom Error for Handling Race Conditions ---
export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConflictError";
  }
}

// --- Central API Fetch Function ---
async function apiFetch(url, options = {}) {
  if (!appState.syncConfig || !appState.syncConfig.pat) {
    throw new Error("GitHub PAT is not configured.");
  }
  const { pat } = appState.syncConfig;

  const headers = {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github.v3+json",
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.headers.has("x-ratelimit-limit")) {
    appState.rateLimit = {
      limit: parseInt(response.headers.get("x-ratelimit-limit"), 10),
      remaining: parseInt(response.headers.get("x-ratelimit-remaining"), 10),
      reset: parseInt(response.headers.get("x-ratelimit-reset"), 10),
    };
    updateRateLimitDisplay();
  }

  return response;
}

// --- Internal API Helper Functions ---

const b64toBlob = (b64Data, contentType = "", sliceSize = 512) => {
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
const toBase64 = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = error => reject(error);
  });
async function fetchJsonFromGitHub(filePath, defaultValue) {
  if (!appState.syncConfig) return null;
  const { username, repo } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;
  try {
    const response = await apiFetch(apiUrl, { cache: "no-cache" });

    if (response.status === 404) {
      console.log(`${filePath} not found. A new one will be created on save.`);
      return { data: defaultValue, sha: null };
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filePath}: ${response.statusText}`);
    }

    const fileData = await response.json();
    const decodedContent = decodeURIComponent(
      escape(window.atob(fileData.content))
    );
    const parsedData = JSON.parse(decodedContent);

    return { data: parsedData, sha: fileData.sha };
  } catch (error) {
    console.error(`Error fetching ${filePath}:`, error);
    throw error;
  }
}

async function saveJsonToGitHub(filePath, dataObject, commitMessage, sha) {
  if (!appState.syncConfig) throw new Error("Sync config is not set.");
  const { username, repo } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;

  const content = btoa(
    unescape(encodeURIComponent(JSON.stringify(dataObject, null, 2)))
  );
  const body = {
    message: `${commitMessage} - ${new Date().toISOString()}`,
    content: content,
    sha: sha,
  };
  const response = await apiFetch(apiUrl, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (response.status === 409) {
    throw new ConflictError(
      `Conflict Error: The file '${filePath}' was updated elsewhere.`
    );
  }
  if (!response.ok) {
    throw new Error(`Failed to save '${filePath}': ${response.statusText}`);
  }

  const responseData = await response.json();
  return responseData.content.sha;
}

// --- Exported API Functions ---

export const triggerBackupWorkflow = async () => {
  if (!appState.syncConfig) {
    throw new Error("إعدادات المزامنة غير متوفرة.");
  }
  const { username, repo } = appState.syncConfig;
  const url = `https://api.github.com/repos/${username}/${repo}/actions/workflows/backup-to-telegram.yml/dispatches`;
  const response = await apiFetch(url, {
    method: "POST",
    body: JSON.stringify({
      ref: "main",
    }),
  });
  if (!response.ok) {
    throw new Error(
      `فشل في تشغيل عملية النسخ الاحتياطي: ${response.statusText}`
    );
  }
  return response.status === 204;
};
export async function fetchLiveExchangeRate() {
  const url =
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    if (!data || !data.usd || typeof data.usd.iqd !== "number") {
      throw new Error("Invalid API response format");
    }
    return data.usd.iqd;
  } catch (error) {
    console.error("Failed to fetch exchange rate:", error);
    return null;
  }
}

export const fetchImageWithAuth = async path => {
  if (!path) return null;
  if (appState.imageCache.has(path)) {
    return appState.imageCache.get(path);
  }

  try {
    const cachedBlob = await getImage(path);
    if (cachedBlob) {
      const url = URL.createObjectURL(cachedBlob);
      appState.imageCache.set(path, url);
      return url;
    }
  } catch (dbError) {
    console.error("Error fetching from IndexedDB:", dbError);
  }

  if (!appState.syncConfig) return null;
  const { username, repo } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
  try {
    const response = await apiFetch(apiUrl);
    if (!response.ok) throw new Error("Failed to fetch image from GitHub");

    const data = await response.json();
    const blob = b64toBlob(data.content, "image/webp");
    await storeImage(path, blob);
    const url = URL.createObjectURL(blob);
    appState.imageCache.set(path, url);
    return url;
  } catch (error) {
    console.error(`Failed to fetch image ${path}:`, error);
    return null;
  }
};
export const uploadImageToGitHub = async (imageBlob, originalFileName) => {
  if (!navigator.onLine) {
    await addToSyncQueue({
      type: "UPLOAD_IMAGE",
      payload: { imageBlob, originalFileName },
    });
    return `offline_${Date.now()}_${originalFileName}`;
  }

  if (!appState.syncConfig) {
    throw new Error("يجب إعداد المزامنة أولاً لرفع الصور.");
  }
  const base64content = await toBase64(imageBlob);
  const { username, repo } = appState.syncConfig;
  const fileName = `img_${Date.now()}_${originalFileName.replace(/\s/g, "_")}`;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/images/${fileName}`;
  const response = await apiFetch(apiUrl, {
    method: "PUT",
    body: JSON.stringify({
      message: `Upload image: ${fileName}`,
      content: base64content,
    }),
  });
  if (!response.ok)
    throw new Error(`Image upload failed: ${response.statusText}`);
  const data = await response.json();
  return data.content.path;
};
export const fetchFromGitHub = async () => {
  const result = await fetchJsonFromGitHub("inventory.json", {
    items: [],
    lastArchiveTimestamp: null,
  });
  if (result && Array.isArray(result.data)) {
    result.data = { items: result.data, lastArchiveTimestamp: null };
  }
  return result;
};

export const saveToGitHub = async () => {
  if (!navigator.onLine) {
    await addToSyncQueue({
      type: "SAVE_INVENTORY",
      payload: appState.inventory,
    });
    return;
  }
  appState.fileSha = await saveJsonToGitHub(
    "inventory.json",
    appState.inventory,
    "Update inventory data",
    appState.fileSha
  );
};

export const fetchSales = async () => {
  return await fetchJsonFromGitHub("sales.json", []);
};
export const saveSales = async () => {
  if (!navigator.onLine) {
    await addToSyncQueue({ type: "SAVE_SALES", payload: appState.sales });
    return;
  }
  appState.salesFileSha = await saveJsonToGitHub(
    "sales.json",
    appState.sales,
    "Update sales data",
    appState.salesFileSha
  );
};

export const fetchSuppliers = async () => {
  return await fetchJsonFromGitHub("suppliers.json", []);
};
export const saveSuppliers = async () => {
  if (!navigator.onLine) {
    await addToSyncQueue({
      type: "SAVE_SUPPLIERS",
      payload: appState.suppliers,
    });
    return;
  }
  appState.suppliersFileSha = await saveJsonToGitHub(
    "suppliers.json",
    appState.suppliers,
    "Update suppliers data",
    appState.suppliersFileSha
  );
};

export const deleteFileFromGitHub = async (path, sha, message) => {
  if (!appState.syncConfig) return false;
  const { username, repo } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
  const response = await apiFetch(apiUrl, {
    method: "DELETE",
    body: JSON.stringify({ message, sha }),
  });
  if (!response.ok) {
    throw new Error(`Failed to delete ${path}: ${response.statusText}`);
  }
  return response.ok;
};
export const getGitHubDirectoryListing = async path => {
  if (!appState.syncConfig) return [];
  const { username, repo } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
  const response = await apiFetch(apiUrl, { cache: "no-cache" });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error("فشل الوصول إلى المجلد المحدد.");
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
};
export const createGitHubFile = async (path, content, message) => {
  if (!appState.syncConfig) return;
  const { username, repo } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;

  const base64Content = btoa(unescape(encodeURIComponent(content)));
  const response = await apiFetch(apiUrl, {
    method: "PUT",
    body: JSON.stringify({ message, content: base64Content }),
  });
  if (!response.ok) {
    if (response.status !== 422) {
      throw new Error(`Failed to create file ${path}: ${response.statusText}`);
    }
  }
};

export const fetchGitHubFile = async path => {
  const result = await fetchJsonFromGitHub(path, null);
  return result ? result.data : null;
};
