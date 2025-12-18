import { OmoriParameters } from './omori';

export interface ReferenceModel {
    id: string;
    name: string;
    citation: string;
    description: string;
    region: string;
    params: {
        a: number; // Productivity
        b: number; // Scaling with magnitude
        p: number; // Decay
        c: number; // Time offset (days)
        Mcut: number; // Cutoff magnitude for productivity definition (usually M_main - M_cut)
    };
}

/**
 * Reference models from seismological literature
 */
export const REFERENCE_MODELS: ReferenceModel[] = [
    {
        id: 'rj-1989',
        name: 'Generic California (Reasenberg & Jones 1989)',
        citation: 'Reasenberg, P. A., & Jones, L. M. (1989). Science.',
        description: 'Standard "generic" California model used for decades.',
        region: 'California (Statewide)',
        params: {
            a: -1.67,
            b: 0.91,
            p: 1.08,
            c: 0.05,
            Mcut: 0 // RJ89 defines rate as: lambda = 10^(a + b(Mm - M)) * (t + c)^-p. 
            // This is slightly distinct from the Hardebeck form which often groups M-Mcut.
            // However, we will standardize the calculation function below.
        }
    },
    {
        id: 'hardebeck-2019-scsn',
        name: 'Southern California (Hardebeck et al. 2019)',
        citation: 'Hardebeck et al. (2019). Seismol. Res. Lett. 90(1).',
        description: 'Updated parameters for Southern California (SCSN region).',
        region: 'Southern California',
        params: {
            a: -2.30,
            b: 1.0,
            p: 0.83,
            c: 0.0033,
            Mcut: 0
        }
    },
    {
        id: 'hardebeck-2019-ncss',
        name: 'Northern California (Hardebeck et al. 2019)',
        citation: 'Hardebeck et al. (2019). Seismol. Res. Lett. 90(1).',
        description: 'Updated parameters for Northern California (NCSS region).',
        region: 'Northern California',
        params: {
            a: -2.64,
            b: 1.0,
            p: 0.96,
            c: 0.012,
            Mcut: 0
        }
    },
    {
        id: 'hardebeck-2019-mendocino',
        name: 'Mendocino (Hardebeck et al. 2019)',
        citation: 'Hardebeck et al. (2019). Seismol. Res. Lett. 90(1).',
        description: 'Specific parameters for the Mendocino Triple Junction region.',
        region: 'Mendocino',
        params: {
            a: -3.18,
            b: 1.0,
            p: 1.15,
            c: 0.050,
            Mcut: 0
        }
    },
    {
        id: 'hardebeck-2019-hydrothermal',
        name: 'Hydrothermal Areas (Hardebeck et al. 2019)',
        citation: 'Hardebeck et al. (2019). Seismol. Res. Lett. 90(1).',
        description: 'Combined parameters for Long Valley, Coso, and Salton Sea.',
        region: 'Hydrothermal',
        params: {
            a: -1.79,
            b: 1.0,
            p: 0.94,
            c: 0.026,
            Mcut: 0
        }
    }
];

/**
 * Calculate expected rate using reference model parameters
 * Reasenberg & Jones (1989) form:
 * lambda(t, M) = 10^(a + b(Mm - M)) * (t + c)^-p
 * 
 * To get rate of ALL events above Mc:
 * lambda_total(t) = 10^(a + b*(Mm - Mc)) * (t + c)^-p
 */
export function calculateReferenceRate(
    model: ReferenceModel,
    t: number,
    Mm: number, // Mainshock magnitude
    Mc: number  // Magnitude of completeness
): number {
    const { a, b, p, c } = model.params;

    // Productivity K for events > Mc
    // K = 10^(a + b(Mm - Mc))
    const K = Math.pow(10, a + b * (Mm - Mc));

    return K / Math.pow(t + c, p);
}

/**
 * Generate reference series data
 */
export function generateReferenceSeries(
    model: ReferenceModel,
    days: number[],
    Mm: number,
    Mc: number
): { day: number; count: number }[] {
    return days.map(day => ({
        day,
        count: calculateReferenceRate(model, day, Mm, Mc)
    }));
}
