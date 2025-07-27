// js/ui.js
import { appState } from './state.js';
import { fetchImageWithAuth } from './api.js';
import { sanitizeHTML } from './utils.js';

// Get all DOM elements once to be used throughout this module
const elements = {
    // Main Layout
    inventoryGrid: document.getElementById('inventory-grid'),
    searchBar: document.getElementById('search-bar'),
    statsContainer: document.getElementById('stats-cards'),
    totalItemsStat: document.getElementById('total-items-stat'),
    lowStockStat: document.getElementById('low-stock-stat'),
    statusIndicator: document.getElementById('status-indicator'),
    searchContainer: document.getElementById('search-container'),
    categoryFilterBtn: document.getElementById('category-filter-btn'),
    categoryFilterDropdown: document.getElementById('category-filter-dropdown'),
    
    // Header
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    addItemBtn: document.getElementById('add-item-btn'),
    syncSettingsBtn: document.getElementById('sync-settings-btn'),
    currencyToggleBtn: document.getElementById('currency-toggle-btn'),
    inventoryToggleBtn: document.getElementById('inventory-toggle-btn'),
    dashboardToggleBtn: document.getElementById('dashboard-toggle-btn'),

    // View Containers
    inventoryViewContainer: document.getElementById('inventory-view-container'),
    dashboardViewContainer: document.getElementById('dashboard-view-container'),

    // Dashboard Elements
    timeFilterControls: document.getElementById('time-filter-controls'),
    totalSalesStat: document.getElementById('total-sales-stat'),
    totalProfitStat: document.getElementById('total-profit-stat'),
    bestsellersList: document.getElementById('bestsellers-list'),

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
    categoryDatalist: document.getElementById('category-list'),
    imagePlaceholder: document.getElementById('image-placeholder'),
    regenerateSkuBtn: document.getElementById('regenerate-sku-btn'),

    // Sale Modal
    saleModal: document.getElementById('sale-modal'),
    saleForm: document.getElementById('sale-form'),
    saleItemIdInput: document.getElementById('sale-item-id'),
    saleItemName: document.getElementById('sale-item-name'),
    cancelSaleBtn: document.getElementById('cancel-sale-btn'),
    saleQuantityInput: document.getElementById('sale-quantity'),
    saleIncreaseBtn: document.getElementById('sale-increase-btn'),
    saleDecreaseBtn: document.getElementById('sale-decrease-btn'),

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
    
    // --- NEW: Supplier UI Elements ---
    supplierManagerModal: document.getElementById('supplier-manager-modal'),
    closeSupplierManagerBtn: document.getElementById('close-supplier-manager-btn'),
    supplierListContainer: document.getElementById('supplier-list-container'),
    supplierForm: document.getElementById('supplier-form'),
    supplierFormTitle: document.getElementById('supplier-form-title'),
    supplierIdInput: document.getElementById('supplier-id'),
    cancelEditSupplierBtn: document.getElementById('cancel-edit-supplier-btn'),
    manageSuppliersBtn: document.getElementById('manage-suppliers-btn'),
    itemSupplierSelect: document.getElementById('item-supplier'),
    supplierDetailsContainer: document.getElementById('supplier-details-container'),
    detailsSupplierName: document.getElementById('details-supplier-name'),
    detailsSupplierPhone: document.getElementById('details-supplier-phone'),
    detailsSupplierWhatsapp: document.getElementById('details-supplier-whatsapp'),
};

export function getDOMElements() {
    return elements;
}

export function renderCategoryFilter() {
    const categories = [...new Set(appState.inventory.items.map(item => item.category).filter(Boolean))];
    elements.categoryFilterDropdown.innerHTML = '';

    const allItem = document.createElement('div');
    allItem.className = 'category-item';
    allItem.textContent = 'عرض الكل';
    allItem.dataset.category = 'all';
    if (appState.selectedCategory === 'all') {
        allItem.classList.add('active');
    }
    elements.categoryFilterDropdown.appendChild(allItem);
    
    categories.forEach(category => {
        const categoryItem = document.createElement('div');
        categoryItem.className = 'category-item';
        categoryItem.textContent = sanitizeHTML(category);
        categoryItem.dataset.category = category;
        if (appState.selectedCategory === category) {
            categoryItem.classList.add('active');
        }
        elements.categoryFilterDropdown.appendChild(categoryItem);
    });
}

/**
 * Populates the category datalist for the item form input.
 */
