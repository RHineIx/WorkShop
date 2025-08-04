// js/ui.js
import { appState } from "./state.js";
import { fetchImageWithAuth } from "./api.js";
import { sanitizeHTML } from "./utils.js";

const elements = {
  // Main Layout
  inventoryGrid: document.getElementById("inventory-grid"),
  searchBar: document.getElementById("search-bar"),
  statsContainer: document.getElementById("stats-cards"),
  totalItemsStat: document.getElementById("total-items-stat"),
  lowStockStat: document.getElementById("low-stock-stat"),
  toastContainer: document.getElementById("toast-container"),
  searchContainer: document.getElementById("search-container"),
  categoryFilterBtn: document.getElementById("category-filter-btn"),
  categoryFilterDropdown: document.getElementById("category-filter-dropdown"),

  // Header
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  addItemBtn: document.getElementById("add-item-btn"),
  syncSettingsBtn: document.getElementById("sync-settings-btn"),
  currencyToggleBtn: document.getElementById("currency-toggle-btn"),
  inventoryToggleBtn: document.getElementById("inventory-toggle-btn"),
  dashboardToggleBtn: document.getElementById("dashboard-toggle-btn"),

  // View Containers
  inventoryViewContainer: document.getElementById("inventory-view-container"),
  dashboardViewContainer: document.getElementById("dashboard-view-container"),

  // Dashboard Elements
  timeFilterControls: document.getElementById("time-filter-controls"),
  totalSalesStat: document.getElementById("total-sales-stat"),
  totalProfitStat: document.getElementById("total-profit-stat"),
  bestsellersList: document.getElementById("bestsellers-list"),

  // Details Modal
  detailsModal: document.getElementById("details-modal"),
  closeDetailsModalBtn: document.getElementById("close-details-modal-btn"),
  detailsImage: document.getElementById("details-image"),
  detailsImagePlaceholder: document.getElementById("details-image-placeholder"),
  detailsName: document.getElementById("details-name"),
  detailsSku: document.getElementById("details-sku"),
  detailsQuantityValue: document.getElementById("details-quantity-value"),
  detailsDecreaseBtn: document.getElementById("details-decrease-btn"),
  detailsIncreaseBtn: document.getElementById("details-increase-btn"),

  detailsNotesContent: document.getElementById("details-notes-content"),
  detailsEditBtn: document.getElementById("details-edit-btn"),
  detailsDeleteBtn: document.getElementById("details-delete-btn"),
  detailsCostIqd: document.getElementById("details-cost-iqd"),
  detailsSellIqd: document.getElementById("details-sell-iqd"),
  detailsCostUsd: document.getElementById("details-cost-usd"),
  detailsSellUsd: document.getElementById("details-sell-usd"),

  // Add/Edit Modal
  itemModal: document.getElementById("item-modal"),
  itemForm: document.getElementById("item-form"),
  cancelItemBtn: document.getElementById("cancel-item-btn"),
  modalTitle: document.getElementById("modal-title"),
  itemIdInput: document.getElementById("item-id"),
  imageUploadInput: document.getElementById("item-image-upload"),
  pasteImageBtn: document.getElementById("paste-image-btn"),
  imagePreview: document.getElementById("image-preview"),
  categoryDatalist: document.getElementById("category-list"),
  imagePlaceholder: document.getElementById("image-placeholder"),
  regenerateSkuBtn: document.getElementById("regenerate-sku-btn"),

  // Sale Modal
  saleModal: document.getElementById("sale-modal"),
  saleForm: document.getElementById("sale-form"),
  saleItemIdInput: document.getElementById("sale-item-id"),
  saleItemName: document.getElementById("sale-item-name"),
  cancelSaleBtn: document.getElementById("cancel-sale-btn"),
  saleQuantityInput: document.getElementById("sale-quantity"),
  saleIncreaseBtn: document.getElementById("sale-increase-btn"),
  saleDecreaseBtn: document.getElementById("sale-decrease-btn"),
  salePriceCurrency: document.getElementById("sale-price-currency"),
  saleTotalPrice: document.getElementById("sale-total-price"),

  // Sync Modal
  syncModal: document.getElementById("sync-modal"),
  syncForm: document.getElementById("sync-form"),
  cancelSyncBtn: document.getElementById("cancel-sync-btn"),
  githubUsernameInput: document.getElementById("github-username"),
  githubRepoInput: document.getElementById("github-repo"),
  githubPatInput: document.getElementById("github-pat"),
  cleanupImagesBtn: document.getElementById("cleanup-images-btn"),
  downloadBackupBtn: document.getElementById("download-backup-btn"),
  restoreBackupInput: document.getElementById("restore-backup-input"),

  // Supplier UI Elements
  supplierManagerModal: document.getElementById("supplier-manager-modal"),
  closeSupplierManagerBtn: document.getElementById(
    "close-supplier-manager-btn"
  ),
  supplierListContainer: document.getElementById("supplier-list-container"),
  supplierForm: document.getElementById("supplier-form"),
  supplierFormTitle: document.getElementById("supplier-form-title"),
  supplierIdInput: document.getElementById("supplier-id"),
  cancelEditSupplierBtn: document.getElementById("cancel-edit-supplier-btn"),
  manageSuppliersBtn: document.getElementById("manage-suppliers-btn"),
  itemSupplierSelect: document.getElementById("item-supplier"),
  supplierDetailsContainer: document.getElementById(
    "supplier-details-container"
  ),
  detailsSupplierName: document.getElementById("details-supplier-name"),
  detailsSupplierPhone: document.getElementById("details-supplier-phone"),
  detailsSupplierWhatsapp: document.getElementById("details-supplier-whatsapp"),

  // Archive Modal
  archiveBrowserModal: document.getElementById("archive-browser-modal"),
  closeArchiveBrowserBtn: document.getElementById("close-archive-browser-btn"),
};

