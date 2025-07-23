// js/ui.js
import { appState } from './state.js';
import { fetchImageWithAuth } from './api.js';
import { sanitizeHTML, generateUniqueSKU } from './utils.js';

// Get all DOM elements once to be used throughout this module
const elements = {
    // Main Layout
    inventoryGrid: document.getElementById('inventory-grid'),
    searchBar: document.getElementById('search-bar'),
    statsContainer: document.getElementById('stats-cards'),
    totalItemsStat: document.getElementById('total-items-stat'),
    lowStockStat: document.getElementById('low-stock-stat'),
    statusIndicator: document.getElementById('status-indicator'),
    
    // Header
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    addItemBtn: document.getElementById('add-item-btn'),
    syncSettingsBtn: document.getElementById('sync-settings-btn'),
    currencyToggleBtn: document.getElementById('currency-toggle-btn'),

    // Details Modal
    detailsModal: document.getElementById('details-modal'),
    closeDetailsModalBtn: document.getElementById('close-details-modal-btn'),
    detailsImage: document.getElementById('details-image'),
    detailsImagePlaceholder: document.getElementById('details-image-placeholder'),
    detailsName: document.getElementById('details-name'),
    detailsSku: document.getElementById('details-sku'),
    detailsQuantityValue: document.getElementById('details-quantity-value'),
    detailsDecreaseBtn: document.getElementById('details-decrease-btn'),
    detailsIncreaseBtn: document.getElementById('details-increase-btn'),
    detailsNotesContent: document.getElementById('details-notes-content'),
    detailsEditBtn: document.getElementById('details-edit-btn'),
    detailsBarcodeBtn: document.getElementById('details-barcode-btn'),
    detailsDeleteBtn: document.getElementById('details-delete-btn'),
    detailsCostIqd: document.getElementById('details-cost-iqd'),
    detailsSellIqd: document.getElementById('details-sell-iqd'),
    detailsCostUsd: document.getElementById('details-cost-usd'),
    detailsSellUsd: document.getElementById('details-sell-usd'),

    // Add/Edit Modal
    itemModal: document.getElementById('item-modal'),
    itemForm: document.getElementById('item-form'),
    cancelItemBtn: document.getElementById('cancel-item-btn'),
    modalTitle: document.getElementById('modal-title'),
    itemIdInput: document.getElementById('item-id'),
    imageUploadInput: document.getElementById('item-image-upload'),
    imagePreview: document.getElementById('image-preview'),
    imagePlaceholder: document.getElementById('image-placeholder'),
    regenerateSkuBtn: document.getElementById('regenerate-sku-btn'),
    itemSupplier: document.getElementById('item-supplier'),

    // Sale Modal
    saleModal: document.getElementById('sale-modal'),
    saleForm: document.getElementById('sale-form'),
    saleItemIdInput: document.getElementById('sale-item-id'),
    saleItemName: document.getElementById('sale-item-name'),
    cancelSaleBtn: document.getElementById('cancel-sale-btn'),

    // Sync Modal
    syncModal: document.getElementById('sync-modal'),
    syncForm: document.getElementById('sync-form'),
    cancelSyncBtn: document.getElementById('cancel-sync-btn'),
    githubUsernameInput: document.getElementById('github-username'),
    githubRepoInput: document.getElementById('github-repo'),
    githubPatInput: document.getElementById('github-pat'),
    cleanupImagesBtn: document.getElementById('cleanup-images-btn'),
    
    // Barcode Modal
    barcodeModal: document.getElementById('barcode-modal'),
    barcodeItemName: document.getElementById('barcode-item-name'),
    barcodeSvg: document.getElementById('barcode-svg'),
    downloadBarcodeBtn: document.getElementById('download-barcode-btn'),
    closeBarcodeBtn: document.getElementById('close-barcode-btn'),
};

/**
 * Exports the collected DOM elements for use in other modules (primarily main.js).
 * @returns {Object} The elements object.
 */
export function getDOMElements() {
    return elements;
}

/**
 * Displays a status message at the bottom of the screen.
 */
export const showStatus = (message, type, duration = 3000) => {
    elements.statusIndicator.textContent = message;
    elements.statusIndicator.className = `status-indicator ${type} show`;
    if (type !== 'syncing') {
        setTimeout(() => {
            elements.statusIndicator.classList.remove('show');
        }, duration);
    }
};

/**
 * Renders the product cards in the main grid based on the current state.
 */
