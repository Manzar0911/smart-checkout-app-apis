/**
 * Backend Flexible Date Validation Utilities
 * Supports: full_date (DD/MM/YYYY), month_year (MM/YYYY), year_only (YYYY)
 * Backward compatible with old ISO date strings (YYYY-MM-DD)
 */

const DATE_TYPES = {
  FULL_DATE: 'full_date',
  MONTH_YEAR: 'month_year',
  YEAR_ONLY: 'year_only',
};

const VALID_DATE_TYPES = [DATE_TYPES.FULL_DATE, DATE_TYPES.MONTH_YEAR, DATE_TYPES.YEAR_ONLY];

/**
 * Check if a given day/month/year constitutes a real calendar date
 */
function isRealCalendarDate(day, month, year) {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return false;
  const dateObj = new Date(y, m - 1, d);
  return (
    dateObj.getFullYear() === y &&
    dateObj.getMonth() === m - 1 &&
    dateObj.getDate() === d
  );
}

/**
 * Validate a date value against its declared type
 * @param {string} value - The date string
 * @param {string} type - 'full_date' | 'month_year' | 'year_only'
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateFlexibleDate(value, type) {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return { valid: false, error: 'Date value is required.' };
  }

  const val = String(value).trim();

  // Normalize type — default to full_date if missing/invalid
  const dateType = VALID_DATE_TYPES.includes(type) ? type : DATE_TYPES.FULL_DATE;

  switch (dateType) {
    case DATE_TYPES.FULL_DATE: {
      // Accept DD/MM/YYYY or old ISO YYYY-MM-DD
      const fullDateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      const isoRegex = /^\d{4}-\d{2}-\d{2}$/;

      if (fullDateRegex.test(val)) {
        const parts = val.split('/');
        const month = parseInt(parts[1], 10);
        if (month < 1 || month > 12) {
          return { valid: false, error: 'Invalid month. Must be 01-12.' };
        }
        if (!isRealCalendarDate(parts[0], parts[1], parts[2])) {
          return { valid: false, error: 'Invalid calendar date.' };
        }
        return { valid: true, error: null };
      }

      if (isoRegex.test(val)) {
        // Old ISO format — still valid for backward compat
        const parts = val.split('-');
        if (!isRealCalendarDate(parts[2], parts[1], parts[0])) {
          return { valid: false, error: 'Invalid calendar date.' };
        }
        return { valid: true, error: null };
      }

      return { valid: false, error: 'Invalid date format. Expected DD/MM/YYYY.' };
    }

    case DATE_TYPES.MONTH_YEAR: {
      const regex = /^\d{2}\/\d{4}$/;
      if (!regex.test(val)) {
        return { valid: false, error: 'Invalid format. Expected MM/YYYY.' };
      }
      const parts = val.split('/');
      const month = parseInt(parts[0], 10);
      if (month < 1 || month > 12) {
        return { valid: false, error: 'Invalid month. Must be 01-12.' };
      }
      const year = parseInt(parts[1], 10);
      if (year < 1900 || year > 2200) {
        return { valid: false, error: 'Invalid year.' };
      }
      return { valid: true, error: null };
    }

    case DATE_TYPES.YEAR_ONLY: {
      const regex = /^\d{4}$/;
      if (!regex.test(val)) {
        return { valid: false, error: 'Invalid year format. Expected YYYY (4 digits).' };
      }
      const year = parseInt(val, 10);
      if (year < 1900 || year > 2200) {
        return { valid: false, error: 'Invalid year.' };
      }
      return { valid: true, error: null };
    }

    default:
      return { valid: false, error: 'Unknown date type.' };
  }
}

/**
 * Normalize a date to a comparable numeric value
 * @returns {number} comparable value, or NaN on failure
 */
function dateToComparableValue(value, type) {
  if (!value) return NaN;
  const val = String(value).trim();
  const dateType = VALID_DATE_TYPES.includes(type) ? type : DATE_TYPES.FULL_DATE;

  switch (dateType) {
    case DATE_TYPES.FULL_DATE: {
      // Handle both DD/MM/YYYY and ISO YYYY-MM-DD
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
        const parts = val.split('/');
        return parseInt(parts[2]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[0]);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const parts = val.split('-');
        return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
      }
      return NaN;
    }
    case DATE_TYPES.MONTH_YEAR: {
      const parts = val.split('/');
      if (parts.length !== 2) return NaN;
      return parseInt(parts[1]) * 10000 + parseInt(parts[0]) * 100;
    }
    case DATE_TYPES.YEAR_ONLY: {
      return parseInt(val) * 10000;
    }
    default:
      return NaN;
  }
}

/**
 * Compare manufacturing and expiry dates with mixed type support
 * @returns {{ valid: boolean, error: string|null }}
 */
function compareFlexibleDates(mfgValue, mfgType, expValue, expType) {
  const mfgValidation = validateFlexibleDate(mfgValue, mfgType);
  if (!mfgValidation.valid) {
    return { valid: false, error: `Manufacturing date: ${mfgValidation.error}` };
  }

  const expValidation = validateFlexibleDate(expValue, expType);
  if (!expValidation.valid) {
    return { valid: false, error: `Expiry date: ${expValidation.error}` };
  }

  const mfgNumeric = dateToComparableValue(mfgValue, mfgType);
  const expNumeric = dateToComparableValue(expValue, expType);

  if (isNaN(mfgNumeric) || isNaN(expNumeric)) {
    return { valid: false, error: 'Unable to compare dates.' };
  }

  // Compare at the granularity of the coarser type
  const granularityOrder = {
    [DATE_TYPES.YEAR_ONLY]: 1,
    [DATE_TYPES.MONTH_YEAR]: 2,
    [DATE_TYPES.FULL_DATE]: 3,
  };

  const mfgGranularity = granularityOrder[mfgType] || 3;
  const expGranularity = granularityOrder[expType] || 3;
  const coarserGranularity = Math.min(mfgGranularity, expGranularity);

  let mfgCompare = mfgNumeric;
  let expCompare = expNumeric;

  if (coarserGranularity === 1) {
    mfgCompare = Math.floor(mfgNumeric / 10000);
    expCompare = Math.floor(expNumeric / 10000);
  } else if (coarserGranularity === 2) {
    mfgCompare = Math.floor(mfgNumeric / 100);
    expCompare = Math.floor(expNumeric / 100);
  }

  if (expCompare < mfgCompare) {
    return { valid: false, error: 'Expiry date cannot be before manufacturing date.' };
  }

  return { valid: true, error: null };
}

/**
 * Parse/format a flexible date for display
 * Handles old ISO format conversion
 * @param {string} value
 * @param {string} type
 * @returns {string}
 */
function parseFlexibleDate(value, type) {
  if (!value) return '';
  const val = String(value).trim();

  // If old ISO format (YYYY-MM-DD), convert to DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    const parts = val.substring(0, 10).split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  return val;
}

/**
 * Safely get date type, defaulting to full_date for null/undefined/invalid
 */
function safeDateType(type) {
  return VALID_DATE_TYPES.includes(type) ? type : DATE_TYPES.FULL_DATE;
}

module.exports = {
  DATE_TYPES,
  VALID_DATE_TYPES,
  validateFlexibleDate,
  compareFlexibleDates,
  parseFlexibleDate,
  dateToComparableValue,
  safeDateType,
};
