// js/utils.js

/**
 * Sanitizes a string to prevent XSS attacks by converting HTML special characters.
 * @param {string} str The string to sanitize.
 * @returns {string} The sanitized string.
 */
export const sanitizeHTML = (str) => {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
};

/**
 * Generates a random SKU string.
 * @returns {string} A random SKU like "KEY-A1B2C3D4".
 */
const generateSKU = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `KEY-${result}`;
};

/**
 * Generates a SKU and ensures it's unique within the provided list of existing SKUs.
 * @param {Set<string>} existingSkus - A Set of SKUs that are already in use.
 * @returns {string} A unique SKU.
 */
export const generateUniqueSKU = (existingSkus) => {
    let newSku;
    do {
        newSku = generateSKU();
    } while (existingSkus.has(newSku));
    return newSku;
};