export function getDOMElements() {
  return elements;
}

export function renderCategoryFilter() {
  const categories = [
    ...new Set(
      appState.inventory.items.map(item => item.category).filter(Boolean)
    ),
  ];
  elements.categoryFilterDropdown.innerHTML = "";
  const allItem = document.createElement("div");
  allItem.className = "category-item";
  allItem.textContent = "عرض الكل";
  allItem.dataset.category = "all";
  if (appState.selectedCategory === "all") {
    allItem.classList.add("active");
  }
  elements.categoryFilterDropdown.appendChild(allItem);
  categories.forEach(category => {
    const categoryItem = document.createElement("div");
    categoryItem.className = "category-item";
    categoryItem.textContent = sanitizeHTML(category);
    categoryItem.dataset.category = category;
    if (appState.selectedCategory === category) {
      categoryItem.classList.add("active");
    }
    elements.categoryFilterDropdown.appendChild(categoryItem);
  });
}

export function populateCategoryDatalist() {
  const categories = [
    ...new Set(
      appState.inventory.items.map(item => item.category).filter(Boolean)
    ),
  ];
  const datalist = elements.categoryDatalist;
  datalist.innerHTML = "";
  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = sanitizeHTML(category);
    datalist.appendChild(option);
  });
}

const ICONS = {
  success: "material-symbols:check-circle",
  error: "material-symbols:error",
  syncing: "material-symbols:sync",
  info: "material-symbols:info",
  warning: "material-symbols:warning-rounded",
};
export const hideSyncStatus = () => {
  const syncToasts =
    elements.toastContainer.querySelectorAll(".toast--syncing");
  syncToasts.forEach(toast => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 500);
  });
};

