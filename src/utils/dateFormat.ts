import { format, parse } from 'date-fns';

/**
 * Centralized date formatting utilities for ESNZ-ForecastApp
 * All dates are displayed in dd/mm/yyyy format (New Zealand standard)
 */

// Standard date format: dd/mm/yyyy
export const DATE_FORMAT = 'dd/MM/yyyy';

// Date-time format: dd/mm/yyyy HH:mm:ss
export const DATETIME_FORMAT = 'dd/MM/yyyy HH:mm:ss';

// Date-time format with timezone: dd/mm/yyyy HH:mm:ss zzz
export const DATETIME_TZ_FORMAT = 'dd/MM/yyyy HH:mm:ss zzz';

// ISO format for HTML date inputs (yyyy-MM-dd)
export const ISO_DATE_FORMAT = 'yyyy-MM-dd';

/**
 * Format a date to dd/mm/yyyy
 * @param date - Date object, ISO string, or timestamp
 * @returns Formatted date string in dd/mm/yyyy format
 */
export function formatDate(date: Date | string | number): string {
    try {
        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) {
            return 'Invalid Date';
        }
        return format(dateObj, DATE_FORMAT);
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Invalid Date';
    }
}

/**
 * Format a date-time to dd/mm/yyyy HH:mm:ss
 * @param date - Date object, ISO string, or timestamp
 * @returns Formatted date-time string
 */
export function formatDateTime(date: Date | string | number): string {
    try {
        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) {
            return 'Invalid Date';
        }
        return format(dateObj, DATETIME_FORMAT);
    } catch (error) {
        console.error('Error formatting date-time:', error);
        return 'Invalid Date';
    }
}

/**
 * Format a date to ISO format (yyyy-MM-dd) for HTML date inputs
 * @param date - Date object, ISO string, or timestamp
 * @returns ISO formatted date string (yyyy-MM-dd)
 */
export function formatDateISO(date: Date | string | number): string {
    try {
        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) {
            return '';
        }
        return format(dateObj, ISO_DATE_FORMAT);
    } catch (error) {
        console.error('Error formatting date to ISO:', error);
        return '';
    }
}

/**
 * Parse a dd/mm/yyyy date string to a Date object
 * @param dateStr - Date string in dd/mm/yyyy format
 * @returns Date object
 */
export function parseDate(dateStr: string): Date {
    try {
        return parse(dateStr, DATE_FORMAT, new Date());
    } catch (error) {
        console.error('Error parsing date:', error);
        return new Date(NaN);
    }
}

/**
 * Format a date for CSV export (dd/mm/yyyy HH:mm:ss)
 * @param date - Date object, ISO string, or timestamp
 * @returns Formatted date string for CSV
 */
export function formatDateForCSV(date: Date | string | number): string {
    return formatDateTime(date);
}

/**
 * Format a date for JSON export (ISO 8601 format but with dd/mm/yyyy display)
 * @param date - Date object, ISO string, or timestamp
 * @returns Formatted date string for JSON
 */
export function formatDateForJSON(date: Date | string | number): string {
    return formatDateTime(date);
}

/**
 * Format a date for tooltips and displays (dd/mm/yyyy HH:mm:ss)
 * @param date - Date object, ISO string, or timestamp
 * @returns Formatted date string for tooltips
 */
export function formatDateForTooltip(date: Date | string | number): string {
    return formatDateTime(date);
}

/**
 * Convert ISO date string (yyyy-MM-dd) to dd/mm/yyyy for display
 * @param isoDate - ISO date string (yyyy-MM-dd)
 * @returns Date string in dd/mm/yyyy format
 */
export function isoToDisplayDate(isoDate: string): string {
    try {
        const dateObj = new Date(isoDate);
        if (isNaN(dateObj.getTime())) {
            return isoDate;
        }
        return format(dateObj, DATE_FORMAT);
    } catch (error) {
        return isoDate;
    }
}

/**
 * Convert dd/mm/yyyy to ISO date string (yyyy-MM-dd) for HTML inputs
 * @param displayDate - Date string in dd/mm/yyyy format
 * @returns ISO date string (yyyy-MM-dd)
 */
export function displayToISODate(displayDate: string): string {
    try {
        const dateObj = parse(displayDate, DATE_FORMAT, new Date());
        if (isNaN(dateObj.getTime())) {
            return displayDate;
        }
        return format(dateObj, ISO_DATE_FORMAT);
    } catch (error) {
        return displayDate;
    }
}

