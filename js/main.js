// js/main.js
import { appState } from './state.js';
import { generateUniqueSKU } from './utils.js';
import * as api from './api.js';
import { ConflictError } from './api.js'; // Import the custom error
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
        let parsedData = JSON.parse(savedInventory);
        // Backward compatibility for old local data structure
        if (Array.isArray(parsedData)) {
            appState.inventory = { items: parsedData, lastArchiveTimestamp: null };
        } else {
            appState.inventory = parsedData;
        }
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

async function handleSaleFormSubmit(e) {
    e.preventDefault();
    const saveButton = document.getElementById('confirm-sale-btn');
    saveButton.disabled = true;

    const itemId = document.getElementById('sale-item-id').value;
    const item = appState.inventory.items.find(i => i.id === itemId);
    const quantityToSell = parseInt(document.getElementById('sale-quantity').value, 10);
    const salePrice = parseFloat(document.getElementById('sale-price').value);

    if (!item) {
        ui.showStatus('خطأ: المنتج غير موجود.', 'error', { duration: 5000 });
        saveButton.disabled = false;
        return;
    }
    if (item.quantity < quantityToSell) {
        ui.showStatus(`لا يمكن بيع هذه الكمية، المتبقي: ${item.quantity} فقط.`, 'error', { duration: 5000 });
        saveButton.disabled = false;
        return;
    }
    if (quantityToSell <= 0) {
        ui.showStatus('خطأ: يرجى إدخال كمية صحيحة.', 'error', { duration: 5000 });
        saveButton.disabled = false;
        return;
    }

    ui.showStatus('جاري تسجيل البيع...', 'syncing');
    item.quantity -= quantityToSell;

    const isIQD = appState.activeCurrency === 'IQD';

    const saleRecord = {
        saleId: `sale_${Date.now()}`,
        itemId: item.id,
        itemName: item.name,
        quantitySold: quantityToSell,
        sellPriceIqd: isIQD ? salePrice : item.sellPriceIqd,
        costPriceIqd: item.costPriceIqd || 0,
        sellPriceUsd: !isIQD ? salePrice : item.sellPriceUsd,
        costPriceUsd: item.costPriceUsd || 0,
        saleDate: document.getElementById('sale-date').value,
        notes: document.getElementById('sale-notes').value,
        timestamp: new Date().toISOString()
    };
    appState.sales.push(saleRecord);
    ui.renderInventory();

    try {
        await api.saveToGitHub();
        await api.saveSales();
        saveLocalData();
        ui.showStatus('تم تسجيل البيع بنجاح!', 'success');
        ui.getDOMElements().saleModal.close();
    } catch (error) {
        if (error instanceof ConflictError) {
            ui.showStatus(
                'البيانات غير محدّثة. يرجى تحديث الصفحة والمحاولة مرة أخرى.',
                'error',
                { showRefreshButton: true }
            );
        } else {
            ui.showStatus(`فشل تسجيل البيع: ${error.message}`, 'error', { duration: 5000 });
        }
        item.quantity += quantityToSell; // Revert quantity
        appState.sales.pop();
        ui.renderInventory();
    } finally {
        if(appState.currentView === 'dashboard') {
            ui.renderDashboard();
        }
        saveButton.disabled = false;
    }
}

async function handleItemFormSubmit(e) {
    e.preventDefault();
    const saveButton = document.getElementById('save-item-btn');
    saveButton.disabled = true;
    ui.showStatus('جاري الحفظ...', 'syncing');

    const originalInventoryState = JSON.parse(JSON.stringify(appState.inventory));
    const itemId = document.getElementById('item-id').value;
    
    try {
        let imagePath = null;
        if(itemId){
            const existingItem = appState.inventory.items.find(i => i.id === itemId);
            if(existingItem) imagePath = existingItem.imagePath;
        }

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
        
        const index = appState.inventory.items.findIndex(i => i.id === itemId);
        if (index !== -1) {
            appState.inventory.items[index] = itemData;
        } else {
            appState.inventory.items.push(itemData);
        }
        
        ui.renderInventory();
        ui.renderCategoryFilter();
        
        await api.saveToGitHub();
        saveLocalData();
        
        ui.showStatus('تم حفظ التغييرات بنجاح!', 'success');
        ui.getDOMElements().itemModal.close();

        if (appState.currentItemId === itemData.id) {
            ui.openDetailsModal(itemData.id);
        }
    } catch (error) {
        appState.inventory = originalInventoryState;
        ui.renderInventory();
        if (error instanceof ConflictError) {
            ui.showStatus(
                'خطأ: قام مستخدم آخر بتحديث البيانات. يرجى التحديث.',
                'error',
                { showRefreshButton: true }
            );
        } else {
            ui.showStatus(`فشل الحفظ: ${error.message}`, 'error', { duration: 5000 });
        }
    } finally {
        saveButton.disabled = false;
        appState.selectedImageFile = null;
    }
}


