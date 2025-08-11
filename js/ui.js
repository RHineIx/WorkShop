// js/ui.js
import { appState } from "./state.js";
import { fetchImageWithAuth } from "./api.js";
import { sanitizeHTML } from "./utils.js";

const ITEMS_PER_PAGE = 20;
const elements = {
  // Main Layout
  themeTransitionOverlay: document.getElementById("theme-transition-overlay"),
  inventoryGrid: document.getElementById("inventory-grid"),
  searchBar: document.getElementById("search-bar"),
  statsContainer: document.getElementById("stats-cards"),
  totalItemsStat: document.getElementById("total-items-stat"),
  lowStockStat: document.getElementById("low-stock-stat"),
  toastContainer: document.getElementById("toast-container"),
  searchContainer: document.getElementById("search-container"),
  categoryFilterBar: document.getElementById("category-filter-bar"),
  sortOptions: document.getElementById("sort-options"),
  loadMoreTrigger: document.getElementById("load-more-trigger"),

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
  salesLogContent: document.getElementById("sales-log-content"),

  // Details Modal
  detailsModal: document.getElementById("details-modal"),
  closeDetailsModalBtn: document.getElementById("close-details-modal-btn"),
  detailsImage: document.getElementById("details-image"),
  detailsImagePlaceholder: document.getElementById("details-image-placeholder"),
  detailsName: document.getElementById("details-name"),
  detailsSku: document.getElementById("details-sku"),
  detailsPnGridContainer: document.getElementById("details-pn-grid-container"),
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
  exchangeRateInput: document.getElementById("exchange-rate"),
  rateLimitDisplay: document.getElementById("rate-limit-display"),
  cleanupImagesBtn: document.getElementById("cleanup-images-btn"),
  downloadBackupBtn: document.getElementById("download-backup-btn"),
  restoreBackupInput: document.getElementById("restore-backup-input"),
  generateMagicLinkBtn: document.getElementById("generate-magic-link-btn"),
  magicLinkContainer: document.getElementById("magic-link-container"),
  magicLinkOutput: document.getElementById("magic-link-output"),

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

  // Cropper Modal
  cropperModal: document.getElementById("cropper-modal"),
  cropperImage: document.getElementById("cropper-image"),
  paddingDisplay: document.getElementById("padding-display"),
  increasePaddingBtn: document.getElementById("increase-padding-btn"),
  decreasePaddingBtn: document.getElementById("decrease-padding-btn"),
  bgColorInput: document.getElementById("bg-color-input"),

  // App Version
  appVersionDisplay: document.getElementById("app-version-display"),

  // Bulk Actions UI
  bulkActionsBar: document.getElementById("bulk-actions-bar"),
  selectionCount: document.getElementById("selection-count"),
  bulkCategoryModal: document.getElementById("bulk-category-modal"),
  bulkCategoryForm: document.getElementById("bulk-category-form"),
  bulkSupplierModal: document.getElementById("bulk-supplier-modal"),
  bulkSupplierForm: document.getElementById("bulk-supplier-form"),
  bulkSupplierSelect: document.getElementById("bulk-item-supplier"),

  // Floating Action Buttons
  scrollToTopBtn: document.getElementById("scroll-to-top-btn"),
};
// --- INTERSECTION OBSERVERS ---
const imageObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const imagePath = img.dataset.src;
        img.parentElement.classList.add("loading");
        fetchImageWithAuth(imagePath)
          .then(blobUrl => {
            if (blobUrl) {
              img.src = blobUrl;
              img.onload = () => img.parentElement.classList.remove("loading");
              img.onerror = () => {
                img.parentElement.classList.remove("loading");
                img.remove();
              };
            } else {
              img.parentElement.classList.remove("loading");
            }
          })
          .catch(() => img.parentElement.classList.remove("loading"));
        observer.unobserve(img);
      }
    });
  },
  { rootMargin: "0px 0px 200px 0px" }
);
const animationObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);
const loadMoreObserver = new IntersectionObserver(
  entries => {
    const entry = entries[0];
    if (entry.isIntersecting) {
      appState.visibleItemCount += ITEMS_PER_PAGE;
      filterAndRenderItems();
    }
  },
  { rootMargin: "0px 0px 400px 0px" }
);
// --- Centralized Modal Control ---
function handleModalClose(event) {
  const closedDialog = event.target;
  appState.modalStack = appState.modalStack.filter(d => d !== closedDialog);
  if (appState.modalStack.length === 0) {
    const scrollY = appState.scrollPosition;
    document.body.classList.remove("body-scroll-locked");
    document.body.style.top = "";
    // Temporarily disable smooth scrolling to prevent visible jump
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, scrollY);
    document.documentElement.style.scrollBehavior = "";
    // Revert to CSS defined behavior

    document.body.appendChild(elements.toastContainer);
  } else {
    const topModal = appState.modalStack[appState.modalStack.length - 1];
    topModal.appendChild(elements.toastContainer);
  }
}
export function openModal(dialogElement) {
  if (!dialogElement) return;
  if (appState.modalStack.length === 0) {
    appState.scrollPosition = window.scrollY;
    document.body.style.top = `-${appState.scrollPosition}px`;
    document.body.classList.add("body-scroll-locked");
  }
  dialogElement.addEventListener("close", handleModalClose, { once: true });
  appState.modalStack.push(dialogElement);
  dialogElement.appendChild(elements.toastContainer);
  dialogElement.showModal();
}

