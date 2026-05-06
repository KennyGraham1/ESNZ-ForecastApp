# Statistical Models

## Omori's Law

### Overview

Omori's Law describes the temporal decay of aftershock rates following a mainshock. The application fits the modified Omori–Utsu formula:

$$\lambda(t) = \frac{K}{(t + c)^p}$$

Where:

| Symbol | Meaning |
|---|---|
| λ(t) | Aftershock rate at time *t* after the mainshock |
| K | Productivity constant (scales the overall rate) |
| c | Time offset (days) preventing singularity at *t* = 0 |
| p | Decay exponent (typically 0.9–1.5 for tectonic earthquakes) |

### Fitting methods

Seven optimisation methods are available, selectable in the Aftershock Sequence tab:

| Method | ID | Description |
|---|---|---|
| Grid Search | `grid-search` | Exhaustive parameter-space scan; robust but slow |
| Levenberg-Marquardt | `levenberg-marquardt` | Gradient-based non-linear least squares (fast) |
| Nelder-Mead | `nelder-mead` | Derivative-free simplex optimisation |
| Hybrid | `hybrid` | Grid-search initialisation followed by Levenberg-Marquardt refinement |
| Maximum Likelihood | `mle` | Likelihood maximisation over observed interevent times |
| MLE + Simulated Annealing | `mle-sa` | MLE with simulated-annealing global search to escape local minima |
| MLE + EM | `mle-em` | Expectation-Maximisation variant for MLE |

**Recommended starting point:** `hybrid` — combines the global coverage of grid-search with the precision of Levenberg-Marquardt.

### Cumulative form

The cumulative aftershock count predicted by the model is:

$$N(t) = \int_0^t \lambda(\tau)\,d\tau = \frac{K}{1 - p} \left[ (t + c)^{1-p} - c^{1-p} \right] \quad (p \neq 1)$$

Both the rate and cumulative forms are plotted in the **Aftershock Sequence** tab.

### Confidence intervals

Bootstrap confidence intervals are computed for K, c, and p by resampling the observed aftershock catalogue and re-fitting. The 95% CI is shown as a shaded band on the rate plot.

### Pre-configured historical events

The following New Zealand sequences are available for one-click analysis:

| Event | Date | Magnitude |
|---|---|---|
| Kaikōura | 2016-11-14 | M7.8 |
| Christchurch | 2011-02-22 | M6.3 |
| Canterbury (Darfield) | 2010-09-04 | M7.1 |
| Seddon | 2013-07-21 | M6.5 |
| Cook Strait | 2013-07-21 | M6.6 |
| Eketāhuna | 2014-01-20 | M6.3 |

Any earthquake can also be analysed by entering custom mainshock parameters (location, magnitude, date).

---

## Gutenberg-Richter Analysis

### Frequency-magnitude relation

The Gutenberg-Richter (GR) relation describes the distribution of earthquake magnitudes in a region:

$$\log_{10} N(M) = a - b \cdot M$$

Where:

| Symbol | Meaning |
|---|---|
| N(M) | Cumulative number of earthquakes with magnitude ≥ M |
| a | Activity parameter (seismicity rate) |
| b | b-value (slope of the log-linear distribution; typically ~1.0) |

### Magnitude of completeness (Mc)

Two methods are available for estimating the magnitude of completeness Mc:

| Method | Description |
|---|---|
| **Maximum Curvature** | Mc = magnitude at the peak of the non-cumulative frequency-magnitude distribution. Fast and widely used; may underestimate Mc in heterogeneous catalogs. |
| **Goodness of Fit** | Finds the lowest M at which the observed distribution fits a GR line within a specified residual threshold (default 5%). More conservative; preferred for publication-quality estimates. |

### b-value estimation

The b-value is estimated by linear regression on log₁₀(N) vs M for events above Mc, using the `simple-statistics` library. The fit and its residuals are displayed in the Gutenberg-Richter plot.

---

## Reference models

Pre-computed reference seismicity models for New Zealand are available in `src/lib/analysis/referenceModels.ts`. These provide baseline comparison curves for:

- National background seismicity rate as a function of magnitude
- Regional hazard scaling benchmarks

Reference models are displayed as overlay curves on the Gutenberg-Richter plot for comparison with the observed catalog.

---

## What is NOT implemented

The following methods are referenced in literature or older documentation but are **not** implemented in the current codebase:

| Method | Status |
|---|---|
| Gardner-Knopoff declustering | Not implemented. The README mentions it; no code exists. |
| ETAS (Epidemic-Type Aftershock Sequence) model | Not implemented |
| Hawkes process fitting | Not implemented |

These may be added in future releases. Do not rely on any claims about these features in older documentation files in the `docs/` directory.
