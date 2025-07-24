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

/**
 * Wrapper function to handle saving data with automatic conflict resolution.
 * It will retry a specified number of times if a ConflictError is caught.
 * @param {number} maxRetries - The maximum number of times to retry.
 */
async function saveDataWithConflictResolution(maxRetries = 3) {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            await api.saveToGitHub();
            await api.saveSales();
            saveLocalData(); // Save to local storage on successful sync
            return; // Exit successfully
        } catch (error) {
            if (error instanceof ConflictError) {
                attempts++;
                ui.showStatus(`Conflict detected. Re-syncing and retrying... (${attempts}/${maxRetries})`, 'syncing');

                // Fetch the latest data from the server
                const [inventoryResult, salesResult] = await Promise.all([
                    api.fetchFromGitHub(),
                    api.fetchSales()
                ]);

                // This is the core of the conflict resolution.
                // We assume the user's intended changes are still valid and re-apply them
                // to the latest version of the data.
                // For this app, the "last intended change" is always the last item in the sales array
                // and the corresponding quantity decrease in the inventory.

                const serverInventory = inventoryResult.data;
                const serverSales = salesResult.data;
                appState.fileSha = inventoryResult.sha;
                appState.salesFileSha = salesResult.sha;

                const lastUnsavedSale = appState.sales[appState.sales.length - 1];
                if(lastUnsavedSale){
                    const itemToUpdate = serverInventory.find(i => i.id === lastUnsavedSale.itemId);
                    const localItemState = appState.inventory.find(i => i.id === lastUnsavedSale.itemId);

                    if (itemToUpdate && localItemState) {
                        // Re-apply the user's change to the fresh server data
                        itemToUpdate.quantity = localItemState.quantity;
                    }

                    // Update the state with the merged data
                    appState.inventory = serverInventory;
                    appState.sales = [...serverSales, lastUnsavedSale];
                } else {
                    // If there's no sale, just update to the latest server state
                    appState.inventory = serverInventory;
                    appState.sales = serverSales;
                }

            } else {
                // For any other error, fail immediately
                throw error;
            }
        }
    }
    // If all retries fail, throw a final error
    throw new Error('Failed to save data after multiple retries.');
}


async function handleItemFormSubmit(e) {
    e.preventDefault();
    const saveButton = document.getElementById('save-item-btn');
    saveButton.disabled = true;
    ui.showStatus('Saving...', 'syncing');

    const itemId = document.getElementById('item-id').value;
    const existingItem = appState.inventory.find(i => i.id === itemId);
    let imagePath = existingItem ?
        existingItem.imagePath : null;

    // Hold original state in case of failure
    const originalInventory = JSON.parse(JSON.stringify(appState.inventory));

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
        ui.renderCategoryFilter();
        
        await saveDataWithConflictResolution();
        
        ui.showStatus('Changes saved to the cloud!', 'success');
        ui.getDOMElements().itemModal.close();

        if (appState.currentItemId === itemData.id) {
            ui.openDetailsModal(itemData.id);
        }
    } catch (error) {
        ui.showStatus(`Save failed: ${error.message}`, 'error', 5000);
        // Revert to original state on failure
        appState.inventory = originalInventory;
        ui.renderInventory();
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
    const itemIndex = appState.inventory.findIndex(i => i.id === itemId);

    if (itemIndex === -1) {
        ui.showStatus('Error: Product not found.', 'error');
        saveButton.disabled = false;
        return;
    }

    const item = appState.inventory[itemIndex];
    if (item.quantity <= 0) {
        ui.showStatus('Cannot sell item, quantity is zero.', 'error');
        saveButton.disabled = false;
        return;
    }
    
    ui.showStatus('Processing sale...', 'syncing');
    
    // Apply change locally first
    item.quantity--;
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
    
    // Update UI immediately for better UX
    ui.renderInventory();

    try {
        await saveDataWithConflictResolution();
        ui.showStatus('Sale recorded successfully!', 'success');
        ui.getDOMElements().saleModal.close();
    } catch (error) {
        ui.showStatus(`Sale failed: ${error.message}`, 'error', 5000);
        // Revert local changes on final failure
        item.quantity++;
        appState.sales.pop();
        ui.renderInventory();
    } finally {
        if(appState.currentView === 'dashboard') {
            ui.renderDashboard();
        }
        saveButton.disabled = false;
    }
}


