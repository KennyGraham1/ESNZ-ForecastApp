'use client';

import { useId } from 'react';

interface FieldSelectProps {
    /** Visible label rendered above the control and linked via htmlFor for a11y. */
    label: string;
    /**
     * Current value ('' represents the "none" option when includeNone is set).
     * Accepts string | number because `keyof EarthquakeData` widens to that.
     */
    value: string | number;
    /** Fired with the raw string value; callers cast to their field type. */
    onChange: (value: string) => void;
    /** Field names to list as options. */
    options: readonly string[];
    /** When true, prepends a sentinel "" option (e.g. "None"). */
    includeNone?: boolean;
    /** Label for the sentinel option when includeNone is set. */
    noneLabel?: string;
    /** Optional helper text shown beneath the control. */
    hint?: string;
}

const SELECT_CLASS =
    'block w-full rounded-md border border-gray-300 bg-white p-2 shadow-sm ' +
    'focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';

/**
 * Accessible, consistently-styled dropdown for choosing an earthquake data field.
 * Replaces the repeated label+select markup throughout the Sandbox sidebar.
 */
export default function FieldSelect({
    label,
    value,
    onChange,
    options,
    includeNone = false,
    noneLabel = 'None',
    hint
}: FieldSelectProps) {
    const id = useId();
    return (
        <div>
            <label htmlFor={id} className="block text-xs font-medium text-gray-500 mb-1">
                {label}
            </label>
            <select
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={SELECT_CLASS}
            >
                {includeNone && <option value="">{noneLabel}</option>}
                {options.map((field) => (
                    <option key={field} value={field}>{field}</option>
                ))}
            </select>
            {hint && <p className="text-[10px] text-gray-500 mt-1">{hint}</p>}
        </div>
    );
}
