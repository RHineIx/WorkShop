// js/main.js
import { appState } from "./state.js";
import {
  generateUniqueSKU,
  compressImage,
  debounce,
  sanitizeHTML,
} from "./utils.js";
import * as api from "./api.js";
import { ConflictError } from "./api.js";
import * as ui from "./ui.js";

// --- GLOBAL VARIABLES ---
let cropper = null;
let cropperPadding = 0.1;
let cropperBgColor = "#FFFFFF";
let pressTimer = null;
let longPressTriggered = false;

// Variables to detect scroll vs. long press
let startX = 0;
let startY = 0;
const moveThreshold = 5; // The distance in pixels to count as a scroll

// --- LOCAL STORAGE & CONFIG ---

function loadConfig() {
  const savedConfig = localStorage.getItem("inventoryAppSyncConfig");
  if (savedConfig) {
    appState.syncConfig = JSON.parse(savedConfig);
  }
  const savedRate = localStorage.getItem("inventoryAppExchangeRate");
  if (savedRate) {
    appState.exchangeRate = parseFloat(savedRate);
  }
}

function saveConfig() {
  localStorage.setItem(
    "inventoryAppSyncConfig",
    JSON.stringify(appState.syncConfig)
  );
  localStorage.setItem("inventoryAppExchangeRate", appState.exchangeRate);
}

function handleMagicLink() {
  if (!window.location.hash.startsWith("#setup=")) {
    return false;
  }

  try {
    const encodedData = window.location.hash.substring(7);
    const decodedJson = atob(encodedData);
    const config = JSON.parse(decodedJson);

    if (config.username && config.repo && config.pat) {
      appState.syncConfig = config;
      saveConfig();
      ui.showStatus("تم الإعداد بنجاح!", "success");
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
      return true;
    }
  } catch (error) {
    console.error("Failed to process magic link:", error);
    ui.showStatus("فشل معالجة رابط الإعداد.", "error");
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search
    );
  }
  return false;
}

function generateMagicLink() {
  if (!appState.syncConfig) {
    ui.showStatus("يجب حفظ الإعدادات أولاً.", "error");
    return;
  }
  const { magicLinkContainer, magicLinkOutput } = ui.getDOMElements();
  const configJson = JSON.stringify(appState.syncConfig);
  const encodedData = btoa(configJson);
  const url = `${window.location.origin}${window.location.pathname}#setup=${encodedData}`;
  magicLinkOutput.value = url;
  magicLinkContainer.classList.remove("view-hidden");
  magicLinkOutput.onclick = () => {
    magicLinkOutput.select();
    navigator.clipboard.writeText(url).then(() => {
      ui.showStatus("تم نسخ الرابط إلى الحافظة!", "success", {
        duration: 2000,
      });
    });
  };
}

function loadLocalData() {
  const savedInventory = localStorage.getItem("inventoryAppData");
  if (savedInventory) {
    let parsedData = JSON.parse(savedInventory);
    if (Array.isArray(parsedData)) {
      appState.inventory = { items: parsedData, lastArchiveTimestamp: null };
    } else {
      appState.inventory = parsedData;
    }
  }
  const savedSales = localStorage.getItem("salesAppData");
  if (savedSales) {
    appState.sales = JSON.parse(savedSales);
  }
  const savedSuppliers = localStorage.getItem("suppliersAppData");
  if (savedSuppliers) {
    appState.suppliers = JSON.parse(savedSuppliers);
  }
}

function saveLocalData() {
  localStorage.setItem("inventoryAppData", JSON.stringify(appState.inventory));
  localStorage.setItem("salesAppData", JSON.stringify(appState.sales));
  localStorage.setItem("suppliersAppData", JSON.stringify(appState.suppliers));
}

// --- CSV Import Handler ---
async function handleCsvImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  ui.showStatus("جاري معالجة ملف CSV...", "syncing");

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async results => {
      const newProducts = [];
      let modifiedSkuCount = 0;
      const existingSkus = new Set(
        appState.inventory.items.map(item => item.sku)
      );

      for (const row of results.data) {
        let sku = row.Slug ? String(row.Slug).trim() : null;
        if (!sku || !row.Name) {
          continue; // Skip rows without essential data
        }

        if (existingSkus.has(sku)) {
          modifiedSkuCount++;
          let counter = 2;
          let newSku = `${sku}-${counter}`;
          while (existingSkus.has(newSku)) {
            counter++;
            newSku = `${sku}-${counter}`;
          }
          sku = newSku; // Use the new unique SKU
        }

        const newProduct = {
          id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: String(row.Name).trim(),
          sku: sku,
          category: String(row.Collection || "").trim(),
          quantity: parseInt(row.Quantity, 10) || 0,
          alertLevel: 5, // Default value
          sellPriceIqd: parseFloat(row.Price) || 0,
          costPriceIqd: 0,
          sellPriceUsd: 0,
          costPriceUsd: 0,
          notes: String(row.Description || "").trim(),
          imagePath: String(row.Image || "").trim(),
          supplierId: null,
          oemPartNumber: "",
          compatiblePartNumber: "",
        };
        newProducts.push(newProduct);
        existingSkus.add(sku); // Add to set to prevent future duplicates within the same file
      }

      if (newProducts.length === 0) {
        ui.hideSyncStatus();
        ui.showStatus(`لم يتم العثور على منتجات جديدة للاستيراد.`, "info");
        return;
      }

      appState.inventory.items.push(...newProducts);

      try {
        ui.showStatus(`جاري حفظ ${newProducts.length} منتج جديد...`, "syncing");
        await api.saveToGitHub();
        saveLocalData();
        ui.filterAndRenderItems();
        ui.populateCategoryDatalist();
        ui.hideSyncStatus();
        ui.showStatus(
          `تم استيراد ${newProducts.length} منتج. تم تعديل ${modifiedSkuCount} SKU مكرر.`,
          "success"
        );
      } catch (error) {
        ui.hideSyncStatus();
        ui.showStatus(
          `فشل حفظ البيانات بعد الاستيراد: ${error.message}`,
          "error"
        );
        // Revert changes if save fails
        appState.inventory.items.splice(
          appState.inventory.items.length - newProducts.length,
          newProducts.length
        );
      } finally {
        event.target.value = ""; // Reset file input
      }
    },
    error: error => {
      ui.hideSyncStatus();
      ui.showStatus(`فشل في قراءة ملف CSV: ${error.message}`, "error");
      event.target.value = ""; // Reset file input
    },
  });
}

// --- PRICE CONVERSION LOGIC ---
function handlePriceConversion(iqdInput, usdInput) {
  const iqdValue = parseFloat(iqdInput.value);
  const rate = appState.exchangeRate;
  if (!isNaN(iqdValue) && iqdValue > 0 && rate > 0) {
    const usdValue = iqdValue / rate;
    usdInput.value = usdValue.toFixed(2);
  } else {
    usdInput.value = 0;
  }
}

// --- CORE LOGIC HANDLERS ---

