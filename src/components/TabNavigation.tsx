'use client';

import { useState } from 'react';

interface Tab {
    id: string;
    label: string;
}

interface TabNavigationProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
}

export default function TabNavigation({ tabs, activeTab, onTabChange }: TabNavigationProps) {
    const [hoveredTab, setHoveredTab] = useState<string | null>(null);

    return (
        <div className="relative px-6 py-6 mb-6">
            {/* Background gradient bar */}
            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200"></div>

            <nav className="flex justify-center items-center gap-3" aria-label="Tabs">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const isHovered = hoveredTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            onMouseEnter={() => setHoveredTab(tab.id)}
                            onMouseLeave={() => setHoveredTab(null)}
                            className={`
                                relative px-6 py-3 rounded-xl font-semibold text-sm
                                transition-all duration-300 ease-out
                                ${isActive
                                    ? 'text-white bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 shadow-xl shadow-blue-500/50 scale-105 -translate-y-1'
                                    : 'text-gray-600 bg-white hover:bg-gradient-to-br hover:from-gray-50 hover:to-gray-100 shadow-md hover:shadow-lg hover:scale-102 hover:-translate-y-0.5'
                                }
                                ${isHovered && !isActive ? 'ring-2 ring-blue-300 ring-opacity-50' : ''}
                                border border-gray-200
                                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                            `}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            {/* Shimmer effect for active tab */}
                            {isActive && (
                                <div className="absolute inset-0 rounded-xl overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
                                </div>
                            )}

                            {/* Tab label */}
                            <span className="relative z-10 whitespace-nowrap">
                                {tab.label}
                            </span>

                            {/* Active indicator dot */}
                            {isActive && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-300 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-400 border-2 border-white"></span>
                                </span>
                            )}

                            {/* Bottom glow for active tab */}
                            {isActive && (
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent blur-sm"></div>
                            )}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
