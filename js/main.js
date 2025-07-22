// js/main.js
import { appState } from './state.js';
import { generateUniqueSKU } from './utils.js';
import * as api from './api.js';
import * as ui from './ui.js';

// --- LOCAL STORAGE & CONFIG ---

function loadConfig() {
    const savedConfig = localStorage.getItem('inventoryAppSyncConfig');
    if (savedConfig) {
        appState.syncConfig = JSON.parse(savedConfig);
    }
}

function saveConfig() {
    localStorage.setItem('inventoryAppSyncConfig', JSON.stringify(appState.syncConfig));
}

function loadLocalInventory() {
    const saved = localStorage.getItem('inventoryAppData');
    if (saved) {
        appState.inventory = JSON.parse(saved);
    }
}

function saveLocalInventory() {
    localStorage.setItem('inventoryAppData', JSON.stringify(appState.inventory));
}

// --- CORE LOGIC HANDLERS ---

async function handleFormSubmit(e) {
    e.preventDefault();
    const saveButton = document.getElementById('save-item-btn');
    saveButton.disabled = true;
    ui.showStatus('جاري الحفظ...', 'syncing');

    const itemId = document.getElementById('item-id').value;
    const existingItem = appState.inventory.find(i => i.id === itemId);
    let imagePath = existingItem ? existingItem.imagePath : null;

    if (appState.selectedImageFile) {
        const uploadedPath = await api.uploadImageToGitHub(appState.selectedImageFile);
        if (uploadedPath) {
            imagePath = uploadedPath;
        } else {
            ui.showStatus('فشل رفع الصورة، سيتم الحفظ بدونها.', 'error', 4000);
        }
    }
    
    const itemData = {
        id: itemId || `item_${Date.now()}`,
        sku: document.getElementById('item-sku').value,
        name: document.getElementById('item-name').value,
        category: document.getElementById('item-category').value,
        quantity: parseInt(document.getElementById('item-quantity').value, 10) || 0,
        alertLevel: parseInt(document.getElementById('item-alert-level').value, 10) || 5,
        costPrice: parseFloat(document.getElementById('item-cost-price').value) || 0,
        sellPrice: parseFloat(document.getElementById('item-sell-price').value) || 0,
        notes: document.getElementById('item-notes').value,
        imagePath: imagePath,
    };

    if (itemId) {
        const index = appState.inventory.findIndex(i => i.id === itemId);
        if (index !== -1) appState.inventory[index] = itemData;
    } else {
        appState.inventory.push(itemData);
    }
    
    ui.renderInventory();
    await api.saveToGitHub();
    document.getElementById('item-modal').close();
    if (appState.currentItemId === itemData.id) {
        ui.openDetailsModal(itemData.id);
    }
    saveButton.disabled = false;
}

async function handleImageCleanup() {
    if (!appState.syncConfig) {
        ui.showStatus('يرجى إعداد المزامنة أولاً.', 'error');
        return;
    }
    if (!confirm('هل أنت متأكد من رغبتك في حذف جميع الصور غير المستخدمة نهائياً من المستودع؟ لا يمكن التراجع عن هذا الإجراء.')) {
        return;
    }
    ui.showStatus('جاري البحث عن الصور غير المستخدمة...', 'syncing');
    try {
        const allRepoImages = await api.getGitHubDirectoryListing('images');
        if (!Array.isArray(allRepoImages) || allRepoImages.length === 0) {
            ui.showStatus('لا توجد صور لتنظيفها.', 'success');
            return;
        }
        const usedImages = new Set(appState.inventory.map(item => item.imagePath).filter(Boolean));
        const orphanedImages = allRepoImages.filter(repoImage => !usedImages.has(repoImage.path));
        
        if (orphanedImages.length === 0) {
            ui.showStatus('لا توجد صور غير مستخدمة ليتم حذفها.', 'success');
            return;
        }
        
        ui.showStatus(`تم العثور على ${orphanedImages.length} صورة... جاري الحذف.`, 'syncing');
        let deletedCount = 0;
        for (const image of orphanedImages) {
            const success = await api.deleteFileFromGitHub(image.path, image.sha, `Cleanup: delete unused image ${image.name}`);
            if (success) deletedCount++;
        }
        if (deletedCount > 0) {
            ui.showStatus(`تم حذف ${deletedCount} صورة غير مستخدمة بنجاح.`, 'success', 5000);
        } else {
            ui.showStatus('فشل حذف الصور. تحقق من صلاحيات مفتاح الوصول.', 'error', 5000);
        }
    } catch (error) {
        ui.showStatus(`حدث خطأ: ${error.message}`, 'error', 5000);
    }
}

// --- EVENT LISTENERS ---

