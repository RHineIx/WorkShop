// js/api.js
import { appState } from "./state.js";
import { getImage, storeImage } from "./db.js";
// --- Custom Error for Handling Race Conditions ---
/**
 * Custom error class to identify when a file update fails due to a
 * version mismatch (409 Conflict from GitHub API).
 */
export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConflictError";
  }
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
  const { username, repo, pat } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;
  try {
    const response = await fetch(apiUrl, {
      headers: { Authorization: `token ${pat}` },
      cache: "no-cache",
    });
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

async function saveJsonToGitHub(filePath, dataObject, commitMessage) {
  if (!appState.syncConfig) throw new Error("Sync config is not set.");
  const { username, repo, pat } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;

  let latestSha = null;
  try {
    const remoteFile = await fetch(apiUrl, {
      headers: { Authorization: `token ${pat}` },
      cache: "no-cache",
    });
    if (remoteFile.ok) {
      latestSha = (await remoteFile.json()).sha;
    }
  } catch (e) {
    // File probably doesn't exist, which is fine.
  }

  const content = btoa(
    unescape(encodeURIComponent(JSON.stringify(dataObject, null, 2)))
  );
  const body = {
    message: `${commitMessage} - ${new Date().toISOString()}`,
    content: content,
    sha: latestSha,
  };
  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: { Authorization: `token ${pat}` },
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

/**
 * Fetches the live USD to IQD exchange rate.
 * @returns {Promise<number|null>} The exchange rate, or null if failed.
 */
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

/**
 * Fetches an image, prioritizing local cache (memory -> IndexedDB) before fetching from GitHub.
 */
export const fetchImageWithAuth = async path => {
  if (!path) return null;
  // 1. Check in-memory cache first (fastest)
  if (appState.imageCache.has(path)) {
    return appState.imageCache.get(path);
  }

  // 2. Check IndexedDB cache
  try {
    const cachedBlob = await getImage(path);
    if (cachedBlob) {
      const url = URL.createObjectURL(cachedBlob);
      appState.imageCache.set(path, url);
      // Add to in-memory cache for this session
      return url;
    }
  } catch (dbError) {
    console.error("Error fetching from IndexedDB:", dbError);
  }

  // 3. If not in any cache, fetch from GitHub
  if (!appState.syncConfig) return null;
  const { username, repo, pat } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
  try {
    const response = await fetch(apiUrl, {
      headers: { Authorization: `token ${pat}` },
    });
    if (!response.ok) throw new Error("Failed to fetch image from GitHub");

    const data = await response.json();
    const blob = b64toBlob(data.content, "image/webp");
    // Assuming images are webp or jpeg

    // Store the fetched blob in IndexedDB for future use
    await storeImage(path, blob);
    const url = URL.createObjectURL(blob);
    appState.imageCache.set(path, url); // Also cache in memory for current session
    return url;
  } catch (error) {
    console.error(`Failed to fetch image ${path}:`, error);
    return null;
  }
};
/**
 * Uploads an image file to the repo.
 */
export const uploadImageToGitHub = async (imageBlob, originalFileName) => {
  if (!appState.syncConfig) {
    throw new Error("يجب إعداد المزامنة أولاً لرفع الصور.");
  }
  const base64content = await toBase64(imageBlob);
  const { username, repo, pat } = appState.syncConfig;
  const fileName = `img_${Date.now()}_${originalFileName.replace(/\s/g, "_")}`;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/images/${fileName}`;
  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: { Authorization: `token ${pat}` },
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
/**
 * REFACTORED: Fetches the main inventory.json file.
 */
export const fetchFromGitHub = async () => {
  const result = await fetchJsonFromGitHub("inventory.json", {
    items: [],
    lastArchiveTimestamp: null,
  });
  // Handle legacy format where inventory was just an array
  if (result && Array.isArray(result.data)) {
    result.data = { items: result.data, lastArchiveTimestamp: null };
  }
  return result;
};

/**
 * REFACTORED: Saves the main inventory data.
 */
export const saveToGitHub = async () => {
  appState.fileSha = await saveJsonToGitHub(
    "inventory.json",
    appState.inventory,
    "Update inventory data"
  );
};

/**
 * REFACTORED: Fetches the sales.json file.
 */
export const fetchSales = async () => {
  return await fetchJsonFromGitHub("sales.json", []);
};

/**
 * REFACTORED: Saves the sales data.
 */
export const saveSales = async () => {
  appState.salesFileSha = await saveJsonToGitHub(
    "sales.json",
    appState.sales,
    "Update sales data"
  );
};

/**
 * REFACTORED: Fetches the suppliers.json file.
 */
export const fetchSuppliers = async () => {
  return await fetchJsonFromGitHub("suppliers.json", []);
};

/**
 * REFACTORED: Saves the suppliers data.
 */
export const saveSuppliers = async () => {
  appState.suppliersFileSha = await saveJsonToGitHub(
    "suppliers.json",
    appState.suppliers,
    "Update suppliers data"
  );
};

/**
 * Deletes a file from the GitHub repository.
 */
export const deleteFileFromGitHub = async (path, sha, message) => {
  if (!appState.syncConfig) return false;
  const { username, repo, pat } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
  const response = await fetch(apiUrl, {
    method: "DELETE",
    headers: { Authorization: `token ${pat}` },
    body: JSON.stringify({ message, sha }),
  });
  if (!response.ok) {
    throw new Error(`Failed to delete ${path}: ${response.statusText}`);
  }
  return response.ok;
};
/**
 * Fetches the contents of a directory from the GitHub repo.
 */
export const getGitHubDirectoryListing = async path => {
  if (!appState.syncConfig) return [];
  const { username, repo, pat } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
  const response = await fetch(apiUrl, {
    headers: { Authorization: `token ${pat}` },
    cache: "no-cache",
  });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error("فشل الوصول إلى المجلد المحدد.");
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
};
/**
 * Creates a new file on GitHub. Used for creating archive files.
 */
export const createGitHubFile = async (path, content, message) => {
  if (!appState.syncConfig) return;
  const { username, repo, pat } = appState.syncConfig;
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;

  const base64Content = btoa(unescape(encodeURIComponent(content)));
  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: { Authorization: `token ${pat}` },
    body: JSON.stringify({ message, content: base64Content }),
  });
  if (!response.ok) {
    // 422 is "Unprocessable Entity", often means file exists, which is not a critical error for archiving.
    if (response.status !== 422) {
      throw new Error(`Failed to create file ${path}: ${response.statusText}`);
    }
  }
};

/**
 * REFACTORED: Fetches the content of a specific file from GitHub.
 * Used for reading archive files. Returns only the data.
 */
export const fetchGitHubFile = async path => {
  const result = await fetchJsonFromGitHub(path, null);
  return result ? result.data : null;
};