export const renderInventory = () => {
    elements.inventoryGrid.innerHTML = '';
    let filteredInventory = [...appState.inventory];
    if (appState.activeFilter === 'low_stock') {
        filteredInventory = filteredInventory.filter(item => item.quantity <= item.alertLevel);
    }
    if (appState.searchTerm) {
        const lowerCaseSearch = appState.searchTerm.toLowerCase();
        filteredInventory = filteredInventory.filter(item =>
            item.name.toLowerCase().includes(lowerCaseSearch) ||
            (item.sku && item.sku.toLowerCase().includes(lowerCaseSearch))
        );
    }

    if (filteredInventory.length === 0) {
        elements.inventoryGrid.innerHTML = '<p class="empty-state">لا توجد منتجات تطابق بحثك...</p>';
    } else {
        filteredInventory.forEach(item => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.dataset.id = item.id;
            if (item.quantity <= item.alertLevel) {
                card.classList.add('low-stock');
            }
            
            const isIQD = appState.activeCurrency === 'IQD';
            const price = isIQD ? (item.sellPriceIqd || 0) : (item.sellPriceUsd || 0);
            const symbol = isIQD ? 'د.ع' : '$';

            const placeholder = `<div class="card-image-placeholder"><span class="material-symbols-outlined">key</span></div>`;
            card.innerHTML = `
                <div class="card-image-container">
                    ${item.imagePath ? `<img class="card-image" alt="${sanitizeHTML(item.name)}">` : placeholder}
                </div>
                <div class="card-info">
                    <div class="card-name">${sanitizeHTML(item.name)}</div>
                    <div class="card-footer">
                        <div class="card-price">${sanitizeHTML(String(price))} ${symbol}</div>
                        <div class="card-actions">
                            <button class="icon-btn sell-btn" title="بيع قطعة واحدة" aria-label="بيع قطعة واحدة">
                                <span class="material-symbols-outlined">shopping_cart</span>
                            </button>
                            <button class="icon-btn details-btn" title="عرض التفاصيل" aria-label="عرض التفاصيل">
                                <span class="material-symbols-outlined">more_vert</span>
                            </button>
                        </div>
                    </div>
                </div>`;
            elements.inventoryGrid.appendChild(card);
            if (item.imagePath) {
                const imgElement = card.querySelector('.card-image');
                fetchImageWithAuth(item.imagePath).then(blobUrl => {
                    if (blobUrl) imgElement.src = blobUrl;
                });
            }
        });
    }
    updateStats();
};

/**
 * Updates the statistic cards with the latest inventory counts.
 */
export const updateStats = () => {
    elements.totalItemsStat.textContent = appState.inventory.length;
    elements.lowStockStat.textContent = appState.inventory.filter(item => item.quantity <= item.alertLevel).length;
};

/**
 * Sets the color theme for the application.
 */
export const setTheme = (themeName) => {
    document.body.className = `theme-${themeName}`;
    elements.themeToggleBtn.querySelector('.material-symbols-outlined').textContent = themeName === 'dark' ? 'dark_mode' : 'light_mode';
    localStorage.setItem('inventoryAppTheme', themeName);
};

/**
 * Updates the currency toggle button text and re-renders the UI.
 */
export const updateCurrencyDisplay = () => {
    const isIQD = appState.activeCurrency === 'IQD';
    elements.currencyToggleBtn.textContent = isIQD ? 'د.ع' : '$';
    renderInventory();

    if (elements.detailsModal.open && appState.currentItemId) {
        openDetailsModal(appState.currentItemId);
    }
};

// --- MODAL UI FUNCTIONS ---

/**
 * Populates and opens the details modal for a given item.
 */
export const openDetailsModal = (itemId) => {
    const item = appState.inventory.find(i => i.id === itemId);
    if (!item) return;
    appState.currentItemId = itemId;

    elements.detailsName.textContent = item.name;
    elements.detailsSku.textContent = `SKU: ${sanitizeHTML(item.sku || 'N/A')}`;
    elements.detailsQuantityValue.textContent = item.quantity;
    elements.detailsCostIqd.textContent = `${sanitizeHTML(String(item.costPriceIqd || 0))} د.ع`;
    elements.detailsSellIqd.textContent = `${sanitizeHTML(String(item.sellPriceIqd || 0))} د.ع`;
    elements.detailsCostUsd.textContent = `$${sanitizeHTML(String(item.costPriceUsd || 0))}`;
    elements.detailsSellUsd.textContent = `$${sanitizeHTML(String(item.sellPriceUsd || 0))}`;
    
    elements.detailsNotesContent.textContent = item.notes || 'لا توجد ملاحظات.';
    if (item.imagePath) {
        elements.detailsImage.style.display = 'block';
        elements.detailsImagePlaceholder.style.display = 'none';
        elements.detailsImage.src = '';
        fetchImageWithAuth(item.imagePath).then(blobUrl => {
            if (blobUrl) elements.detailsImage.src = blobUrl;
        });
    } else {
        elements.detailsImage.style.display = 'none';
        elements.detailsImagePlaceholder.style.display = 'flex';
    }
    elements.detailsModal.showModal();
};

