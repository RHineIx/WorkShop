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

    try {
        if (appState.selectedImageFile) {
            imagePath = await api.uploadImageToGitHub(appState.selectedImageFile);
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
        ui.showStatus('تم حفظ التغييرات في السحابة!', 'success');

        ui.getDOMElements().itemModal.close();
        if (appState.currentItemId === itemData.id) {
            ui.openDetailsModal(itemData.id);
        }
    } catch (error) {
        ui.showStatus(`فشل الحفظ: ${error.message}`, 'error', 5000);
    } finally {
        saveButton.disabled = false;
    }
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
    elements.addItemBtn.addEventListener('click', () => ui.openItemModal());
    elements.syncSettingsBtn.addEventListener('click', ui.populateSyncModal);

    // Main Grid Interaction
    elements.inventoryGrid.addEventListener('click', (e) => {
        const button = e.target.closest('.card-details-btn');
        if (button) {
            const card = e.target.closest('.product-card');
            if (card) ui.openDetailsModal(card.dataset.id);
        }
    });

    // Details Modal
    elements.closeDetailsModalBtn.addEventListener('click', () => elements.detailsModal.close());
    elements.detailsDecreaseBtn.addEventListener('click', async () => {
        const item = appState.inventory.find(i => i.id === appState.currentItemId);
        if (item && item.quantity > 0) {
            item.quantity--;
            ui.renderInventory();
            await api.saveToGitHub();
        }
    });
    elements.detailsIncreaseBtn.addEventListener('click', async () => {
        const item = appState.inventory.find(i => i.id === appState.currentItemId);
        if (item) {
            item.quantity++;
            ui.renderInventory();
            await api.saveToGitHub();
        }
    });
    elements.detailsEditBtn.addEventListener('click', () => {
        elements.detailsModal.close();
        ui.openItemModal(appState.currentItemId);
    });
    elements.detailsDeleteBtn.addEventListener('click', async () => {
        if (confirm('هل أنت متأكد من رغبتك في حذف هذا المنتج؟')) {
            appState.inventory = appState.inventory.filter(item => item.id !== appState.currentItemId);
            elements.detailsModal.close();
            ui.renderInventory();
            await api.saveToGitHub();
        }
    });
    elements.detailsBarcodeBtn.addEventListener('click', () => ui.openBarcodeModal(appState.currentItemId));
    elements.downloadBarcodeBtn.addEventListener('click', () => ui.downloadBarcode());
    
    // Search and Filter
    elements.searchBar.addEventListener('input', (e) => {
        appState.searchTerm = e.target.value;
        ui.renderInventory();
    });
    elements.statsContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.stat-card');
        if (!card) return;
        appState.searchTerm = '';
        elements.searchBar.value = '';
        if (card.classList.contains('low-stock-alert')) {
             appState.activeFilter = (appState.activeFilter === 'low_stock') ? 'all' : 'low_stock';
        } else {
            appState.activeFilter = 'all';
        }
        ui.renderInventory();
    });

    // Modals
    elements.cancelItemBtn.addEventListener('click', () => elements.itemModal.close());
    elements.itemForm.addEventListener('submit', handleFormSubmit);
    elements.imageUploadInput.addEventListener('change', (e) => {
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
        
        ui.showStatus('جاري مزامنة البيانات...', 'syncing');
        try {
            const data = await api.fetchFromGitHub();
            if (data) {
                appState.inventory = data.inventory;
                appState.fileSha = data.sha;
                saveLocalInventory();
                ui.renderInventory();
                ui.showStatus('تمت المزامنة بنجاح!', 'success');
            }
        } catch(error) {
             ui.showStatus(`خطأ في المزامنة: ${error.message}`, 'error', 5000);
             loadLocalInventory();
             ui.renderInventory();
        }
    });

    elements.closeBarcodeBtn.addEventListener('click', () => elements.barcodeModal.close());
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
        ui.showStatus('جاري مزامنة البيانات...', 'syncing');
        try {
            const data = await api.fetchFromGitHub();
            if (data) {
                appState.inventory = data.inventory;
                appState.fileSha = data.sha;
                saveLocalInventory(); // Save fetched data locally
                ui.showStatus('تمت المزامنة بنجاح!', 'success');
            }
        } catch(error) {
            ui.showStatus(`خطأ في المزامنة: ${error.message}`, 'error', 5000);
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