async function handleSaleFormSubmit(e) {
  e.preventDefault();
  const saveButton = document.getElementById("confirm-sale-btn");
  saveButton.disabled = true;
  ui.showStatus("التحقق من البيانات...", "syncing");
  try {
    const { sha: latestSha } = await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      ui.showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      saveButton.disabled = false;
      return;
    }

    const itemId = document.getElementById("sale-item-id").value;
    const item = appState.inventory.items.find(i => i.id === itemId);
    const quantityToSell = parseInt(
      document.getElementById("sale-quantity").value,
      10
    );
    const salePrice = parseFloat(document.getElementById("sale-price").value);
    if (!item || item.quantity < quantityToSell || quantityToSell <= 0) {
      ui.showStatus("خطأ في البيانات أو الكمية غير متوفرة.", "error");
      saveButton.disabled = false;
      return;
    }

    ui.showStatus("جاري تسجيل البيع...", "syncing");
    const originalQuantity = item.quantity;
    item.quantity -= quantityToSell;
    const saleRecord = {
      saleId: `sale_${Date.now()}`,
      itemId: item.id,
      itemName: item.name,
      quantitySold: quantityToSell,
      sellPriceIqd:
        appState.activeCurrency === "IQD" ? salePrice : item.sellPriceIqd,
      costPriceIqd: item.costPriceIqd || 0,
      sellPriceUsd:
        appState.activeCurrency !== "IQD" ? salePrice : item.sellPriceUsd,
      costPriceUsd: item.costPriceUsd || 0,
      saleDate: document.getElementById("sale-date").value,
      notes: document.getElementById("sale-notes").value,
      timestamp: new Date().toISOString(),
    };
    appState.sales.push(saleRecord);
    ui.filterAndRenderItems();

    try {
      await api.saveToGitHub();
      await api.saveSales();
      saveLocalData();
      ui.getDOMElements().saleModal.close();
      ui.hideSyncStatus();
      ui.showStatus("تم تسجيل البيع بنجاح!", "success");
    } catch (saveError) {
      item.quantity = originalQuantity;
      appState.sales.pop();
      ui.filterAndRenderItems();
      throw saveError;
    }
  } catch (error) {
    ui.hideSyncStatus();
    if (!(error instanceof ConflictError)) {
      ui.showStatus(`فشل تسجيل البيع: ${error.message}`, "error");
    }
  } finally {
    if (appState.currentView === "dashboard") {
      ui.renderDashboard();
    }
    saveButton.disabled = false;
  }
}

async function handleItemFormSubmit(e) {
  e.preventDefault();
  const saveButton = document.getElementById("save-item-btn");
  saveButton.disabled = true;
  ui.showStatus("التحقق من البيانات...", "syncing");
  try {
    const { data: latestInventory, sha: latestSha } =
      await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      ui.showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      saveButton.disabled = false;
      return;
    }

    ui.hideSyncStatus();
    ui.showStatus("جاري الحفظ...", "syncing");
    appState.inventory = latestInventory;
    appState.fileSha = latestSha;
    const itemId = document.getElementById("item-id").value;
    let imagePath = null;
    const existingItem = appState.inventory.items.find(i => i.id === itemId);
    if (existingItem) {
      imagePath = existingItem.imagePath;
    }

    if (appState.selectedImageFile) {
      ui.hideSyncStatus();
      ui.showStatus("جاري ضغط الصورة...", "syncing");
      const compressedImageBlob = await compressImage(
        appState.selectedImageFile,
        { quality: 0.7, maxWidth: 1024, maxHeight: 1024 }
      );
      imagePath = await api.uploadImageToGitHub(
        compressedImageBlob,
        appState.selectedImageFile.name
      );
    }

    const itemData = {
      id: itemId || `item_${Date.now()}`,
      sku: document.getElementById("item-sku").value,
      name: document.getElementById("item-name").value,
      category: document.getElementById("item-category").value,
      oemPartNumber: document.getElementById("item-oem-pn").value.trim(),
      compatiblePartNumber: document
        .getElementById("item-compatible-pn")
        .value.trim(),
      quantity:
        parseInt(document.getElementById("item-quantity").value, 10) || 0,
      alertLevel:
        parseInt(document.getElementById("item-alert-level").value, 10) || 5,
      costPriceIqd:
        parseFloat(document.getElementById("item-cost-price-iqd").value) || 0,
      sellPriceIqd:
        parseFloat(document.getElementById("item-sell-price-iqd").value) || 0,
      costPriceUsd:
        parseFloat(document.getElementById("item-cost-price-usd").value) || 0,
      sellPriceUsd:
        parseFloat(document.getElementById("item-sell-price-usd").value) || 0,
      notes: document.getElementById("item-notes").value,
      imagePath: imagePath,
      supplierId: document.getElementById("item-supplier").value || null,
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
    ui.hideSyncStatus();
    ui.showStatus("تم حفظ التغييرات بنجاح!", "success");

    if (appState.currentItemId === itemData.id) {
      ui.openDetailsModal(itemData.id);
    }
  } catch (error) {
    ui.hideSyncStatus();
    ui.showStatus(`فشل الحفظ: ${error.message}`, "error");
  } finally {
    saveButton.disabled = false;
    appState.selectedImageFile = null;
  }
}

async function handleImageCleanup() {
  if (!appState.syncConfig) {
    ui.showStatus("يرجى إعداد المزامنة أولاً.", "error", { duration: 5000 });
    return;
  }
  if (
    !confirm(
      "هل أنت متأكد من رغبتك في حذف جميع الصور غير المستخدمة نهائياً من المستودع؟ لا يمكن التراجع عن هذا الإجراء."
    )
  ) {
    return;
  }
  ui.showStatus("جاري البحث عن الصور غير المستخدمة...", "syncing");
  try {
    const allRepoImages = await api.getGitHubDirectoryListing("images");
    const usedImages = new Set(
      appState.inventory.items.map(item => item.imagePath).filter(Boolean)
    );
    const orphanedImages = allRepoImages.filter(
      repoImage => !usedImages.has(repoImage.path)
    );
    if (orphanedImages.length === 0) {
      ui.hideSyncStatus();
      ui.showStatus("لا توجد صور غير مستخدمة ليتم حذفها.", "success");
      return;
    }

    ui.showStatus(
      `تم العثور على ${orphanedImages.length} صورة... جاري الحذف.`,
      "syncing"
    );
    let deletedCount = 0;
    for (const image of orphanedImages) {
      await api.deleteFileFromGitHub(
        image.path,
        image.sha,
        `Cleanup: delete unused image ${image.name}`
      );
      deletedCount++;
    }
    ui.hideSyncStatus();
    ui.showStatus(`تم حذف ${deletedCount} صورة غير مستخدمة بنجاح.`, "success", {
      duration: 5000,
    });
  } catch (error) {
    ui.hideSyncStatus();
    ui.showStatus(`حدث خطأ: ${error.message}`, "error", { duration: 5000 });
  }
}