export const showStatus = (message, type, options = {}) => {
  const { duration = 4000, showRefreshButton = false } = options;
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  const iconName = ICONS[type] || "info";

  const icon = document.createElement("iconify-icon");
  icon.className = "toast__icon";
  icon.setAttribute("icon", iconName);
  toast.appendChild(icon);

  const messageSpan = document.createElement("span");
  messageSpan.textContent = message;
  toast.appendChild(messageSpan);
  if (showRefreshButton) {
    const refreshButton = document.createElement("button");
    refreshButton.textContent = "تحديث";
    refreshButton.className = "status-refresh-btn";
    refreshButton.onclick = () => location.reload();
    refreshButton.style.marginLeft = "auto";
    toast.appendChild(refreshButton);
  }

  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);
  if (duration > 0 && type !== "syncing" && !showRefreshButton) {
    const transitionDuration = 500;
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        if (toast.parentElement) {
          toast.remove();
        }
      }, transitionDuration);
    }, duration);
  }
};

export const toggleView = viewToShow => {
  appState.currentView = viewToShow;
  const isInventory = viewToShow === "inventory";
  const isDashboard = viewToShow === "dashboard";

  elements.inventoryViewContainer.classList.toggle("view-hidden", !isInventory);
  elements.dashboardViewContainer.classList.toggle("view-hidden", !isDashboard);

  elements.inventoryToggleBtn.classList.remove("active-view-btn");
  elements.dashboardToggleBtn.classList.remove("active-view-btn");

  if (isInventory) {
    elements.inventoryToggleBtn.classList.add("active-view-btn");
  } else if (isDashboard) {
    elements.dashboardToggleBtn.classList.add("active-view-btn");
  }

  if (isDashboard) {
    renderDashboard();
  }
};
export const renderDashboard = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate;
  switch (appState.dashboardPeriod) {
    case "week":
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 6);
      break;
    case "month":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "today":
    default:
      startDate = today;
      break;
  }
  const filteredSales = appState.sales.filter(
    sale =>
      new Date(sale.saleDate) >= startDate && new Date(sale.saleDate) <= now
  );
  const isIQD = appState.activeCurrency === "IQD";
  const totalSales = filteredSales.reduce(
    (sum, sale) => sum + (isIQD ? sale.sellPriceIqd : sale.sellPriceUsd),
    0
  );
  const totalCost = filteredSales.reduce(
    (sum, sale) => sum + (isIQD ? sale.costPriceIqd : sale.costPriceUsd),
    0
  );
  const totalProfit = totalSales - totalCost;
  const symbol = isIQD ? "د.ع" : "$";
  elements.totalSalesStat.textContent = `${totalSales.toLocaleString()} ${symbol}`;
  elements.totalProfitStat.textContent = `${totalProfit.toLocaleString()} ${symbol}`;
  const itemSales = {};
  filteredSales.forEach(sale => {
    itemSales[sale.itemId] = (itemSales[sale.itemId] || 0) + sale.quantitySold;
  });
  const sortedBestsellers = Object.entries(itemSales)
    .map(([itemId, count]) => {
      const item = appState.inventory.items.find(i => i.id === itemId);
      return { name: item ? item.name : "منتج محذوف", count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  elements.bestsellersList.innerHTML = "";
  if (sortedBestsellers.length > 0) {
    sortedBestsellers.forEach(item => {
      const li = document.createElement("div");
      li.className = "bestseller-item";
      li.innerHTML = `<span class="bestseller-name">${sanitizeHTML(
        item.name
      )}</span><span class="bestseller-count">بيع ${item.count}</span>`;
      elements.bestsellersList.appendChild(li);
    });
  } else {
    elements.bestsellersList.innerHTML = "<p>لا توجد مبيعات في هذه الفترة.</p>";
  }
};
export function updateSaleTotal() {
  const quantity = parseInt(elements.saleQuantityInput.value, 10) || 0;
  const unitPrice =
    parseFloat(document.getElementById("sale-price").value) || 0;
  const totalPrice = quantity * unitPrice;
  const symbol = appState.activeCurrency === "IQD" ? "د.ع" : "$";
  elements.saleTotalPrice.textContent = `${totalPrice.toLocaleString()} ${symbol}`;
}

export function renderInventorySkeleton(count = 8) {
  elements.inventoryGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const skeletonCard = document.createElement("div");
    skeletonCard.className = "skeleton-card";
    skeletonCard.innerHTML = `
            <div class="skeleton skeleton-image"></div>
            <div class="skeleton-info">
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text w-75"></div>
                 <div class="skeleton skeleton-text w-50" style="margin-top: 12px;"></div>
            </div>
        `;
    fragment.appendChild(skeletonCard);
  }

  elements.inventoryGrid.appendChild(fragment);
}

function getFilteredItems() {
  let items = [...appState.inventory.items];
  if (appState.activeFilter === "low_stock") {
    items = items.filter(item => item.quantity <= item.alertLevel);
  }
  if (appState.selectedCategory && appState.selectedCategory !== "all") {
    items = items.filter(item => item.category === appState.selectedCategory);
  }
  if (appState.searchTerm) {
    const lowerCaseSearch = appState.searchTerm.toLowerCase();
    items = items.filter(
      item =>
        item.name.toLowerCase().includes(lowerCaseSearch) ||
        (item.sku && item.sku.toLowerCase().includes(lowerCaseSearch))
    );
  }
  return items;
}

export function filterAndRenderItems() {
  const itemsToRender = getFilteredItems();
  renderInventory(itemsToRender);
}

export function renderInventory(itemsToRender) {
  elements.inventoryGrid.innerHTML = "";
  if (itemsToRender.length === 0) {
    elements.inventoryGrid.innerHTML =
      '<p class="empty-state">لا توجد منتجات تطابق بحثك...</p>';
    return;
  }
  const fragment = document.createDocumentFragment();
  itemsToRender.forEach(item => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.dataset.id = item.id;
    const isLowStock = item.quantity <= item.alertLevel;
    if (isLowStock) card.classList.add("low-stock");
    const isIQD = appState.activeCurrency === "IQD";
    const price = isIQD ? item.sellPriceIqd || 0 : item.sellPriceUsd || 0;

    const symbol = isIQD ? "د.ع" : "$";
    const placeholder = `<div class="card-image-placeholder"><iconify-icon icon="material-symbols:key"></iconify-icon></div>`;
    card.innerHTML = `
             <div class="card-image-container">
                <div class="quantity-badge ${
                  isLowStock ? "low-stock" : ""
                }">متبقي ${item.quantity}</div>
               ${
                 item.imagePath
                   ? `<img class="card-image" alt="${sanitizeHTML(item.name)}">`
                   : placeholder
               }
            </div>
            <div class="card-info">
                <div class="card-name">${sanitizeHTML(item.name)}</div>
                <div class="card-sku">SKU: ${sanitizeHTML(item.sku || "")}</div>
                <div class="card-footer">
                    <div class="card-price">${price.toLocaleString()} ${symbol}</div>
                     <div class="card-actions">
                         <button class="icon-btn sell-btn" title="بيع"><iconify-icon icon="material-symbols:shopping-cart-outline-rounded"></iconify-icon></button>
                         <button class="icon-btn details-btn" title="عرض التفاصيل"><iconify-icon icon="material-symbols:more-vert"></iconify-icon></button>
                    </div>
                </div>
            </div>`;
    fragment.appendChild(card);
    if (item.imagePath) {
      const imgElement = card.querySelector(".card-image");
      fetchImageWithAuth(item.imagePath).then(blobUrl => {
        if (blobUrl) imgElement.src = blobUrl;
      });
    }
  });
  elements.inventoryGrid.appendChild(fragment);
  updateStats();
}