export function populateCategoryDatalist() {
    const categories = [...new Set(appState.inventory.items.map(item => item.category).filter(Boolean))];
    const datalist = elements.categoryDatalist;
    datalist.innerHTML = ''; // Clear previous options
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = sanitizeHTML(category);
        datalist.appendChild(option);
    });
}

export const showStatus = (message, type, options = {}) => {
    const { duration = 3000, showRefreshButton = false } = options;
    elements.statusIndicator.innerHTML = '';
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    elements.statusIndicator.appendChild(messageSpan);
    
    if (showRefreshButton) {
        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'تحديث';
        refreshButton.className = 'status-refresh-btn';
        refreshButton.onclick = () => location.reload();
        elements.statusIndicator.appendChild(refreshButton);
    }
    
    elements.statusIndicator.className = `status-indicator ${type} show`;
    
    if (type !== 'syncing' && !showRefreshButton) {
        setTimeout(() => {
            elements.statusIndicator.classList.remove('show');
        }, duration);
    }
};

export const toggleView = (viewToShow) => {
    appState.currentView = viewToShow;
    const isInventory = viewToShow === 'inventory';
    
    elements.inventoryViewContainer.classList.toggle('view-hidden', !isInventory);
    elements.dashboardViewContainer.classList.toggle('view-hidden', isInventory);
    elements.inventoryToggleBtn.classList.toggle('active-view-btn', isInventory);
    elements.dashboardToggleBtn.classList.toggle('active-view-btn', !isInventory);
    
    if (!isInventory) {
        renderDashboard();
    }
};

