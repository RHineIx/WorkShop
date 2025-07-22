// js/utils.js

/**
 * Sanitizes a string to prevent XSS attacks by converting HTML special characters
 * into their corresponding entities.
 * @param {string} str The potentially unsafe string to sanitize.
 * @returns {string} A safe string with HTML characters encoded.
 */
export const sanitizeHTML = (str) => {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
};

/**
 * Generates a random, non-unique SKU string in the format "KEY-XXXXXXXX".
 * @returns {string} A randomly generated SKU.
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
 * Generates a SKU and ensures it is unique by checking against a Set of existing SKUs.
 * It will continue generating SKUs until a unique one is found.
 * @param {Set<string>} existingSkus - A Set containing all SKUs that are currently in use.
 * @returns {string} A guaranteed unique SKU.
 */
export const generateUniqueSKU = (existingSkus) => {
    let newSku;
    do {
        newSku = generateSKU();
    } while (existingSkus.has(newSku));
    return newSku;
};