async function handleSupplierFormSubmit(e) {
  e.preventDefault();
  const elements = ui.getDOMElements();
  const id = elements.supplierIdInput.value;
  const name = document.getElementById("supplier-name").value.trim();
  const phone = document.getElementById("supplier-phone").value.trim();
  if (!name) {
    ui.showStatus("يرجى إدخال اسم المورّد.", "error");
    return;
  }

  if (id) {
    const supplier = appState.suppliers.find(s => s.id === id);
    if (supplier) {
      supplier.name = name;
      supplier.phone = phone;
    }
  } else {
    if (
      appState.suppliers.some(s => s.name.toLowerCase() === name.toLowerCase())
    ) {
      ui.showStatus("هذا المورّد موجود بالفعل.", "error");
      return;
    }
    const newSupplier = { id: `sup_${Date.now()}`, name, phone };
    appState.suppliers.push(newSupplier);
  }

  const actionText = id ? "تعديل" : "إضافة";
  ui.showStatus(`جاري ${actionText} المورّد...`, "syncing");
  try {
    await api.saveSuppliers();
    ui.renderSupplierList();
    ui.populateSupplierDropdown(elements.itemSupplierSelect.value);
    ui.hideSyncStatus();
    ui.showStatus(`تم ${actionText} المورّد بنجاح!`, "success");
    elements.supplierForm.reset();
    elements.supplierIdInput.value = "";
    elements.supplierFormTitle.textContent = "إضافة مورّد جديد";
    elements.cancelEditSupplierBtn.classList.add("view-hidden");
  } catch (error) {
    ui.hideSyncStatus();
    ui.showStatus(`فشل حفظ المورّد: ${error.message}`, "error");
  }
}

async function handleDeleteSupplier(supplierId) {
  const linkedProductsCount = appState.inventory.items.filter(
    item => item.supplierId === supplierId
  ).length;
  let confirmMessage = "هل أنت متأكد من رغبتك في حذف هذا المورّد نهائياً؟";
  if (linkedProductsCount > 0) {
    confirmMessage = `هذا المورّد مرتبط بـ ${linkedProductsCount} منتجات.
هل أنت متأكد من حذفه؟ سيتم فك ارتباطه من هذه المنتجات.`;
  }

  if (confirm(confirmMessage)) {
    ui.showStatus("جاري حذف المورّد...", "syncing");
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
      ui.hideSyncStatus();
      ui.showStatus("تم حذف المورّد بنجاح!", "success");
    } catch (error) {
      ui.hideSyncStatus();
      ui.showStatus(`فشل حذف المورّد: ${error.message}`, "error");
    }
  }
}

async function handleManualArchive() {
  if (!appState.syncConfig || !appState.sales || appState.sales.length === 0) {
    ui.showStatus("لا توجد بيانات للمزامنة أو الأرشفة.", "error", {
      duration: 4000,
    });
    return;
  }
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}_${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
  const salesByMonth = appState.sales.reduce((acc, sale) => {
    const saleDate = new Date(sale.saleDate);
    const monthKey = `${saleDate.getFullYear()}_${String(
      saleDate.getMonth() + 1
    ).padStart(2, "0")}`;
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(sale);
    return acc;
  }, {});
  const archivesToCreate = Object.entries(salesByMonth).filter(
    ([key]) => key !== currentMonthKey
  );
  if (archivesToCreate.length === 0) {
    ui.showStatus("لا توجد مبيعات من الشهور السابقة لأرشفتها.", "success");
    return;
  }
  if (
    !confirm(
      `سيتم أرشفة المبيعات لـ ${archivesToCreate.length} شهر. هل أنت متأكد؟`
    )
  ) {
    return;
  }
  ui.showStatus("جاري أرشفة البيانات...", "syncing");
  try {
    for (const [monthKey, salesData] of archivesToCreate) {
      const path = `archives/sales_${monthKey}.json`;
      const content = JSON.stringify(salesData, null, 2);
      await api.createGitHubFile(
        path,
        content,
        `Manual archive for ${monthKey}`
      );
    }
    appState.sales = salesByMonth[currentMonthKey] || [];
    appState.inventory.lastArchiveTimestamp = new Date().toLocaleString(
      "ar-EG"
    );
    await api.saveSales();
    await api.saveToGitHub();
    saveLocalData();
    updateLastArchiveDateDisplay();
    ui.hideSyncStatus();
    ui.showStatus(
      `تمت أرشفة ${archivesToCreate.length} شهر من السجلات بنجاح.`,
      "success",
      { duration: 5000 }
    );
  } catch (error) {
    console.error("Manual archive failed:", error);
    ui.hideSyncStatus();
    ui.showStatus(`فشلت عملية الأرشفة: ${error.message}`, "error", {
      duration: 5000,
    });
  }
}

function updateLastArchiveDateDisplay() {
  const lastArchiveDate = appState.inventory.lastArchiveTimestamp;
  const displayElement = document.getElementById("last-archive-date-display");
  if (lastArchiveDate) {
    displayElement.textContent = `آخر أرشفة: ${lastArchiveDate}`;
  } else {
    displayElement.textContent = "آخر أرشفة: لم تتم بعد";
  }
}

