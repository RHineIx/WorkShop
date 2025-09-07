// js/handlers/vehicleSearchHandler.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { elements } from "../dom.js";
import { showStatus } from "../notifications.js";
import { sanitizeHTML } from "../utils.js";

/**
 * Loads the main vehicle index file.
 */
async function loadVehicleIndex() {
  const { vehicleSearchResults } = elements;
  vehicleSearchResults.innerHTML = '<p class="empty-state">جاري تحميل فهرس المركبات...</p>';
  try {
    const result = await api.fetchGitHubFile("searching/vehicle_index.json");
    if (!result) {
      throw new Error("ملف فهرس المركبات غير موجود أو فارغ.");
    }
    appState.vehicleIndex = result;
    appState.vehicleDataLoaded = true;

    populateMakeDropdown();
    vehicleSearchResults.innerHTML = '<p class="empty-state">الرجاء تحديد الماركة والموديل والسنة لعرض النتائج.</p>';
  } catch (error) {
    showStatus(`فشل تحميل فهرس البحث: ${error.message}`, "error");
    vehicleSearchResults.innerHTML = `<p class="empty-state" style="color: var(--danger-color)">فشل تحميل الفهرس. تأكد من رفع الملفات بشكل صحيح.</p>`;
  }
}

function populateMakeDropdown() {
  const makes = Object.keys(appState.vehicleIndex).sort();
  const select = elements.vehicleMakeSelect;
  select.innerHTML = '<option value="">اختر ماركة...</option>';
  makes.forEach(make => {
    const option = document.createElement("option");
    option.value = make;
    option.textContent = make;
    select.appendChild(option);
  });
}

function handleMakeChange(e) {
  const make = e.target.value;
  appState.vehicleFilters.make = make;
  appState.vehicleFilters.model = "";
  appState.vehicleFilters.year = "";

  const modelSelect = elements.vehicleModelSelect;
  const yearSelect = elements.vehicleYearSelect;

  modelSelect.innerHTML = '<option value="">اختر موديل...</option>';
  yearSelect.innerHTML = '<option value="">اختر سنة...</option>';
  modelSelect.disabled = true;
  yearSelect.disabled = true;
  elements.vehicleSearchResults.innerHTML = '<p class="empty-state">الرجاء تحديد الماركة والموديل والسنة لعرض النتائج.</p>';

  if (make && appState.vehicleIndex[make]) {
    const models = Object.keys(appState.vehicleIndex[make]).sort();
    models.forEach(model => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });
    modelSelect.disabled = false;
  }
}

function handleModelChange(e) {
  const model = e.target.value;
  appState.vehicleFilters.model = model;
  appState.vehicleFilters.year = "";

  const yearSelect = elements.vehicleYearSelect;
  yearSelect.innerHTML = '<option value="">اختر سنة...</option>';
  yearSelect.disabled = true;
  elements.vehicleSearchResults.innerHTML = '<p class="empty-state">الرجاء تحديد الماركة والموديل والسنة لعرض النتائج.</p>';

  const make = appState.vehicleFilters.make;
  if (model && appState.vehicleIndex[make] && appState.vehicleIndex[make][model]) {
    const years = appState.vehicleIndex[make][model]; // Already sorted descending
    years.forEach(year => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    });
    yearSelect.disabled = false;
  }
}

async function handleYearChange(e) {
  appState.vehicleFilters.year = e.target.value;
  await renderVehicleResults();
}

async function renderVehicleResults() {
  const { make, model, year } = appState.vehicleFilters;
  const resultsGrid = elements.vehicleSearchResults;

  if (!make || !model || !year) {
    resultsGrid.innerHTML = '<p class="empty-state">الرجاء تحديد الماركة والموديل والسنة لعرض النتائج.</p>';
    return;
  }
  
  resultsGrid.innerHTML = '<p class="empty-state">جاري جلب النتائج...</p>';
  
  try {
    const sanitizedMake = make.replace(/[^a-zA-Z0-9.-_]/g, '_');
    const sanitizedModel = model.replace(/[^a-zA-Z0-9.-_]/g, '_');
    const sanitizedYear = year.replace(/[^a-zA-Z0-9.-_]/g, '_');
    
    const filePath = `searching/data/${sanitizedMake}/${sanitizedModel}/${sanitizedYear}.json`;
    const results = await api.fetchGitHubFile(filePath);

    if (!results || results.length === 0) {
      resultsGrid.innerHTML = '<p class="empty-state">لا توجد نتائج مطابقة لبحثك.</p>';
      return;
    }

    resultsGrid.innerHTML = "";
    const fragment = document.createDocumentFragment();
    const template = elements.vehicleResultCardTemplate;

    results.forEach(item => {
      const clone = template.content.cloneNode(true);
      const card = clone.querySelector('.vehicle-result-card');
      
      card.querySelector('.vr-card-name').textContent = item.Name || 'N/A';
      
      const fccIdEl = card.querySelector('.vr-detail-item[data-field="fccId"]');
      const partNoEl = card.querySelector('.vr-detail-item[data-field="partNo"]');
      const yearEl = card.querySelector('.vr-detail-item[data-field="year"]');
      const yearRangeEl = card.querySelector('.vr-detail-item[data-field="yearRange"]');

      if (item["FCC ID"]) {
        fccIdEl.querySelector('span').textContent = item["FCC ID"];
      } else {
        fccIdEl.style.display = 'none';
      }

      if (item["Part Num"]) {
        partNoEl.querySelector('span').textContent = item["Part Num"];
      } else {
        partNoEl.style.display = 'none';
      }

      if (item.Year) {
        yearEl.querySelector('span').textContent = item.Year;
      } else {
        yearEl.style.display = 'none';
      }

      if (item["Years From"] && item["Years To"]) {
        yearRangeEl.querySelector('span').textContent = `${item["Years From"]} - ${item["Years To"]}`;
      } else {
        yearRangeEl.style.display = 'none';
      }
      
      fragment.appendChild(clone);
    });

    resultsGrid.appendChild(fragment);

  } catch (error) {
    console.error("Failed to render vehicle results:", error);
    resultsGrid.innerHTML = `<p class="empty-state" style="color: var(--danger-color)">فشل في جلب النتائج. قد يكون الملف غير موجود.</p>`;
  }
}


export function initVehicleSearch() {
  if (!appState.vehicleDataLoaded) {
    loadVehicleIndex();
  }
}

export function setupVehicleSearchListeners(elements) {
  elements.vehicleMakeSelect.addEventListener("change", handleMakeChange);
  elements.vehicleModelSelect.addEventListener("change", handleModelChange);
  elements.vehicleYearSelect.addEventListener("change", handleYearChange);
}