'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface DateRangeSliderProps {
    minDate: Date;
    maxDate: Date;
    startDate?: Date;
    endDate?: Date;
    onChange: (start: Date, end: Date) => void;
}

export default function DateRangeSlider({ minDate, maxDate, startDate, endDate, onChange }: DateRangeSliderProps) {
    const minTime = minDate.getTime();
    const maxTime = maxDate.getTime();

    // Internal state to track drag updates immediately, while prop updates might lag
    const [minVal, setMinVal] = useState(startDate ? startDate.getTime() : minTime);
    const [maxVal, setMaxVal] = useState(endDate ? endDate.getTime() : maxTime);

    // Sync with props
    useEffect(() => {
        if (startDate) setMinVal(startDate.getTime());
        if (endDate) setMaxVal(endDate.getTime());
    }, [startDate, endDate]);

    // Convert to percentage for CSS positioning
    const getPercent = useCallback((value: number) => {
        return Math.round(((value - minTime) / (maxTime - minTime)) * 100);
    }, [minTime, maxTime]);

    // Handle interaction
    const handleMinChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = Math.min(Number(event.target.value), maxVal - 86400000); // Prevent crossing, keep 1 day gap
        setMinVal(value);
        onChange(new Date(value), new Date(maxVal));
    };

    const handleMaxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = Math.max(Number(event.target.value), minVal + 86400000); // Prevent crossing
        setMaxVal(value);
        onChange(new Date(minVal), new Date(value));
    };

    return (
        <div className="w-full pt-4 pb-2 px-1">
            <div className="relative h-10">
                {/* Sliders */}
                <input
                    type="range"
                    min={minTime}
                    max={maxTime}
                    value={minVal}
                    onChange={handleMinChange}
                    className="pointer-events-none absolute h-2 w-full -top-1 z-20 opacity-0 cursor-pointer"
                    style={{ WebkitAppearance: 'none' }}
                />
                <input
                    type="range"
                    min={minTime}
                    max={maxTime}
                    value={maxVal}
                    onChange={handleMaxChange}
                    className="pointer-events-none absolute h-2 w-full -top-1 z-20 opacity-0 cursor-pointer"
                    style={{ WebkitAppearance: 'none' }}
                />

                {/* Visual Track */}
                <div className="absolute top-1 left-0 right-0 h-1.5 bg-gray-200 rounded-full z-10">
                    <div
                        className="absolute h-full bg-indigo-500 rounded-full"
                        style={{
                            left: `${getPercent(minVal)}%`,
                            right: `${100 - getPercent(maxVal)}%`
                        }}
                    />
                </div>

                {/* Thumbs (Visual Only - interaction is handled by invisible inputs above but styling browsers native inputs is hard so we make custom thumbs? 
                   Actually, let's try the standard way where inputs are visible but styled special.
                   A simpler way for "Visual Only" thumbs is to just render divs at the computed positions.
                */}
                <div
                    className="absolute top-0 w-4 h-4 bg-white border-2 border-indigo-600 rounded-full shadow-md z-30 pointer-events-none"
                    style={{ left: `calc(${getPercent(minVal)}% - 8px)` }}
                />
                <div
                    className="absolute top-0 w-4 h-4 bg-white border-2 border-indigo-600 rounded-full shadow-md z-30 pointer-events-none"
                    style={{ left: `calc(${getPercent(maxVal)}% - 8px)` }}
                />

                {/* Invisible Touch Areas for the inputs need to be interactive. 
                    The above inputs are opacity-0. They need to be pointer-events-auto ONLY on the thumbs, which is hard.
                    
                    Re-thinking: The standard "Dual Range Slider CSS" trick involves:
                    1. Two range inputs usage.
                    2. Removing default appearance.
                    3. Setting pointer-events: none on the input itself.
                    4. Setting pointer-events: auto on the webkit-slider-thumb.
                    
                    Let's update the styles in a style tag or className to achieve this.
                */}
                <style jsx>{`
                    input[type='range']::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        pointer-events: all;
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        background: transparent; /* Invisible, we use the custom divs for visuals to avoid z-index hell */
                        cursor: pointer;
                    }
                    input[type='range']::-moz-range-thumb {
                        pointer-events: all;
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        background: transparent;
                        cursor: pointer;
                        border: none;
                    }
                `}</style>
            </div>

            <div className="flex justify-between items-center text-xs text-gray-600 font-medium">
                <span>{new Date(minVal).toLocaleDateString()}</span>
                <span>{new Date(maxVal).toLocaleDateString()}</span>
            </div>
        </div>
    );
}