export function getDOMElements() {
  return elements;
}

export const displayVersionInfo = versionData => {
  if (versionData && elements.appVersionDisplay) {
    const { hash, branch } = versionData;
    elements.appVersionDisplay.textContent = `الإصدار: ${hash} - الفرع (${branch})`;
  }
};

let countdownInterval = null;
export function updateRateLimitDisplay() {
  const { limit, remaining, reset } = appState.rateLimit;
  const indicator = document.querySelector(".rate-limit-indicator");
  if (limit === null || remaining === null) {
    indicator.classList.remove("visible", "high", "medium", "low");
    if (elements.rateLimitDisplay) elements.rateLimitDisplay.textContent = "";
    return;
  }

  indicator.classList.add("visible");
  const percentage = (remaining / limit) * 100;

  indicator.classList.remove("high", "medium", "low");
  if (percentage > 50) {
    indicator.classList.add("high");
  } else if (percentage > 10) {
    indicator.classList.add("medium");
  } else {
    indicator.classList.add("low");
  }

  const updateDisplay = () => {
    const now = Math.floor(Date.now() / 1000);
    const secondsUntilReset = reset - now;
    if (secondsUntilReset <= 0) {
      elements.rateLimitDisplay.textContent = `${remaining}/${limit} طلبات متبقية.`;
      clearInterval(countdownInterval);
    } else {
      const minutes = Math.floor(secondsUntilReset / 60);
      const seconds = secondsUntilReset % 60;
      elements.rateLimitDisplay.textContent = `${remaining}/${limit} طلبات متبقية | إعادة التعيين بعد ${minutes}د ${seconds}ث`;
    }
  };
  clearInterval(countdownInterval);
  updateDisplay();
  countdownInterval = setInterval(updateDisplay, 1000);
}