export const updateStats = () => {
  elements.totalItemsStat.textContent = appState.inventory.items.length;
  elements.lowStockStat.textContent = appState.inventory.items.filter(
    item => item.quantity <= item.alertLevel
  ).length;
};
export const setTheme = themeName => {
  document.body.className = `theme-${themeName}`;
  const icon = elements.themeToggleBtn.querySelector("iconify-icon");
  if (icon) {
    icon.setAttribute(
      "icon",
      themeName === "dark"
        ? "material-symbols:dark-mode-outline-rounded"
        : "material-symbols:light-mode-outline-rounded"
    );
  }
  localStorage.setItem("inventoryAppTheme", themeName);
};

export const updateCurrencyDisplay = () => {
  const isIQD = appState.activeCurrency === "IQD";
  elements.currencyToggleBtn.textContent = isIQD ? "د.ع" : "$";
  if (appState.currentView === "inventory") {
    filterAndRenderItems();
    if (elements.detailsModal.open && appState.currentItemId) {
      openDetailsModal(appState.currentItemId);
    }
  } else if (appState.currentView === "dashboard") {
    renderDashboard();
  }
};
export function renderSupplierList() {
  elements.supplierListContainer.innerHTML = "";
  if (appState.suppliers.length === 0) {
    elements.supplierListContainer.innerHTML = "<p>لا يوجد مورّدون حاليًا.</p>";
    return;
  }
  appState.suppliers.forEach(supplier => {
    const item = document.createElement("div");
    item.className = "supplier-item";
    item.innerHTML = `
            <div>
                <strong>${sanitizeHTML(supplier.name)}</strong>
                <div class="text-secondary">${sanitizeHTML(
                  supplier.phone || ""
                )}</div>
            </div>
    
            <div class="supplier-item-actions">
                <button class="icon-btn edit-supplier-btn" data-id="${
                  supplier.id
                }" title="تعديل المورّد">
                    <iconify-icon icon="material-symbols:edit-outline-rounded"></iconify-icon>
                </button>
                <button class="icon-btn danger-btn delete-supplier-btn" data-id="${
                  supplier.id
                }" title="حذف المورّد">
                    <iconify-icon icon="material-symbols:delete-outline-rounded"></iconify-icon>
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
    const option = document.createElement("option");
    option.value = supplier.id;
    option.textContent = sanitizeHTML(supplier.name);
    if (supplier.id === selectedSupplierId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

export const openDetailsModal = itemId => {
  const item = appState.inventory.items.find(i => i.id === itemId);
  if (!item) return;
  appState.currentItemId = itemId;
  appState.itemStateBeforeEdit = JSON.parse(JSON.stringify(item));
  elements.detailsName.textContent = item.name;
  elements.detailsSku.textContent = `SKU: ${sanitizeHTML(item.sku || "N/A")}`;
  elements.detailsQuantityValue.textContent = item.quantity;
  elements.detailsCostIqd.textContent = `${(
    item.costPriceIqd || 0
  ).toLocaleString()} د.ع`;
  elements.detailsSellIqd.textContent = `${(
    item.sellPriceIqd || 0
  ).toLocaleString()} د.ع`;
  elements.detailsCostUsd.textContent = `$${(
    item.costPriceUsd || 0
  ).toLocaleString()}`;
  elements.detailsSellUsd.textContent = `$${(
    item.sellPriceUsd || 0
  ).toLocaleString()}`;
  elements.detailsNotesContent.textContent = item.notes || "لا توجد ملاحظات.";
  const supplier = appState.suppliers.find(s => s.id === item.supplierId);
  if (supplier) {
    elements.detailsSupplierName.textContent = sanitizeHTML(supplier.name);
    elements.detailsSupplierPhone.textContent = supplier.phone
      ? sanitizeHTML(supplier.phone)
      : "لا يوجد";
    if (supplier.phone) {
      elements.detailsSupplierWhatsapp.href = `https://wa.me/${supplier.phone.replace(
        /[^0-9]/g,
        ""
      )}`;
      elements.detailsSupplierWhatsapp.style.display = "inline-flex";
    } else {
      elements.detailsSupplierWhatsapp.style.display = "none";
    }
    elements.supplierDetailsContainer.classList.remove("view-hidden");
  } else {
    elements.supplierDetailsContainer.classList.add("view-hidden");
  }
  if (item.imagePath) {
    elements.detailsImage.style.display = "block";
    elements.detailsImagePlaceholder.style.display = "none";
    elements.detailsImage.src = "";
    elements.detailsImage.classList.add("skeleton");
    fetchImageWithAuth(item.imagePath).then(blobUrl => {
      if (blobUrl) {
        elements.detailsImage.src = blobUrl;
        elements.detailsImage.onload = () => {
          elements.detailsImage.classList.remove("skeleton");
        };
      } else {
        elements.detailsImage.classList.remove("skeleton");
      }
    });
  } else {
    elements.detailsImage.style.display = "none";
    elements.detailsImagePlaceholder.style.display = "flex";
  }

  appState.modalStack.push(elements.detailsModal);
  elements.detailsModal.appendChild(elements.toastContainer);
  elements.detailsModal.showModal();
};
export const openItemModal = (itemId = null) => {
  elements.itemForm.reset();
  appState.selectedImageFile = null;
  elements.imagePreview.src = "#";
  elements.imagePreview.classList.add("image-preview-hidden");
  elements.imagePlaceholder.style.display = "flex";
  elements.regenerateSkuBtn.style.display = "none";
  if (itemId) {
    const item = appState.inventory.items.find(i => i.id === itemId);
    if (item) {
      elements.modalTitle.textContent = "تعديل منتج";
      elements.itemIdInput.value = item.id;
      document.getElementById("item-sku").value = item.sku;
      document.getElementById("item-name").value = item.name;
      document.getElementById("item-category").value = item.category;
      document.getElementById("item-quantity").value = item.quantity;
      document.getElementById("item-alert-level").value = item.alertLevel;
      document.getElementById("item-cost-price-iqd").value =
        item.costPriceIqd || 0;
      document.getElementById("item-sell-price-iqd").value =
        item.sellPriceIqd || 0;
      document.getElementById("item-cost-price-usd").value =
        item.costPriceUsd || 0;
      document.getElementById("item-sell-price-usd").value =
        item.sellPriceUsd || 0;
      document.getElementById("item-notes").value = item.notes;
      populateSupplierDropdown(item.supplierId);
      if (item.imagePath) {
        fetchImageWithAuth(item.imagePath).then(blobUrl => {
          if (blobUrl) {
            elements.imagePreview.src = blobUrl;
            elements.imagePreview.classList.remove("image-preview-hidden");

            elements.imagePlaceholder.style.display = "none";
          }
        });
      }
    }
  } else {
    elements.modalTitle.textContent = "إضافة منتج جديد";
    elements.itemIdInput.value = "";
    elements.regenerateSkuBtn.style.display = "flex";
    populateSupplierDropdown();
  }
  appState.modalStack.push(elements.itemModal);
  elements.itemModal.appendChild(elements.toastContainer);
  elements.itemModal.showModal();
};
export const openSaleModal = itemId => {
  const item = appState.inventory.items.find(i => i.id === itemId);
  if (!item) return;
  elements.saleForm.reset();
  elements.saleItemIdInput.value = item.id;
  elements.saleItemName.textContent = item.name;
  const saleQuantityInput = document.getElementById("sale-quantity");
  const salePriceInput = document.getElementById("sale-price");
  const isIQD = appState.activeCurrency === "IQD";
  const price = isIQD ? item.sellPriceIqd || 0 : item.sellPriceUsd || 0;
  const symbol = isIQD ? "د.ع" : "$";
  elements.salePriceCurrency.textContent = symbol;
  salePriceInput.value = price;
  salePriceInput.step = isIQD ? "250" : "0.01";
  saleQuantityInput.value = 1;
  saleQuantityInput.max = item.quantity;
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  document.getElementById("sale-date").value = `${year}-${month}-${day}`;

  appState.modalStack.push(elements.saleModal);
  elements.saleModal.appendChild(elements.toastContainer);
  elements.saleModal.showModal();
  updateSaleTotal();
};
export const populateSyncModal = () => {
  if (appState.syncConfig) {
    elements.githubUsernameInput.value = appState.syncConfig.username;
    elements.githubRepoInput.value = appState.syncConfig.repo;
    elements.githubPatInput.value = appState.syncConfig.pat;
  }
  appState.modalStack.push(elements.syncModal);
  elements.syncModal.appendChild(elements.toastContainer);
  elements.syncModal.showModal();
};
