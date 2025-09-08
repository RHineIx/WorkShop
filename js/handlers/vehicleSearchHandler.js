// js/handlers/vehicleSearchHandler.js
import { appState } from "../state.js";
import * as api from "../api.js";
import { elements } from "../dom.js";
import { showStatus } from "../notifications.js";
import { sanitizeHTML } from "../utils.js";

/**
 * Parses CSV text into an array of objects, correctly handling commas within quoted fields.
 * @param {string} csvText The raw CSV string.
 * @returns {Array<Object>}
 */
function parseCSV(csvText) {
  if (!csvText) return [];
  const rows = csvText.trim().split(/\r?\n/);
  if (rows.length < 2) return [];

  // Clean up headers by removing quotes
  const headers = rows[0].split(",").map(h => h.trim().replace(/"/g, ''));
  const data = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const values = [];
    let inQuote = false;
    let currentField = '';

    for (const char of row) {
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        values.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    values.push(currentField.trim()); // Add the last field

    if (values.length === headers.length) {
      const obj = headers.reduce((acc, header, index) => {
        // Clean up values by removing quotes
        acc[header] = values[index] ? values[index].replace(/"/g, '').trim() : '';
        return acc;
      }, {});
      data.push(obj);
    } else {
       console.warn(`Skipping malformed CSV row ${i + 1}: Expected ${headers.length} fields, but found ${values.length}.`);
    }
  }
  return data;
}


/**
 * Fetches and processes the vehicle data from both CSV files.
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
    if (make) { // Ensure empty make names are not added
        const option = document.createElement("option");
        option.value = make;
        option.textContent = make;
        select.appendChild(option);
    }
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
      if (model) { // Ensure empty model names are not added
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
      }
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
        if (year) { // Ensure empty years are not added
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
    });
    yearSelect.disabled = false;
  }
}

async function handleYearChange(e) {
    appState.vehicleFilters.year = e.target.value;
    await renderVehicleResults();
}

/**
 * Creates a copyable tag button for FCC ID or Part Num.
 * @param {string} text - The text content to display and copy.
 * @param {string} cssClass - The CSS class for the button.
 * @param {string} textClass - The CSS class for the text span.
 * @returns {HTMLButtonElement}
 */
function createCopyButton(text, cssClass, textClass) {
    const copyBtn = document.createElement('button');
    copyBtn.className = cssClass;
    copyBtn.title = `نسخ ${text}`;
    copyBtn.innerHTML = `
        <span class="${textClass}">${sanitizeHTML(text)}</span>
        <iconify-icon class="copy-icon" icon="material-symbols:content-copy-outline-rounded"></iconify-icon>
    `;

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => {
            const textEl = copyBtn.querySelector(`.${textClass}`);
            const iconEl = copyBtn.querySelector('.copy-icon');
            const originalIcon = iconEl.getAttribute('icon');
            
            copyBtn.classList.add('copied');
            iconEl.setAttribute('icon', 'material-symbols:check-rounded');
            textEl.textContent = "تم النسخ!";
            
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                iconEl.setAttribute('icon', originalIcon);
                textEl.textContent = sanitizeHTML(text);
            }, 1500);
        }).catch(err => {
            showStatus("فشل النسخ.", "error");
            console.error('Copy failed', err);
        });
    });
    return copyBtn;
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
            
            const iconElement = card.querySelector('.vr-card-icon iconify-icon');
            const makeForIcon = (item.Make || '').split('/')[0].trim().toLowerCase().replace(/\s+/g, '-');
            if (makeForIcon) {
                iconElement.setAttribute('icon', `cbi:${makeForIcon}`);
            }

            card.querySelector('.vr-card-name').textContent = item.Name || 'N/A';
            
            const partNumContainer = card.querySelector('.vr-part-num-container');
            const fccContainer = card.querySelector('.vr-fcc-container');
            const yearRangeEl = card.querySelector('.vr-meta-item[data-field="yearRange"]');

            if (item["Part Num"]) {
                const partNums = item["Part Num"].split('|').map(id => id.trim()).filter(id => id);
                partNums.forEach(pn => {
                    partNumContainer.appendChild(createCopyButton(pn, 'vr-copy-part-num', 'part-num-text'));
                });
            } else {
                partNumContainer.style.display = 'none';
            }
            
            if (item["FCC ID"]) {
                const fccIDs = item["FCC ID"].split('|').map(id => id.trim()).filter(id => id);
                fccIDs.forEach(id => {
                    fccContainer.appendChild(createCopyButton(id, 'vr-copy-fcc', 'fcc-text'));
                });
            } else {
                fccContainer.style.display = 'none';
            }
            
            if (item["Years From"] && item["Years To"]) {
                yearRangeEl.querySelector('span').textContent = `${item["Years From"]}-${item["Years To"]}`;
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