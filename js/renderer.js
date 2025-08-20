// js/renderer.js
import { appState } from "./state.js";
import { fetchImageWithAuth } from "./api.js";
import { sanitizeHTML } from "./utils.js";
import { elements } from "./dom.js";
import { ACTION_TYPES } from "./logger.js";

const ITEMS_PER_PAGE = 20;
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
export function getAllUniqueCategories() {
  return [
    ...new Set(
      appState.inventory.items
        .flatMap(item => item.categories || [])
        .filter(Boolean)
    ),
  ].sort();
}

function getFilteredItems() {
  let items = [...appState.inventory.items];
  if (appState.activeFilter === "low_stock") {
    items = items.filter(item => item.quantity <= item.alertLevel);
  }

  if (appState.selectedCategory && appState.selectedCategory !== "all") {
    if (appState.selectedCategory === "_uncategorized_") {
      items = items.filter(
        item => !item.categories || item.categories.length === 0
      );
    } else {
      items = items.filter(item =>
        (item.categories || []).includes(appState.selectedCategory)
      );
    }
  }

  if (appState.searchTerm) {
    const searchTerms = appState.searchTerm
      .toLowerCase()
      .split(" ")
      .filter(term => term.trim() !== "");
    if (searchTerms.length > 0) {
      items = items.filter(item => {
        const searchableContent = [
          item.name,
          item.sku,
          item.notes,
          item.oemPartNumber,
          item.compatiblePartNumber,
          ...(item.categories || []),
        ]
          .join(" ")
          .toLowerCase();
        return searchTerms.every(term => searchableContent.includes(term));
      });
    }
  }

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
    updateStats();
    return;
  }

  const fragment = document.createDocumentFragment();
  const cardTemplate = elements.productCardTemplate;
  itemsToDisplay.forEach(item => {
    const cardClone = cardTemplate.content.cloneNode(true);
    const cardElement = cardClone.querySelector(".product-card");

    cardElement.dataset.id = item.id;

    if (appState.selectedItemIds.has(item.id)) {
      cardElement.classList.add("selected");
    }

    const isLowStock = item.quantity > 0 && item.quantity <= item.alertLevel;
    const isOutOfStock = item.quantity === 0;

    if (isLowStock) cardElement.classList.add("low-stock");
    if (isOutOfStock) cardElement.classList.add("out-of-stock");

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

    const quantityBadge = cardClone.querySelector(".quantity-badge");
    quantityBadge.textContent = badgeText;
    quantityBadge.className = `quantity-badge ${badgeClass}`;
    const imageContainer = cardClone.querySelector(".card-image-container");
    const placeholder = cardClone.querySelector(".card-image-placeholder");

    if (item.imagePath) {
      const img = document.createElement("img");
      img.className = "card-image";
      img.alt = sanitizeHTML(item.name);

      if (item.imagePath.startsWith("http")) {
        img.src = item.imagePath;
      } else {
        img.dataset.src = item.imagePath;
      }
      imageContainer.appendChild(img);
      placeholder.remove();
    }

    const tagsContainer = cardClone.querySelector(
      ".card-category-tags-container"
    );
    tagsContainer.innerHTML = "";
    if (item.categories && item.categories.length > 0) {
      item.categories.forEach(category => {
        const tag = document.createElement("span");
        tag.className = "card-category-tag";
        tag.textContent = sanitizeHTML(category);
        tagsContainer.appendChild(tag);
      });
    }

    cardClone.querySelector(".card-name").textContent = sanitizeHTML(item.name);
    cardClone.querySelector(".card-sku").textContent = `SKU: ${sanitizeHTML(
      item.sku || ""
    )}`;
    const isIQD = appState.activeCurrency === "IQD";
    const price = isIQD ? item.sellPriceIqd || 0 : item.sellPriceUsd || 0;
    const symbol = isIQD ? "د.ع" : "$";
    cardClone.querySelector(
      ".card-price"
    ).textContent = `${price.toLocaleString()} ${symbol}`;
    cardClone.querySelector(".sell-btn").disabled = isOutOfStock;

    fragment.appendChild(cardClone);
  });

  elements.inventoryGrid.appendChild(fragment);

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

