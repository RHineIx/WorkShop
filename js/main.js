// js/main.js
import { appState } from './state.js';
import { generateUniqueSKU, compressImage } from './utils.js';
import * as api from './api.js';
import { ConflictError } from './api.js';
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
    const savedSuppliers = localStorage.getItem('suppliersAppData');
    if(savedSuppliers) {
        appState.suppliers = JSON.parse(savedSuppliers);
    }
}

function saveLocalData() {
    localStorage.setItem('inventoryAppData', JSON.stringify(appState.inventory));
    localStorage.setItem('salesAppData', JSON.stringify(appState.sales));
    localStorage.setItem('suppliersAppData', JSON.stringify(appState.suppliers));
}


// --- CORE LOGIC HANDLERS ---

async function handleSaleFormSubmit(e) {
    e.preventDefault();
    const saveButton = document.getElementById('confirm-sale-btn');
    saveButton.disabled = true;
    ui.showStatus('التحقق من البيانات...', 'syncing');

    try {
        // --- NEW: Check-First Logic ---
        // 1. Fetch the latest version from GitHub before doing anything.
        const { sha: latestSha } = await api.fetchFromGitHub();

        // 2. Compare the latest SHA with the one we have locally.
        if (latestSha !== appState.fileSha) {
            // If they don't match, our data is stale. Abort the operation.
            ui.showStatus('البيانات غير محدّثة. تم تحديثها من جهاز آخر.', 'error', { showRefreshButton: true });
            saveButton.disabled = false;
            return;
        }

        // --- If check passes, continue with the sale ---
        const itemId = document.getElementById('sale-item-id').value;
        const item = appState.inventory.items.find(i => i.id === itemId);
        const quantityToSell = parseInt(document.getElementById('sale-quantity').value, 10);
        const salePrice = parseFloat(document.getElementById('sale-price').value);

        // Re-validate after getting confirmation that data is fresh
        if (!item || item.quantity < quantityToSell || quantityToSell <= 0) {
            ui.showStatus('خطأ في البيانات أو الكمية غير متوفرة.', 'error');
            saveButton.disabled = false;
            return;
        }
        
        ui.showStatus('جاري تسجيل البيع...', 'syncing');

        // 3. Update local state
        const originalQuantity = item.quantity; // Keep original quantity for rollback
        item.quantity -= quantityToSell;
        
        const saleRecord = {
            saleId: `sale_${Date.now()}`,
            itemId: item.id,
            itemName: item.name,
            quantitySold: quantityToSell,
            sellPriceIqd: appState.activeCurrency === 'IQD' ? salePrice : item.sellPriceIqd,
            costPriceIqd: item.costPriceIqd || 0,
            sellPriceUsd: appState.activeCurrency !== 'IQD' ? salePrice : item.sellPriceUsd,
            costPriceUsd: item.costPriceUsd || 0,
            saleDate: document.getElementById('sale-date').value,
            notes: document.getElementById('sale-notes').value,
            timestamp: new Date().toISOString()
        };
        appState.sales.push(saleRecord);
        ui.filterAndRenderItems();

        // 4. Save to GitHub
        // We wrap save operations in their own try...catch to handle potential network failures
        // and roll back the local changes if the save fails.
        try {
            await api.saveToGitHub();
            await api.saveSales();
            saveLocalData();
            
            ui.getDOMElements().saleModal.close();
            ui.showStatus('تم تسجيل البيع بنجاح!', 'success');
        } catch (saveError) {
            // If saving fails (e.g., network error), revert local changes
            item.quantity = originalQuantity;
            appState.sales.pop();
            ui.filterAndRenderItems();
            throw saveError; // Re-throw the error to be caught by the outer block
        }

    } catch (error) {
        // This will now catch check failures or save failures
        if (!(error instanceof ConflictError)) { // ConflictError is already handled by the check
            ui.showStatus(`فشل تسجيل البيع: ${error.message}`, 'error');
        }
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
    ui.showStatus('التحقق من البيانات...', 'syncing');

    try {
        // --- NEW: Check-First Logic ---
        const { data: latestInventory, sha: latestSha } = await api.fetchFromGitHub();
        if (latestSha !== appState.fileSha) {
            ui.showStatus('البيانات غير محدّثة. تم تحديثها من جهاز آخر.', 'error', { showRefreshButton: true });
            saveButton.disabled = false;
            return;
        }
        
        ui.showStatus('جاري الحفظ...', 'syncing');
        
        // Before making changes, update our local state to the latest version to avoid conflicts
        appState.inventory = latestInventory;
        appState.fileSha = latestSha;

        const itemId = document.getElementById('item-id').value;
        let imagePath = null;
        const existingItem = appState.inventory.items.find(i => i.id === itemId);
        if (existingItem) {
            imagePath = existingItem.imagePath;
        }

        if (appState.selectedImageFile) {
            ui.showStatus('جاري ضغط الصورة...', 'syncing');
            const compressedImageBlob = await compressImage(appState.selectedImageFile, { quality: 0.7, maxWidth: 1024, maxHeight: 1024 });
            imagePath = await api.uploadImageToGitHub(compressedImageBlob, appState.selectedImageFile.name);
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
            supplierId: document.getElementById('item-supplier').value || null,
        };
        
        const index = appState.inventory.items.findIndex(i => i.id === itemId);
        if (index !== -1) {
            appState.inventory.items[index] = itemData;
        } else {
            appState.inventory.items.push(itemData);
        }
        
        ui.filterAndRenderItems();
        ui.renderCategoryFilter();
        ui.populateCategoryDatalist();
        
        await api.saveToGitHub();
        saveLocalData();
        
        ui.getDOMElements().itemModal.close();
        ui.showStatus('تم حفظ التغييرات بنجاح!', 'success');

        if (appState.currentItemId === itemData.id) {
            ui.openDetailsModal(itemData.id);
        }
    } catch (error) {
        ui.showStatus(`فشل الحفظ: ${error.message}`, 'error');
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

async function handleSupplierFormSubmit(e) {
    e.preventDefault();
    const elements = ui.getDOMElements();
    const id = elements.supplierIdInput.value;
    const name = document.getElementById('supplier-name').value.trim();
    const phone = document.getElementById('supplier-phone').value.trim();
    if (!name) {
        ui.showStatus('يرجى إدخال اسم المورّد.', 'error');
        return;
    }

    if (id) {
        const supplier = appState.suppliers.find(s => s.id === id);
        if (supplier) {
            supplier.name = name;
            supplier.phone = phone;
        }
    } else {
        if (appState.suppliers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
            ui.showStatus('هذا المورّد موجود بالفعل.', 'error');
            return;
        }
        const newSupplier = { id: `sup_${Date.now()}`, name, phone };
        appState.suppliers.push(newSupplier);
    }
    
    const actionText = id ? 'تعديل' : 'إضافة';
    ui.showStatus(`جاري ${actionText} المورّد...`, 'syncing');
    try {
        await api.saveSuppliers();
        ui.renderSupplierList();
        ui.populateSupplierDropdown(elements.itemSupplierSelect.value);
        ui.showStatus(`تم ${actionText} المورّد بنجاح!`, 'success');
        elements.supplierForm.reset();
        elements.supplierIdInput.value = '';
        elements.supplierFormTitle.textContent = 'إضافة مورّد جديد';
        elements.cancelEditSupplierBtn.classList.add('view-hidden');
    } catch (error) {
        ui.showStatus(`فشل حفظ المورّد: ${error.message}`, 'error');
    }
}

async function handleDeleteSupplier(supplierId) {
    const linkedProductsCount = appState.inventory.items.filter(item => item.supplierId === supplierId).length;
    let confirmMessage = 'هل أنت متأكد من رغبتك في حذف هذا المورّد نهائياً؟';
    if (linkedProductsCount > 0) {
        confirmMessage = `هذا المورّد مرتبط بـ ${linkedProductsCount} منتجات. هل أنت متأكد من حذفه؟ سيتم فك ارتباطه من هذه المنتجات.`;
    }

    if (confirm(confirmMessage)) {
        ui.showStatus('جاري حذف المورّد...', 'syncing');
        try {
            if (linkedProductsCount > 0) {
                appState.inventory.items.forEach(item => {
                    if (item.supplierId === supplierId) {
                        item.supplierId = null;
                    }
                });
                await api.saveToGitHub();
            }

            appState.suppliers = appState.suppliers.filter(s => s.id !== supplierId);
            await api.saveSuppliers();
            
            saveLocalData();
            ui.renderSupplierList();
            ui.populateSupplierDropdown(ui.getDOMElements().itemSupplierSelect.value);
            ui.showStatus('تم حذف المورّد بنجاح!', 'success');
        } catch (error) {
            ui.showStatus(`فشل حذف المورّد: ${error.message}`, 'error');
        }
    }
}

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
        await api.saveToGitHub();
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
                item.dataset.path = file.path;
                const deleteButton = document.createElement('button');
                deleteButton.className = 'archive-delete-btn';
                deleteButton.innerHTML = `<span class="material-symbols-outlined">delete</span>`;
   
                deleteButton.title = 'حذف الأرشيف';
                deleteButton.dataset.path = file.path;
                deleteButton.dataset.sha = file.sha;
                item.appendChild(itemText);
                item.appendChild(deleteButton);
                
                listContainer.appendChild(item);
            });
    } catch (error) {
        listContainer.innerHTML = `<p style="color: var(--danger-color);">فشل تحميل الأرشيف: ${error.message}</p>`;
    }
}

