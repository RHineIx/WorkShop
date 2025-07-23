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

function loadLocalData() {
    const savedInventory = localStorage.getItem('inventoryAppData');
    if (savedInventory) {
        appState.inventory = JSON.parse(savedInventory);
    }
    const savedSales = localStorage.getItem('salesAppData');
    if(savedSales) {
        appState.sales = JSON.parse(savedSales);
    }
}

function saveLocalData() {
    localStorage.setItem('inventoryAppData', JSON.stringify(appState.inventory));
    localStorage.setItem('salesAppData', JSON.stringify(appState.sales));
}


// --- CORE LOGIC HANDLERS ---

async function handleItemFormSubmit(e) {
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
            costPriceIqd: parseFloat(document.getElementById('item-cost-price-iqd').value) || 0,
            sellPriceIqd: parseFloat(document.getElementById('item-sell-price-iqd').value) || 0,
            costPriceUsd: parseFloat(document.getElementById('item-cost-price-usd').value) || 0,
            sellPriceUsd: parseFloat(document.getElementById('item-sell-price-usd').value) || 0,
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
        appState.selectedImageFile = null;
    }
}

async function handleSaleFormSubmit(e) {
    e.preventDefault();
    const saveButton = document.getElementById('confirm-sale-btn');
    saveButton.disabled = true;

    const itemId = document.getElementById('sale-item-id').value;
    const saleDate = document.getElementById('sale-date').value;
    const saleNotes = document.getElementById('sale-notes').value;
    const item = appState.inventory.find(i => i.id === itemId);

    if (!item) {
        ui.showStatus('خطأ: المنتج غير موجود.', 'error');
        saveButton.disabled = false;
        return;
    }
    
    if (appState.isSyncing) {
        ui.showStatus('المزامنة جارية بالفعل...', 'error', 1500);
        saveButton.disabled = false;
        return;
    }
    
    if (item.quantity <= 0) {
        ui.showStatus('لا يمكن بيع المنتج، الكمية صفر.', 'error');
        saveButton.disabled = false;
        return;
    }

    appState.isSyncing = true;
    ui.showStatus('جاري تسجيل البيع...', 'syncing');

    // 1. Decrease quantity
    item.quantity--;

    // 2. Create a sales record
    const saleRecord = {
        saleId: `sale_${Date.now()}`,
        itemId: item.id,
        itemName: item.name,
        quantitySold: 1,
        sellPriceIqd: item.sellPriceIqd || 0,
        costPriceIqd: item.costPriceIqd || 0,
        sellPriceUsd: item.sellPriceUsd || 0,
        costPriceUsd: item.costPriceUsd || 0,
        saleDate: saleDate,
        notes: saleNotes,
        timestamp: new Date().toISOString()
    };
    appState.sales.push(saleRecord);

    try {
        // 3. Save inventory first, then save sales
        await api.saveToGitHub();
        await api.saveSales();
        ui.showStatus('تم تسجيل البيع بنجاح!', 'success');
    } catch (error) {
        ui.showStatus(`فشل تسجيل البيع: ${error.message}`, 'error', 5000);
        // Revert changes in state if save fails
        item.quantity++;
        appState.sales.pop();
    } finally {
        // 4. Update the UI
        ui.getDOMElements().saleModal.close();
        ui.renderInventory();
        appState.isSyncing = false;
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
            await api.deleteFileFromGitHub(image.path, image.sha, `Cleanup: delete unused image ${image.name}`);
            deletedCount++;
        }
        ui.showStatus(`تم حذف ${deletedCount} صورة غير مستخدمة بنجاح.`, 'success', 5000);
    } catch (error) {
        ui.showStatus(`حدث خطأ: ${error.message}`, 'error', 5000);
    }
}

// --- EVENT LISTENERS SETUP ---