export function updateProductCardImage(itemId, newImageBlobUrl) {
  const card = document.querySelector(`.product-card[data-id="${itemId}"]`);
  if (!card) return;

  const imageContainer = card.querySelector(".card-image-container");
  if (!imageContainer) return;
  const existingImage = imageContainer.querySelector(".card-image");
  if (existingImage) existingImage.remove();

  const existingPlaceholder = imageContainer.querySelector(
    ".card-image-placeholder"
  );
  if (existingPlaceholder) existingPlaceholder.remove();
  const newImg = document.createElement("img");
  newImg.className = "card-image";
  newImg.src = newImageBlobUrl;
  imageContainer.appendChild(newImg);
}

export function updateProductCard(itemId) {
  const card = document.querySelector(`.product-card[data-id="${itemId}"]`);
  const item = appState.inventory.items.find(i => i.id === itemId);
  if (!card || !item) {
    return;
  }

  const isLowStock = item.quantity > 0 && item.quantity <= item.alertLevel;
  const isOutOfStock = item.quantity === 0;

  card.classList.toggle("low-stock", isLowStock);
  card.classList.toggle("out-of-stock", isOutOfStock);

  const badge = card.querySelector(".quantity-badge");
  if (badge) {
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
    badge.textContent = badgeText;
    badge.className = `quantity-badge ${badgeClass}`;
  }

  const sellBtn = card.querySelector(".sell-btn");
  if (sellBtn) {
    sellBtn.disabled = isOutOfStock;
  }
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

export function updateStats() {
  elements.totalItemsStat.textContent = appState.inventory.items.length;
  elements.lowStockStat.textContent = appState.inventory.items.filter(
    item => item.quantity <= item.alertLevel
  ).length;
}

export function renderCategoryFilter() {
  const { categoryFilterBar } = elements;
  if (!categoryFilterBar) return;
  const categories = getAllUniqueCategories();
  categoryFilterBar.innerHTML = "";
  const fragment = document.createDocumentFragment();

  // "All" button
  const allButton = document.createElement("button");
  allButton.className = "category-chip";
  allButton.textContent = "عرض الكل";
  allButton.dataset.category = "all";
  if (appState.selectedCategory === "all") {
    allButton.classList.add("active");
  }
  fragment.appendChild(allButton);
  // "Uncategorized" button
  const hasUncategorized = appState.inventory.items.some(
    item => !item.categories || item.categories.length === 0
  );
  if (hasUncategorized) {
    const uncategorizedButton = document.createElement("button");
    uncategorizedButton.className = "category-chip";
    uncategorizedButton.textContent = "غير مصنف";
    uncategorizedButton.dataset.category = "_uncategorized_";
    if (appState.selectedCategory === "_uncategorized_") {
      uncategorizedButton.classList.add("active");
    }
    fragment.appendChild(uncategorizedButton);
  }

  // All other category buttons
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

function renderSalesLog(filteredSales) {
  const { salesLogContent } = elements;
  salesLogContent.innerHTML = "";
  if (filteredSales.length === 0) {
    salesLogContent.innerHTML =
      "<div><p>لا توجد مبيعات في هذه الفترة.</p></div>";
    return;
  }

  const isIQD = appState.activeCurrency === "IQD";
  const symbol = isIQD ? "د.ع" : "$";
  const salesByDay = filteredSales.reduce((acc, sale) => {
    const date = sale.saleDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(sale);
    return acc;
  }, {});
  const dayGroupTemplate = document.getElementById("day-group-template");
  const saleItemTemplate = document.getElementById("sale-item-template");
  const mainFragment = document.createDocumentFragment();
  for (const [date, sales] of Object.entries(salesByDay)) {
    const dayGroupClone = dayGroupTemplate.content.cloneNode(true);
    const dayGroupElement = dayGroupClone.querySelector(".day-group");
    const salesListElement = dayGroupElement.querySelector(".sales-list");

    const [year, month, day] = date.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayHeader = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
      dateStyle: "full",
      timeZone: "Asia/Baghdad",
    }).format(dateObj);
    dayGroupElement.querySelector(".day-header").textContent = dayHeader;

    sales.forEach(sale => {
      const item =
        appState.inventory.items.find(i => i.id === sale.itemId) || {};
      const saleItemClone = saleItemTemplate.content.cloneNode(true);
      const saleItemElement = saleItemClone.querySelector(".sale-item");

      saleItemElement.dataset.saleId = sale.saleId;
      saleItemElement.querySelector(".item-product-name").textContent =
        sanitizeHTML(sale.itemName);
      saleItemElement.querySelector(".item-product-sku").textContent =
        sanitizeHTML(item.sku || "N/A");
      saleItemElement.querySelector(
        ".sale-quantity"
      ).textContent = `x${sale.quantitySold}`;

      const sellPrice = isIQD ? sale.sellPriceIqd : sale.sellPriceUsd;
      const totalSellPrice = sellPrice * sale.quantitySold;
      saleItemElement.querySelector(".meta-price").textContent =
        totalSellPrice.toLocaleString();

      const costPrice = isIQD ? sale.costPriceIqd : sale.costPriceUsd;
      const profit = (sellPrice - costPrice) * sale.quantitySold;
      const profitClass = profit >= 0 ? "profit-positive" : "profit-negative";
      const profitIcon =
        profit >= 0
          ? "material-symbols:trending-up-rounded"
          : "material-symbols:trending-down-rounded";

      const profitItem = saleItemElement.querySelector(".profit-item");
      profitItem.classList.add(profitClass);
      profitItem.querySelector(".profit-icon").setAttribute("icon", profitIcon);
      profitItem.querySelector(
        ".profit-value"
      ).textContent = `${profit.toLocaleString()} ${symbol}`;
      if (sale.notes) {
        const notesItem = saleItemElement.querySelector(".notes-item");
        notesItem.style.display = "flex";
        notesItem.querySelector(".notes-value").textContent = sanitizeHTML(
          sale.notes
        );
      }

      const saleTime = new Date(sale.timestamp).toLocaleTimeString("ar-IQ", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        numberingSystem: "latn",
      });
      saleItemElement.querySelector(
        ".sale-datetime"
      ).textContent = `التاريخ: ${sale.saleDate} | الوقت: ${saleTime}`;

      salesListElement.appendChild(saleItemElement);
    });
    mainFragment.appendChild(dayGroupElement);
  }

  const wrapperDiv = document.createElement("div");
  wrapperDiv.appendChild(mainFragment);

  salesLogContent.innerHTML = "";
  salesLogContent.appendChild(wrapperDiv);
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
        <div class="text-secondary">${sanitizeHTML(supplier.phone || "")}</div>
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

