# Omori's Law Analysis Documentation

## 1. Overview

**Omori's Law** is a fundamental empirical relation in seismology that describes the decay of aftershock activity following a mainshock. Discovered by Fusakichi Omori in 1894, it states that the frequency of aftershocks decreases hyperbolically with time.

In the ESNZ-ForecastApp, this analysis allows users to:
- Identify the temporal decay pattern of an aftershock sequence.
- Estimate key parameters defining the sequence's behavior.
- Visualize the fit between the theoretical model and observed data.

This tool is critical for forecasting statistical probabilities of future events in a sequence and characterizing the "productivity" and "decay rate" of significant earthquakes.

## 2. Mathematical Formula

The application models aftershock decay using the **Modified Omori Law (MOL)**, proposed by Utsu (1961). The formula estimates the rate of aftershocks $n(t)$ at time $t$ after the mainshock:

$$ n(t) = \frac{K}{(t + c)^p} $$

### Parameters:
- **$n(t)$**: The rate of aftershocks (number of events per day) at time $t$.
- **$t$**: Time elapsed since the mainshock (measured in days).
- **$K$ (Productivity)**: Proportional to the total number of aftershocks in the sequence. A higher $K$ indicates a more productive sequence.
- **$c$ (Time Offset)**: A small constant (days) that accounts for the complex, incomplete detection of aftershocks immediately following the mainshock. It prevents the rate from going to infinity at $t=0$.
- **$p$ (Decay Exponent)**: Describes how quickly the aftershock activity decays.
  - Typically, $p \approx 1.1$.
  - $p > 1$: Decay is faster than $1/t$.
  - $p < 1$: Decay is slower.

## 3. Parameter Estimation

The application estimates the parameters ($K$, $c$, $p$) by fitting the Modified Omori Law to the observed daily counts of aftershocks.

### Fitting Method: Grid Search with Least Squares Estimation (LSE)
Instead of complex iterative solvers like Levenberg-Marquardt (which are optioned for future production use), the current implementation uses a robust **Grid Search** approach minimizing the Sum of Squared Errors (SSE).

**Algorithm Steps:**
1.  **Binning**: Earthquakes are binned into daily counts for the first 365 days (or `daysAfter` parameter) following the mainshock.
2.  **Filtering**: Days with zero counts are excluded to improve fit stability.
3.  **Grid Search**: The algorithm iterates through a predefined grid of reasonable values for $p$ and $c$:
    - **$p$ range**: 0.8 to 1.5 (step 0.1)
    - **$c$ range**: 0.01 to 1.0 (step 0.1)
4.  **K Calculation**: For each ($p$, $c$) pair, the optimal $K$ is calculated analytically to minimize error:
    $$ K = \frac{\sum (Counts_i \cdot (t_i + c)^p)}{N} $$
    *(Derived from rearranging the formula to solve for K linear approximation)*
5.  **Selection**: The combination of ($K$, $c$, $p$) yielding the lowest Sum of Squared Errors (SSE) between observed and predicted counts is selected.

### Constraints
- **Minimum Data Requirement**: Analysis requires at least **10 aftershocks** and **5 non-zero days** of activity.
- **Ranges**: Parameters are constrained to physically realistic ranges typical for New Zealand seismicity (as reflected in the grid search bounds).

## 4. Implementation Details

### Data Preprocessing
- **Mainshock Identification**:
    - **Selection**: Users can select a mainshock manualy, choose from historical presets (e.g., 2016 Kaikōura), or select from automatically detected recent significant events.
    - **Automatic Detection**: Uses the **Gardner-Knopoff** declustering algorithm to identify independent mainshocks ($M \ge 5.5$) by removing dependent foreshocks/aftershocks within magnitude-dependent space-time windows.
- **Aftershock Filtering**:
    - Events are considered aftershocks if they occur **after** the mainshock and within the user-specified duration (default **365 days**).
    - No spatial filtering is strictly applied in the *analysis function itself* (`calculateOmoriParameters`), relying on the passed dataset being an appropriate spatial subset (usually pre-filtered by the user or the view context). However, the declustering logic used for *identifying mainshocks* uses Gardner-Knopoff spatial windows.

### Default Values
- **Initial Guesses** (before optimization):
  - $K \approx 2 \times \max(daily\_counts)$
  - $c = 0.1$ days
  - $p = 1.1$

### Time Units
- All calculations are performed in **days** relative to the mainshock time ($t = t_{event} - t_{mainshock}$).

### Code Location
- **Core Logic**: `src/lib/analysis/omori.ts`
- **Visualization**: `src/components/OmoriLawPlot.tsx`
- **Main Window Logic**: `src/components/tabs/AftershockSequence.tsx` (Handles Gardner-Knopoff declustering for mainshock selection)

## 5. Scientific References

- **Omori, F. (1894)**. "On the aftershocks of earthquakes". *Journal of the College of Science, Imperial University of Tokyo*, 7, 111–200.
- **Utsu, T. (1961)**. "A statistical study on the occurrence of aftershocks". *Geophysical Magazine*, 30, 521–605.
- **Gardner, J. K., & Knopoff, L. (1974)**. "Is the sequence of earthquakes in Southern California, with aftershocks removed, Poissonian?". *Bulletin of the Seismological Society of America*, 64(5), 1363-1367.
- **Reasenberg, P. (1985)**. "Second-order moment of central California seismicity, 1969–1982". *Journal of Geophysical Research*, 90(B7), 5479–5495.
