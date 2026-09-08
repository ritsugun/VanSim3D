import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Container, PackedItem, PackingMetrics, UnplacedItem, ContainerLoad, OverallPackingMetrics, UnitSystem, Language } from '../types';
import { formatDimensions, formatCoordinates, formatWeightCompact } from './units';

export interface PdfExportOptions {
  container: Container;
  containers?: ContainerLoad[];
  packedItems: PackedItem[];
  metrics: PackingMetrics;
  overallMetrics?: OverallPackingMetrics;
  unplacedItems?: UnplacedItem[];
  activeContainerIndex?: number | 'all';
  language: Language;
  unitSystem: UnitSystem;
  algorithmName?: string;
  hasManualAdjustments?: boolean;
  includeDiagrams?: boolean;
  includeSummaryTable?: boolean;
  includeStepTable?: boolean;
  includeSignoff?: boolean;
  orientation?: 'landscape' | 'portrait';
  documentTitle?: string;
  notes?: string;
}

// In-memory cache for Japanese TTF font base64
let cachedFontBase64: string | null = null;
let isFontLoading = false;

/**
 * Fetch and cache the Japanese font from the backend endpoint
 */
export async function preloadJapaneseFont(): Promise<string | null> {
  if (cachedFontBase64) return cachedFontBase64;
  if (isFontLoading) {
    // Wait for in-progress load
    while (isFontLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return cachedFontBase64;
  }

  try {
    isFontLoading = true;
    const response = await fetch('/api/font/japanese');
    if (!response.ok) {
      console.warn('Could not fetch Japanese font, falling back to standard font');
      isFontLoading = false;
      return null;
    }
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        // Strip data:font/ttf;base64, header if present
        const base64 = base64data.includes(',') ? base64data.split(',')[1] : base64data;
        cachedFontBase64 = base64;
        isFontLoading = false;
        resolve(base64);
      };
      reader.onerror = () => {
        isFontLoading = false;
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Failed to load font:', err);
    isFontLoading = false;
    return null;
  }
}

/**
 * Render a high-resolution 2D schematic of the container cargo layout onto a canvas
 */
export function renderContainer2DView(
  container: Container,
  items: PackedItem[],
  view: 'top' | 'side',
  cog?: { x: number; y: number; z: number }
): string {
  const canvas = document.createElement('canvas');
  const width = 1400;
  const height = 440;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Title & Header bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, 36);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  const viewTitle = view === 'top' 
    ? `TOP-DOWN FLOOR PLAN (X-Length vs Y-Width) | Cargo Footprint & Door Access`
    : `SIDE ELEVATION PLAN (X-Length vs Z-Height) | Vertical Stacking Layers & Height`;
  ctx.fillText(viewTitle, 16, 24);

  // Drawing area dimensions
  const padLeft = 80;
  const padRight = 80;
  const padTop = 60;
  const padBottom = 60;
  const drawW = width - padLeft - padRight;
  const drawH = height - padTop - padBottom;

  // Scaling
  const cLen = container.length; // X
  const cDim2 = view === 'top' ? container.width : container.height; // Y or Z
  const scaleX = drawW / cLen;
  const scaleY = drawH / cDim2;

  // Container Outer Boundary Box
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(padLeft, padTop, drawW, drawH);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.strokeRect(padLeft, padTop, drawW, drawH);

  // Container Walls and Door Indication
  // Door is at X = 0 (Left side), Front bulkhead is at X = cLen (Right side)
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(padLeft - 10, padTop, 10, drawH); // Door edge
  ctx.fillStyle = '#64748b';
  ctx.fillRect(padLeft + drawW, padTop, 10, drawH); // Front wall

  // Door label
  ctx.fillStyle = '#1d4ed8';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('<-- REAR DOOR (扉面)', padLeft - 35, padTop + drawH / 2);

  // Front wall label
  ctx.fillStyle = '#475569';
  ctx.fillText('FRONT BULKHEAD (奥面) -->', padLeft + drawW + 40, padTop + drawH / 2);

  // Grid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  const numGridX = Math.floor(cLen / 1000);
  for (let i = 1; i <= numGridX; i++) {
    const gx = padLeft + i * 1000 * scaleX;
    ctx.beginPath();
    ctx.moveTo(gx, padTop);
    ctx.lineTo(gx, padTop + drawH);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(`${i}m`, gx, padTop + drawH + 16);
  }

  // Draw Cargo Items
  items.forEach((item) => {
    const itemX = item.x;
    const itemDim2 = view === 'top' ? item.y : item.z;
    const itemLen = item.length;
    const itemDim2Len = view === 'top' ? item.width : item.height;

    const px = padLeft + itemX * scaleX;
    // In canvas, Y=0 is at top, but container Y=0 is bottom or left wall
    const py = padTop + drawH - (itemDim2 + itemDim2Len) * scaleY;
    const pw = itemLen * scaleX;
    const ph = itemDim2Len * scaleY;

    // Box fill
    ctx.fillStyle = item.color || '#3b82f6';
    ctx.fillRect(px, py, pw, ph);

    // Box border
    ctx.strokeStyle = item.isManual ? '#f59e0b' : '#0f172a';
    ctx.lineWidth = item.isManual ? 2 : 1;
    ctx.strokeRect(px, py, pw, ph);

    // Label if box is big enough
    if (pw > 28 && ph > 18) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`#${item.sequenceNumber}`, px + pw / 2, py + ph / 2 + 4);
    }
  });

  // Center of Gravity (CoG) Marker
  if (cog) {
    const cogX = cog.x;
    const cogDim2 = view === 'top' ? cog.y : cog.z;
    const cogPx = padLeft + cogX * scaleX;
    const cogPy = padTop + drawH - cogDim2 * scaleY;

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cogPx, cogPy, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cogPx - 14, cogPy);
    ctx.lineTo(cogPx + 14, cogPy);
    ctx.moveTo(cogPx, cogPy - 14);
    ctx.lineTo(cogPx, cogPy + 14);
    ctx.stroke();

    ctx.fillStyle = '#b91c1c';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`CoG: ${Math.round(cogX)}mm`, cogPx + 12, cogPy - 4);
  }

  // Dimensions footer annotation
  ctx.fillStyle = '#334155';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  const dim2Name = view === 'top' ? 'Width (W)' : 'Height (H)';
  ctx.fillText(
    `Container: ${container.name} | L: ${container.length.toLocaleString()}mm × ${dim2Name}: ${cDim2.toLocaleString()}mm | Items Placed: ${items.length} units`,
    padLeft,
    height - 18
  );

  return canvas.toDataURL('image/png');
}