const formatRelativeTime = date => {
  const now = new Date();
  const seconds = Math.round((now - date) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (seconds < 60) return `قبل لحظات`;
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  if (hours < 24) return `قبل ${hours} ساعة`;
  if (days < 30) return `قبل ${days} يوم`;
  return date.toLocaleString("ar-EG");
};
const getActionDetails = log => {
  const name = `<strong>${sanitizeHTML(log.targetName)}</strong>`;
  const details = log.details;
  const formatCategories = cats => {
    if (!Array.isArray(cats))
      return `"${sanitizeHTML(String(cats ?? "")) || "بلا فئة"}"`;
    if (cats.length === 0) return '"بلا فئة"';
    return `"${cats.map(c => sanitizeHTML(c)).join(", ")}"`;
  };

  const from = details.from;
  const to = details.to;

  switch (log.action) {
    case ACTION_TYPES.ITEM_CREATED:
      return {
        icon: "material-symbols:add-box-outline",
        class: "create",
        description: `تم إنشاء منتج جديد: ${name}.`,
      };
    case ACTION_TYPES.PRICE_UPDATED:
      return {
        icon: "material-symbols:price-change-outline",
        class: "update",
        description: `تم تغيير سعر ${name} من <span class="old-value">${Number(
          from
        ).toLocaleString()}</span> إلى <span class="new-value">${Number(
          to
        ).toLocaleString()}</span>.`,
      };
    case ACTION_TYPES.QUANTITY_UPDATED:
      let qtyDescription = `تم تعديل كمية ${name} من ${sanitizeHTML(
        String(from)
      )} إلى ${sanitizeHTML(String(to))}.`;
      if (details.reason && details.reason.trim() !== "") {
        qtyDescription += ` (السبب: ${sanitizeHTML(details.reason)})`;
      }
      return {
        icon: "material-symbols:inventory-2-outline",
        class: "update",
        description: qtyDescription,
      };
    case ACTION_TYPES.SALE_RECORDED:
      return {
        icon: "material-symbols:shopping-cart-outline",
        class: "sale",
        description: `تم بيع ${details.quantity} قطعة من ${name}.`,
      };
    case ACTION_TYPES.ITEM_DELETED:
      return {
        icon: "material-symbols:delete-outline",
        class: "delete",
        description: `تم حذف المنتج: ${name}.`,
      };
    case ACTION_TYPES.NAME_UPDATED:
      return {
        icon: "material-symbols:edit-outline",
        class: "update",
        description: `تم تغيير اسم المنتج من "${sanitizeHTML(
          String(from)
        )}" إلى "${sanitizeHTML(String(to))}".`,
      };
    case ACTION_TYPES.SKU_UPDATED:
      return {
        icon: "material-symbols:qr-code-2",
        class: "update",
        description: `تم تغيير SKU للمنتج ${name} من "${sanitizeHTML(
          String(from)
        )}" إلى "${sanitizeHTML(String(to))}".`,
      };
    case ACTION_TYPES.CATEGORY_UPDATED:
      return {
        icon: "material-symbols:folder-open-outline",
        class: "update",
        description: `تم تغيير فئة ${name} من ${formatCategories(
          from
        )} إلى ${formatCategories(to)}.`,
      };
    case ACTION_TYPES.NOTES_UPDATED:
      return {
        icon: "material-symbols:note-stack-add-outline",
        class: "update",
        description: `تم تحديث الملاحظات للمنتج ${name}.`,
      };
    case ACTION_TYPES.IMAGE_UPDATED:
      return {
        icon: "material-symbols:add-photo-alternate-outline",
        class: "update",
        description: `تم تحديث صورة المنتج ${name}.`,
      };
    case ACTION_TYPES.SUPPLIER_UPDATED:
      return {
        icon: "material-symbols:business-center-outline",
        class: "update",
        description: `تم تغيير مورّد المنتج ${name} من "${sanitizeHTML(
          String(from)
        )}" إلى "${sanitizeHTML(String(to))}".`,
      };
    default:
      return {
        icon: "material-symbols:edit-document-outline",
        class: "update",
        description: `تم تحديث بيانات ${name} (${log.action}).`,
      };
  }
};

export function renderAuditLog() {
  if (!elements.auditLogList) return;
  elements.auditLogList.innerHTML = "";

  let logsToRender = [...appState.auditLog];

  const filter = appState.activityLogFilter;
  if (filter !== "all") {
    const otherUpdateTypes = [
      ACTION_TYPES.NAME_UPDATED,
      ACTION_TYPES.SKU_UPDATED,
      ACTION_TYPES.CATEGORY_UPDATED,
      ACTION_TYPES.PRICE_UPDATED,
      ACTION_TYPES.NOTES_UPDATED,
      ACTION_TYPES.IMAGE_UPDATED,
      ACTION_TYPES.SUPPLIER_UPDATED,
    ];
    logsToRender = appState.auditLog.filter(log => {
      switch (filter) {
        case "sale":
          return log.action === ACTION_TYPES.SALE_RECORDED;
        case "quantity":
          return log.action === ACTION_TYPES.QUANTITY_UPDATED;
        case "lifecycle":
          return (
            log.action === ACTION_TYPES.ITEM_CREATED ||
            log.action === ACTION_TYPES.ITEM_DELETED
          );
        case "other":
          return otherUpdateTypes.includes(log.action);
        default:
          return true;
      }
    });
  }

  if (logsToRender.length === 0) {
    elements.auditLogList.innerHTML =
      '<p style="padding: 1rem;">لا توجد نشاطات تطابق هذا الفلتر.</p>';
    return;
  }

  const sortedLog = logsToRender.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  const fragment = document.createDocumentFragment();

  sortedLog.forEach(logItem => {
    const clone = elements.logEntryTemplate.content.cloneNode(true);
    const iconElement = clone.querySelector(".log-icon");
    const iconify = iconElement.querySelector("iconify-icon");
    const descriptionElement = clone.querySelector(".log-description");
    const metaElement = clone.querySelector(".log-meta");

    const { icon, class: actionClass, description } = getActionDetails(logItem);

    iconElement.className = `log-icon ${actionClass}`;
    iconify.setAttribute("icon", icon);
    descriptionElement.innerHTML = description;
    metaElement.innerHTML = `بواسطة <span class="log-user">${sanitizeHTML(
      logItem.user
    )}</span> • ${formatRelativeTime(new Date(logItem.timestamp))}`;

    fragment.appendChild(clone);
  });
  elements.auditLogList.appendChild(fragment);
}
