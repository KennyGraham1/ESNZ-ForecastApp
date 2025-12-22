import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { MainEventInfo, OmoriParameters } from '@/lib/analysis/omori';
import { GutenbergRichterResult } from '@/lib/analysis/gutenbergRichter';
import { exportChartToImage } from '@/utils/chartRegistry';

interface ReportData {
    mainEvent: MainEventInfo | null;
    earthquakeCount: number;
    omoriParams: OmoriParameters | null;
    grResult: GutenbergRichterResult | null;
    plotIds: {
        timeline: string;
        gr: string;
        omori: string;
        cumulative: string;
        threeD: string;
    };
    declusteringMethod?: string;
    declusteringParams?: { [key: string]: any };
}

export const generateAnalysisReport = async ({
    mainEvent,
    earthquakeCount,
    omoriParams,
    grResult,
    plotIds,
    declusteringMethod,
    declusteringParams
}: ReportData) => {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);

    let currentPage = 1;

    // Colors
    const primaryBlue = '#2563eb';
    const darkGray = '#1f2937';
    const mediumGray = '#6b7280';
    const lightGray = '#f3f4f6';

    // Helper: Add header to page
    const addHeader = () => {
        doc.setFontSize(10);
        doc.setTextColor(mediumGray);
        doc.setFont('helvetica', 'normal');
        doc.text('Aftershock Sequence Analysis Report', pageWidth / 2, 12, { align: 'center' });
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 15, pageWidth - margin, 15);
    };



    // Helper: Draw a table
    const drawTable = (headers: string[], rows: string[][], startY: number, columnWidths?: number[]) => {
        const tableWidth = contentWidth;
        const colCount = headers.length;
        const defaultColWidth = tableWidth / colCount;
        const colWidths = columnWidths || Array(colCount).fill(defaultColWidth);

        let y = startY;
        const baseRowHeight = 8;
        const padding = 2;

        // Header row
        doc.setFillColor(primaryBlue);
        doc.rect(margin, y, tableWidth, baseRowHeight, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);

        let x = margin;
        headers.forEach((header, i) => {
            doc.text(header, x + 2, y + 6);
            x += colWidths[i];
        });

        y += baseRowHeight;

        // Data rows
        doc.setTextColor(darkGray);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);

        rows.forEach((row, rowIndex) => {
            // Calculate wrapped lines for each cell to find the row height
            const wrappedCells = row.map((cell, i) => doc.splitTextToSize(cell, colWidths[i] - 4));
            const maxLines = Math.max(...wrappedCells.map(lines => Array.isArray(lines) ? lines.length : 1));
            const rowHeight = Math.max(baseRowHeight, (maxLines * 4.5) + (padding * 2));

            // Check for page break within table
            if (y + rowHeight > pageHeight - 20) {
                doc.addPage();
                currentPage++;
                addHeader();
                addHeader();
                y = 25;
                y = 25;

                // Re-draw header on new page
                doc.setFillColor(primaryBlue);
                doc.rect(margin, y, tableWidth, baseRowHeight, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                let hX = margin;
                headers.forEach((h, i) => {
                    doc.text(h, hX + 2, y + 6);
                    hX += colWidths[i];
                });
                y += baseRowHeight;
                doc.setTextColor(darkGray);
                doc.setFont('helvetica', 'normal');
            }

            // Alternating row colors
            if (rowIndex % 2 === 0) {
                doc.setFillColor(lightGray);
                doc.rect(margin, y, tableWidth, rowHeight, 'F');
            }

            x = margin;
            wrappedCells.forEach((lines, i) => {
                doc.text(lines, x + 2, y + 5);
                x += colWidths[i];
            });

            y += rowHeight;
        });

        // Border
        doc.setDrawColor(200, 200, 200);
        doc.rect(margin, startY, tableWidth, y - startY);

        return y;
    };

    // Helper: Add section header
    const addSection = (sectionNumber: string, title: string, y: number) => {
        if (y + 25 > pageHeight - margin) {
            doc.addPage();
            currentPage++;
            addHeader();
            addHeader();
            y = 25;
            y = 25;
        }
        doc.setFillColor(lightGray);
        doc.rect(margin, y, contentWidth, 10, 'F');
        doc.setTextColor(primaryBlue);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(`${sectionNumber}. ${title}`, margin + 3, y + 7);
        return y + 15;
    };

    // Helper: Add centered equation with overflow protection
    const addEquation = (text: string, y: number, options: { fontSize?: number; color?: string } = {}) => {
        const fontSize = options.fontSize || 12;
        const color = options.color || primaryBlue;

        doc.setFontSize(fontSize);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(color);

        // Ensure equation fits within content width
        const equationWidth = doc.getTextWidth(text);
        let finalFontSize = fontSize;
        let finalY = y;

        if (equationWidth > contentWidth) {
            // Scale down if it still overflows (unlikely but safe)
            const scaleFactor = contentWidth / equationWidth;
            finalFontSize = Math.floor(fontSize * scaleFactor);
            doc.setFontSize(finalFontSize);
        }

        doc.text(text, pageWidth / 2, finalY, { align: 'center' });
        return finalY + (finalFontSize * 0.82);
    };

    const addText = (text: string, y: number, options: { fontSize?: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right' } = {}) => {
        const fontSize = options.fontSize || 10;
        const bold = options.bold || false;
        const color = options.color || darkGray;
        const align = options.align || 'left';

        doc.setFontSize(fontSize);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setTextColor(color);

        const lines = doc.splitTextToSize(text, contentWidth);
        const lineHeight = fontSize * 0.45;

        lines.forEach((line: string) => {
            if (y + lineHeight > pageHeight - margin) {
                doc.addPage();
                currentPage++;


                y = 25;
                // Re-apply style after page break
                doc.setFontSize(fontSize);
                doc.setFont('helvetica', bold ? 'bold' : 'normal');
                doc.setTextColor(color);
            }
            const xPos = align === 'center' ? pageWidth / 2 : (align === 'right' ? pageWidth - margin : margin);
            doc.text(line, xPos, y, { align });
            y += lineHeight;
        });

        return y + 2;
    };

    // Mapping from report element IDs to chart registry IDs
    const chartIdMapping: Record<string, string> = {
        'report-gr': 'gr-plot',
        'report-timeline': 'timeline-plot',
        'report-depth': 'depth-plot',
        'report-map': 'map-plot',
        'report-omori': 'omori-plot',
        'report-omori-counts': 'omori-counts-plot',
        'report-omori-cumulative': 'omori-cumulative-plot',
        'report-cumulative': 'cumulative-plot'
    };

    // Helper: Capture and add plot (ONE PLOT PER PAGE)
    // Uses native Highcharts export for registered charts, falls back to html2canvas
    const addPlotOnNewPage = async (elementId: string, title: string, description?: string) => {
        doc.addPage();
        currentPage++;
        addHeader();

        let y = 30;

        try {
            // Map report ID to registry ID and try native export
            const registryId = chartIdMapping[elementId] || elementId;
            let imgData = await exportChartToImage(registryId, 2);

            // Fallback to html2canvas if chart not in registry
            if (!imgData) {
                const element = document.getElementById(elementId);
                if (!element) {
                    console.warn(`Plot element not found: ${elementId}`);
                    y = addText(`[Plot not available: ${title}]`, y, { color: '#ef4444' });
                    y = addText(`[Plot not available: ${title}]`, y, { color: '#ef4444' });
                    return;
                }

                const canvas = await html2canvas(element, {
                    scale: 3, // Increased scale for better quality
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                });
                imgData = canvas.toDataURL('image/png');
            }

            const imgProps = doc.getImageProperties(imgData);

            // Calculate dimensions to fit within page
            const maxWidth = contentWidth;
            const maxHeight = pageHeight - 80;

            let imgWidth = maxWidth;
            let imgHeight = (imgProps.height * imgWidth) / imgProps.width;

            if (imgHeight > maxHeight) {
                imgHeight = maxHeight;
                imgWidth = (imgProps.width * imgHeight) / imgProps.height;
            }

            // Add figure title
            y = addText(title, y, { fontSize: 12, bold: true, color: primaryBlue });
            y += 5;

            // Add description
            if (description) {
                y = addText(description, y, { fontSize: 10, color: mediumGray });
                y += 5;
            }

            // Add image centered
            const xOffset = margin + (contentWidth - imgWidth) / 2;
            doc.addImage(imgData, 'PNG', xOffset, y, imgWidth, imgHeight);
        } catch (err) {
            console.error(`Error adding plot ${elementId}:`, err);
            y = addText(`[Error rendering ${title}]`, y, { color: '#ef4444' });
        }
    };

    // ===========================================
    // COVER PAGE
    // ===========================================

    // Logo area
    doc.setFillColor(primaryBlue);
    doc.rect(0, 0, pageWidth, 60, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.text('Aftershock Sequence', pageWidth / 2, 30, { align: 'center' });
    doc.setFontSize(24);
    doc.text('Analysis Report', pageWidth / 2, 45, { align: 'center' });

    // Main event detailed info box
    let yPos = 80;
    if (mainEvent) {
        doc.setFillColor(lightGray);
        doc.roundedRect(margin, yPos, contentWidth, 70, 3, 3, 'F');

        doc.setTextColor(primaryBlue);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Main Event Information', margin + 5, yPos + 12);

        doc.setTextColor(darkGray);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(mainEvent.name, margin + 5, yPos + 26);

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        const eventDate = mainEvent.time.toLocaleDateString('en-NZ', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const eventTime = mainEvent.time.toLocaleTimeString('en-NZ', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
        });
        doc.text(`Date: ${eventDate}`, margin + 5, yPos + 38);
        doc.text(`Time: ${eventTime}`, margin + 5, yPos + 46);
        doc.text(`Magnitude: M${mainEvent.magnitude.toFixed(1)} (Moment Magnitude)`, margin + 5, yPos + 54);

        if (mainEvent.latitude && mainEvent.longitude) {
            doc.text(`Location: ${mainEvent.latitude.toFixed(4)}°${mainEvent.latitude >= 0 ? 'N' : 'S'}, ${mainEvent.longitude.toFixed(4)}°${mainEvent.longitude >= 0 ? 'E' : 'W'}`, margin + 5, yPos + 62);
        }
    }

    yPos = 160;

    // Report metadata with more detail
    const metaData = [
        ['Report Type:', 'Comprehensive Seismic Aftershock Sequence Analysis'],
        ['Analysis Period:', earthquakeCount > 0 ? `${earthquakeCount} aftershock events analyzed` : 'N/A'],
        ['Generated:', new Date().toLocaleString('en-NZ', { dateStyle: 'full', timeStyle: 'long' })],
        ['Software:', 'ESNZ ForecastApp v1.0'],
        ['Analysis Methods:', 'Gutenberg-Richter, Omori-Utsu Law, Statistical Modeling'],
        ['Declustering:', declusteringMethod || 'N/A']
    ];

    if (declusteringParams && Object.keys(declusteringParams).length > 0) {
        Object.entries(declusteringParams).forEach(([key, value]) => {
            metaData.push([`  - ${key}:`, value.toString()]);
        });
    }

    yPos = drawTable(['Field', 'Value'], metaData, yPos, [70, contentWidth - 70]) + 10;

    // Footer on cover
    doc.setFontSize(10);
    doc.setTextColor(mediumGray);
    doc.text('Earthquake and Seismic Hazard Analysis • New Zealand', pageWidth / 2, pageHeight - 20, { align: 'center' });
    doc.setFontSize(8);
    doc.text('This report is auto-generated and should be reviewed by a qualified seismologist', pageWidth / 2, pageHeight - 14, { align: 'center' });

    // ===========================================
    // PAGE 2: EXECUTIVE SUMMARY
    // ===========================================
    doc.addPage();
    currentPage++;
    addHeader();

    yPos = 30;

    yPos = addSection('1', 'Executive Summary', yPos);
    yPos = addText(
        `This comprehensive report presents a detailed statistical analysis of the aftershock sequence following the ${mainEvent?.name || 'selected seismic event'}. ` +
        `The mainshock occurred on ${mainEvent?.time.toLocaleDateString('en-NZ', { dateStyle: 'full' })} with a moment magnitude of M${mainEvent?.magnitude.toFixed(1)}. ` +
        `A total of ${earthquakeCount} aftershock events were recorded and analyzed using state-of-the-art seismological methods.`,
        yPos
    );
    yPos += 10;

    yPos = addText(
        'The analysis employs three fundamental seismological relationships:',
        yPos,
        { bold: true }
    );
    yPos += 5;

    yPos = addText(
        '• Gutenberg-Richter Law: Characterizes the frequency-magnitude distribution of earthquakes, providing insights into the scaling behavior of seismicity.',
        yPos
    );
    yPos += 6;

    yPos = addText(
        '• Omori-Utsu Law: Models the temporal decay of aftershock activity, describing how the rate of aftershocks decreases with time following the mainshock.',
        yPos
    );
    yPos += 6;

    yPos = addText(
        '• Cumulative Event Analysis: Tracks the total number of aftershocks over time, comparing observed patterns with theoretical predictions.',
        yPos
    );
    yPos += 12;

    yPos = addText(
        'Key Findings Summary:',
        yPos,
        { fontSize: 12, bold: true, color: primaryBlue }
    );
    yPos += 5;

    if (grResult) {
        yPos = addText(
            `• The b-value of ${grResult.bValue.toFixed(2)} ${grResult.bValue < 0.9 ? '(below typical range, indicating stress heterogeneity)' : grResult.bValue > 1.1 ? '(above typical range, suggesting diverse rupture processes)' : '(within normal range for tectonic regions)'} was determined from ${grResult.earthquakesAboveMc} events above the magnitude of completeness (Mc = ${grResult.magnitudeOfCompleteness.toFixed(1)}).`,
            yPos
        );
        yPos += 6;
    }

    if (omoriParams) {
        yPos = addText(
            `• Aftershock decay follows the Omori-Utsu law with p-value = ${omoriParams.p.toFixed(2)} ${omoriParams.p < 1.0 ? '(slower than classical Omori decay)' : omoriParams.p > 1.3 ? '(faster decay, potentially indicating stress relaxation)' : '(typical decay rate)'}, using ${omoriParams.optimizationMethod} optimization method.`,
            yPos
        );
        yPos += 6;
    }

    yPos += 10;
    yPos = addText(
        'The following sections provide detailed analysis, visualizations, and statistical parameters for each component of this comprehensive aftershock sequence study.',
        yPos,
        { fontSize: 10, color: mediumGray }
    );



    // ===========================================
    // GUTENBERG-RICHTER ANALYSIS
    // ===========================================
    if (grResult) {
        doc.addPage();
        currentPage++;
        addHeader();
        yPos = 30;

        yPos = addSection('2', 'Gutenberg-Richter Analysis', yPos);
        yPos = addText(
            'The Gutenberg-Richter law describes the relationship between earthquake magnitude and frequency. ' +
            'The b-value (typically ~1.0) represents the proportion of small to large earthquakes, ' +
            'while the a-value characterizes overall seismicity.',
            yPos
        );
        yPos += 10;

        const { bValue, aValue, magnitudeOfCompleteness, rSquared, earthquakesAboveMc } = grResult;

        // More detailed parameter table
        const grParams = [
            ['b-value', bValue.toFixed(3), 'Magnitude-frequency distribution slope'],
            ['a-value', aValue.toFixed(2), 'Productivity parameter'],
            ['Mc', magnitudeOfCompleteness.toFixed(1), 'Magnitude of completeness'],
            ['R-squared', rSquared.toFixed(4), 'Goodness of fit'],
            ['Events >= Mc', earthquakesAboveMc.toString(), 'Events above completeness'],
            ['Method', 'Max Curvature', 'Mc estimation technique']
        ];

        yPos = drawTable(['Parameter', 'Value', 'Description'], grParams, yPos, [35, 25, contentWidth - 60]) + 10;

        yPos = addText(
            'Statistical Relationship:',
            yPos,
            { bold: true, fontSize: 11 }
        );
        yPos += 2;

        yPos = addEquation(
            `log10(N) = ${aValue.toFixed(2)} - ${bValue.toFixed(2)} x M`,
            yPos
        );
        yPos += 6;

        yPos = addText(
            `Interpretation: The b-value of ${bValue.toFixed(2)} indicates ${bValue < 1.0 ? 'a larger proportion of higher magnitude events' : 'a typical frequency-magnitude distribution'}. The R-squared value of ${rSquared.toFixed(3)} demonstrates a good fit.`,
            yPos,
            { fontSize: 10 }
        );



        // GR Plot on its own page
        await addPlotOnNewPage(
            plotIds.gr,
            'Figure 1: Gutenberg-Richter Frequency-Magnitude Distribution',
            'Cumulative frequency-magnitude distribution showing the number of earthquakes with magnitude >= M. ' +
            'Blue circles represent observed data, the red line shows the best-fit relationship.'
        );
    }

    // ===========================================
    // AFTERSHOCK TIMELINE
    // ===========================================
    // AFTERSHOCK TIMELINE & CHARACTERISTICS
    // ===========================================
    await addPlotOnNewPage(
        plotIds.timeline,
        'Figure 2a: Aftershock Sequence Timeline',
        'Magnitude versus time since mainshock. Marker size is proportional to magnitude.'
    );

    // Depth Profile on new page
    await addPlotOnNewPage(
        'report-depth',
        'Figure 2b: Magnitude vs Depth',
        'Distribution of event magnitudes with depth. Shows the depth range of the aftershock sequence.'
    );

    // Map on new page (if available)
    await addPlotOnNewPage(
        'report-map',
        'Figure 2c: Aftershock Locations',
        'Spatial distribution of aftershocks. The mainshock is highlighted, and Polygon selection area (if used) is shown.'
    );

    // ===========================================
    // OMORI-UTSU LAW ANALYSIS
    // ===========================================
    if (omoriParams) {
        doc.addPage();
        currentPage++;
        addHeader();
        yPos = 30;

        yPos = addSection('3', 'Omori-Utsu Law Analysis', yPos);
        yPos = addText(
            'The Modified Omori Law characterizes the temporal decay of aftershock activity. ' +
            'It describes how the rate of aftershocks decreases with time following the mainshock.',
            yPos
        );
        yPos += 10;

        const { K, c, p, optimizationMethod } = omoriParams;

        // Detailed Omori parameters
        const omoriTable = [
            ['K (Productivity)', K.toFixed(2), 'Expected number of aftershocks in first day'],
            ['c (Time offset)', `${c.toFixed(3)} days`, 'Early-time correction parameter (prevents singularity at t=0)'],
            ['p (Decay rate)', p.toFixed(3), 'Power-law decay exponent (classical Omori p=1)'],
            ['Optimization', optimizationMethod || 'Maximum Likelihood', 'Parameter estimation method'],
            ['Analysis Period', `${earthquakeCount} events`, 'Total aftershocks analyzed']
        ];

        yPos = drawTable(['Parameter', 'Value', 'Description'], omoriTable, yPos, [45, 35, contentWidth - 80]) + 10;

        yPos = addText(
            'Modified Omori-Utsu Law:',
            yPos,
            { bold: true, fontSize: 11 }
        );
        yPos += 2;

        yPos = addEquation(
            `n(t) = ${K.toFixed(2)} / (t + ${c.toFixed(3)})^${p.toFixed(2)}`,
            yPos
        );
        yPos += 6;

        yPos = addText(
            `Analysis: The p-value of ${p.toFixed(2)} ${p < 1.0 ? 'is below 1.0, suggesting slower-than-classical decay which may indicate continued stress loading or a complex fault system' : p > 1.3 ? 'indicates faster-than-typical decay, possibly due to rapid stress relaxation or fluid migration' : 'is consistent with standard aftershock decay behavior'}. ` +
            `The productivity parameter K = ${K.toFixed(0)} suggests ${K > 100 ? 'high aftershock productivity' : K > 50 ? 'moderate aftershock activity' : 'relatively low aftershock productivity'} for an event of this magnitude.`,
            yPos,
            { fontSize: 10 }
        );



        // Omori plots on individual pages
        await addPlotOnNewPage(
            'report-omori-counts',
            'Figure 3a: Observed vs Expected Aftershock Counts',
            'Bar chart showing observed daily counts compared with Omori-Utsu model fit.'
        );

        await addPlotOnNewPage(
            'report-omori-cumulative',
            'Figure 3b: Cumulative Observed vs Expected',
            'Q-Q style comparison of cumulative observed and expected counts. Deviation from 1:1 line indicates model misfit.'
        );

        await addPlotOnNewPage(
            'report-omori',
            'Figure 3c: Daily Aftershock Rate (Log-Log)',
            'Daily aftershock rate on log-log scales. Points are observed counts, line is the fitted model.'
        );
    }

    // ===========================================
    // CUMULATIVE ANALYSIS
    // ===========================================
    await addPlotOnNewPage(
        plotIds.cumulative,
        'Figure 4: Cumulative Aftershock Count',
        'Total number of aftershocks over time since the mainshock.'
    );

    // Replace placeholder with actual page count
    // ===========================================
    // ADD FOOTERS TO ALL PAGES
    // ===========================================
    const totalPages = doc.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        const footerY = pageHeight - 10;
        doc.setFontSize(8);
        doc.setTextColor(mediumGray);
        doc.setFont('helvetica', 'normal');

        // Page number
        const pageText = `Page ${i} of ${totalPages}`;
        doc.text(pageText, pageWidth - margin, footerY, { align: 'right' });

        // Generation date (skip on cover page if desired)
        if (i > 1) {
            const dateText = `Generated: ${new Date().toLocaleDateString()}`;
            doc.text(dateText, margin, footerY);

            // Line above footer
            doc.setDrawColor(200, 200, 200);
            doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
        }
    }

    // Save the PDF
    const filename = `Aftershock_Analysis_${mainEvent?.name.replace(/[^a-z0-9]/gi, '_') || 'Report'}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
};