async function handleImageCleanup() {
    if (!appState.syncConfig) {
        ui.showStatus('Please configure sync settings first.', 'error');
        return;
    }
    if (!confirm('Are you sure you want to permanently delete all unused images from the repository? This action cannot be undone.')) {
        return;
    }
    ui.showStatus('Scanning for unused images...', 'syncing');
    try {
        const allRepoImages = await api.getGitHubDirectoryListing('images');
        const usedImages = new Set(appState.inventory.map(item => item.imagePath).filter(Boolean));
        const orphanedImages = allRepoImages.filter(repoImage => !usedImages.has(repoImage.path));
        
        if (orphanedImages.length === 0) {
            ui.showStatus('No unused images found to delete.', 'success');
            return;
        }
        
        ui.showStatus(`Found ${orphanedImages.length} images... Deleting.`, 'syncing');
        let deletedCount = 0;
        for (const image of orphanedImages) {
            await api.deleteFileFromGitHub(image.path, image.sha, `Cleanup: delete unused image ${image.name}`);
            deletedCount++;
        }
        ui.showStatus(`Successfully deleted ${deletedCount} unused images.`, 'success', 5000);
    } catch (error) {
        ui.showStatus(`An error occurred: ${error.message}`, 'error', 5000);
    }
}

// --- Archive Feature Handlers ---

