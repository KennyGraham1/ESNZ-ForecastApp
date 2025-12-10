# Omori-Utsu Analysis Plot Updates

## Summary
Updated the Omori-Utsu analysis plots in `src/components/OmoriLawPlot.tsx` to match the reference matplotlib-style visualizations.

## Changes Made

### 1. Chart 1: "Counts vs OU expected"
**Previous:** Overlaid column charts (blue bars for observed, semi-transparent red bars for expected)

**Updated:**
- **Chart type:** Column chart with line overlay
- **Title:** "Counts vs OU expected"
- **X-axis:** "Time since mainshock (days)"
- **Y-axis:** "Count per bin"
- **Data series:**
  - Blue bars (cornflower blue with transparency): "Empirical counts"
  - Red line (crimson): "OU expected (fitted)"
- **Visual style:** Matches reference image with bars showing empirical data and smooth fitted line overlay

### 2. Chart 2: "Cumulative Counts: Observed vs Expected"
**Previous:** Time series showing observed vs expected cumulative counts over time

**Updated:**
- **Chart type:** Q-Q style plot (observed vs expected)
- **Title:** "Cumulative Counts: Observed vs Expected"
- **X-axis:** "Expected cumulative count"
- **Y-axis:** "Observed cumulative count"
- **Data series:**
  - Purple dashed line: "1:1" reference line
  - Blue solid line: "Observed vs Expected" actual data
- **Visual style:** Shows how well the model fits by comparing observed vs expected cumulative counts directly

### 3. Chart 3: "Profile log-likelihood contour for (p,c)"
**Previous:** Scatter plot with blue-yellow-red color gradient, axes labeled as c (x) and p (y)

**Updated:**
- **Chart type:** Contour plot (scatter with color gradient)
- **Title:** "Profile log-likelihood contour for (p,c)"
- **X-axis:** "p" (decay exponent) - range 0.6 to 2.2
- **Y-axis:** "c (days)" (time offset) - range 0 to 0.2
- **Color gradient:** Cyan → Green → Yellow → Orange → Red (lowest to highest likelihood)
- **MLE marker:** Red filled circle marking the maximum likelihood estimate
- **Visual style:** Matches reference with proper axis orientation (p on x-axis, c on y-axis) and contour-style coloring

### 4. Chart Order
Reordered charts in the "Model Fit" tab to match typical analysis workflow:
1. Counts vs OU expected (first - shows raw fit quality)
2. Cumulative Counts Q-Q plot (second - shows cumulative fit)
3. Daily Aftershock Rate Log-Log (third - shows decay pattern)

## Technical Details

### Color Schemes
- **Empirical data:** `rgba(100, 149, 237, 0.7)` (cornflower blue)
- **Fitted line:** `#DC143C` (crimson red)
- **1:1 reference:** `rgba(128, 0, 128, 0.5)` (purple, semi-transparent)
- **Observed vs Expected:** `#0000CD` (medium blue)
- **Likelihood gradient:** Cyan → Green → Yellow → Orange → Red

### Chart Dimensions
- All charts: 350px height (except profile likelihood at 400px)
- Responsive width (fills container)

### Legend Positioning
- Aligned to right, vertical layout
- Top positioning for better visibility

## Files Modified
- `src/components/OmoriLawPlot.tsx` - Main component with all three chart updates

## Testing Recommendations
1. Load the Aftershock Sequence Analysis tab
2. Select a significant earthquake (e.g., M5.0+)
3. Verify all three charts render correctly in the "Model Fit" tab
4. Check the "Parameters" tab shows the profile likelihood contour
5. Verify tooltips and legends display correctly
6. Test with different earthquake sequences to ensure robustness