export function renderCategoryFilter() {
  const { categoryFilterBar } = getDOMElements();
  if (!categoryFilterBar) return;

  const categories = [
    ...new Set(
      appState.inventory.items.map(item => item.category).filter(Boolean)
    ),
  ];

  categoryFilterBar.innerHTML = ""; // Clear existing chips
  const fragment = document.createDocumentFragment();

  // Create "All" button
  const allButton = document.createElement("button");
  allButton.className = "category-chip";
  allButton.textContent = "عرض الكل";
  allButton.dataset.category = "all";
  if (appState.selectedCategory === "all") {
    allButton.classList.add("active");
  }
  fragment.appendChild(allButton);

  // Create buttons for each category
  categories.forEach(category => {
    const chipButton = document.createElement("button");
    chipButton.className = "category-chip";
    chipButton.textContent = sanitizeHTML(category);
    chipButton.dataset.category = category;
    if (appState.selectedCategory === category) {
      chipButton.classList.add("active");
    }
    fragment.appendChild(chipButton);
  });

  categoryFilterBar.appendChild(fragment);
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
function renderSalesLog(filteredSales) {
  if (filteredSales.length === 0) {
    elements.salesLogContent.innerHTML =
      "<div><p>لا توجد مبيعات في هذه الفترة.</p></div>";
    return;
  }

  const isIQD = appState.activeCurrency === "IQD";
  const symbol = isIQD ? "د.ع" : "$";
  const salesByDay = filteredSales.reduce((acc, sale) => {
    const date = sale.saleDate;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(sale);
    return acc;
  }, {});
  const logHTML = Object.entries(salesByDay)
    .map(([date, sales]) => {
      const dateObj = new Date(date);
      const dayHeader = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
        dateStyle: "full",
      }).format(dateObj);

      const salesCardsHTML = sales
        .map(sale => {
          const item =
            appState.inventory.items.find(i => i.id === sale.itemId) || {};
          const sellPrice = isIQD ? sale.sellPriceIqd : sale.sellPriceUsd;
          const costPrice = isIQD ? sale.costPriceIqd : sale.costPriceUsd;
          const totalSellPrice = sellPrice * sale.quantitySold;
          const profit = (sellPrice - costPrice) * sale.quantitySold;
          const profitClass =
            profit >= 0 ? "profit-positive" : "profit-negative";
          const profitIcon =
            profit >= 0
              ? "material-symbols:trending-up-rounded"
              : "material-symbols:trending-down-rounded";

          const saleTime = new Date(sale.timestamp).toLocaleTimeString(
            "ar-IQ",
            {
              hour: "numeric",
              minute: "numeric",
              hour12: true,
            }
          );
          return `
                <div class="sale-item">
                    <div class="item-header">
                        <div class="item-info">
                            <div class="item-product-name">${sanitizeHTML(
                              sale.itemName
                            )}</div>
                            <div class="item-product-sku">${sanitizeHTML(
                              item.sku || "N/A"
                            )}</div>
                        </div>
                        <div class="item-meta">
                            <div class="meta-label">الكمية</div>
                            <div class="meta-value">x${sale.quantitySold}</div>
                        </div>
                        <div class="item-meta">
                            <div class="meta-label">الإجمالي</div>
                            <div class="meta-value meta-price">${totalSellPrice.toLocaleString()}</div>
                        </div>
                        <div class="sale-datetime">
                            التاريخ: ${sale.saleDate} |
                            الوقت: ${saleTime}
                        </div>
                    </div>
                    <div class="item-details">
                        <ul class="details-list">
                            <li class="${profitClass}">
                                <div class="detail-label-group">
                                    <iconify-icon icon="${profitIcon}"></iconify-icon>
                                    <span class="label">الربح</span>
                                </div>
                                <span class="value">${profit.toLocaleString()} ${symbol}</span>
                            </li>
                            ${
                              sale.notes
                                ? `<li>
                                <div class="detail-label-group">
                                    <iconify-icon icon="solar:notes-outline"></iconify-icon>
                                    <span class="label">ملاحظات</span>
                                </div>
                                <span class="value">${sanitizeHTML(
                                  sale.notes
                                )}</span>
                            </li>`
                                : ""
                            }
                        </ul>
                    </div>
                </div>
            `;
        })
        .join("");

      return `
            <div class="day-group">
                <h3 class="day-header">${dayHeader}</h3>
                <div class="sales-list">
                    ${salesCardsHTML}
                </div>
            </div>
        `;
    })
    .join("");
  elements.salesLogContent.innerHTML = `<div>${logHTML}</div>`;
}

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
  const filteredSales = appState.sales
    .filter(sale => {
      const [year, month, day] = sale.saleDate.split("-").map(Number);
      const saleDate = new Date(year, month - 1, day);
      return saleDate >= startDate && saleDate <= now;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const isIQD = appState.activeCurrency === "IQD";
  const totalSales = filteredSales.reduce(
    (sum, sale) =>
      sum + (isIQD ? sale.sellPriceIqd : sale.sellPriceUsd) * sale.quantitySold,
    0
  );
  const totalCost = filteredSales.reduce(
    (sum, sale) =>
      sum + (isIQD ? sale.costPriceIqd : sale.costPriceUsd) * sale.quantitySold,
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

  renderSalesLog(filteredSales);
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
  // Apply filters
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
        (item.sku && item.sku.toLowerCase().includes(lowerCaseSearch)) ||
        (item.notes && item.notes.toLowerCase().includes(lowerCaseSearch)) ||
        (item.oemPartNumber &&
          item.oemPartNumber.toLowerCase().includes(lowerCaseSearch)) ||
        (item.compatiblePartNumber &&
          item.compatiblePartNumber.toLowerCase().includes(lowerCaseSearch))
    );
  }

  // Apply sorting
  switch (appState.currentSortOption) {
    case "name_asc":
      items.sort((a, b) => a.name.localeCompare(b.name, "ar"));
      break;
    case "quantity_asc":
      items.sort((a, b) => a.quantity - b.quantity);
      break;
    case "quantity_desc":
      items.sort((a, b) => b.quantity - a.quantity);
      break;
    case "date_desc":
      items.sort((a, b) => {
        const timeA = parseInt(a.id.split("_")[1], 10);
        const timeB = parseInt(b.id.split("_")[1], 10);
        return timeB - timeA;
      });
      break;
    default:
      // Default sort (usually insertion order) remains unchanged
      break;
  }

  return items;
}