/**
 * Opens the Add/Edit item modal.
 */
export const openItemModal = (itemId = null) => {
    elements.itemForm.reset();
    appState.selectedImageFile = null;
    elements.imagePreview.src = '#';
    elements.imagePreview.classList.add('image-preview-hidden');
    elements.imagePlaceholder.style.display = 'flex';
    elements.regenerateSkuBtn.style.display = 'none';

    if (itemId) { // Editing an existing item
        const item = appState.inventory.find(i => i.id === itemId);
        if (item) {
            elements.modalTitle.textContent = "تعديل منتج";
            elements.itemIdInput.value = item.id;
            document.getElementById('item-sku').value = item.sku;
            document.getElementById('item-name').value = item.name;
            document.getElementById('item-category').value = item.category;
            document.getElementById('item-quantity').value = item.quantity;
            document.getElementById('item-alert-level').value = item.alertLevel;
            document.getElementById('item-cost-price-iqd').value = item.costPriceIqd || 0;
            document.getElementById('item-sell-price-iqd').value = item.sellPriceIqd || 0;
            document.getElementById('item-cost-price-usd').value = item.costPriceUsd || 0;
            document.getElementById('item-sell-price-usd').value = item.sellPriceUsd || 0;
            document.getElementById('item-notes').value = item.notes;
            if (item.imagePath) {
                fetchImageWithAuth(item.imagePath).then(blobUrl => {
                    if (blobUrl) {
                        elements.imagePreview.src = blobUrl;
                        elements.imagePreview.classList.remove('image-preview-hidden');
                        elements.imagePlaceholder.style.display = 'none';
                    }
                });
            }
        }
    } else { // Adding a new item
        elements.modalTitle.textContent = "إضافة منتج جديد";
        elements.itemIdInput.value = '';
        const existingSkus = new Set(appState.inventory.map(item => item.sku));
        document.getElementById('item-sku').value = generateUniqueSKU(existingSkus);
        elements.regenerateSkuBtn.style.display = 'flex';
    }
    elements.itemModal.showModal();
};

/**
 * NEW: Opens and populates the "Confirm Sale" modal.
 * @param {string} itemId The ID of the item to be sold.
 */
export const openSaleModal = (itemId) => {
    const item = appState.inventory.find(i => i.id === itemId);
    if (!item) return;

    elements.saleForm.reset();
    elements.saleItemIdInput.value = item.id;
    elements.saleItemName.textContent = item.name;
    
    // Set date to today in YYYY-MM-DD format
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    document.getElementById('sale-date').value = `${year}-${month}-${day}`;

    elements.saleModal.showModal();
};



/**
 * Opens the barcode modal and generates a barcode for the given item.
 */
export const openBarcodeModal = (itemId) => {
    const item = appState.inventory.find(i => i.id === itemId);
    if (item && item.sku) {
        appState.currentItemId = item.id;
        elements.barcodeItemName.textContent = item.name;
        try {
            JsBarcode(elements.barcodeSvg, item.sku, {
                format: "CODE128", lineColor: "#000", width: 2, height: 100, displayValue: true
            });
            elements.barcodeModal.showModal();
        } catch (error) {
            console.error("Barcode generation error:", error);
            alert("خطأ في إنشاء الباركود. تأكد من أن SKU صالح.");
        }
    } else {
        alert("هذا المنتج لا يحتوي على SKU لإنشاء باركود.");
    }
};

/**
 * Triggers the download of the currently displayed barcode as a PNG image.
 */
export const downloadBarcode = () => {
    const item = appState.inventory.find(i => i.id === appState.currentItemId);
    if (!item) return;
    const svg = elements.barcodeSvg;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const scale = 5;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = function () {
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngUrl;
        downloadLink.download = `barcode_${item.sku}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
    };
    img.src = url;
};

/**
 * Populates the sync modal with saved configuration data and displays it.
 */
export const populateSyncModal = () => {
    if (appState.syncConfig) {
        elements.githubUsernameInput.value = appState.syncConfig.username;
        elements.githubRepoInput.value = appState.syncConfig.repo;
        elements.githubPatInput.value = appState.syncConfig.pat;
    }
    elements.syncModal.showModal();
};