async function openArchiveBrowser() {
  const modal = document.getElementById("archive-browser-modal");
  const listContainer = document.getElementById("archive-list-container");
  const detailsContainer = document.getElementById("archive-details-container");
  listContainer.innerHTML = "<p>جاري تحميل قائمة الأرشيف...</p>";
  detailsContainer.innerHTML =
    "<p>اختر شهراً من القائمة أعلاه لعرض تفاصيله.</p>";

  appState.modalStack.push(modal);
  modal.appendChild(ui.getDOMElements().toastContainer);
  modal.showModal();
  try {
    const files = await api.getGitHubDirectoryListing("archives");
    if (files.length === 0) {
      listContainer.innerHTML = "<p>لا يوجد أرشيف لعرضه.</p>";
      return;
    }
    listContainer.innerHTML = "";
    files
      .sort((a, b) => b.name.localeCompare(a.name))
      .forEach(file => {
        const item = document.createElement("div");
        item.className = "archive-item";
        const itemText = document.createElement("span");

        itemText.className = "archive-item-text";
        itemText.textContent = file.name
          .replace("sales_", "")
          .replace(".json", "")
          .replace("_", "-");
        item.dataset.path = file.path;
        const deleteButton = document.createElement("button");
        deleteButton.className = "archive-delete-btn";

        deleteButton.innerHTML = `<iconify-icon icon="material-symbols:delete-outline-rounded"></iconify-icon>`;
        deleteButton.title = "حذف الأرشيف";
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
  ui.showStatus("جاري تجهيز النسخة الاحتياطية...", "syncing");
  try {
    const zip = new JSZip();
    zip.file("inventory.json", JSON.stringify(appState.inventory, null, 2));
    zip.file("sales.json", JSON.stringify(appState.sales, null, 2));
    zip.file("suppliers.json", JSON.stringify(appState.suppliers, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");
    link.download = `rhineix-workshop-backup-${timestamp}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    ui.hideSyncStatus();
    ui.showStatus("تم تنزيل النسخة الاحتياطية بنجاح!", "success");
  } catch (error) {
    console.error("Backup failed:", error);
    ui.hideSyncStatus();
    ui.showStatus(`فشل إنشاء النسخة الاحتياطية: ${error.message}`, "error", {
      duration: 5000,
    });
  }
}

async function handleBackupToTelegram() {
  if (!appState.syncConfig) {
    ui.showStatus("يرجى إعداد المزامنة أولاً.", "error");
    return;
  }
  if (
    !confirm("هل أنت متأكد من رغبتك في إنشاء وإرسال نسخة احتياطية إلى تليجرام؟")
  ) {
    return;
  }
  ui.showStatus("جاري طلب النسخة الاحتياطية...", "syncing");
  try {
    const success = await api.triggerBackupWorkflow();
    if (success) {
      ui.hideSyncStatus();
      ui.showStatus(
        "تم إرسال الطلب بنجاح! ستصلك النسخة الاحتياطية على تليجرام قريبًا.",
        "success",
        { duration: 6000 }
      );
    }
  } catch (error) {
    ui.hideSyncStatus();
    ui.showStatus(`فشل إرسال الطلب: ${error.message}`, "error", {
      duration: 6000,
    });
  }
}

async function handleRestoreBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (
    !confirm(
      "هل أنت متأكد من رغبتك في استعادة البيانات من هذا الملف؟ سيتم الكتابة فوق جميع بياناتك الحالية."
    )
  ) {
    event.target.value = "";
    return;
  }
  ui.showStatus("جاري استعادة النسخة الاحتياطية...", "syncing");
  try {
    const zip = await JSZip.loadAsync(file);
    const inventoryFile = zip.file("inventory.json");
    const salesFile = zip.file("sales.json");
    const suppliersFile = zip.file("suppliers.json");
    if (!inventoryFile || !salesFile || !suppliersFile) {
      throw new Error(
        "ملف النسخة الاحتياطية غير صالح أو لا يحتوي على الملفات المطلوبة."
      );
    }

    const inventoryData = JSON.parse(await inventoryFile.async("string"));
    const salesData = JSON.parse(await salesFile.async("string"));
    const suppliersData = JSON.parse(await suppliersFile.async("string"));
    if (
      !inventoryData.items ||
      !Array.isArray(salesData) ||
      !Array.isArray(suppliersData)
    ) {
      throw new Error("محتوى ملف النسخة الاحتياطية غير صالح.");
    }

    appState.inventory = inventoryData;
    appState.sales = salesData;
    appState.suppliers = suppliersData;

    saveLocalData();
    ui.hideSyncStatus();
    ui.showStatus(
      "تمت استعادة البيانات بنجاح! سيتم إعادة تحميل التطبيق.",
      "success",
      { duration: 4000 }
    );
    setTimeout(() => {
      location.reload();
    }, 4000);
  } catch (error) {
    console.error("Restore failed:", error);
    ui.hideSyncStatus();
    ui.showStatus(`فشلت عملية الاستعادة: ${error.message}`, "error", {
      duration: 5000,
    });
  } finally {
    event.target.value = "";
  }
}

async function saveQuantityChanges(currentItem) {
  ui.showStatus("التحقق من البيانات...", "syncing");
  const itemBeforeEdit = appState.itemStateBeforeEdit;
  try {
    const { data: latestInventory, sha: latestSha } =
      await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      ui.showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      const originalItemIndex = appState.inventory.items.findIndex(
        i => i.id === itemBeforeEdit.id
      );
      if (originalItemIndex !== -1) {
        appState.inventory.items[originalItemIndex] = itemBeforeEdit;
      }
      ui.filterAndRenderItems();
      return;
    }

    ui.showStatus("جاري حفظ تغيير الكمية...", "syncing");
    appState.inventory = latestInventory;
    appState.fileSha = latestSha;

    const itemToUpdate = appState.inventory.items.find(
      i => i.id === currentItem.id
    );
    if (itemToUpdate) {
      itemToUpdate.quantity = currentItem.quantity;
    }
    await api.saveToGitHub();
    saveLocalData();
    ui.showStatus("تم حفظ التغييرات بنجاح!", "success");
  } catch (error) {
    const originalItemIndex = appState.inventory.items.findIndex(
      i => i.id === itemBeforeEdit.id
    );
    if (originalItemIndex !== -1) {
      appState.inventory.items[originalItemIndex] = itemBeforeEdit;
    }
    ui.filterAndRenderItems();
    ui.showStatus("فشل حفظ التغييرات.", "error", { duration: 4000 });
  }
}

// --- MULTI-SELECT FEATURE LOGIC ---
function handlePointerDown(e) {
  const card = e.target.closest(".product-card");
  if (!card || e.target.closest(".icon-btn")) return;

  startX = e.clientX;
  startY = e.clientY;
  longPressTriggered = false;

  pressTimer = setTimeout(() => {
    longPressTriggered = true;
    if (!appState.isSelectionModeActive) {
      enterSelectionMode(card);
    }
  }, 500);
}

function handlePointerMove(e) {
  if (!pressTimer) return;

  const deltaX = Math.abs(e.clientX - startX);
  const deltaY = Math.abs(e.clientY - startY);

  if (deltaX > moveThreshold || deltaY > moveThreshold) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function handlePointerUp() {
  clearTimeout(pressTimer);
}

function handleGridClick(e) {
  const card = e.target.closest(".product-card");
  if (!card) return;

  if (longPressTriggered) {
    longPressTriggered = false;
    return;
  }

  clearTimeout(pressTimer);

  if (appState.isSelectionModeActive) {
    toggleSelection(card);
    return;
  }

  const itemId = card.dataset.id;
  if (e.target.closest(".sell-btn")) {
    const item = appState.inventory.items.find(i => i.id === itemId);
    if (item && item.quantity > 0) {
      ui.openSaleModal(itemId);
    } else {
      ui.showStatus("هذا المنتج نافد من المخزون.", "error");
    }
  } else if (e.target.closest(".details-btn")) {
    ui.openDetailsModal(itemId);
  }
}

function enterSelectionMode(card) {
  appState.isSelectionModeActive = true;
  ui.getDOMElements().inventoryGrid.classList.add("selection-mode");
  if (card) {
    toggleSelection(card);
  }
}

function exitSelectionMode() {
  appState.isSelectionModeActive = false;
  appState.selectedItemIds.clear();

  const elements = ui.getDOMElements();
  elements.inventoryGrid.classList.remove("selection-mode");

  const selectedCards = elements.inventoryGrid.querySelectorAll(
    ".product-card.selected"
  );
  selectedCards.forEach(card => card.classList.remove("selected"));

  ui.updateBulkActionsBar();
}

function toggleSelection(card) {
  const id = card.dataset.id;
  if (!id) return;

  if (appState.selectedItemIds.has(id)) {
    appState.selectedItemIds.delete(id);
    card.classList.remove("selected");
  } else {
    appState.selectedItemIds.add(id);
    card.classList.add("selected");
  }

  if (appState.selectedItemIds.size === 0) {
    exitSelectionMode();
  } else {
    ui.updateBulkActionsBar();
  }
}

async function handleBulkCategoryChange(e) {
  e.preventDefault();
  const newCategory = e.target.elements["bulk-item-category"].value.trim();
  if (!newCategory) return;

  ui.showStatus("التحقق من البيانات...", "syncing");
  try {
    const { sha: latestSha } = await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      ui.showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      return;
    }

    appState.selectedItemIds.forEach(id => {
      const item = appState.inventory.items.find(i => i.id === id);
      if (item) item.category = newCategory;
    });

    await api.saveToGitHub();
    saveLocalData();
    ui.showStatus(
      `تم تحديث فئة ${appState.selectedItemIds.size} عناصر بنجاح.`,
      "success"
    );
  } catch (error) {
    ui.showStatus(`فشل تحديث الفئة: ${error.message}`, "error");
  } finally {
    ui.getDOMElements().bulkCategoryModal.close();
    exitSelectionMode();
    ui.populateCategoryDatalist();
    ui.renderCategoryFilter();
  }
}

async function handleBulkSupplierChange(e) {
  e.preventDefault();
  const newSupplierId = e.target.elements["bulk-item-supplier"].value;
  if (!newSupplierId) return;

  ui.showStatus("التحقق من البيانات...", "syncing");
  try {
    const { sha: latestSha } = await api.fetchFromGitHub();
    if (latestSha !== appState.fileSha) {
      ui.showStatus("البيانات غير محدّثة. تم تحديثها من جهاز آخر.", "error", {
        showRefreshButton: true,
      });
      return;
    }

    appState.selectedItemIds.forEach(id => {
      const item = appState.inventory.items.find(i => i.id === id);
      if (item) item.supplierId = newSupplierId;
    });

    await api.saveToGitHub();
    saveLocalData();
    ui.showStatus(
      `تم تحديث مورّد ${appState.selectedItemIds.size} عناصر بنجاح.`,
      "success"
    );
  } catch (error) {
    ui.showStatus(`فشل تحديث المورّد: ${error.message}`, "error");
  } finally {
    ui.getDOMElements().bulkSupplierModal.close();
    exitSelectionMode();
  }
}

// --- EVENT LISTENER SETUP ---

function setupGeneralListeners(elements) {
  elements.themeToggleBtn.addEventListener("click", () => {
    const isLight = document.body.classList.contains("theme-light");
    ui.setTheme(isLight ? "dark" : "light");
  });
  elements.currencyToggleBtn.addEventListener("click", () => {
    appState.activeCurrency = appState.activeCurrency === "IQD" ? "USD" : "IQD";
    localStorage.setItem("inventoryAppCurrency", appState.activeCurrency);
    ui.updateCurrencyDisplay();
  });
}

function setupViewToggleListeners(elements) {
  elements.inventoryToggleBtn.addEventListener("click", () => {
    if (appState.isSelectionModeActive) exitSelectionMode();
    ui.toggleView("inventory");
  });
  elements.dashboardToggleBtn.addEventListener("click", () => {
    if (appState.isSelectionModeActive) exitSelectionMode();
    ui.toggleView("dashboard");
  });
}

function setupInventoryListeners(elements) {
  // Add all pointer/touch/click listeners for the grid
  elements.inventoryGrid.addEventListener("pointerdown", handlePointerDown);
  elements.inventoryGrid.addEventListener("pointermove", handlePointerMove);
  elements.inventoryGrid.addEventListener("pointerup", handlePointerUp);
  elements.inventoryGrid.addEventListener("click", handleGridClick);
  elements.inventoryGrid.addEventListener("contextmenu", e =>
    e.preventDefault()
  );

  elements.searchBar.addEventListener(
    "input",
    debounce(e => {
      appState.searchTerm = e.target.value;
      ui.filterAndRenderItems();
    }, 500)
  );

  elements.sortOptions.addEventListener("change", e => {
    appState.currentSortOption = e.target.value;
    ui.filterAndRenderItems();
  });

  elements.statsContainer.addEventListener("click", e => {
    const card = e.target.closest(".stat-card");
    if (!card) return;
    if (appState.isSelectionModeActive) exitSelectionMode();
    appState.searchTerm = "";
    elements.searchBar.value = "";
    if (card.classList.contains("low-stock-alert")) {
      appState.activeFilter =
        appState.activeFilter === "low_stock" ? "all" : "low_stock";
    } else {
      appState.activeFilter = "all";
      appState.selectedCategory = "all";
      ui.renderCategoryFilter();
    }
    ui.filterAndRenderItems();
  });

  elements.categoryFilterBtn.addEventListener("click", e => {
    e.stopPropagation();
    elements.categoryFilterDropdown.classList.toggle("show");
  });
  elements.categoryFilterDropdown.addEventListener("click", e => {
    const categoryItem = e.target.closest(".category-item");
    if (categoryItem) {
      appState.selectedCategory = categoryItem.dataset.category;
      ui.filterAndRenderItems();
      ui.renderCategoryFilter();
      elements.categoryFilterDropdown.classList.remove("show");
    }
  });
  document.addEventListener("click", e => {
    if (!elements.searchContainer.contains(e.target)) {
      elements.categoryFilterDropdown.classList.remove("show");
    }
  });
}

function setupModalListeners(elements) {
  // Item Modal
  elements.addItemBtn.addEventListener("click", () => {
    if (appState.isSelectionModeActive) exitSelectionMode();
    ui.openItemModal();
    const existingSkus = new Set(
      appState.inventory.items.map(item => item.sku)
    );
    document.getElementById("item-sku").value = generateUniqueSKU(existingSkus);
  });
  elements.itemForm.addEventListener("submit", handleItemFormSubmit);
  elements.cancelItemBtn.addEventListener("click", () =>
    elements.itemModal.close()
  );

  function handleImageSelection(file) {
    if (!file || !file.type.startsWith("image/")) {
      ui.showStatus("الملف المحدد ليس صورة.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      const { cropperModal, cropperImage, paddingDisplay, bgColorInput } =
        ui.getDOMElements();
      cropperPadding = 0.1;
      cropperBgColor = "#FFFFFF";
      paddingDisplay.textContent = `${Math.round(cropperPadding * 100)}%`;
      bgColorInput.value = cropperBgColor;

      cropperImage.src = event.target.result;
      cropperModal.showModal();
      if (cropper) {
        cropper.destroy();
      }

      cropper = new Cropper(cropperImage, {
        aspectRatio: 1,
        viewMode: 1,
        background: false,
        autoCropArea: 0.8,
      });
    };
    reader.readAsDataURL(file);
  }

  elements.imageUploadInput.addEventListener("change", e => {
    handleImageSelection(e.target.files[0]);
    e.target.value = "";
  });
  elements.pasteImageBtn.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        ui.showStatus("متصفحك لا يدعم لصق الصور.", "error");
        return;
      }
      const permission = await navigator.permissions.query({
        name: "clipboard-read",
      });
      if (permission.state === "denied") {
        throw new Error("تم رفض إذن الوصول إلى الحافظة.");
      }

      const clipboardItems = await navigator.clipboard.read();
      if (clipboardItems.length === 0) {
        ui.showStatus("لا توجد بيانات في الحافظة.", "warning");
        return;
      }

      const clipboardItem = clipboardItems[0];
      const imageType = clipboardItem.types.find(type =>
        type.startsWith("image/")
      );

      if (imageType) {
        const imageBlob = await clipboardItem.getType(imageType);
        const file = new File(
          [imageBlob],
          `pasted_image.${imageType.split("/")[1]}`,
          {
            type: imageBlob.type,
          }
        );
        handleImageSelection(file);
      } else {
        ui.showStatus("لا توجد صورة في الحافظة.", "warning");
      }
    } catch (error) {
      console.error("Failed to paste image:", error);
      ui.showStatus(`فشل لصق الصورة: ${error.message}`, "error");
    }
  });

  document.getElementById("cancel-crop-btn").addEventListener("click", () => {
    ui.getDOMElements().cropperModal.close();
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
  });
  document.getElementById("crop-image-btn").addEventListener("click", () => {
    if (!cropper) return;

    const croppedCanvas = cropper.getCroppedCanvas();
    if (!croppedCanvas) return;

    const cropWidth = croppedCanvas.width;
    const cropHeight = croppedCanvas.height;

    const finalSize =
      Math.max(cropWidth, cropHeight) / (1 - cropperPadding * 2);
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = finalSize;
    finalCanvas.height = finalSize;
    const ctx = finalCanvas.getContext("2d");

    ctx.fillStyle = cropperBgColor;
    ctx.fillRect(0, 0, finalSize, finalSize);

    const x = (finalSize - cropWidth) / 2;
    const y = (finalSize - cropHeight) / 2;
    ctx.drawImage(croppedCanvas, x, y);

    finalCanvas.toBlob(
      blob => {
        const { imagePreview, imagePlaceholder } = ui.getDOMElements();
        const file = new File([blob], "cropped_image.webp", {
          type: "image/webp",
        });
        appState.selectedImageFile = file;
        const reader = new FileReader();
        reader.onload = event => {
          imagePreview.src = event.target.result;
          imagePreview.classList.remove("image-preview-hidden");
          imagePlaceholder.style.display = "none";
        };
        reader.readAsDataURL(file);

        ui.getDOMElements().cropperModal.close();
        cropper.destroy();
        cropper = null;
      },
      "image/webp",
      0.8
    );
  });
  elements.decreasePaddingBtn.addEventListener("click", () => {
    if (cropperPadding > 0) {
      cropperPadding = Math.max(0, cropperPadding - 0.05);
      elements.paddingDisplay.textContent = `${Math.round(
        cropperPadding * 100
      )}%`;
    }
  });
  elements.increasePaddingBtn.addEventListener("click", () => {
    if (cropperPadding < 0.4) {
      cropperPadding = Math.min(0.4, cropperPadding + 0.05);
      elements.paddingDisplay.textContent = `${Math.round(
        cropperPadding * 100
      )}%`;
    }
  });
  elements.bgColorInput.addEventListener("input", e => {
    cropperBgColor = e.target.value;
  });
  elements.regenerateSkuBtn.addEventListener("click", () => {
    const existingSkus = new Set(
      appState.inventory.items.map(item => item.sku)
    );
    document.getElementById("item-sku").value = generateUniqueSKU(existingSkus);
  });
  const costIqdInput = document.getElementById("item-cost-price-iqd");
  const costUsdInput = document.getElementById("item-cost-price-usd");
  const sellIqdInput = document.getElementById("item-sell-price-iqd");
  const sellUsdInput = document.getElementById("item-sell-price-usd");
  costIqdInput.addEventListener("input", () =>
    handlePriceConversion(costIqdInput, costUsdInput)
  );
  sellIqdInput.addEventListener("input", () =>
    handlePriceConversion(sellIqdInput, sellUsdInput)
  );
  elements.detailsIncreaseBtn.addEventListener("click", () => {
    const item = appState.inventory.items.find(
      i => i.id === appState.currentItemId
    );
    if (item) {
      item.quantity++;
      elements.detailsQuantityValue.textContent = item.quantity;
      ui.filterAndRenderItems();
    }
  });
  elements.detailsDecreaseBtn.addEventListener("click", () => {
    const item = appState.inventory.items.find(
      i => i.id === appState.currentItemId
    );
    if (item && item.quantity > 0) {
      item.quantity--;
      elements.detailsQuantityValue.textContent = item.quantity;
      ui.filterAndRenderItems();
    }
  });
  elements.closeDetailsModalBtn.addEventListener("click", async () => {
    const itemBeforeEdit = appState.itemStateBeforeEdit;
    const currentItem = appState.inventory.items.find(
      i => i.id === appState.currentItemId
    );

    if (
      itemBeforeEdit &&
      currentItem &&
      itemBeforeEdit.quantity !== currentItem.quantity
    ) {
      if (confirm("هناك تغييرات غير محفوظة في الكمية. هل تريد حفظها؟")) {
        await saveQuantityChanges(currentItem);
      } else {
        const originalItemIndex = appState.inventory.items.findIndex(
          i => i.id === itemBeforeEdit.id
        );
        if (originalItemIndex !== -1) {
          appState.inventory.items[originalItemIndex] = itemBeforeEdit;
        }
        ui.filterAndRenderItems();
      }
    }

    appState.itemStateBeforeEdit = null;
    appState.currentItemId = null;
    elements.detailsModal.close();
  });
  elements.detailsEditBtn.addEventListener("click", () => {
    elements.detailsModal.close();
    ui.openItemModal(appState.currentItemId);
  });
  elements.detailsDeleteBtn.addEventListener("click", async () => {
    if (
      confirm(
        "هل أنت متأكد من رغبتك في حذف هذا المنتج؟ سيتم حذف صورته بشكل دائم أيضًا."
      )
    ) {
      const itemToDelete = appState.inventory.items.find(
        item => item.id === appState.currentItemId
      );
      const imagePathToDelete = itemToDelete?.imagePath;
      const originalInventory = JSON.parse(JSON.stringify(appState.inventory));
      appState.inventory.items = appState.inventory.items.filter(
        item => item.id !== appState.currentItemId
      );

      elements.detailsModal.close();
      ui.filterAndRenderItems();
      ui.updateStats();
      try {
        await api.saveToGitHub();
        if (imagePathToDelete) {
          try {
            const repoImages = await api.getGitHubDirectoryListing("images");
            const imageFile = repoImages.find(
              file => file.path === imagePathToDelete
            );
            if (imageFile)
              await api.deleteFileFromGitHub(
                imageFile.path,
                imageFile.sha,
                `Cleanup: Delete image for item ${itemToDelete.name}`
              );
          } catch (imageError) {
            console.error("Failed to delete associated image:", imageError);
          }
        }
        saveLocalData();
        ui.showStatus("تم حذف المنتج بنجاح!", "success");
      } catch (error) {
        appState.inventory = originalInventory;
        ui.filterAndRenderItems();
        ui.updateStats();
        if (error instanceof ConflictError) {
          ui.showStatus("فشل الحذف بسبب تعارض في البيانات.", "error", {
            showRefreshButton: true,
          });
        } else {
          ui.showStatus(`فشل الحذف: ${error.message}`, "error", {
            duration: 5000,
          });
        }
      }
    }
  });

  elements.saleForm.addEventListener("submit", handleSaleFormSubmit);
  elements.cancelSaleBtn.addEventListener("click", () =>
    elements.saleModal.close()
  );
  elements.saleIncreaseBtn.addEventListener("click", () => {
    const quantityInput = elements.saleQuantityInput;
    const max = parseInt(quantityInput.max, 10);
    let currentValue = parseInt(quantityInput.value, 10);
    if (currentValue < max) {
      quantityInput.value = currentValue + 1;
      ui.updateSaleTotal();
    }
  });
  elements.saleDecreaseBtn.addEventListener("click", () => {
    const quantityInput = elements.saleQuantityInput;
    let currentValue = parseInt(quantityInput.value, 10);
    if (currentValue > 1) {
      quantityInput.value = currentValue - 1;
      ui.updateSaleTotal();
    }
  });
  elements.saleQuantityInput.addEventListener("input", ui.updateSaleTotal);
  document
    .getElementById("sale-price")
    .addEventListener("input", ui.updateSaleTotal);
  elements.syncSettingsBtn.addEventListener("click", () => {
    if (appState.isSelectionModeActive) exitSelectionMode();
    ui.populateSyncModal();
    const { magicLinkContainer } = ui.getDOMElements();
    magicLinkContainer.classList.add("view-hidden");
    const display = document.getElementById("live-exchange-rate-display");
    const input = document.getElementById("exchange-rate");
    display.textContent = "جاري تحميل السعر...";
    display.classList.remove("error");

    api.fetchLiveExchangeRate().then(rate => {
      if (rate) {
        const roundedRate = Math.round(rate);
        display.innerHTML = `السعر الحالي: <span class="value">${roundedRate}</span>`;
        display.onclick = () => {
          input.value = roundedRate;
          input.focus();
        };
      } else {
        display.textContent = "فشل تحديث السعر";
        display.classList.add("error");
        display.onclick = null;
      }
    });
  });
  elements.cancelSyncBtn.addEventListener("click", () =>
    elements.syncModal.close()
  );
  elements.syncForm.addEventListener("submit", async e => {
    e.preventDefault();
    appState.syncConfig = {
      username: elements.githubUsernameInput.value.trim(),
      repo: elements.githubRepoInput.value.trim(),
      pat: elements.githubPatInput.value.trim(),
    };
    appState.exchangeRate =
      parseFloat(document.getElementById("exchange-rate").value) || 0;
    saveConfig();

    elements.syncModal.close();
    await initializeApp();
  });
  const advancedSettingsToggle = document.getElementById(
    "advanced-settings-toggle"
  );
  const advancedSettingsContainer = document.getElementById(
    "advanced-settings-container"
  );
  advancedSettingsToggle.addEventListener("click", () => {
    advancedSettingsToggle.classList.toggle("open");
    advancedSettingsContainer.classList.toggle("open");
  });
  elements.cleanupImagesBtn.addEventListener("click", handleImageCleanup);
  elements.downloadBackupBtn.addEventListener("click", handleDownloadBackup);
  elements.restoreBackupInput.addEventListener("change", handleRestoreBackup);
  document
    .getElementById("backup-to-telegram-btn")
    .addEventListener("click", handleBackupToTelegram);
  document
    .getElementById("manual-archive-btn")
    .addEventListener("click", handleManualArchive);
  document
    .getElementById("view-archives-btn")
    .addEventListener("click", openArchiveBrowser);
  document
    .getElementById("archive-list-container")
    .addEventListener("click", async e => {
      const deleteButton = e.target.closest(".archive-delete-btn");
      if (deleteButton) {
        e.stopPropagation();
        const path = deleteButton.dataset.path;
        const sha = deleteButton.dataset.sha;
        if (confirm(`هل أنت متأكد من حذف هذا الأرشيف (${path}) نهائياً؟`)) {
          ui.showStatus("جاري حذف الأرشيف...", "syncing");

          try {
            await api.deleteFileFromGitHub(
              path,
              sha,
              `Delete archive file: ${path}`
            );
            ui.showStatus("تم حذف الأرشيف بنجاح!", "success");
            openArchiveBrowser();
          } catch (error) {
            ui.showStatus(`فشل حذف الأرشيف: ${error.message}`, "error", {
              duration: 5000,
            });
          }
        }
      } else {
        const item = e.target.closest(".archive-item");
        if (!item) return;

        const detailsContainer = document.getElementById(
          "archive-details-container"
        );
        if (item.classList.contains("active")) {
          item.classList.remove("active");
          detailsContainer.innerHTML =
            "<p>اختر شهراً من القائمة أعلاه لعرض تفاصيله.</p>";
          return;
        }

        const container = item.parentElement;
        if (container.querySelector(".active")) {
          container.querySelector(".active").classList.remove("active");
        }
        item.classList.add("active");

        detailsContainer.innerHTML = "<p>جاري تحميل البيانات...</p>";
        try {
          const data = await api.fetchGitHubFile(item.dataset.path);
          const symbol = appState.activeCurrency === "IQD" ? "د.ع" : "$";
          let tableHTML = `<table class="archive-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>التاريخ</th></tr></thead><tbody>`;
          data.forEach(sale => {
            const price =
              appState.activeCurrency === "IQD"
                ? sale.sellPriceIqd
                : sale.sellPriceUsd;
            tableHTML += `<tr><td>${sale.itemName}</td><td>${
              sale.quantitySold
            }</td><td>${price.toLocaleString()} ${symbol}</td><td>${
              sale.saleDate
            }</td></tr>`;
            if (sale.notes) {
              tableHTML += `<tr class="archive-notes-row"><td colspan="4"><iconify-icon icon="material-symbols:notes-outline-rounded"></iconify-icon> ${sanitizeHTML(
                sale.notes
              )}</td></tr>`;
            }
          });
          tableHTML += "</tbody></table>";
          detailsContainer.innerHTML = tableHTML;
        } catch (error) {
          detailsContainer.innerHTML = `<p style="color: var(--danger-color);">فشل تحميل الملف: ${error.message}</p>`;
        }
      }
    });
  document
    .getElementById("close-archive-browser-btn")
    .addEventListener("click", () =>
      document.getElementById("archive-browser-modal").close()
    );

  // Bulk Actions Modals
  const {
    bulkCategoryModal,
    bulkSupplierModal,
    bulkCategoryForm,
    bulkSupplierForm,
  } = elements;
  document
    .getElementById("bulk-change-category-btn")
    .addEventListener("click", () => {
      bulkCategoryForm.reset();
      bulkCategoryModal.showModal();
    });
  document
    .getElementById("bulk-change-supplier-btn")
    .addEventListener("click", () => {
      ui.populateBulkSupplierDropdown();
      bulkSupplierForm.reset();
      bulkSupplierModal.showModal();
    });
  document
    .getElementById("cancel-selection-btn")
    .addEventListener("click", exitSelectionMode);
  bulkCategoryForm.addEventListener("submit", handleBulkCategoryChange);
  bulkSupplierForm.addEventListener("submit", handleBulkSupplierChange);
  bulkCategoryModal
    .querySelector("[data-close]")
    .addEventListener("click", () => bulkCategoryModal.close());
  bulkSupplierModal
    .querySelector("[data-close]")
    .addEventListener("click", () => bulkSupplierModal.close());

  function setupModalCloseBehavior(modalElement) {
    if (!modalElement) return;
    modalElement.addEventListener("close", () => {
      appState.modalStack = appState.modalStack.filter(m => m !== modalElement);

      if (appState.modalStack.length > 0) {
        const topModal = appState.modalStack[appState.modalStack.length - 1];
        topModal.appendChild(elements.toastContainer);
      } else {
        document.body.appendChild(elements.toastContainer);
      }
    });
  }

  setupModalCloseBehavior(elements.detailsModal);
  setupModalCloseBehavior(elements.itemModal);
  setupModalCloseBehavior(elements.syncModal);
  setupModalCloseBehavior(elements.saleModal);
  setupModalCloseBehavior(elements.supplierManagerModal);
  setupModalCloseBehavior(elements.archiveBrowserModal);
  setupModalCloseBehavior(elements.bulkCategoryModal);
  setupModalCloseBehavior(elements.bulkSupplierModal);
}

function setupDashboardListeners(elements) {
  elements.timeFilterControls.addEventListener("click", e => {
    if (appState.isSelectionModeActive) exitSelectionMode();
    const button = e.target.closest(".time-filter-btn");
    if (button) {
      appState.dashboardPeriod = button.dataset.period;
      elements.timeFilterControls
        .querySelector(".active")
        .classList.remove("active");
      button.classList.add("active");
      ui.renderDashboard();
    }
  });
  elements.dashboardViewContainer.addEventListener("click", e => {
    // Handler for collapsible sections (Bestsellers, Sales Log)
    const collapsibleHeader = e.target.closest(".collapsible-header");
    if (collapsibleHeader) {
      const targetId = collapsibleHeader.dataset.target;
      const content = document.getElementById(targetId);
      if (content) {
        collapsibleHeader.classList.toggle("collapsed");
        content.classList.toggle("collapsed");
      }
    }

    // Handler for sales log item details
    const salesItemHeader = e.target.closest(".item-header");
    if (salesItemHeader) {
      const details = salesItemHeader.nextElementSibling;
      if (details && details.classList.contains("item-details")) {
        details.classList.toggle("visible");
      }
    }
  });
}

function setupSupplierListeners(elements) {
  elements.manageSuppliersBtn.addEventListener("click", () => {
    const modal = elements.supplierManagerModal;
    ui.renderSupplierList();
    appState.modalStack.push(modal);
    modal.appendChild(elements.toastContainer);
    modal.showModal();
  });
  elements.closeSupplierManagerBtn.addEventListener("click", () => {
    elements.supplierManagerModal.close();
  });
  elements.supplierForm.addEventListener("submit", handleSupplierFormSubmit);
  elements.supplierListContainer.addEventListener("click", e => {
    const deleteBtn = e.target.closest(".delete-supplier-btn");
    if (deleteBtn) {
      handleDeleteSupplier(deleteBtn.dataset.id);
    }
    const editBtn = e.target.closest(".edit-supplier-btn");
    if (editBtn) {
      const supplier = appState.suppliers.find(
        s => s.id === editBtn.dataset.id
      );
      if (supplier) {
        elements.supplierFormTitle.textContent = "تعديل مورّد";
        elements.supplierIdInput.value = supplier.id;
        document.getElementById("supplier-name").value = supplier.name;
        document.getElementById("supplier-phone").value = supplier.phone;
        elements.cancelEditSupplierBtn.classList.remove("view-hidden");
      }
    }
  });
  elements.cancelEditSupplierBtn.addEventListener("click", () => {
    elements.supplierForm.reset();
    elements.supplierIdInput.value = "";
    elements.supplierFormTitle.textContent = "إضافة مورّد جديد";
    elements.cancelEditSupplierBtn.classList.add("view-hidden");
  });
}

function setupEventListeners() {
  const elements = ui.getDOMElements();

  setupGeneralListeners(elements);
  setupViewToggleListeners(elements);
  setupInventoryListeners(elements);
  setupModalListeners(elements);
  setupDashboardListeners(elements);
  setupSupplierListeners(elements);

  if (elements.generateMagicLinkBtn) {
    elements.generateMagicLinkBtn.addEventListener("click", generateMagicLink);
  }

  const csvImportInput = document.getElementById("csv-import-input");
  if (csvImportInput) {
    csvImportInput.addEventListener("change", handleCsvImport);
  }
}

// --- INITIALIZATION ---

function handleUrlShortcuts() {
  const hash = window.location.hash;
  if (!hash) return;

  if (hash.startsWith("#setup=")) {
    return;
  }

  switch (hash) {
    case "#add-item":
      setTimeout(() => {
        ui.openItemModal();
        const existingSkus = new Set(
          appState.inventory.items.map(item => item.sku)
        );
        document.getElementById("item-sku").value =
          generateUniqueSKU(existingSkus);
      }, 100);
      break;
    case "#dashboard":
      setTimeout(() => {
        ui.toggleView("dashboard");
      }, 100);
      break;
  }
}

async function initializeApp() {
  console.log("Initializing Inventory Management App...");

  const magicLinkProcessed = handleMagicLink();

  setupEventListeners();
  loadConfig();
  const savedTheme = localStorage.getItem("inventoryAppTheme") || "light";
  const savedCurrency = localStorage.getItem("inventoryAppCurrency") || "IQD";
  appState.activeCurrency = savedCurrency;
  ui.setTheme(savedTheme);

  try {
    const response = await fetch("version.json?t=" + Date.now());
    if (response.ok) {
      const versionData = await response.json();
      ui.displayVersionInfo(versionData);
    }
  } catch (error) {
    console.error("Could not fetch version info:", error);
  }

  ui.renderInventorySkeleton();
  if (appState.syncConfig) {
    ui.showStatus("جاري مزامنة البيانات...", "syncing");
    try {
      const [inventoryResult, salesResult, suppliersResult] = await Promise.all(
        [api.fetchFromGitHub(), api.fetchSales(), api.fetchSuppliers()]
      );
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
      ui.hideSyncStatus();
      if (!magicLinkProcessed) {
        ui.showStatus("تمت المزامنة بنجاح!", "success");
      }
    } catch (error) {
      ui.hideSyncStatus();
      ui.showStatus(`خطأ في المزامنة: ${error.message}`, "error", {
        duration: 5000,
      });
      loadLocalData();
    }
  } else {
    loadLocalData();
  }

  updateLastArchiveDateDisplay();
  ui.filterAndRenderItems();
  ui.renderCategoryFilter();
  ui.populateCategoryDatalist();
  ui.updateCurrencyDisplay();

  handleUrlShortcuts();

  console.log("App Initialized Successfully.");
}

// Start the application
initializeApp();

// --- Register Service Worker ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js") // Use relative path for robustness
      .then(registration => {
        console.log(
          "ServiceWorker registration successful with scope: ",
          registration.scope
        );
      })
      .catch(err => {
        console.log("ServiceWorker registration failed: ", err);
      });
  });
}