export function filterAndRenderItems(resetPagination = false) {
  if (resetPagination) {
    appState.visibleItemCount = ITEMS_PER_PAGE;
  }
  const itemsToRender = getFilteredItems();
  renderInventory(itemsToRender);
}

export function renderInventory(itemsToRender) {
  loadMoreObserver.disconnect();
  elements.inventoryGrid.innerHTML = "";
  if (appState.isSelectionModeActive) {
    elements.inventoryGrid.classList.add("selection-mode");
  } else {
    elements.inventoryGrid.classList.remove("selection-mode");
  }

  const itemsToDisplay = itemsToRender.slice(0, appState.visibleItemCount);

  if (itemsToDisplay.length === 0) {
    elements.inventoryGrid.innerHTML =
      '<p class="empty-state">لا توجد منتجات تطابق بحثك...</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  itemsToDisplay.forEach(item => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.dataset.id = item.id;

    if (appState.selectedItemIds.has(item.id)) {
      card.classList.add("selected");
    }

    const isLowStock = item.quantity > 0 && item.quantity <= item.alertLevel;
    const isOutOfStock = item.quantity === 0;

    if (isLowStock) card.classList.add("low-stock");
    if (isOutOfStock) card.classList.add("out-of-stock");

    let badgeText = `متوفر: ${item.quantity}`;
    let badgeClass = "";
    if (isLowStock) {
      badgeText = `منخفض: ${item.quantity}`;
      badgeClass = "low-stock";
    }
    if (isOutOfStock) {
      badgeText = `نفد المخزون`;
      badgeClass = "out-of-stock";
    }

    const isIQD = appState.activeCurrency === "IQD";
    const price = isIQD ? item.sellPriceIqd || 0 : item.sellPriceUsd || 0;
    const symbol = isIQD ? "د.ع" : "$";
    const placeholder = `<div class="card-image-placeholder"><iconify-icon icon="material-symbols:key"></iconify-icon></div>`;
    let imageHtml = placeholder;
    if (item.imagePath) {
      if (item.imagePath.startsWith("http")) {
        // External URL: Use src directly, no lazy loading
        imageHtml = `<img class="card-image" src="${
          item.imagePath
        }" alt="${sanitizeHTML(item.name)}">`;
      } else {
        // Internal Path: Use data-src for lazy loading with auth
        imageHtml = `<img class="card-image" data-src="${
          item.imagePath
        }" alt="${sanitizeHTML(item.name)}">`;
      }
    }

    card.innerHTML = `
      <div class="card-checkbox"></div>
      <div class="card-image-container">
        <div class="quantity-badge ${badgeClass}">${badgeText}</div>
        ${imageHtml}
      </div>
      <div class="card-info">
        ${
          item.category
            ? `<div class="card-category-tag">${sanitizeHTML(
                item.category
              )}</div>`
            : ""
        }
        <h3 class="card-name">${sanitizeHTML(item.name)}</h3>
        <p class="card-sku">SKU: ${sanitizeHTML(item.sku || "")}</p>
        <div class="card-footer">
          <div class="card-price">${price.toLocaleString()} ${symbol}</div>
          <div class="card-actions">
            <button class="icon-btn sell-btn" title="بيع" ${
              isOutOfStock ? "disabled" : ""
            }>
                <iconify-icon icon="material-symbols:shopping-cart-outline-rounded"></iconify-icon>
            </button>
            <button class="icon-btn details-btn" title="عرض التفاصيل">
                <iconify-icon icon="material-symbols:more-vert"></iconify-icon>
            </button>
          </div>
        </div>
      </div>`;
    fragment.appendChild(card);
  });

  elements.inventoryGrid.appendChild(fragment);
  // --- ACTIVATE OBSERVERS ---
  elements.inventoryGrid
    .querySelectorAll(".card-image[data-src]")
    .forEach(img => imageObserver.observe(img));
  elements.inventoryGrid
    .querySelectorAll(".product-card")
    .forEach(card => animationObserver.observe(card));
  if (appState.visibleItemCount < itemsToRender.length) {
    elements.loadMoreTrigger.style.display = "block";
    loadMoreObserver.observe(elements.loadMoreTrigger);
  } else {
    elements.loadMoreTrigger.style.display = "none";
  }

  updateStats();
}