export const renderDashboard = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate;
    switch (appState.dashboardPeriod) {
        case 'week':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 6);
            break;
        case 'month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'today':
        default:
            startDate = today;
            break;
    }

    const filteredSales = appState.sales.filter(sale => new Date(sale.saleDate) >= startDate && new Date(sale.saleDate) <= now);
    const isIQD = appState.activeCurrency === 'IQD';
    const totalSales = filteredSales.reduce((sum, sale) => sum + (isIQD ? sale.sellPriceIqd : sale.sellPriceUsd), 0);
    const totalCost = filteredSales.reduce((sum, sale) => sum + (isIQD ? sale.costPriceIqd : sale.costPriceUsd), 0);
    const totalProfit = totalSales - totalCost;
    const symbol = isIQD ? 'د.ع' : '$';

    elements.totalSalesStat.textContent = `${totalSales.toLocaleString()} ${symbol}`;
    elements.totalProfitStat.textContent = `${totalProfit.toLocaleString()} ${symbol}`;

    const itemSales = {};
    filteredSales.forEach(sale => {
        itemSales[sale.itemId] = (itemSales[sale.itemId] || 0) + sale.quantitySold;
    });

    const sortedBestsellers = Object.entries(itemSales)
        .map(([itemId, count]) => {
            const item = appState.inventory.items.find(i => i.id === itemId);
            return { name: item ? item.name : 'منتج محذوف', count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    elements.bestsellersList.innerHTML = '';
    if (sortedBestsellers.length > 0) {
        sortedBestsellers.forEach(item => {
            const li = document.createElement('div');
            li.className = 'bestseller-item';
            li.innerHTML = `<span class="bestseller-name">${sanitizeHTML(item.name)}</span><span class="bestseller-count">بيع ${item.count}</span>`;
            elements.bestsellersList.appendChild(li);
        });
    } else {
        elements.bestsellersList.innerHTML = '<p>لا توجد مبيعات في هذه الفترة.</p>';
    }
};

/**
 * Renders skeleton loaders for the inventory grid.
 * @param {number} count The number of skeleton cards to render.
 */
export function renderInventorySkeleton(count = 8) {
    elements.inventoryGrid.innerHTML = ''; // Clear previous content
    for (let i = 0; i < count; i++) {
        const skeletonCard = document.createElement('div');
        skeletonCard.className = 'skeleton-card';
        skeletonCard.innerHTML = `
            <div class="skeleton skeleton-image"></div>
            <div class="skeleton-info">
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text w-75"></div>
                 <div class="skeleton skeleton-text w-50" style="margin-top: 12px;"></div>
            </div>
        `;
        elements.inventoryGrid.appendChild(skeletonCard);
    }
}

export const renderInventory = () => {
    renderInventorySkeleton(); // Show skeletons first

    setTimeout(() => { // Use setTimeout to allow the DOM to update and show the skeletons
        let filteredInventory = [...appState.inventory.items];

        if (appState.activeFilter === 'low_stock') {
            filteredInventory = filteredInventory.filter(item => item.quantity <= item.alertLevel);
        }
        if (appState.selectedCategory && appState.selectedCategory !== 'all') {
            filteredInventory = filteredInventory.filter(item => item.category === appState.selectedCategory);
        }
        if (appState.searchTerm) {
            const lowerCaseSearch = appState.searchTerm.toLowerCase();
            filteredInventory = filteredInventory.filter(item =>
                item.name.toLowerCase().includes(lowerCaseSearch) ||
                (item.sku && item.sku.toLowerCase().includes(lowerCaseSearch))
            );
        }
        
        elements.inventoryGrid.innerHTML = ''; // Clear skeletons now

        if (filteredInventory.length === 0) {
            elements.inventoryGrid.innerHTML = '<p class="empty-state">لا توجد منتجات تطابق بحثك...</p>';
        } else {
            filteredInventory.forEach(item => {
                const card = document.createElement('div');
                card.className = 'product-card';
                card.dataset.id = item.id;
                const isLowStock = item.quantity <= item.alertLevel;
                if (isLowStock) card.classList.add('low-stock');
                
                const isIQD = appState.activeCurrency === 'IQD';
                const price = isIQD ? (item.sellPriceIqd || 0) : (item.sellPriceUsd || 0);
                const symbol = isIQD ? 'د.ع' : '$';
                const placeholder = `<div class="card-image-placeholder"><span class="material-symbols-outlined">key</span></div>`;
                
                card.innerHTML = `
                    <div class="card-image-container">
                        <div class="quantity-badge ${isLowStock ? 'low-stock' : ''}">متبقي ${item.quantity}</div>
                        ${item.imagePath ? `<img class="card-image" alt="${sanitizeHTML(item.name)}">` : placeholder}
                    </div>
                    <div class="card-info">
                        <div class="card-name">${sanitizeHTML(item.name)}</div>
                        <div class="card-footer">
                            <div class="card-price">${price.toLocaleString()} ${symbol}</div>
                            <div class="card-actions">
                                <button class="icon-btn sell-btn" title="بيع قطعة واحدة"><span class="material-symbols-outlined">shopping_cart</span></button>
                                <button class="icon-btn details-btn" title="عرض التفاصيل"><span class="material-symbols-outlined">more_vert</span></button>
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
    }, 50); // A small delay like 50ms is enough
};

export const updateStats = () => {
    elements.totalItemsStat.textContent = appState.inventory.items.length;
    elements.lowStockStat.textContent = appState.inventory.items.filter(item => item.quantity <= item.alertLevel).length;
};

export const setTheme = (themeName) => {
    document.body.className = `theme-${themeName}`;
    elements.themeToggleBtn.querySelector('.material-symbols-outlined').textContent = themeName === 'dark' ? 'dark_mode' : 'light_mode';
    localStorage.setItem('inventoryAppTheme', themeName);
};

export const updateCurrencyDisplay = () => {
    const isIQD = appState.activeCurrency === 'IQD';
    elements.currencyToggleBtn.textContent = isIQD ? 'د.ع' : '$';
    if (appState.currentView === 'inventory') {
        renderInventory();
        if (elements.detailsModal.open && appState.currentItemId) {
            openDetailsModal(appState.currentItemId);
        }
    } else {
        renderDashboard();
    }
};

// --- NEW: Supplier UI Functions ---

export function renderSupplierList() {
    elements.supplierListContainer.innerHTML = '';
    if (appState.suppliers.length === 0) {
        elements.supplierListContainer.innerHTML = '<p>لا يوجد مورّدون حاليًا.</p>';
        return;
    }
    appState.suppliers.forEach(supplier => {
        const item = document.createElement('div');
        item.className = 'supplier-item';
        item.innerHTML = `
            <div>
                <strong>${sanitizeHTML(supplier.name)}</strong>
                <div class="text-secondary">${sanitizeHTML(supplier.phone || '')}</div>
            </div>
            <div class="supplier-item-actions">
                <button class="icon-btn edit-supplier-btn" data-id="${supplier.id}" title="تعديل المورّد">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button class="icon-btn danger-btn delete-supplier-btn" data-id="${supplier.id}" title="حذف المورّد">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
        `;
        elements.supplierListContainer.appendChild(item);
    });
}

export function populateSupplierDropdown(selectedSupplierId = null) {
    const select = elements.itemSupplierSelect;
    select.innerHTML = '<option value="">-- اختر مورّد --</option>';
    appState.suppliers.forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier.id;
        option.textContent = sanitizeHTML(supplier.name);
        if (supplier.id === selectedSupplierId) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// --- MODAL UI FUNCTIONS (with modifications) ---

export const openDetailsModal = (itemId) => {
    const item = appState.inventory.items.find(i => i.id === itemId);
    if (!item) return;
    appState.currentItemId = itemId;
    appState.itemStateBeforeEdit = JSON.parse(JSON.stringify(item));

    elements.detailsName.textContent = item.name;
    elements.detailsSku.textContent = `SKU: ${sanitizeHTML(item.sku || 'N/A')}`;
    elements.detailsQuantityValue.textContent = item.quantity;
    elements.detailsCostIqd.textContent = `${(item.costPriceIqd || 0).toLocaleString()} د.ع`;
    elements.detailsSellIqd.textContent = `${(item.sellPriceIqd || 0).toLocaleString()} د.ع`;
    elements.detailsCostUsd.textContent = `$${(item.costPriceUsd || 0).toLocaleString()}`;
    elements.detailsSellUsd.textContent = `$${(item.sellPriceUsd || 0).toLocaleString()}`;
    elements.detailsNotesContent.textContent = item.notes || 'لا توجد ملاحظات.';
    
    const supplier = appState.suppliers.find(s => s.id === item.supplierId);
    if (supplier) {
        elements.detailsSupplierName.textContent = sanitizeHTML(supplier.name);
        elements.detailsSupplierPhone.textContent = supplier.phone ? sanitizeHTML(supplier.phone) : 'لا يوجد';
        if (supplier.phone) {
            elements.detailsSupplierWhatsapp.href = `https://wa.me/${supplier.phone.replace(/[^0-9]/g, '')}`;
            elements.detailsSupplierWhatsapp.style.display = 'inline-flex';
        } else {
            elements.detailsSupplierWhatsapp.style.display = 'none';
        }
        elements.supplierDetailsContainer.classList.remove('view-hidden');
    } else {
        elements.supplierDetailsContainer.classList.add('view-hidden');
    }

    if (item.imagePath) {
        elements.detailsImage.style.display = 'block';
        elements.detailsImagePlaceholder.style.display = 'none';
        elements.detailsImage.src = ''; // Clear previous image
        elements.detailsImage.classList.add('skeleton'); // Add skeleton class

        fetchImageWithAuth(item.imagePath).then(blobUrl => {
            if (blobUrl) {
                elements.detailsImage.src = blobUrl;
                elements.detailsImage.onload = () => {
                    elements.detailsImage.classList.remove('skeleton'); // Remove skeleton on load
                };
            } else {
                // If fetching fails, remove skeleton and maybe show placeholder
                elements.detailsImage.classList.remove('skeleton');
            }
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
        const item = appState.inventory.items.find(i => i.id === itemId);
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
            
            populateSupplierDropdown(item.supplierId);

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
        elements.regenerateSkuBtn.style.display = 'flex';
        populateSupplierDropdown();
    }
    elements.itemModal.showModal();
};

export const openSaleModal = (itemId) => {
    const item = appState.inventory.items.find(i => i.id === itemId);
    if (!item) return;

    elements.saleForm.reset();
    elements.saleItemIdInput.value = item.id;
    elements.saleItemName.textContent = item.name;

    const saleQuantityInput = document.getElementById('sale-quantity');
    const salePriceInput = document.getElementById('sale-price');
    const isIQD = appState.activeCurrency === 'IQD';
    const price = isIQD ? (item.sellPriceIqd || 0) : (item.sellPriceUsd || 0);
    
    salePriceInput.value = price;
    salePriceInput.step = isIQD ? '250' : '0.01';
    saleQuantityInput.value = 1;
    saleQuantityInput.max = item.quantity;

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    document.getElementById('sale-date').value = `${year}-${month}-${day}`;

    elements.saleModal.showModal();
};

export const openBarcodeModal = (itemId) => {
    const item = appState.inventory.items.find(i => i.id === itemId);
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

export const downloadBarcode = () => {
    const item = appState.inventory.items.find(i => i.id === appState.currentItemId);
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