function setupEventListeners() {
    const elements = ui.getDOMElements();
    let quantityInterval = null;

    // Header Controls
    elements.themeToggleBtn.addEventListener('click', () => ui.setTheme(document.body.classList.contains('theme-light') ? 'dark' : 'light'));
    elements.addItemBtn.addEventListener('click', () => ui.openItemModal());
    elements.syncSettingsBtn.addEventListener('click', ui.populateSyncModal);
    elements.currencyToggleBtn.addEventListener('click', () => {
        appState.activeCurrency = appState.activeCurrency === 'IQD' ? 'USD' : 'IQD';
        localStorage.setItem('inventoryAppCurrency', appState.activeCurrency);
        ui.updateCurrencyDisplay();
    });

    // Main Grid Interaction
    elements.inventoryGrid.addEventListener('click', (e) => {
        const detailsBtn = e.target.closest('.details-btn');
        const sellBtn = e.target.closest('.sell-btn');
        const card = e.target.closest('.product-card');

        if (!card) return;
        const itemId = card.dataset.id;
        
        if (detailsBtn) {
            ui.openDetailsModal(itemId);
        }

        if (sellBtn) {
            ui.openSaleModal(itemId);
        }
    });

    // Details Modal
    elements.closeDetailsModalBtn.addEventListener('click', () => elements.detailsModal.close());
    const stopQuantityChange = () => {
        if (quantityInterval) {
            clearInterval(quantityInterval);
            quantityInterval = null;
            api.saveToGitHub();
        }
    };
    const startQuantityChange = (action) => {
        action();
        quantityInterval = setInterval(action, 100);
    };
    elements.detailsIncreaseBtn.addEventListener('mousedown', () => {
        startQuantityChange(() => {
            const item = appState.inventory.find(i => i.id === appState.currentItemId);
            if (item) {
                item.quantity++;
                elements.detailsQuantityValue.textContent = item.quantity;
                ui.renderInventory();
            }
        });
    });
    elements.detailsDecreaseBtn.addEventListener('mousedown', () => {
        startQuantityChange(() => {
            const item = appState.inventory.find(i => i.id === appState.currentItemId);
            if (item && item.quantity > 0) {
                item.quantity--;
                elements.detailsQuantityValue.textContent = item.quantity;
                ui.renderInventory();
            } else {
                stopQuantityChange();
            }
        });
    });
    ['mouseup', 'mouseleave', 'touchend'].forEach(eventType => {
        elements.detailsIncreaseBtn.addEventListener(eventType, stopQuantityChange);
        elements.detailsDecreaseBtn.addEventListener(eventType, stopQuantityChange);
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
    elements.itemForm.addEventListener('submit', handleItemFormSubmit);
    elements.cancelItemBtn.addEventListener('click', () => elements.itemModal.close());
    
    elements.saleForm.addEventListener('submit', handleSaleFormSubmit);
    elements.cancelSaleBtn.addEventListener('click', () => elements.saleModal.close());

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
        await initializeApp();
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
    const savedCurrency = localStorage.getItem('inventoryAppCurrency') || 'IQD';
    appState.activeCurrency = savedCurrency;
    ui.setTheme(savedTheme);
    
    if (appState.syncConfig) {
        ui.showStatus('جاري مزامنة البيانات...', 'syncing');
        try {
            const [inventoryResult, salesResult] = await Promise.all([
                api.fetchFromGitHub(),
                api.fetchSales()
            ]);

            if (inventoryResult) {
                appState.inventory = inventoryResult.data;
                appState.fileSha = inventoryResult.sha;
            }
            if (salesResult) {
                appState.sales = salesResult.data;
                appState.salesFileSha = salesResult.sha;
            }
            saveLocalData();
            ui.showStatus('تمت المزامنة بنجاح!', 'success');
        } catch(error) {
            ui.showStatus(`خطأ في المزامنة: ${error.message}`, 'error', 5000);
            loadLocalData();
        }
    } else {
        loadLocalData();
    }
    
    ui.updateCurrencyDisplay();
    console.log('App Initialized Successfully.');
}

// Start the application
initializeApp();