export const updateStats = () => {
  elements.totalItemsStat.textContent = appState.inventory.items.length;
  elements.lowStockStat.textContent = appState.inventory.items.filter(
    item => item.quantity <= item.alertLevel
  ).length;
};
export const setTheme = themeName => {
  const overlay = elements.themeTransitionOverlay;
  if (!overlay || document.body.classList.contains(`theme-${themeName}`)) {
    return;
  }
  if (overlay.dataset.transitioning === "true") {
    return;
  }
  overlay.dataset.transitioning = "true";
  const oldBgColor = getComputedStyle(document.body).backgroundColor;
  overlay.style.backgroundColor = oldBgColor;
  overlay.classList.add("visible");
  setTimeout(() => {
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
    overlay.classList.remove("visible");
  }, 300);
  setTimeout(() => {
    overlay.dataset.transitioning = "false";
  }, 600);
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

export function populateBulkSupplierDropdown() {
  elements.bulkSupplierSelect.innerHTML =
    '<option value="" disabled selected>-- اختر مورّد --</option>';
  appState.suppliers.forEach(supplier => {
    const option = document.createElement("option");
    option.value = supplier.id;
    option.textContent = sanitizeHTML(supplier.name);
    elements.bulkSupplierSelect.appendChild(option);
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
  const pnContainer = elements.detailsPnGridContainer;
  pnContainer.innerHTML = "";
  pnContainer.classList.add("view-hidden");
  const handleTagClick = tagElement => {
    if (tagElement.classList.contains("copied")) return;
    const originalText = tagElement.textContent;
    const textToCopy = originalText.trim();
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        tagElement.innerHTML = `<span class="copied-feedback">تم النسخ!</span>`;
        tagElement.classList.add("copied");

        setTimeout(() => {
          tagElement.textContent = originalText;
          tagElement.classList.remove("copied");
        }, 1500);
      })
      .catch(() => {
        showStatus("فشل النسخ إلى الحافظة", "error");
      });
  };
  if (item.oemPartNumber || item.compatiblePartNumber) {
    const pnGrid = document.createElement("div");
    pnGrid.className = "details-pn-grid";
    if (item.oemPartNumber) {
      const label = document.createElement("div");
      label.className = "pn-grid-label";
      label.textContent = "رمز OEM";
      pnGrid.appendChild(label);
      const valueContainer = document.createElement("div");
      valueContainer.className = "pn-grid-value";
      const tag = document.createElement("span");
      tag.className = "pn-copy-tag";
      tag.textContent = item.oemPartNumber;
      tag.addEventListener("click", () => handleTagClick(tag));
      valueContainer.appendChild(tag);
      pnGrid.appendChild(valueContainer);
    }

    if (item.compatiblePartNumber) {
      const label = document.createElement("div");
      label.className = "pn-grid-label";
      label.textContent = "الرموز المتوافقة";
      pnGrid.appendChild(label);

      const valueContainer = document.createElement("div");
      valueContainer.className = "pn-grid-value";
      const compatiblePns = item.compatiblePartNumber
        .split(",")
        .map(pn => pn.trim())
        .filter(Boolean);
      compatiblePns.forEach(pn => {
        const tag = document.createElement("span");
        tag.className = "pn-copy-tag";
        tag.textContent = pn;
        tag.addEventListener("click", () => handleTagClick(tag));
        valueContainer.appendChild(tag);
      });
      pnGrid.appendChild(valueContainer);
    }

    pnContainer.appendChild(pnGrid);
    pnContainer.classList.remove("view-hidden");
  }

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
    elements.detailsImage.src = ""; // Clear previous image

    // Handle both external URLs and internal paths
    if (item.imagePath.startsWith("http")) {
      elements.detailsImage.src = item.imagePath;
    } else {
      elements.detailsImage.classList.add("skeleton");
      fetchImageWithAuth(item.imagePath).then(blobUrl => {
        if (blobUrl) {
          elements.detailsImage.src = blobUrl;
          elements.detailsImage.onload = () =>
            elements.detailsImage.classList.remove("skeleton");
        } else {
          elements.detailsImage.classList.remove("skeleton");
        }
      });
    }
  } else {
    elements.detailsImage.style.display = "none";
    elements.detailsImagePlaceholder.style.display = "flex";
  }

  openModal(elements.detailsModal);
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
      document.getElementById("item-oem-pn").value = item.oemPartNumber || "";
      document.getElementById("item-compatible-pn").value =
        item.compatiblePartNumber || "";
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
        // Handle both external URLs and internal paths
        if (item.imagePath.startsWith("http")) {
          elements.imagePreview.src = item.imagePath;
          elements.imagePreview.classList.remove("image-preview-hidden");
          elements.imagePlaceholder.style.display = "none";
        } else {
          fetchImageWithAuth(item.imagePath).then(blobUrl => {
            if (blobUrl) {
              elements.imagePreview.src = blobUrl;
              elements.imagePreview.classList.remove("image-preview-hidden");
              elements.imagePlaceholder.style.display = "none";
            }
          });
        }
      }
    }
  } else {
    elements.modalTitle.textContent = "إضافة منتج جديد";
    elements.itemIdInput.value = "";
    elements.regenerateSkuBtn.style.display = "flex";
    populateSupplierDropdown();
  }
  openModal(elements.itemModal);
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

  openModal(elements.saleModal);
  updateSaleTotal();
};
export const populateSyncModal = () => {
  if (appState.syncConfig) {
    elements.githubUsernameInput.value = appState.syncConfig.username;
    elements.githubRepoInput.value = appState.syncConfig.repo;
    elements.githubPatInput.value = appState.syncConfig.pat;
  }
  if (appState.exchangeRate) {
    elements.exchangeRateInput.value = appState.exchangeRate;
  } else {
    elements.exchangeRateInput.value = "";
  }
  openModal(elements.syncModal);
};
export function updateBulkActionsBar() {
  const count = appState.selectedItemIds.size;
  if (count > 0) {
    elements.selectionCount.textContent = `تم تحديد ${count} عناصر`;
    elements.bulkActionsBar.classList.add("visible");
  } else {
    elements.bulkActionsBar.classList.remove("visible");
  }
}
