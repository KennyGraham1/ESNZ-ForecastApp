import { EarthquakeData } from '@/types/earthquake';
import { differenceInHours, differenceInMilliseconds } from 'date-fns';

export interface TemporalStatistics {
    meanIET: number; // hours
    medianIET: number; // hours
    minIET: number; // hours
    maxIET: number; // hours
    stdIET: number; // hours
    eventsPerDay: number;
    interEventTimes: number[]; // hours
}

export function calculateTemporalStatistics(earthquakes: EarthquakeData[]): TemporalStatistics | null {
    if (!earthquakes || earthquakes.length < 2) {
        return null;
    }

    // Sort by time
    const sortedEq = [...earthquakes].sort((a, b) => {
        const timeA = a.time instanceof Date ? a.time.getTime() : new Date(a.time).getTime();
        const timeB = b.time instanceof Date ? b.time.getTime() : new Date(b.time).getTime();
        return timeA - timeB;
    });

    const interEventTimes: number[] = [];
    for (let i = 1; i < sortedEq.length; i++) {
        const timePrev = sortedEq[i - 1].time instanceof Date ? sortedEq[i - 1].time : new Date(sortedEq[i - 1].time);
        const timeCurr = sortedEq[i].time instanceof Date ? sortedEq[i].time : new Date(sortedEq[i].time);

        // Calculate difference in hours
        const diffHours = (timeCurr.getTime() - timePrev.getTime()) / (1000 * 60 * 60);
        interEventTimes.push(diffHours);
    }

    if (interEventTimes.length === 0) return null;

    // Calculate statistics
    const sum = interEventTimes.reduce((a, b) => a + b, 0);
    const meanIET = sum / interEventTimes.length;

    const sortedIET = [...interEventTimes].sort((a, b) => a - b);
    const mid = Math.floor(sortedIET.length / 2);
    const medianIET = sortedIET.length % 2 !== 0 ? sortedIET[mid] : (sortedIET[mid - 1] + sortedIET[mid]) / 2;

    const minIET = sortedIET[0];
    const maxIET = sortedIET[sortedIET.length - 1];

    const variance = interEventTimes.reduce((acc, val) => acc + Math.pow(val - meanIET, 2), 0) / interEventTimes.length;
    const stdIET = Math.sqrt(variance);

    // Events per day
    const startTime = sortedEq[0].time instanceof Date ? sortedEq[0].time : new Date(sortedEq[0].time);
    const endTime = sortedEq[sortedEq.length - 1].time instanceof Date ? sortedEq[sortedEq.length - 1].time : new Date(sortedEq[sortedEq.length - 1].time);
    const totalDays = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24);
    const eventsPerDay = totalDays > 0 ? sortedEq.length / totalDays : 0;

    return {
        meanIET,
        medianIET,
        minIET,
        maxIET,
        stdIET,
        eventsPerDay,
        interEventTimes
    };
}