/**
 * Main export function: Generates a complete, professional warehouse loading manifest PDF
 */
export async function exportWarehouseLoadingManifestPdf(options: PdfExportOptions): Promise<void> {
  const {
    container,
    containers,
    packedItems,
    metrics,
    overallMetrics,
    unplacedItems = [],
    activeContainerIndex = 'all',
    language = 'ja',
    unitSystem = 'metric',
    algorithmName = 'Extreme Points 3D (BFD)',
    hasManualAdjustments = false,
    includeDiagrams = true,
    includeSummaryTable = true,
    includeStepTable = true,
    includeSignoff = true,
    orientation = 'landscape',
    documentTitle,
    notes = ''
  } = options;

  const isJa = language === 'ja';
  const hasMultipleContainers = !!(containers && containers.length > 1);

  // Pre-load Japanese font
  const fontBase64 = await preloadJapaneseFont();

  // Create jsPDF instance
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const fontName = fontBase64 ? 'IPAGothic' : 'helvetica';
  if (fontBase64) {
    doc.addFileToVFS('IPAGothic.ttf', fontBase64);
    doc.addFont('IPAGothic.ttf', 'IPAGothic', 'normal');
    doc.setFont('IPAGothic');
  }

  const pageWidth = orientation === 'landscape' ? 297 : 210;
  const pageHeight = orientation === 'landscape' ? 210 : 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  // Target items to display in manifest
  const targetItems = (hasMultipleContainers && activeContainerIndex !== 'all')
    ? (containers?.find(c => c.containerIndex === Number(activeContainerIndex))?.packedItems || packedItems)
    : (hasMultipleContainers ? containers!.flatMap(c => c.packedItems) : packedItems);

  // Cumulative weights map
  const cumulativeWeightMap = new Map<number, number>();
  let runningWeight = 0;
  targetItems.forEach(item => {
    runningWeight += item.weight;
    cumulativeWeightMap.set(item.sequenceNumber, runningWeight);
  });

  // Unique SKU summary for Bill of Items
  const skuSummaryMap = new Map<string, {
    sku: string;
    name: string;
    length: number;
    width: number;
    height: number;
    weight: number;
    count: number;
    totalWeight: number;
    fragile: boolean;
    floorPlacement: boolean;
    color: string;
  }>();

  targetItems.forEach(item => {
    const existing = skuSummaryMap.get(item.sku);
    if (existing) {
      existing.count += 1;
      existing.totalWeight += item.weight;
    } else {
      skuSummaryMap.set(item.sku, {
        sku: item.sku,
        name: item.name,
        length: item.length,
        width: item.width,
        height: item.height,
        weight: item.weight,
        count: 1,
        totalWeight: item.weight,
        fragile: item.fragile,
        floorPlacement: !!item.floorPlacement,
        color: item.color
      });
    }
  });

  const skuList = Array.from(skuSummaryMap.values());
  const now = new Date();
  const manifestId = `CLM-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
  const dateFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // ==========================================
  // PAGE 1: HEADER & KEY WAREHOUSE METRICS
  // ==========================================
  let currentY = margin;

  // Header Banner Background
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, currentY, contentWidth, 22, 'F');

  // Accent line
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(margin, currentY + 21, contentWidth, 1.5, 'F');

  // Document Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  const mainTitleText = documentTitle || (isJa 
    ? 'コンテナ積載作業指示書・マニフェスト (STOWAGE PLAN & LOADING GUIDE)' 
    : 'CONTAINER STOWAGE PLAN & WAREHOUSE LOADING MANIFEST');
  doc.text(mainTitleText, margin + 6, currentY + 9);

  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(
    isJa 
      ? `現場作業員・フォークリフト積載指示書 | 国際規格 ISO 1496-1 準拠 | 重量配分・積載順序公認文書`
      : `Official Warehouse Dispatch & Inspection Document | ISO 1496-1 Standard Compliant`,
    margin + 6,
    currentY + 16
  );

  // Manifest Reference Tag (Right aligned)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(`REF: ${manifestId}`, pageWidth - margin - 6, currentY + 9, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`ISSUED: ${dateFormatted}`, pageWidth - margin - 6, currentY + 16, { align: 'right' });

  currentY += 26;

  // Container & Operation Specs Bar
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, currentY, contentWidth, 14, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);

  const containerText = `${isJa ? '対象コンテナ:' : 'Container:'} ${container.name}`;
  const dimText = `${isJa ? '内寸:' : 'Dims:'} L ${container.length.toLocaleString()} × W ${container.width.toLocaleString()} × H ${container.height.toLocaleString()} mm`;
  const tareText = `${isJa ? '自重/最大荷重:' : 'Tare/Max:'} ${container.tareWeight.toLocaleString()} kg / ${container.maxWeight.toLocaleString()} kg`;
  const algoText = `${isJa ? '計算エンジン:' : 'Engine:'} ${algorithmName} ${hasManualAdjustments ? (isJa ? '(★手動微調整あり)' : '(★Manual Adjusted)') : ''}`;

  doc.text(containerText, margin + 4, currentY + 5.5);
  doc.text(dimText, margin + 80, currentY + 5.5);
  doc.text(tareText, margin + 4, currentY + 10.5);
  doc.text(algoText, margin + 80, currentY + 10.5);

  currentY += 17;

  // Warehouse KPI Metrics Summary Cards
  const kpiCardW = (contentWidth - 9) / 4;
  const kpiCardH = 18;

  // 1. Cargo Volume Utilization Card
  doc.setFillColor(239, 246, 255); // blue-50
  doc.setDrawColor(191, 219, 254);
  doc.rect(margin, currentY, kpiCardW, kpiCardH, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(30, 64, 175);
  doc.text(isJa ? '容積積載率 (VOLUME)' : 'VOLUME UTILIZATION', margin + 4, currentY + 5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${metrics.volumeUtilization.toFixed(1)}%`, margin + 4, currentY + 11.5);
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${metrics.packedVolumeCbm.toFixed(2)} m³ / ${metrics.containerVolumeCbm.toFixed(2)} m³`, margin + 4, currentY + 15.5);

  // 2. Cargo Weight Utilization Card
  const kpi2X = margin + kpiCardW + 3;
  doc.setFillColor(240, 253, 244); // emerald-50
  doc.setDrawColor(187, 247, 208);
  doc.rect(kpi2X, currentY, kpiCardW, kpiCardH, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(22, 101, 52);
  doc.text(isJa ? '重量積載率 (PAYLOAD)' : 'WEIGHT UTILIZATION', kpi2X + 4, currentY + 5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${metrics.weightUtilization.toFixed(1)}%`, kpi2X + 4, currentY + 11.5);
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${metrics.packedWeightKg.toLocaleString()} kg / ${metrics.containerMaxWeightKg.toLocaleString()} kg`, kpi2X + 4, currentY + 15.5);

  // 3. Center of Gravity & Balance Card
  const kpi3X = kpi2X + kpiCardW + 3;
  doc.setFillColor(254, 243, 199); // amber-50
  doc.setDrawColor(253, 230, 138);
  doc.rect(kpi3X, currentY, kpiCardW, kpiCardH, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(146, 64, 14);
  doc.text(isJa ? '3D重心位置 (CoG mm)' : 'CENTER OF GRAVITY (CoG)', kpi3X + 4, currentY + 5);
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  const cog = metrics.centerOfGravity;
  doc.text(`X:${Math.round(cog.x)} Y:${Math.round(cog.y)} Z:${Math.round(cog.z)}`, kpi3X + 4, currentY + 11.5);
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  const xOffset = cog.offsetXPercent.toFixed(1);
  doc.text(`${isJa ? '前後オフセット:' : 'Front-Back Offset:'} ${xOffset}% (±5% SAFE)`, kpi3X + 4, currentY + 15.5);

  // 4. Quantity & Units Card
  const kpi4X = kpi3X + kpiCardW + 3;
  doc.setFillColor(250, 245, 255); // purple-50
  doc.setDrawColor(233, 213, 255);
  doc.rect(kpi4X, currentY, kpiCardW, kpiCardH, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(107, 33, 168);
  doc.text(isJa ? '積載個数 / コンテナ数' : 'TOTAL CARGO COUNT', kpi4X + 4, currentY + 5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${targetItems.length} ${isJa ? '個積載' : 'pcs loaded'}`, kpi4X + 4, currentY + 11.5);
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  const contCountText = hasMultipleContainers 
    ? `${isJa ? '全' : 'Fleet:'} ${containers?.length} ${isJa ? '本 (Active: #' + activeContainerIndex + ')' : 'Units'}`
    : `1 Unit (${isJa ? '未積載:' : 'Unplaced:'} ${unplacedItems.reduce((s, u) => s + u.count, 0)} ${isJa ? '個' : 'pcs'})`;
  doc.text(contCountText, kpi4X + 4, currentY + 15.5);

  currentY += kpiCardH + 4;

  // ==========================================
  // SECTION: 2D STOWAGE SCHEMATICS (Top + Side)
  // ==========================================
  if (includeDiagrams) {
    // Section Header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, currentY, contentWidth, 6, 'F');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(
      isJa 
        ? '【図面】コンテナ積載配置平面図・側面図 (2D Cargo Stowage Schematics)' 
        : '2D CARGO STOWAGE SCHEMATICS (Top-Down & Side-Elevation Layouts)',
      margin + 3,
      currentY + 4.2
    );
    currentY += 8;

    // Render Top View and Side View Canvas images
    const topDataUrl = renderContainer2DView(container, targetItems, 'top', metrics.centerOfGravity);
    const sideDataUrl = renderContainer2DView(container, targetItems, 'side', metrics.centerOfGravity);

    const diagramHeight = 38; // mm
    const diagramWidth = (contentWidth - 4) / 2; // mm

    if (topDataUrl) {
      doc.addImage(topDataUrl, 'PNG', margin, currentY, diagramWidth, diagramHeight);
      doc.setDrawColor(203, 213, 225);
      doc.rect(margin, currentY, diagramWidth, diagramHeight);
    }

    if (sideDataUrl) {
      const sideX = margin + diagramWidth + 4;
      doc.addImage(sideDataUrl, 'PNG', sideX, currentY, diagramWidth, diagramHeight);
      doc.setDrawColor(203, 213, 225);
      doc.rect(sideX, currentY, diagramWidth, diagramHeight);
    }

    currentY += diagramHeight + 5;
  }

  // ==========================================
  // SECTION: BILL OF ITEMS (SKU SUMMARY)
  // ==========================================
  if (includeSummaryTable && skuList.length > 0) {
    const summaryHead = [
      [
        isJa ? 'No' : '#',
        isJa ? '管理番号 (SKU)' : 'SKU',
        isJa ? '品名 (Description)' : 'Item Description',
        isJa ? '寸法 (L×W×H mm)' : 'Dims (L×W×H mm)',
        isJa ? '単体重量' : 'Unit Wt',
        isJa ? '積載数' : 'Qty Loaded',
        isJa ? '総重量' : 'Total Wt',
        isJa ? '特性・指定' : 'Handling Flags'
      ]
    ];

    const summaryBody = skuList.map((skuItem, sIdx) => {
      const flags: string[] = [];
      if (skuItem.fragile) flags.push(isJa ? '割れ物/天地無用' : 'FRAGILE');
      if (skuItem.floorPlacement) flags.push(isJa ? '床置き' : 'FLOOR ONLY');
      if (flags.length === 0) flags.push(isJa ? '通常' : 'STANDARD');

      return [
        String(sIdx + 1),
        skuItem.sku,
        skuItem.name,
        `${skuItem.length}×${skuItem.width}×${skuItem.height}`,
        `${skuItem.weight} kg`,
        String(skuItem.count),
        `${skuItem.totalWeight.toLocaleString()} kg`,
        flags.join(', ')
      ];
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: summaryHead,
      body: summaryBody,
      theme: 'grid',
      styles: {
        font: fontName,
        fontSize: 7.5,
        cellPadding: 1.6,
        textColor: [30, 41, 59]
      },
      headStyles: {
        font: fontName,
        fontStyle: 'normal',
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 7.5
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 36, fontStyle: 'normal' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 38, halign: 'center' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 20, halign: 'center' },
        6: { cellWidth: 24, halign: 'right' },
        7: { cellWidth: 36 }
      },
      didDrawPage: (data) => {
        // Footer on each page
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Warehouse Dispatch Manifest | Ref: ${manifestId} | Page ${doc.getNumberOfPages()}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }
    });

    // Update currentY based on autoTable's final Y
    // @ts-expect-error - jspdf-autotable extends jsPDF with lastAutoTable
    currentY = (doc.lastAutoTable?.finalY || currentY) + 6;
  }

  // Check if we need a new page for Step-by-Step sequence
  if (includeStepTable && currentY > pageHeight - 50) {
    doc.addPage();
    currentY = margin;
  }

  // =======================================================
  // SECTION: STEP-BY-STEP STOWAGE INSTRUCTION (WAREHOUSE)
  // =======================================================
  if (includeStepTable) {
    // Section Header
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, currentY, contentWidth, 7, 'F');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(
      isJa 
        ? '【作業指示】積載順序・配置座標・現場確認チェックシート (Step-by-Step Loading Sequence Guide)' 
        : 'STEP-BY-STEP STOWAGE SEQUENCE & PHYSICAL VERIFICATION CHECKLIST',
      margin + 4,
      currentY + 4.8
    );
    currentY += 9;

    const stepHead = [
      [
        isJa ? '手順' : 'Step',
        hasMultipleContainers ? (isJa ? 'コンテナ' : 'Cont.') : (isJa ? '段' : 'Lyr'),
        isJa ? '管理番号 (SKU)' : 'SKU',
        isJa ? '品名 (Description)' : 'Item Description',
        isJa ? '配置座標 X, Y, Z (mm)' : 'Position X, Y, Z (mm)',
        isJa ? '向き寸法 (L×W×H)' : 'Oriented Dims (mm)',
        isJa ? '重量' : 'Weight',
        isJa ? '累積' : 'Cumul.',
        isJa ? '注意事項' : 'Handling',
        isJa ? '現場確認' : 'Verify'
      ]
    ];

    const stepBody = targetItems.map((item) => {
      const cumul = cumulativeWeightMap.get(item.sequenceNumber) || item.weight;
      const flags: string[] = [];
      if (item.fragile) flags.push(isJa ? '⚠️天地無用' : '⚠️FRAGILE');
      if (item.floorPlacement) flags.push(isJa ? '⚓床置' : '⚓FLOOR');
      if (item.isManual) flags.push(isJa ? '🛠️手動' : '🛠️MANUAL');

      return [
        String(item.sequenceNumber),
        hasMultipleContainers ? `#${item.containerIndex || 1}` : `L${item.layer}`,
        item.sku,
        item.name,
        `X:${item.x}, Y:${item.y}, Z:${item.z}`,
        `${item.length}×${item.width}×${item.height}`,
        `${item.weight}kg`,
        `${cumul}kg`,
        flags.length > 0 ? flags.join(' ') : '-',
        '[   ]' // Checkbox for warehouse team pen signoff
      ];
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: stepHead,
      body: stepBody,
      theme: 'grid',
      styles: {
        font: fontName,
        fontSize: 7,
        cellPadding: 1.5,
        textColor: [30, 41, 59]
      },
      headStyles: {
        font: fontName,
        fontStyle: 'normal',
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.5
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 14, halign: 'center' },
        2: { cellWidth: 32 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 42, halign: 'center' },
        5: { cellWidth: 34, halign: 'center' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 20, halign: 'right' },
        8: { cellWidth: 26, halign: 'center' },
        9: { cellWidth: 14, halign: 'center', fontStyle: 'bold' }
      },
      didDrawPage: (data) => {
        // Footer on each page
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Warehouse Dispatch Manifest | Ref: ${manifestId} | Page ${doc.getNumberOfPages()}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }
    });

    // @ts-expect-error - jspdf-autotable extends jsPDF with lastAutoTable
    currentY = (doc.lastAutoTable?.finalY || currentY) + 6;
  }

  // ==========================================
  // SECTION: UNPLACED ITEMS (IF ANY)
  // ==========================================
  if (unplacedItems && unplacedItems.length > 0) {
    if (currentY > pageHeight - 45) {
      doc.addPage();
      currentY = margin;
    }

    doc.setFillColor(254, 242, 242); // red-50
    doc.setDrawColor(254, 202, 202);
    doc.rect(margin, currentY, contentWidth, 7, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(185, 28, 28);
    doc.text(
      isJa 
        ? `⚠️ 未積載貨物リスト (${unplacedItems.reduce((s, u) => s + u.count, 0)} 点が未積載・別便手配必要)` 
        : `⚠️ UNPLACED ITEMS ALERT (${unplacedItems.reduce((s, u) => s + u.count, 0)} units unplaced - Requires secondary dispatch)`,
      margin + 3,
      currentY + 4.8
    );
    currentY += 9;

    const unplacedHead = [
      [
        isJa ? 'SKU' : 'SKU',
        isJa ? '品名' : 'Description',
        isJa ? '未積載数量' : 'Qty Unplaced',
        isJa ? '寸法 (mm)' : 'Dimensions',
        isJa ? '重量' : 'Weight',
        isJa ? '未積載理由' : 'Reason / Constraint'
      ]
    ];

    const unplacedBody = unplacedItems.map(u => [
      u.sku,
      u.name,
      `${u.count} ${isJa ? '個' : 'pcs'}`,
      `${u.dimensions.length}×${u.dimensions.width}×${u.dimensions.height}`,
      `${u.weight} kg`,
      u.reason === 'exceeds_weight' ? (isJa ? 'コンテナ最大積載重量超過' : 'Exceeds Payload Limit') :
      u.reason === 'no_spatial_fit' ? (isJa ? '空間容積不足' : 'No Spatial Fit') :
      u.reason === 'stacking_constraint' ? (isJa ? 'スタッキング制約' : 'Stacking Limit') : (isJa ? '床置き制約' : 'Floor Constraint')
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: unplacedHead,
      body: unplacedBody,
      theme: 'grid',
      styles: {
        font: fontName,
        fontSize: 7,
        cellPadding: 1.5,
        textColor: [153, 27, 27]
      },
      headStyles: {
        font: fontName,
        fontStyle: 'normal',
        fillColor: [185, 28, 28],
        textColor: [255, 255, 255],
        fontSize: 7.5
      }
    });

    // @ts-expect-error - jspdf-autotable extends jsPDF with lastAutoTable
    currentY = (doc.lastAutoTable?.finalY || currentY) + 6;
  }

  // =======================================================
  // SECTION: WAREHOUSE SIGN-OFF & QA CERTIFICATION BLOCK
  // =======================================================
  if (includeSignoff) {
    if (currentY > pageHeight - 38) {
      doc.addPage();
      currentY = margin;
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, currentY, contentWidth, 28, 'FD');

    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      isJa 
        ? '【現場完了確認・承認署名欄 (Warehouse Sign-Off & Inspection Certification)】' 
        : 'WAREHOUSE SIGN-OFF & QUALITY INSPECTION CERTIFICATION',
      margin + 4,
      currentY + 5
    );

    // QA Checklist
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    const check1 = isJa ? '[   ] コンテナ内部の清掃・乾燥・異臭なしを確認' : '[   ] Container Clean, Dry & Odor-Free Verified';
    const check2 = isJa ? '[   ] 荷崩れ防止ラッシング・ダンネージ配置完了' : '[   ] Lashing, Chocking & Dunnage Secured';
    const check3 = isJa ? '[   ] 重量制限および軸重配分安全遵守確認' : '[   ] Axle Load & Gross Weight Limits Complied';

    doc.text(check1, margin + 4, currentY + 10);
    doc.text(check2, margin + 4, currentY + 15);
    doc.text(check3, margin + 4, currentY + 20);

    // Signatures
    const sigX1 = margin + 110;
    const sigX2 = sigX1 + 55;
    const sigX3 = sigX2 + 55;

    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);

    // Loaded By
    doc.text(isJa ? '積載作業担当者 (Loaded By):' : 'Loaded By (Operator):', sigX1, currentY + 10);
    doc.line(sigX1, currentY + 19, sigX1 + 45, currentY + 19);

    // Inspected By
    doc.text(isJa ? '検収・立会人 (Inspector):' : 'Quality Inspector:', sigX2, currentY + 10);
    doc.line(sigX2, currentY + 19, sigX2 + 45, currentY + 19);

    // Seal Number
    doc.text(isJa ? '封印ボルトシール番号 (Seal No):' : 'Container Bolt Seal No:', sigX3, currentY + 10);
    doc.line(sigX3, currentY + 19, sigX3 + 45, currentY + 19);

    // Date
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(isJa ? '署名日: _____年____月____日' : 'Date: _____ / _____ / 2026', sigX1, currentY + 24);
  }

  // Save the document with clean filename
  const safeContName = container.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = now.toISOString().slice(0, 10);
  const filename = `Loading_Manifest_${safeContName}_${dateStr}.pdf`;

  doc.save(filename);
}