async function runAutomaticArchive() {
    if (!appState.syncConfig || !appState.sales || appState.sales.length === 0) {
        return;
    }
    console.log('Running automatic archive check...');
    try {
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastCheck = localStorage.getItem('lastArchiveCheck');

        if (lastCheck === currentMonthKey) {
            console.log('Archive check already performed for this month.');
            return;
        }
        
        const salesByMonth = appState.sales.reduce((acc, sale) => {
            const saleDate = new Date(sale.saleDate);
            const monthKey = `${saleDate.getFullYear()}_${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
            if (!acc[monthKey]) acc[monthKey] = [];
            acc[monthKey].push(sale);
            return acc;
        }, {});

        const archivesToCreate = Object.entries(salesByMonth).filter(([key]) => key !== currentMonthKey);
        if (archivesToCreate.length === 0) {
            localStorage.setItem('lastArchiveCheck', currentMonthKey);
            console.log('No old sales to archive.');
            return;
        }

        ui.showStatus('Automatically archiving old data...', 'syncing');
        for (const [monthKey, salesData] of archivesToCreate) {
            const path = `archives/sales_${monthKey}.json`;
            const content = JSON.stringify(salesData, null, 2);
            await api.createGitHubFile(path, content, `Auto-archive sales for ${monthKey}`);
        }

        appState.sales = salesByMonth[currentMonthKey] || [];
        await api.saveSales();
        saveLocalData();
        localStorage.setItem('lastArchiveCheck', currentMonthKey);
        ui.showStatus(`Successfully archived records for ${archivesToCreate.length} months.`, 'success', 5000);

    } catch (error) {
        console.error('Automatic archive failed:', error);
        ui.showStatus('Automatic archiving failed.', 'error', 5000);
    }
}

async function openArchiveBrowser() {
    const modal = document.getElementById('archive-browser-modal');
    const listContainer = document.getElementById('archive-list-container');
    const detailsContainer = document.getElementById('archive-details-container');

    listContainer.innerHTML = '<p>Loading archive list...</p>';
    detailsContainer.innerHTML = '<p>Select a month from the list above to view its details.</p>';
    modal.showModal();

    try {
        const files = await api.getGitHubDirectoryListing('archives');
        if (files.length === 0) {
            listContainer.innerHTML = '<p>No archives available to display.</p>';
            return;
        }

        listContainer.innerHTML = '';
        files
            .sort((a,b) => b.name.localeCompare(a.name)) // Sort descending
            .forEach(file => {
                const item = document.createElement('div');
                item.className = 'archive-item';
                item.textContent = file.name.replace('sales_', '').replace('.json', '').replace('_', '-');
                item.dataset.path = file.path;
                listContainer.appendChild(item);
            });
    } catch (error) {
        listContainer.innerHTML = `<p style="color: var(--danger-color);">Failed to load archives: ${error.message}</p>`;
    }
}


// --- EVENT LISTENERS SETUP ---

function setupEventListeners() {
    const elements = ui.getDOMElements();
    let quantityInterval = null;
    
    // Header Controls & View Toggling
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

    // Dashboard Time Filter
    elements.timeFilterControls.addEventListener('click', (e) => {
        const button = e.target.closest('.time-filter-btn');
        if (button) {
            appState.dashboardPeriod = button.dataset.period;
            elements.timeFilterControls.querySelector('.active').classList.remove('active');
            button.classList.add('active');
            ui.renderDashboard();
        }
    });

    // Main Grid Interaction
    elements.inventoryGrid.addEventListener('click', (e) => {
        const detailsBtn = e.target.closest('.details-btn');
        const sellBtn = e.target.closest('.sell-btn');
        const card = e.target.closest('.product-card');

        if (!card) return;
        const itemId = card.dataset.id;
        
        if (detailsBtn) ui.openDetailsModal(itemId);
        if (sellBtn) ui.openSaleModal(itemId);
    });
    
    // Details Modal
    elements.closeDetailsModalBtn.addEventListener('click', () => elements.detailsModal.close());
    const stopQuantityChange = () => {
        if (quantityInterval) {
            clearInterval(quantityInterval);
            quantityInterval = null;
            saveDataWithConflictResolution().catch(error => {
                 ui.showStatus(`Sync failed: ${error.message}`, 'error', 5000);
            });
        }
    };
    const startQuantityChange = (action) => {
        action();
        quantityInterval = setInterval(action, 100);
    };
    elements.detailsIncreaseBtn.addEventListener('mousedown', () => startQuantityChange(() => {
        const item = appState.inventory.find(i => i.id === appState.currentItemId);
        if (item) {
            item.quantity++;
            elements.detailsQuantityValue.textContent = item.quantity;
            ui.renderInventory();
        }
    }));
    elements.detailsDecreaseBtn.addEventListener('mousedown', () => startQuantityChange(() => {
        const item = appState.inventory.find(i => i.id === appState.currentItemId);
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
        if (confirm('Are you sure you want to delete this product?')) {
            appState.inventory = appState.inventory.filter(item => item.id !== appState.currentItemId);
            elements.detailsModal.close();
            ui.renderInventory();
            await saveDataWithConflictResolution();
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
            appState.selectedCategory = 'all';
            ui.renderCategoryFilter();
        }
        ui.renderInventory();
    });

    // Category Filter
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

    // Maintenance & Archive Buttons
    elements.closeBarcodeBtn.addEventListener('click', () => elements.barcodeModal.close());
    elements.cleanupImagesBtn.addEventListener('click', handleImageCleanup);
    document.getElementById('archive-sales-btn').addEventListener('click', openArchiveBrowser);
    
    // Archive Browser Modal Listeners
    const archiveBrowserModal = document.getElementById('archive-browser-modal');
    document.getElementById('close-archive-browser-btn').addEventListener('click', () => archiveBrowserModal.close());
    document.getElementById('archive-list-container').addEventListener('click', async (e) => {
        const item = e.target.closest('.archive-item');
        if (!item) return;

        const container = item.parentElement;
        if(container.querySelector('.active')) {
            container.querySelector('.active').classList.remove('active');
        }
        item.classList.add('active');
        
        const detailsContainer = document.getElementById('archive-details-container');
        detailsContainer.innerHTML = '<p>Loading data...</p>';
        try {
            const data = await api.fetchGitHubFile(item.dataset.path);
            const symbol = appState.activeCurrency === 'IQD' ? 'IQD' : '$';
            let tableHTML = `<table class="archive-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Date</th></tr></thead><tbody>`;
            data.forEach(sale => {
                const price = appState.activeCurrency === 'IQD' ? sale.sellPriceIqd : sale.sellPriceUsd;
                tableHTML += `<tr><td>${sale.itemName}</td><td>${sale.quantitySold}</td><td>${price.toLocaleString()} ${symbol}</td><td>${sale.saleDate}</td></tr>`;
            });
            tableHTML += '</tbody></table>';
            detailsContainer.innerHTML = tableHTML;
        } catch (error) {
            detailsContainer.innerHTML = `<p style="color: var(--danger-color);">Failed to load file: ${error.message}</p>`;
        }
    });

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
        ui.showStatus('Syncing data...', 'syncing');
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
            ui.showStatus('Sync successful!', 'success');

            // Run automatic archive check after successful sync
            await runAutomaticArchive();

        } catch(error) {
            ui.showStatus(`Sync error: ${error.message}`, 'error', 5000);
            loadLocalData();
        }
    } else {
        loadLocalData();
    }
    
    ui.renderCategoryFilter();
    ui.updateCurrencyDisplay();
    ui.renderInventory();
    console.log('App Initialized Successfully.');
}

// Start the application
initializeApp();