async function handleDownloadBackup() {
    ui.showStatus('جاري تجهيز النسخة الاحتياطية...', 'syncing');
    try {
        const zip = new JSZip();
        zip.file("inventory.json", JSON.stringify(appState.inventory, null, 2));
        zip.file("sales.json", JSON.stringify(appState.sales, null, 2));
        zip.file("suppliers.json", JSON.stringify(appState.suppliers, null, 2));
        const blob = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        link.download = `rhineix-workshop-backup-${timestamp}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        ui.showStatus('تم تنزيل النسخة الاحتياطية بنجاح!', 'success');
    } catch (error) {
        console.error("Backup failed:", error);
        ui.showStatus(`فشل إنشاء النسخة الاحتياطية: ${error.message}`, 'error', { duration: 5000 });
    }
}

async function handleRestoreBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm("هل أنت متأكد من رغبتك في استعادة البيانات من هذا الملف؟ سيتم الكتابة فوق جميع بياناتك الحالية.")) {
        event.target.value = '';
        return;
    }
    ui.showStatus('جاري استعادة النسخة الاحتياطية...', 'syncing');
    try {
        const zip = await JSZip.loadAsync(file);
        const inventoryFile = zip.file("inventory.json");
        const salesFile = zip.file("sales.json");
        const suppliersFile = zip.file("suppliers.json");
        if (!inventoryFile || !salesFile || !suppliersFile) {
            throw new Error("ملف النسخة الاحتياطية غير صالح أو لا يحتوي على الملفات المطلوبة.");
        }
        const inventoryData = JSON.parse(await inventoryFile.async("string"));
        const salesData = JSON.parse(await salesFile.async("string"));
        const suppliersData = JSON.parse(await suppliersFile.async("string"));
        if (!inventoryData.items || !Array.isArray(salesData) || !Array.isArray(suppliersData)) {
            throw new Error("محتوى ملف النسخة الاحتياطية غير صالح.");
        }
        appState.inventory = inventoryData;
        appState.sales = salesData;
        appState.suppliers = suppliersData;
        saveLocalData();
        ui.showStatus('تمت استعادة البيانات بنجاح! سيتم إعادة تحميل التطبيق.', 'success', { duration: 4000 });
        setTimeout(() => {
            location.reload();
        }, 4000);
    } catch (error) {
        console.error("Restore failed:", error);
        ui.showStatus(`فشلت عملية الاستعادة: ${error.message}`, 'error', { duration: 5000 });
    } finally {
        event.target.value = '';
    }
}

function setupEventListeners() {
    const elements = ui.getDOMElements();
    elements.themeToggleBtn.addEventListener('click', () => ui.setTheme(document.body.classList.contains('theme-light') ? 'dark' : 'light'));
    elements.addItemBtn.addEventListener('click', () => {
        ui.openItemModal();
        const existingSkus = new Set(appState.inventory.items.map(item => item.sku));
        document.getElementById('item-sku').value = generateUniqueSKU(existingSkus);
    });
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
        if (detailsBtn) {
            ui.openDetailsModal(itemId);
        }
        if (sellBtn) {
            const item = appState.inventory.items.find(i => i.id === itemId);
            if (item && item.quantity > 0) {
                ui.openSaleModal(itemId);
            } else {
                ui.showStatus('هذا المنتج نافد من المخزون ولا يمكن بيعه.', 'error', { duration: 4000 });
            }
        }
    });
    elements.detailsIncreaseBtn.addEventListener('click', () => {
        const item = appState.inventory.items.find(i => i.id === appState.currentItemId);
        if (item) {
            item.quantity++;
            elements.detailsQuantityValue.textContent = item.quantity;
            ui.filterAndRenderItems();
        }
    });
    elements.detailsDecreaseBtn.addEventListener('click', () => {
        const item = appState.inventory.items.find(i => i.id === appState.currentItemId);
        if (item && item.quantity > 0) {
            item.quantity--;
            elements.detailsQuantityValue.textContent = item.quantity;
            ui.filterAndRenderItems();
        }
    });
    elements.closeDetailsModalBtn.addEventListener('click', async () => {
        const itemBeforeEdit = appState.itemStateBeforeEdit;
        const currentItem = appState.inventory.items.find(i => i.id === appState.currentItemId);
        if (itemBeforeEdit && currentItem && itemBeforeEdit.quantity !== currentItem.quantity) {
            ui.showStatus('التحقق من البيانات...', 'syncing');
            try {
                // --- NEW: Check-First Logic ---
                const { data: latestInventory, sha: latestSha } = await api.fetchFromGitHub();
                if (latestSha !== appState.fileSha) {
                    ui.showStatus('البيانات غير محدّثة. تم تحديثها من جهاز آخر.', 'error', { showRefreshButton: true });
                    // Revert local changes as they were based on stale data
                    const originalItemIndex = appState.inventory.items.findIndex(i => i.id === itemBeforeEdit.id);
                    if (originalItemIndex !== -1) {
                        appState.inventory.items[originalItemIndex] = itemBeforeEdit;
                    }
                    ui.filterAndRenderItems();
                } else {
                    // Data is current, proceed with saving the quantity change
                    ui.showStatus('جاري حفظ تغيير الكمية...', 'syncing');
                    appState.inventory = latestInventory;
                    appState.fileSha = latestSha;
                    
                    // Re-apply the quantity change to the fresh data
                    const itemToUpdate = appState.inventory.items.find(i => i.id === currentItem.id);
                    if (itemToUpdate) {
                        itemToUpdate.quantity = currentItem.quantity;
                    }
                    
                    await api.saveToGitHub();
                    saveLocalData();
                    ui.showStatus('تم حفظ التغييرات بنجاح!', 'success');
                }
            } catch (error) {
                 // Revert local changes on failure
                const originalItemIndex = appState.inventory.items.findIndex(i => i.id === itemBeforeEdit.id);
                if (originalItemIndex !== -1) {
                    appState.inventory.items[originalItemIndex] = itemBeforeEdit;
                }
                ui.filterAndRenderItems();
                ui.showStatus('فشل حفظ التغييرات.', 'error', { duration: 4000 });
            }
        }
        
        appState.itemStateBeforeEdit = null;
        appState.currentItemId = null;
        elements.detailsModal.close();
    });
    elements.detailsEditBtn.addEventListener('click', () => {
        elements.detailsModal.close();
        ui.openItemModal(appState.currentItemId);
    });
    elements.detailsDeleteBtn.addEventListener('click', async () => {
        if (confirm('هل أنت متأكد من رغبتك في حذف هذا المنتج؟ سيتم حذف صورته بشكل دائم أيضًا.')) {
            const itemToDelete = appState.inventory.items.find(item => item.id === appState.currentItemId);
            const imagePathToDelete = itemToDelete?.imagePath;
            const originalInventory = JSON.parse(JSON.stringify(appState.inventory));
            appState.inventory.items = appState.inventory.items.filter(item => item.id !== appState.currentItemId);
            elements.detailsModal.close();
            ui.filterAndRenderItems();
            ui.updateStats();
            try {
                await api.saveToGitHub();
                if (imagePathToDelete) {
                    try {
                        const repoImages = await api.getGitHubDirectoryListing('images');
                        const imageFile = repoImages.find(file => file.path === imagePathToDelete);
                        if (imageFile) {
                            await api.deleteFileFromGitHub(imageFile.path, imageFile.sha, `Cleanup: Delete image for item ${itemToDelete.name}`);
                        }
                    } catch (imageError) {
                        console.error('Failed to delete associated image:', imageError);
                    }
                }
                saveLocalData();
                ui.showStatus('تم حذف المنتج بنجاح!', 'success');
            } catch(error) {
                appState.inventory = originalInventory;
                ui.filterAndRenderItems();
                ui.updateStats();
                if (error instanceof ConflictError) {
                     ui.showStatus('فشل الحذف بسبب تعارض في البيانات.', 'error', { showRefreshButton: true });
                } else {
                     ui.showStatus(`فشل الحذف: ${error.message}`, 'error', { duration: 5000 });
                }
            }
        }
    });
    elements.detailsBarcodeBtn.addEventListener('click', () => ui.openBarcodeModal(appState.currentItemId));
    elements.downloadBarcodeBtn.addEventListener('click', () => ui.downloadBarcode());
    elements.searchBar.addEventListener('input', (e) => {
        appState.searchTerm = e.target.value;
        ui.filterAndRenderItems();
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
        ui.filterAndRenderItems();
    });
    elements.categoryFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.categoryFilterDropdown.classList.toggle('show');
    });
    elements.categoryFilterDropdown.addEventListener('click', (e) => {
        const categoryItem = e.target.closest('.category-item');
        if (categoryItem) {
            appState.selectedCategory = categoryItem.dataset.category;
            ui.filterAndRenderItems();
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
    elements.saleIncreaseBtn.addEventListener('click', () => {
        const quantityInput = elements.saleQuantityInput;
        const max = parseInt(quantityInput.max, 10);
        let currentValue = parseInt(quantityInput.value, 10);
        if (currentValue < max) {
            quantityInput.value = currentValue + 1;
            ui.updateSaleTotal();
        }
    });
    elements.saleDecreaseBtn.addEventListener('click', () => {
        const quantityInput = elements.saleQuantityInput;
        let currentValue = parseInt(quantityInput.value, 10);
        if (currentValue > 1) {
            quantityInput.value = currentValue - 1;
            ui.updateSaleTotal();
        }
    });
    elements.saleQuantityInput.addEventListener('input', ui.updateSaleTotal);
    document.getElementById('sale-price').addEventListener('input', ui.updateSaleTotal);
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
    elements.downloadBackupBtn.addEventListener('click', handleDownloadBackup);
    elements.restoreBackupInput.addEventListener('change', handleRestoreBackup);
    document.getElementById('manual-archive-btn').addEventListener('click', handleManualArchive);
    document.getElementById('view-archives-btn').addEventListener('click', openArchiveBrowser);
    const archiveListContainer = document.getElementById('archive-list-container');
    archiveListContainer.addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.archive-delete-btn');
        if (deleteButton) {
            e.stopPropagation();
            const path = deleteButton.dataset.path;
            const sha = deleteButton.dataset.sha;
            if (confirm(`هل أنت متأكد من حذف هذا الأرشيف (${path}) نهائياً؟`)) {
                ui.showStatus('جاري حذف الأرشيف...', 'syncing');
                try {
                    await api.deleteFileFromGitHub(path, sha, `Delete archive file: ${path}`);
                    ui.showStatus('تم حذف الأرشيف بنجاح!', 'success');
                    openArchiveBrowser();
                } catch (error) {
                    ui.showStatus(`فشل حذف الأرشيف: ${error.message}`, 'error', { duration: 5000 });
                }
            }
        } else {
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
    document.getElementById('close-archive-browser-btn').addEventListener('click', () => document.getElementById('archive-browser-modal').close());
    elements.regenerateSkuBtn.addEventListener('click', () => {
        const existingSkus = new Set(appState.inventory.items.map(item => item.sku));
        document.getElementById('item-sku').value = generateUniqueSKU(existingSkus);
    });
    // --- Supplier Event Listeners ---
    elements.manageSuppliersBtn.addEventListener('click', () => {
        ui.renderSupplierList();
        elements.supplierManagerModal.showModal();
    });
    elements.closeSupplierManagerBtn.addEventListener('click', () => {
        elements.supplierManagerModal.close();
    });
    elements.supplierForm.addEventListener('submit', handleSupplierFormSubmit);
    elements.supplierListContainer.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-supplier-btn');
        if (deleteBtn) {
            handleDeleteSupplier(deleteBtn.dataset.id);
        }
        const editBtn = e.target.closest('.edit-supplier-btn');
        if (editBtn) {
            const supplier = appState.suppliers.find(s => s.id === editBtn.dataset.id);
            if(supplier) {
                elements.supplierFormTitle.textContent = 'تعديل مورّد';
                elements.supplierIdInput.value = supplier.id;
                document.getElementById('supplier-name').value = supplier.name;
                document.getElementById('supplier-phone').value = supplier.phone;
                elements.cancelEditSupplierBtn.classList.remove('view-hidden');
            }
        }
    });
    elements.cancelEditSupplierBtn.addEventListener('click', () => {
        elements.supplierForm.reset();
        elements.supplierIdInput.value = '';
        elements.supplierFormTitle.textContent = 'إضافة مورّد جديد';
        elements.cancelEditSupplierBtn.classList.add('view-hidden');
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
    
    ui.renderInventorySkeleton(); 

    if (appState.syncConfig) {
        ui.showStatus('جاري مزامنة البيانات...', 'syncing');
        try {
            const [inventoryResult, salesResult, suppliersResult] = await Promise.all([
                api.fetchFromGitHub(),
                api.fetchSales(),
                api.fetchSuppliers()
            ]);
            if (inventoryResult) {
                appState.inventory = inventoryResult.data;
                appState.fileSha = inventoryResult.sha;
            }
            if (salesResult) {
                appState.sales = salesResult.data;
                appState.salesFileSha = salesResult.sha;
            }
            if (suppliersResult) {
                appState.suppliers = suppliersResult.data;
                appState.suppliersFileSha = suppliersResult.sha;
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
    ui.populateCategoryDatalist();
    ui.updateCurrencyDisplay();
    console.log('App Initialized Successfully.');
}

// Start the application
initializeApp();