function setupEventListeners() {
    const elements = ui.getDOMElements();

    // Header Controls
    elements.themeToggleBtn.addEventListener('click', () => ui.setTheme(document.body.classList.contains('theme-light') ? 'dark' : 'light'));
    document.getElementById('add-item-btn').addEventListener('click', () => ui.openItemModal());
    document.getElementById('sync-settings-btn').addEventListener('click', ui.populateSyncModal);

    // Main Grid Interaction
    elements.inventoryGrid.addEventListener('click', (e) => {
        const button = e.target.closest('.card-details-btn');
        if (button) {
            ui.openDetailsModal(e.target.closest('.product-card').dataset.id);
        }
    });

    // Details Modal
    elements.closeDetailsModalBtn.addEventListener('click', () => elements.detailsModal.close());
    document.getElementById('details-decrease-btn').addEventListener('click', async () => {
        const item = appState.inventory.find(i => i.id === appState.currentItemId);
        if (item && item.quantity > 0) {
            item.quantity--;
            document.getElementById('details-quantity-value').textContent = item.quantity;
            ui.renderInventory();
            await api.saveToGitHub();
        }
    });
    document.getElementById('details-increase-btn').addEventListener('click', async () => {
        const item = appState.inventory.find(i => i.id === appState.currentItemId);
        if (item) {
            item.quantity++;
            document.getElementById('details-quantity-value').textContent = item.quantity;
            ui.renderInventory();
            await api.saveToGitHub();
        }
    });
    document.getElementById('details-edit-btn').addEventListener('click', () => {
        elements.detailsModal.close();
        ui.openItemModal(appState.currentItemId);
    });
    document.getElementById('details-delete-btn').addEventListener('click', async () => {
        if (confirm('هل أنت متأكد من رغبتك في حذف هذا المنتج؟')) {
            appState.inventory = appState.inventory.filter(item => item.id !== appState.currentItemId);
            elements.detailsModal.close();
            ui.renderInventory();
            await api.saveToGitHub();
        }
    });
    document.getElementById('details-barcode-btn').addEventListener('click', () => ui.openBarcodeModal(appState.currentItemId));
    document.getElementById('download-barcode-btn').addEventListener('click', ui.downloadBarcode);
    
    // Search and Filter
    document.getElementById('search-bar').addEventListener('input', (e) => {
        appState.searchTerm = e.target.value;
        ui.renderInventory();
    });
    document.getElementById('stats-cards').addEventListener('click', (e) => {
        const card = e.target.closest('.stat-card');
        if (!card) return;
        appState.activeFilter = card.classList.contains('low-stock-alert') ? 'low_stock' : 'all';
        ui.renderInventory();
    });

    // Modals
    document.getElementById('cancel-item-btn').addEventListener('click', () => elements.itemModal.close());
    elements.itemForm.addEventListener('submit', handleFormSubmit);
    document.getElementById('item-image-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            appState.selectedImageFile = file;
            const reader = new FileReader();
            reader.onload = (event) => {
                elements.imagePreview.src = event.target.result;
                elements.imagePreview.classList.remove('image-preview-hidden');
                elements.imagePlaceholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    elements.cancelSyncBtn.addEventListener('click', () => elements.syncModal.close());
    elements.syncForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        appState.syncConfig = {
            username: elements.githubUsernameInput.value.trim(),
            repo: elements.githubRepoInput.value.trim(),
            pat: elements.githubPatInput.value.trim(),
        };
        saveConfig();
        elements.syncModal.close();
        const data = await api.fetchFromGitHub();
        if (data) {
            appState.inventory = data.inventory;
            appState.fileSha = data.sha;
            saveLocalInventory();
            ui.renderInventory();
        }
    });

    document.getElementById('close-barcode-btn').addEventListener('click', () => elements.barcodeModal.close());
    elements.cleanupImagesBtn.addEventListener('click', handleImageCleanup);
    elements.regenerateSkuBtn.addEventListener('click', () => {
        const existingSkus = new Set(appState.inventory.map(item => item.sku));
        document.getElementById('item-sku').value = generateUniqueSKU(existingSkus);
    });
}

// --- INITIALIZATION ---

async function initializeApp() {
    console.log('Initializing Inventory Management App...');
    setupEventListeners();
    loadConfig();
    const savedTheme = localStorage.getItem('inventoryAppTheme') || 'light';
    ui.setTheme(savedTheme);

    if (appState.syncConfig) {
        const data = await api.fetchFromGitHub();
        if (data) {
            appState.inventory = data.inventory;
            appState.fileSha = data.sha;
        } else {
            loadLocalInventory();
        }
    } else {
        loadLocalInventory();
    }
    ui.renderInventory();
    console.log('App Initialized Successfully.');
}

// Start the application
initializeApp();