async function handleImageCleanup() {
    if (!appState.syncConfig) {
        ui.showStatus('يرجى إعداد المزامنة أولاً.', 'error', { duration: 5000 });
        return;
    }
    if (!confirm('هل أنت متأكد من رغبتك في حذف جميع الصور غير المستخدمة نهائياً من المستودع؟ لا يمكن التراجع عن هذا الإجراء.')) {
        return;
    }
    ui.showStatus('جاري البحث عن الصور غير المستخدمة...', 'syncing');
    try {
        const allRepoImages = await api.getGitHubDirectoryListing('images');
        const usedImages = new Set(appState.inventory.items.map(item => item.imagePath).filter(Boolean));
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
        ui.showStatus(`تم حذف ${deletedCount} صورة غير مستخدمة بنجاح.`, 'success', { duration: 5000 });
    } catch (error) {
        ui.showStatus(`حدث خطأ: ${error.message}`, 'error', { duration: 5000 });
    }
}

// --- Archive Feature Handlers ---

async function handleManualArchive() {
    if (!appState.syncConfig || !appState.sales || appState.sales.length === 0) {
        ui.showStatus('لا توجد بيانات للمزامنة أو الأرشفة.', 'error', { duration: 4000 });
        return;
    }

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;

    const salesByMonth = appState.sales.reduce((acc, sale) => {
        const saleDate = new Date(sale.saleDate);
        const monthKey = `${saleDate.getFullYear()}_${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
        if (!acc[monthKey]) acc[monthKey] = [];
        acc[monthKey].push(sale);
        return acc;
    }, {});

    const archivesToCreate = Object.entries(salesByMonth).filter(([key]) => key !== currentMonthKey);

    if (archivesToCreate.length === 0) {
        ui.showStatus('لا توجد مبيعات من الشهور السابقة لأرشفتها.', 'success');
        return;
    }

    if (!confirm(`سيتم أرشفة المبيعات لـ ${archivesToCreate.length} شهر. هل أنت متأكد؟`)) {
        return;
    }
    
    ui.showStatus('جاري أرشفة البيانات...', 'syncing');

    try {
        for (const [monthKey, salesData] of archivesToCreate) {
            const path = `archives/sales_${monthKey}.json`;
            const content = JSON.stringify(salesData, null, 2);
            await api.createGitHubFile(path, content, `Manual archive for ${monthKey}`);
        }

        appState.sales = salesByMonth[currentMonthKey] || [];
        appState.inventory.lastArchiveTimestamp = new Date().toLocaleString('ar-EG');
        
        await api.saveSales();
        await api.saveToGitHub(); // Save inventory to persist the new timestamp
        saveLocalData();
        
        updateLastArchiveDateDisplay();

        ui.showStatus(`تمت أرشفة ${archivesToCreate.length} شهر من السجلات بنجاح.`, 'success', { duration: 5000 });

    } catch (error) {
        console.error('Manual archive failed:', error);
        ui.showStatus(`فشلت عملية الأرشفة: ${error.message}`, 'error', { duration: 5000 });
    }
}

function updateLastArchiveDateDisplay() {
    const lastArchiveDate = appState.inventory.lastArchiveTimestamp;
    const displayElement = document.getElementById('last-archive-date-display');
    if (lastArchiveDate) {
        displayElement.textContent = `آخر أرشفة: ${lastArchiveDate}`;
    } else {
        displayElement.textContent = 'آخر أرشفة: لم تتم بعد';
    }
}


async function openArchiveBrowser() {
    const modal = document.getElementById('archive-browser-modal');
    const listContainer = document.getElementById('archive-list-container');
    const detailsContainer = document.getElementById('archive-details-container');

    listContainer.innerHTML = '<p>جاري تحميل قائمة الأرشيف...</p>';
    detailsContainer.innerHTML = '<p>اختر شهراً من القائمة أعلاه لعرض تفاصيله.</p>';
    modal.showModal();

    try {
        const files = await api.getGitHubDirectoryListing('archives');
        if (files.length === 0) {
            listContainer.innerHTML = '<p>لا يوجد أرشيف لعرضه.</p>';
            return;
        }

        listContainer.innerHTML = '';
        files
            .sort((a,b) => b.name.localeCompare(a.name))
            .forEach(file => {
                const item = document.createElement('div');
                item.className = 'archive-item';
                
                const itemText = document.createElement('span');
                itemText.className = 'archive-item-text';
                itemText.textContent = file.name.replace('sales_', '').replace('.json', '').replace('_', '-');
                item.dataset.path = file.path; // Set path on the main item for viewing
                
                const deleteButton = document.createElement('button');
                deleteButton.className = 'archive-delete-btn';
                deleteButton.innerHTML = `<span class="material-symbols-outlined">delete</span>`;
                deleteButton.title = 'حذف الأرشيف';
                deleteButton.dataset.path = file.path; // Set path and sha for deletion
                deleteButton.dataset.sha = file.sha;

                item.appendChild(itemText);
                item.appendChild(deleteButton);
                listContainer.appendChild(item);
            });
    } catch (error) {
        listContainer.innerHTML = `<p style="color: var(--danger-color);">فشل تحميل الأرشيف: ${error.message}</p>`;
    }
}


// --- EVENT LISTENERS SETUP ---

function setupEventListeners() {
    const elements = ui.getDOMElements();
    let quantityInterval = null;
    
    elements.themeToggleBtn.addEventListener('click', () => ui.setTheme(document.body.classList.contains('theme-light') ? 'dark' : 'light'));
    elements.addItemBtn.addEventListener('click', () => ui.openItemModal());
    elements.syncSettingsBtn.addEventListener('click', ui.populateSyncModal);
    elements.currencyToggleBtn.addEventListener('click', () => {
        appState.activeCurrency = appState.activeCurrency === 'IQD' ? 'USD' : 'IQD';
        localStorage.setItem('inventoryAppCurrency', appState.activeCurrency);
        ui.updateCurrencyDisplay();
    });
    elements.inventoryToggleBtn.addEventListener('click', () => ui.toggleView('inventory'));
    elements.dashboardToggleBtn.addEventListener('click', () => ui.toggleView('dashboard'));

    elements.timeFilterControls.addEventListener('click', (e) => {
        const button = e.target.closest('.time-filter-btn');
        if (button) {
            appState.dashboardPeriod = button.dataset.period;
            elements.timeFilterControls.querySelector('.active').classList.remove('active');
            button.classList.add('active');
            ui.renderDashboard();
        }
    });

    elements.inventoryGrid.addEventListener('click', (e) => {
        const detailsBtn = e.target.closest('.details-btn');
        const sellBtn = e.target.closest('.sell-btn');
        const card = e.target.closest('.product-card');

        if (!card) return;
        const itemId = card.dataset.id;
        
        if (detailsBtn) ui.openDetailsModal(itemId);
        if (sellBtn) ui.openSaleModal(itemId);
    });
    
    elements.closeDetailsModalBtn.addEventListener('click', () => elements.detailsModal.close());
    const stopQuantityChange = async () => {
        if (quantityInterval) {
            clearInterval(quantityInterval);
            quantityInterval = null;
            try {
                await api.saveToGitHub();
            } catch (error) {
                 ui.showStatus(`فشل المزامنة: ${error.message}`, 'error', { duration: 5000 });
            }
        }
    };
    const startQuantityChange = (action) => {
        action();
        quantityInterval = setInterval(action, 100);
    };
    elements.detailsIncreaseBtn.addEventListener('mousedown', () => startQuantityChange(() => {
        const item = appState.inventory.items.find(i => i.id === appState.currentItemId);
        if (item) {
            item.quantity++;
            elements.detailsQuantityValue.textContent = item.quantity;
            ui.renderInventory();
        }
    }));
    elements.detailsDecreaseBtn.addEventListener('mousedown', () => startQuantityChange(() => {
        const item = appState.inventory.items.find(i => i.id === appState.currentItemId);
        if (item && item.quantity > 0) {
            item.quantity--;
            elements.detailsQuantityValue.textContent = item.quantity;
            ui.renderInventory();
        } else {
            stopQuantityChange();
        }
    }));
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
            const originalInventory = JSON.parse(JSON.stringify(appState.inventory));
            appState.inventory.items = appState.inventory.items.filter(item => item.id !== appState.currentItemId);
            elements.detailsModal.close();
            ui.renderInventory();
            try {
                await api.saveToGitHub();
            } catch(error) {
                appState.inventory = originalInventory;
                ui.renderInventory();
                ui.showStatus('فشل الحذف، ربما قام مستخدم آخر بتحديث البيانات.', 'error', { showRefreshButton: true });
            }
        }
    });
    elements.detailsBarcodeBtn.addEventListener('click', () => ui.openBarcodeModal(appState.currentItemId));
    elements.downloadBarcodeBtn.addEventListener('click', () => ui.downloadBarcode());
    
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
            appState.selectedCategory = 'all';
            ui.renderCategoryFilter();
        }
        ui.renderInventory();
    });

    elements.categoryFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.categoryFilterDropdown.classList.toggle('show');
    });
    elements.categoryFilterDropdown.addEventListener('click', (e) => {
        const categoryItem = e.target.closest('.category-item');
        if (categoryItem) {
            appState.selectedCategory = categoryItem.dataset.category;
            ui.renderInventory();
            ui.renderCategoryFilter();
            elements.categoryFilterDropdown.classList.remove('show');
        }
    });
    document.addEventListener('click', (e) => {
        if (!elements.searchContainer.contains(e.target)) {
            elements.categoryFilterDropdown.classList.remove('show');
        }
    });

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
    document.getElementById('manual-archive-btn').addEventListener('click', handleManualArchive);
    document.getElementById('view-archives-btn').addEventListener('click', openArchiveBrowser);
    
    // Event listener for the entire archive list container
    const archiveListContainer = document.getElementById('archive-list-container');
    archiveListContainer.addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.archive-delete-btn');
        
        if (deleteButton) {
            e.stopPropagation(); // Prevent the item click from firing
            const path = deleteButton.dataset.path;
            const sha = deleteButton.dataset.sha;
            
            if (confirm(`هل أنت متأكد من حذف هذا الأرشيف (${path}) نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`)) {
                ui.showStatus('جاري حذف الأرشيف...', 'syncing');
                try {
                    await api.deleteFileFromGitHub(path, sha, `Delete archive file: ${path}`);
                    ui.showStatus('تم حذف الأرشيف بنجاح!', 'success');
                    
                    // Refresh the archive browser to show the updated list
                    openArchiveBrowser();

                } catch (error) {
                    ui.showStatus(`فشل حذف الأرشيف: ${error.message}`, 'error', { duration: 5000 });
                }
            }
        } else {
            // This is the original logic for viewing an archive
            const item = e.target.closest('.archive-item');
            if (!item) return;

            const container = item.parentElement;
            if(container.querySelector('.active')) {
                container.querySelector('.active').classList.remove('active');
            }
            item.classList.add('active');
            
            const detailsContainer = document.getElementById('archive-details-container');
            detailsContainer.innerHTML = '<p>جاري تحميل البيانات...</p>';
            try {
                const data = await api.fetchGitHubFile(item.dataset.path);
                const symbol = appState.activeCurrency === 'IQD' ? 'د.ع' : '$';
                let tableHTML = `<table class="archive-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>التاريخ</th></tr></thead><tbody>`;
                data.forEach(sale => {
                    const price = appState.activeCurrency === 'IQD' ? sale.sellPriceIqd : sale.sellPriceUsd;
                    tableHTML += `<tr><td>${sale.itemName}</td><td>${sale.quantitySold}</td><td>${price.toLocaleString()} ${symbol}</td><td>${sale.saleDate}</td></tr>`;
                });
                tableHTML += '</tbody></table>';
                detailsContainer.innerHTML = tableHTML;
            } catch (error) {
                detailsContainer.innerHTML = `<p style="color: var(--danger-color);">فشل تحميل الملف: ${error.message}</p>`;
            }
        }
    });

    const archiveBrowserModal = document.getElementById('archive-browser-modal');
    document.getElementById('close-archive-browser-btn').addEventListener('click', () => archiveBrowserModal.close());
    
    elements.regenerateSkuBtn.addEventListener('click', () => {
        const existingSkus = new Set(appState.inventory.items.map(item => item.sku));
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
            ui.showStatus(`خطأ في المزامنة: ${error.message}`, 'error', { duration: 5000 });
            loadLocalData();
        }
    } else {
        loadLocalData();
    }
    
    updateLastArchiveDateDisplay();
    ui.renderCategoryFilter();
    ui.updateCurrencyDisplay();
    ui.renderInventory();
    console.log('App Initialized Successfully.');
}

// Start the application
initializeApp();