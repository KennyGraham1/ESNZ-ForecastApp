# ESNZ-ForecastApp

**ESNZ-ForecastApp** is a comprehensive web application for earthquake analysis and forecasting, specifically designed for New Zealand seismicity. The application provides advanced statistical analysis, visualization, and forecasting tools for seismologists, researchers, and anyone interested in understanding earthquake patterns and aftershock sequences.

## Overview

ESNZ-ForecastApp leverages real-time earthquake data from [GeoNet](https://www.geonet.org.nz/) to provide interactive visualizations and statistical analyses of seismic activity across New Zealand. The application features a high-performance caching system, advanced clustering algorithms, and specialized tools for aftershock sequence analysis.

## Key Features

### 📊 **Basic Analysis**
- **Interactive Earthquake Map**: Visualize earthquake locations across New Zealand with color-coded magnitude indicators
- **Statistical Summary**: Real-time statistics including total events, magnitude ranges, depth distributions, and temporal patterns
- **Temporal Analysis**: Time-series visualizations showing earthquake frequency and patterns over time
- **Magnitude Distribution**: Histogram analysis of earthquake magnitudes

### 🔬 **Advanced Statistical Analysis**
- **Gutenberg-Richter Analysis**: Frequency-magnitude distribution analysis with automatic b-value calculation using Maximum Curvature or Goodness of Fit methods
- **Depth Profile Analysis**: 3D visualization of earthquake depth distributions and magnitude relationships
- **Spatial Clustering**: Multiple clustering algorithms to identify earthquake clusters:
  - **DBSCAN** - Density-based clustering for arbitrary-shaped clusters
  - **OPTICS** - Variable density clustering for complex patterns
  - **K-Means** - Partition-based clustering
  - **Hierarchical Clustering** - Single, Complete, Average, and Ward linkage methods
  - **Nearest-Neighbor** - Zaliapin-Ben-Zion method specifically designed for seismology
- **3D Visualization**: Interactive 3D scatter plots of earthquake locations, depths, and magnitudes
- **Temporal Statistics**: Detailed time-based analysis including hourly, daily, and monthly patterns

### 🌊 **Aftershock Sequence Analysis**
- **Historical Event Selection**: Pre-configured analysis for major New Zealand earthquakes (Kaikōura 2016, Christchurch 2011, Canterbury 2010, etc.)
- **Custom Main Event Input**: Analyze aftershock sequences for any earthquake by specifying location, magnitude, and time
- **Gardner-Knopoff Declustering**: Automatic identification of independent mainshocks vs. dependent aftershocks
- **Omori's Law Fitting**: Calculate decay parameters (K, c, p) for aftershock sequences with visual fitting
- **Interactive Timeline**: Magnitude vs. time visualization with zoom-to-filter capability
- **Depth Analysis**: Magnitude vs. depth relationships for aftershock sequences
- **Synchronized Map View**: Spatial distribution of aftershocks with timeline synchronization
- **Polygon Selection**: Draw custom regions to filter earthquakes by spatial area

### 🔗 **Temporal-Spatial Analysis**
- **Linked Visualizations**: Synchronized temporal and spatial plots with interactive selection
- **Cluster-Based Filtering**: Select earthquakes by cluster membership
- **Real-time Clustering**: Apply multiple clustering algorithms with adjustable parameters
- **Export Capabilities**: Export charts as PNG, JPEG, SVG, or data as CSV/JSON with clustering metadata

## Technologies Used

### Frontend
- **[Next.js 13](https://nextjs.org/)** - React framework with App Router
- **[React 18](https://react.dev/)** - UI library
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Highcharts](https://www.highcharts.com/)** - Interactive charting library with map support

### Data & Analysis
- **[TanStack Query (React Query)](https://tanstack.com/query)** - Data fetching and caching
- **[density-clustering](https://www.npmjs.com/package/density-clustering)** - DBSCAN, OPTICS, K-Means algorithms
- **[simple-statistics](https://simplestatistics.org/)** - Statistical computations
- **[ml-levenberg-marquardt](https://www.npmjs.com/package/ml-levenberg-marquardt)** - Non-linear curve fitting for Omori's Law
- **[RBush](https://github.com/mourner/rbush)** - R-tree spatial indexing for 90-95% faster clustering
- **[Proj4](https://proj4.org/)** - Coordinate transformations for map projections

### Performance Optimizations
- **Server-side caching** with incremental updates
- **Web Workers** for non-blocking clustering computations
- **R-tree spatial indexing** for efficient nearest-neighbor searches
- **Stratified sampling** for large datasets
- **Memoization** of expensive calculations
- **Pre-computed timestamps** for 95% faster filtering

## Getting Started

### Prerequisites
- Node.js 18+ or compatible runtime (Yarn, pnpm, Bun)
- npm or alternative package manager

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ESNZ-ForecastAppAntigrav
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

### Building for Production

```bash
npm run build
npm start
```

## Usage

### Basic Workflow

1. **Load Data**: The application automatically loads cached earthquake data from GeoNet
2. **Apply Filters**: Use the filter controls to select time range, magnitude range, and depth categories
3. **Explore Tabs**:
   - **Basic**: Overview statistics, map, and temporal analysis
   - **Advanced Statistics**: Gutenberg-Richter, depth profiles, clustering, 3D visualization
   - **Aftershock Sequence**: Analyze aftershock patterns for historical or custom events
   - **Temporal-Spatial**: Linked visualizations with interactive clustering

4. **Export Data**: Use export buttons on charts to save visualizations or data in various formats

### Aftershock Analysis

1. Navigate to the **Aftershock Sequence** tab
2. Click **"Show Historical Events"** to select a major earthquake, or manually enter main event details
3. Click **"Analyze Aftershocks"** to generate:
   - Timeline plot (magnitude vs. time)
   - Depth plot (magnitude vs. depth)
   - Interactive map with aftershock locations
   - Omori's Law decay analysis
4. Use zoom and selection tools to explore specific time periods or spatial regions

### Clustering Analysis

1. Navigate to **Advanced Statistics** or **Temporal-Spatial** tabs
2. Select a clustering algorithm from the dropdown
3. Adjust parameters (epsilon, minSamples, k, etc.)
4. View results with color-coded clusters
5. Export clustering results with metadata

## Data Source

Earthquake data is provided by **[GeoNet](https://www.geonet.org.nz/)**, New Zealand's geological hazard information system. The application uses GeoNet's public API to fetch earthquake catalog data.

## Performance Features

- **Intelligent Caching**: Server-side cache with automatic incremental updates
- **Lazy Loading**: Charts render only when their tab is active
- **Web Workers**: Heavy computations run in background threads
- **Optimized Filtering**: Pre-computed timestamps and server-side filtering reduce data transfer by up to 95%
- **Spatial Indexing**: R-tree data structures accelerate clustering by 90-95%

## Development

### Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes (earthquake data caching)
│   └── page.tsx           # Main application page
├── components/            # React components
│   ├── tabs/             # Tab-specific components
│   └── ...               # Reusable components (charts, maps, etc.)
├── lib/                   # Core libraries
│   ├── analysis/         # Statistical analysis functions
│   └── monitoring/       # Performance monitoring
├── hooks/                 # Custom React hooks
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions
└── config/               # Configuration files
```

### Testing

```bash
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

### Linting

```bash
npm run lint
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This project is private and proprietary.

## Acknowledgments

- **GeoNet** for providing comprehensive earthquake data for New Zealand
- **Next.js** team for the excellent React framework
- **Highcharts** for powerful visualization capabilities
- The seismology research community for statistical methods and algorithms

---

**Note**: This application is designed for research and educational purposes. For official earthquake information and warnings, please refer to [GeoNet](https://www.geonet.org.nz/) and [Civil Defence](https://www.civildefence.govt.nz/).
