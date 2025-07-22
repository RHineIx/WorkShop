// js/ui.js
import { appState } from './state.js';
import { fetchImageWithAuth } from './api.js';
import { sanitizeHTML, generateUniqueSKU } from './utils.js';

// Get all DOM elements once
const elements = {
    inventoryGrid: document.getElementById('inventory-grid'),
    detailsModal: document.getElementById('details-modal'),
    closeDetailsModalBtn: document.getElementById('close-details-modal-btn'),
    detailsImage: document.getElementById('details-image'),
    detailsImagePlaceholder: document.getElementById('details-image-placeholder'),
    detailsName: document.getElementById('details-name'),
    detailsSku: document.getElementById('details-sku'),
    detailsPrice: document.getElementById('details-price'),
    detailsQuantityValue: document.getElementById('details-quantity-value'),
    itemModal: document.getElementById('item-modal'),
    itemForm: document.getElementById('item-form'),
    modalTitle: document.getElementById('modal-title'),
    itemIdInput: document.getElementById('item-id'),
    imagePreview: document.getElementById('image-preview'),
    imagePlaceholder: document.getElementById('image-placeholder'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    totalItemsStat: document.getElementById('total-items-stat'),
    lowStockStat: document.getElementById('low-stock-stat'),
    syncModal: document.getElementById('sync-modal'),
    githubUsernameInput: document.getElementById('github-username'),
    githubRepoInput: document.getElementById('github-repo'),
    githubPatInput: document.getElementById('github-pat'),
    barcodeModal: document.getElementById('barcode-modal'),
    barcodeItemName: document.getElementById('barcode-item-name'),
    barcodeSvg: document.getElementById('barcode-svg'),
    statusIndicator: document.getElementById('status-indicator'),
    regenerateSkuBtn: document.getElementById('regenerate-sku-btn'),
};

export function getDOMElements() {
    return elements;
}

export const showStatus = (message, type, duration = 3000) => {
    elements.statusIndicator.textContent = message;
    elements.statusIndicator.className = `status-indicator ${type} show`;
    if (type !== 'syncing') {
        setTimeout(() => {
            elements.statusIndicator.classList.remove('show');
        }, duration);
    }
};

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
            card.dataset.id = item.id; // Set dataset for event delegation
            if (item.quantity <= item.alertLevel) {
                card.classList.add('low-stock');
            }
            const placeholder = `<div class="card-image-placeholder"><span class="material-symbols-outlined">key</span></div>`;
            card.innerHTML = `
                <div class="card-image-container">
                    ${item.imagePath ? `<img class="card-image" alt="${sanitizeHTML(item.name)}">` : placeholder}
                </div>
                <div class="card-info">
                    <div class="card-name">${sanitizeHTML(item.name)}</div>
                    <div class="card-footer">
                        <div class="card-price">${sanitizeHTML(String(item.sellPrice))} د.ع</div>
                        <button class="card-details-btn">+</button>
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

export const updateStats = () => {
    elements.totalItemsStat.textContent = appState.inventory.length;
    elements.lowStockStat.textContent = appState.inventory.filter(item => item.quantity <= item.alertLevel).length;
};

export const setTheme = (themeName) => {
    document.body.className = `theme-${themeName}`;
    elements.themeToggleBtn.querySelector('.material-symbols-outlined').textContent = themeName === 'dark' ? 'dark_mode' : 'light_mode';
    localStorage.setItem('inventoryAppTheme', themeName);
};

// --- MODAL UI FUNCTIONS ---

export const openDetailsModal = (itemId) => {
    const item = appState.inventory.find(i => i.id === itemId);
    if (!item) return;
    appState.currentItemId = itemId;
    elements.detailsName.textContent = item.name;
    elements.detailsSku.textContent = `SKU: ${sanitizeHTML(item.sku || 'N/A')}`;
    elements.detailsPrice.textContent = `${sanitizeHTML(String(item.sellPrice))} د.ع`;
    elements.detailsQuantityValue.textContent = item.quantity;
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

export const openItemModal = (itemId = null) => {
    elements.itemForm.reset();
    appState.selectedImageFile = null;
    elements.imagePreview.src = '#';
    elements.imagePreview.classList.add('image-preview-hidden');
    elements.imagePlaceholder.style.display = 'flex';
    elements.regenerateSkuBtn.style.display = 'none';

    if (itemId) {
        const item = appState.inventory.find(i => i.id === itemId);
        if (item) {
            elements.modalTitle.textContent = "تعديل منتج";
            elements.itemIdInput.value = item.id;
            document.getElementById('item-sku').value = item.sku;
            document.getElementById('item-name').value = item.name;
            document.getElementById('item-category').value = item.category;
            document.getElementById('item-quantity').value = item.quantity;
            document.getElementById('item-alert-level').value = item.alertLevel;
            document.getElementById('item-cost-price').value = item.costPrice;
            document.getElementById('item-sell-price').value = item.sellPrice;
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
    } else {
        elements.modalTitle.textContent = "إضافة منتج جديد";
        elements.itemIdInput.value = '';
        const existingSkus = new Set(appState.inventory.map(item => item.sku));
        document.getElementById('item-sku').value = generateUniqueSKU(existingSkus);
        elements.regenerateSkuBtn.style.display = 'flex';
    }
    elements.itemModal.showModal();
};

export const openBarcodeModal = (itemId) => {
    const item = appState.inventory.find(i => i.id === itemId);
    if (item && item.sku) {
        elements.barcodeItemName.textContent = item.name;
        try {
            JsBarcode(elements.barcodeSvg, item.sku, {
                format: "CODE128", lineColor: "#000", width: 2, height: 100, displayValue: true
            });
            elements.barcodeModal.showModal();
        } catch (error) {
            alert("خطأ في إنشاء الباركود. تأكد من أن SKU صالح.");
        }
    } else {
        alert("هذا المنتج لا يحتوي على SKU لإنشاء باركود.");
    }
};

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

export const populateSyncModal = () => {
    if (appState.syncConfig) {
        elements.githubUsernameInput.value = appState.syncConfig.username;
        elements.githubRepoInput.value = appState.syncConfig.repo;
        elements.githubPatInput.value = appState.syncConfig.pat;
    }
    elements.syncModal.showModal();
};