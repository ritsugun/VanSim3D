import * as XLSX from 'xlsx';
import { Container, PackedItem, CargoItem, PackingResult, ContainerLoad, OverallPackingMetrics, PackingMetrics } from '../types';
import { STANDARD_CONTAINERS } from '../data/presets';
import { VIVID_NEON_PALETTE } from './colors';

export interface ManifestParseResult {
  success: boolean;
  error?: string;
  fileName: string;
  totalItems: number;
  totalWeightKg: number;
  containerCount: number;
  detectedContainer: Container;
  cargoList: CargoItem[];
  packingResult: PackingResult;
  warnings: string[];
}

/**
 * Parses an external Loading_Manifest file (Excel, CSV, or JSON)
 * and reconstructs the exact 3D container packing arrangement.
 */
export async function parseManifestFile(
  file: File,
  currentContainer: Container
): Promise<ManifestParseResult> {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();

  try {
    if (lowerName.endsWith('.json')) {
      const text = await file.text();
      return parseManifestJson(text, fileName, currentContainer);
    }

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('Excelファイル内にシートが見つかりませんでした。');
      }
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
      return parseManifestRawRows(rawRows, fileName, currentContainer);
    }

    // Default to CSV / Text
    const text = await file.text();
    const cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const rawRows = lines.map(line => {
      const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g;
      const row: string[] = [];
      let match;
      while ((match = regex.exec(line)) !== null) {
        let val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2] || '';
        row.push(val.trim());
      }
      return row;
    });

    return parseManifestRawRows(rawRows, fileName, currentContainer);
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'マニフェストファイルの解析中にエラーが発生しました。',
      fileName,
      totalItems: 0,
      totalWeightKg: 0,
      containerCount: 0,
      detectedContainer: currentContainer,
      cargoList: [],
      packingResult: {
        container: currentContainer,
        containers: [],
        packedItems: [],
        unplacedItems: [],
        metrics: {} as any
      },
      warnings: []
    };
  }
}

/**
 * Parses raw 2D array of rows from CSV or Excel into exact 3D packed items and container loads.
 */
export function parseManifestRawRows(
  rawRows: any[][],
  fileName: string,
  fallbackContainer: Container
): ManifestParseResult {
  const warnings: string[] = [];

  const nonEmptyRows = rawRows.filter(row => 
    Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
  );

  if (nonEmptyRows.length <= 1) {
    throw new Error('マニフェストファイル内に有効なデータ行が見つかりませんでした。');
  }

  // Find header row by scanning first 15 rows for manifest keywords
  let headerRowIndex = 0;
  let maxKeywordScore = 0;
  const manifestKeywords = [
    /積載順序|順序|No|Seq|Step|ステップ|順|番号/i,
    /コンテナ番号|コンテナ|Container_No|ContainerNo|Container|Cont/i,
    /貨物名|品名|商品名|型番|Item_Name|Name|Item|Description/i,
    /管理番号|SKU|Code|品番/i,
    /配置X|座標X|X座標|X\(mm\)|PosX|Pos_X|CoordX|^X$/i,
    /配置Y|座標Y|Y座標|Y\(mm\)|PosY|Pos_Y|CoordY|^Y$/i,
    /配置Z|座標Z|Z座標|Z\(mm\)|PosZ|Pos_Z|CoordZ|^Z$/i,
    /長さ|奥行|奥行き|Length|Depth|L\(mm\)|DimX|Dx|^L$/i,
    /幅|横幅|Width|W\(mm\)|DimY|Dy|^W$/i,
    /高さ|Height|H\(mm\)|DimZ|Dz|^H$/i,
    /重量|重さ|Weight|Wt|Mass|^W$/i
  ];

  const scanLimit = Math.min(15, nonEmptyRows.length);
  for (let r = 0; r < scanLimit; r++) {
    let score = 0;
    const row = nonEmptyRows[r];
    for (const cell of row) {
      if (typeof cell === 'string') {
        for (const kw of manifestKeywords) {
          if (kw.test(cell)) score++;
        }
      }
    }
    if (score > maxKeywordScore) {
      maxKeywordScore = score;
      headerRowIndex = r;
    }
  }

  const headerParts = (nonEmptyRows[headerRowIndex] || []).map(s => String(s ?? '').trim().replace(/^"|"$/g, ''));

  // Match columns
  let seqIdx = headerParts.findIndex(h => /積載順序|順序|No|Seq|Step|ステップ|順|番号/i.test(h));
  let contIdx = headerParts.findIndex(h => /コンテナ番号|コンテナ|Container_No|ContainerNo|Container|Cont/i.test(h));
  let nameIdx = headerParts.findIndex(h => /貨物名|品名|商品名|型番|Item_Name|Name|Item|Description/i.test(h));
  let skuIdx = headerParts.findIndex(h => /管理番号|SKU|Code|品番/i.test(h));
  let xIdx = headerParts.findIndex(h => /配置X|座標X|X座標|X\(mm\)|PosX|Pos_X|CoordX|^X$/i.test(h));
  let yIdx = headerParts.findIndex(h => /配置Y|座標Y|Y座標|Y\(mm\)|PosY|Pos_Y|CoordY|^Y$/i.test(h));
  let zIdx = headerParts.findIndex(h => /配置Z|座標Z|Z座標|Z\(mm\)|PosZ|Pos_Z|CoordZ|^Z$/i.test(h));
  let lenIdx = headerParts.findIndex(h => /長さ|奥行|奥行き|Length|Depth|L\(mm\)|DimX|Dx|^L$/i.test(h));
  let widthIdx = headerParts.findIndex(h => /幅|横幅|Width|W\(mm\)|DimY|Dy|^W$/i.test(h));
  let heightIdx = headerParts.findIndex(h => /高さ|Height|H\(mm\)|DimZ|Dz|^H$/i.test(h));
  let weightIdx = headerParts.findIndex(h => /重量|重さ|Weight|Wt|Mass/i.test(h));
  let layerIdx = headerParts.findIndex(h => /段数|段|Layer|Tier/i.test(h));
  let fragileIdx = headerParts.findIndex(h => /天地無用|割れ物|壊れ物|壊れもの|Fragile/i.test(h));
  let floorIdx = headerParts.findIndex(h => /床置き|床置き指定|直置き|Floor|FloorPlacement/i.test(h));
  let colorIdx = headerParts.findIndex(h => /カラー|色|Color|Hex/i.test(h));

  // Fallback to standard 15-column positional indices if keywords were not detected
  if (xIdx === -1 && yIdx === -1 && zIdx === -1) {
    if (headerParts.length >= 11) {
      seqIdx = 0;
      contIdx = 1;
      nameIdx = 2;
      skuIdx = 3;
      xIdx = 4;
      yIdx = 5;
      zIdx = 6;
      lenIdx = 7;
      widthIdx = 8;
      heightIdx = 9;
      weightIdx = 10;
      layerIdx = 12;
      fragileIdx = 13;
      floorIdx = 14;
    } else {
      throw new Error('配置座標(X, Y, Z)の列を特定できませんでした。Loading_Manifest形式のファイルであることをご確認ください。');
    }
  }

  const dataRows = nonEmptyRows.slice(headerRowIndex + 1);
  const packedItems: PackedItem[] = [];
  const colorMap = new Map<string, string>();
  let colorCounter = 0;

  let maxPlacementX = 0;
  let maxPlacementY = 0;
  let maxPlacementZ = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.length === 0) continue;

    const rawName = nameIdx !== -1 ? row[nameIdx] : '';
    const rawSku = skuIdx !== -1 ? row[skuIdx] : '';
    const rawX = xIdx !== -1 ? row[xIdx] : 0;
    const rawY = yIdx !== -1 ? row[yIdx] : 0;
    const rawZ = zIdx !== -1 ? row[zIdx] : 0;
    const rawLen = lenIdx !== -1 ? row[lenIdx] : 1000;
    const rawWidth = widthIdx !== -1 ? row[widthIdx] : 1000;
    const rawHeight = heightIdx !== -1 ? row[heightIdx] : 1000;
    const rawWeight = weightIdx !== -1 ? row[weightIdx] : 50;

    // Skip empty lines with no name and no dimensions
    if (!rawName && !rawX && !rawY && !rawZ && !rawLen) continue;

    const itemName = String(rawName || '').trim() || `Item-${i + 1}`;
    const sku = String(rawSku || '').trim() || itemName;

    const x = Math.max(0, Math.round(Number(rawX) || 0));
    const y = Math.max(0, Math.round(Number(rawY) || 0));
    const z = Math.max(0, Math.round(Number(rawZ) || 0));
    const length = Math.max(10, Math.round(Number(rawLen) || 1000));
    const width = Math.max(10, Math.round(Number(rawWidth) || 1000));
    const height = Math.max(10, Math.round(Number(rawHeight) || 1000));
    const weight = Math.max(0.1, Math.round(Number(rawWeight) || 50));

    maxPlacementX = Math.max(maxPlacementX, x + length);
    maxPlacementY = Math.max(maxPlacementY, y + width);
    maxPlacementZ = Math.max(maxPlacementZ, z + height);

    // Sequence Number
    let seq = i + 1;
    if (seqIdx !== -1 && row[seqIdx] !== undefined && row[seqIdx] !== '') {
      const parsedSeq = parseInt(String(row[seqIdx]), 10);
      if (!isNaN(parsedSeq)) seq = parsedSeq;
    }

    // Container Index
    let containerIndex = 1;
    if (contIdx !== -1 && row[contIdx] !== undefined && row[contIdx] !== '') {
      const parsedCont = parseInt(String(row[contIdx]), 10);
      if (!isNaN(parsedCont) && parsedCont >= 1) containerIndex = parsedCont;
    }

    // Layer
    let layer = 1;
    if (layerIdx !== -1 && row[layerIdx] !== undefined && row[layerIdx] !== '') {
      const parsedLayer = parseInt(String(row[layerIdx]), 10);
      if (!isNaN(parsedLayer) && parsedLayer >= 1) layer = parsedLayer;
    } else {
      layer = z === 0 ? 1 : Math.max(1, Math.floor(z / Math.max(100, height * 0.8)) + 1);
    }

    // Fragile
    let fragile = false;
    if (fragileIdx !== -1 && row[fragileIdx] !== undefined && row[fragileIdx] !== '') {
      const fragStr = String(row[fragileIdx]).toLowerCase().trim();
      fragile = fragStr === '1' || fragStr === 'true' || fragStr === 'yes' || fragStr === '割れ物' || fragStr === '天地無用';
    } else if (height > 1800) {
      fragile = true;
    }

    // Floor placement
    let floorPlacement = false;
    if (floorIdx !== -1 && row[floorIdx] !== undefined && row[floorIdx] !== '') {
      const floorStr = String(row[floorIdx]).toLowerCase().trim();
      floorPlacement = floorStr === '1' || floorStr === 'true' || floorStr === 'yes' || floorStr === '床置き' || floorStr === '要';
    } else if (z === 0 && weight > 250) {
      floorPlacement = true;
    }

    // Color
    let color = '';
    if (colorIdx !== -1 && row[colorIdx] !== undefined && row[colorIdx] !== '') {
      const cStr = String(row[colorIdx]).trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(cStr)) {
        color = cStr;
      }
    }
    if (!color) {
      const colorKey = sku || itemName;
      if (!colorMap.has(colorKey)) {
        colorMap.set(colorKey, VIVID_NEON_PALETTE[colorCounter % VIVID_NEON_PALETTE.length]);
        colorCounter++;
      }
      color = colorMap.get(colorKey)!;
    }

    packedItems.push({
      id: `manifest_item_${i + 1}_${Date.now()}`,
      cargoItemId: `cargo_${sku.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      sku,
      name: itemName,
      x,
      y,
      z,
      length,
      width,
      height,
      weight,
      color,
      fragile,
      floorPlacement,
      sequenceNumber: seq,
      stepIndex: seq - 1,
      rotationIndex: 0,
      containerIndex,
      layer,
      isManual: false
    });
  }

  if (packedItems.length === 0) {
    throw new Error('マニフェストファイルから有効な積載貨物データを抽出できませんでした。');
  }

  // Sort packedItems by sequenceNumber
  packedItems.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // Determine container dimensions and type
  let detectedContainer = { ...fallbackContainer };
  if (
    maxPlacementX > detectedContainer.length ||
    maxPlacementY > detectedContainer.width ||
    maxPlacementZ > detectedContainer.height
  ) {
    // Find best standard container that accommodates the dimensions
    const suitableStandard = STANDARD_CONTAINERS.find(c => 
      c.length >= maxPlacementX && c.width >= maxPlacementY && c.height >= maxPlacementZ
    );

    if (suitableStandard) {
      detectedContainer = { ...suitableStandard };
      warnings.push(`配置座標に合わせてコンテナを「${suitableStandard.name}」に自動設定しました。`);
    } else {
      // Scale custom container to safely contain the items with padding
      detectedContainer = {
        ...detectedContainer,
        id: 'custom_manifest_container',
        name: `Manifest Fit Container (${Math.ceil(maxPlacementX)}x${Math.ceil(maxPlacementY)}x${Math.ceil(maxPlacementZ)})`,
        length: Math.max(detectedContainer.length, Math.ceil(maxPlacementX / 100) * 100),
        width: Math.max(detectedContainer.width, Math.ceil(maxPlacementY / 100) * 100),
        height: Math.max(detectedContainer.height, Math.ceil(maxPlacementZ / 100) * 100),
        maxWeight: Math.max(detectedContainer.maxWeight, Math.ceil(packedItems.reduce((s, p) => s + p.weight, 0) * 1.2))
      };
      warnings.push(`積載貨物の配置座標に合わせてコンテナサイズを自動拡張しました。`);
    }
  }

  // Group packed items by container index
  const containerIndices = Array.from(new Set(packedItems.map(p => p.containerIndex))).sort((a, b) => a - b);
  const containerLoads: ContainerLoad[] = [];

  for (const cIdx of containerIndices) {
    const cItems = packedItems.filter(p => p.containerIndex === cIdx);
    const cMetrics = calculateContainerMetrics(detectedContainer, cItems);
    containerLoads.push({
      containerIndex: cIdx,
      container: detectedContainer,
      packedItems: cItems,
      metrics: cMetrics
    });
  }

  // Build overall metrics
  const totalItemCount = packedItems.length;
  const totalPackedWeightKg = packedItems.reduce((s, p) => s + p.weight, 0);
  const totalCapacityVolumeCbm = (containerLoads.length * detectedContainer.length * detectedContainer.width * detectedContainer.height) / 1_000_000_000;
  const totalPackedVolumeCbm = containerLoads.reduce((s, c) => s + c.metrics.packedVolumeCbm, 0);
  const totalCapacityWeightKg = containerLoads.length * detectedContainer.maxWeight;

  const overallMetrics: OverallPackingMetrics = {
    totalContainers: containerLoads.length,
    totalContainersCount: containerLoads.length,
    totalCapacityVolumeCbm,
    totalPackedVolumeCbm,
    totalCapacityWeightKg,
    totalPackedWeightKg,
    overallVolumeUtilization: totalCapacityVolumeCbm > 0 ? (totalPackedVolumeCbm / totalCapacityVolumeCbm) * 100 : 0,
    overallWeightUtilization: totalCapacityWeightKg > 0 ? (totalPackedWeightKg / totalCapacityWeightKg) * 100 : 0,
    totalItemCount,
    totalItemsCount: totalItemCount,
    rawTotalItemCount: totalItemCount,
    totalPackedCount: totalItemCount,
    totalUnplacedCount: 0,
    totalCostEstimate: containerLoads.length * (detectedContainer.costEstimate || 2000)
  };

  const primaryMetrics = containerLoads[0]?.metrics || calculateContainerMetrics(detectedContainer, packedItems);

  // Reconstruct CargoItem list from packed items for inventory synchronization
  const cargoGroupMap = new Map<string, {
    sku: string;
    name: string;
    length: number;
    width: number;
    height: number;
    weight: number;
    color: string;
    fragile: boolean;
    floorPlacement: boolean;
    count: number;
  }>();

  for (const p of packedItems) {
    const key = `${p.sku}__${p.name}__${p.length}__${p.width}__${p.height}__${p.weight}`;
    const existing = cargoGroupMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      cargoGroupMap.set(key, {
        sku: p.sku,
        name: p.name,
        length: p.length,
        width: p.width,
        height: p.height,
        weight: p.weight,
        color: p.color,
        fragile: p.fragile,
        floorPlacement: !!p.floorPlacement,
        count: 1
      });
    }
  }

  const reconstructedCargoList: CargoItem[] = Array.from(cargoGroupMap.values()).map((g, idx) => ({
    id: `manifest_cargo_${idx + 1}`,
    sku: g.sku,
    name: g.name,
    length: g.length,
    width: g.width,
    height: g.height,
    weight: g.weight,
    quantity: g.count,
    color: g.color,
    allowYaw: true,
    allowTilt: false,
    allowRoll: false,
    maxStackWeight: g.fragile ? 0 : 200,
    fragile: g.fragile,
    floorPlacement: g.floorPlacement,
    priority: g.weight > 200 ? 1 : 3,
    enabled: true
  }));

  const packingResult: PackingResult = {
    container: detectedContainer,
    containers: containerLoads,
    packedItems,
    unplacedItems: [],
    metrics: primaryMetrics,
    overallMetrics,
    rawTotalItemCount: totalItemCount,
    safetyLimitTruncatedCount: 0,
    hasManualAdjustments: false
  };

  return {
    success: true,
    fileName,
    totalItems: packedItems.length,
    totalWeightKg: totalPackedWeightKg,
    containerCount: containerLoads.length,
    detectedContainer,
    cargoList: reconstructedCargoList,
    packingResult,
    warnings
  };
}

/**
 * Parses JSON format manifest
 */
export function parseManifestJson(
  jsonText: string,
  fileName: string,
  fallbackContainer: Container
): ManifestParseResult {
  const parsed = JSON.parse(jsonText);
  let rawPackedItems: any[] = [];
  let detectedContainer = { ...fallbackContainer };

  if (Array.isArray(parsed)) {
    rawPackedItems = parsed;
  } else if (parsed && Array.isArray(parsed.packedItems)) {
    rawPackedItems = parsed.packedItems;
    if (parsed.container) {
      detectedContainer = { ...detectedContainer, ...parsed.container };
    }
  } else if (parsed && Array.isArray(parsed.items)) {
    rawPackedItems = parsed.items;
  } else {
    throw new Error('JSON内に積載データ (packedItems 配列) が見つかりませんでした。');
  }

  // Convert objects to rows format
  const headers = ['積載順序(No)', 'コンテナ番号(Container_No)', '貨物名(Item_Name)', '管理番号(SKU)', '配置X(mm)', '配置Y(mm)', '配置Z(mm)', '長さ(mm)', '幅(mm)', '高さ(mm)', '重量(kg)', '累積重量(kg)', '段数(Layer)', '天地無用/割れ物', '床置き指定', 'カラー'];
  const rows = rawPackedItems.map((p, idx) => [
    p.sequenceNumber ?? (idx + 1),
    p.containerIndex ?? 1,
    p.name ?? `Item-${idx + 1}`,
    p.sku ?? p.name ?? `SKU-${idx + 1}`,
    p.x ?? 0,
    p.y ?? 0,
    p.z ?? 0,
    p.length ?? 1000,
    p.width ?? 1000,
    p.height ?? 1000,
    p.weight ?? 50,
    0,
    p.layer ?? (p.z === 0 ? 1 : Math.floor(p.z / 800) + 1),
    p.fragile ? 1 : 0,
    p.floorPlacement ? 1 : 0,
    p.color ?? ''
  ]);

  return parseManifestRawRows([headers, ...rows], fileName, detectedContainer);
}

/**
 * Calculates physical packing metrics for a container and its packed items.
 */
function calculateContainerMetrics(container: Container, packedItems: PackedItem[]): PackingMetrics {
  const containerVolMm3 = container.length * container.width * container.height;
  const containerVolumeCbm = containerVolMm3 / 1_000_000_000;

  let packedVolMm3 = 0;
  let currentTotalWeight = 0;
  let cogWeightedX = 0;
  let cogWeightedY = 0;
  let cogWeightedZ = 0;

  for (let i = 0; i < packedItems.length; i++) {
    const p = packedItems[i];
    const itemVol = p.length * p.width * p.height;
    packedVolMm3 += itemVol;
    currentTotalWeight += p.weight;

    const itemCenterX = p.x + p.length / 2;
    const itemCenterY = p.y + p.width / 2;
    const itemCenterZ = p.z + p.height / 2;

    cogWeightedX += itemCenterX * p.weight;
    cogWeightedY += itemCenterY * p.weight;
    cogWeightedZ += itemCenterZ * p.weight;
  }

  const packedVolumeCbm = packedVolMm3 / 1_000_000_000;
  const freeVolumeCbm = Math.max(0, containerVolumeCbm - packedVolumeCbm);
  const volumeUtilization = (packedVolMm3 / containerVolMm3) * 100;
  const weightUtilization = (currentTotalWeight / container.maxWeight) * 100;

  const cogX = currentTotalWeight > 0 ? cogWeightedX / currentTotalWeight : container.length / 2;
  const cogY = currentTotalWeight > 0 ? cogWeightedY / currentTotalWeight : container.width / 2;
  const cogZ = currentTotalWeight > 0 ? cogWeightedZ / currentTotalWeight : container.height / 2;

  const offsetXPercent = ((cogX - container.length / 2) / container.length) * 100;
  const offsetYPercent = ((cogY - container.width / 2) / container.width) * 100;
  const offsetZPercent = ((cogZ - container.height / 2) / container.height) * 100;

  const frontRatio = Math.max(0, Math.min(1, 1 - (cogX / (container.length * 0.85))));
  const rearRatio = 1 - frontRatio;
  const frontAxleKg = currentTotalWeight * frontRatio;
  const rearAxleKg = currentTotalWeight * rearRatio;

  return {
    containerVolumeCbm,
    packedVolumeCbm,
    freeVolumeCbm,
    volumeUtilization: Math.min(100, volumeUtilization),
    containerMaxWeightKg: container.maxWeight,
    packedWeightKg: currentTotalWeight,
    weightUtilization: Math.min(100, weightUtilization),
    totalItemCount: packedItems.length,
    packedCount: packedItems.length,
    unplacedCount: 0,
    centerOfGravity: {
      x: cogX,
      y: cogY,
      z: cogZ,
      offsetXPercent,
      offsetYPercent,
      offsetZPercent
    },
    axleDistribution: {
      frontAxlePercent: frontRatio * 100,
      rearAxlePercent: rearRatio * 100,
      frontAxleKg,
      rearAxleKg
    },
    calculationTimeMs: 0,
    algorithm: 'extreme_points_bfd',
    containersNeeded: 1
  };
}

/**
 * Downloads a sample Loading Manifest Excel (.xlsx) file
 */
export function downloadSampleManifestExcel(): void {
  const headers = [
    '積載順序(No)',
    'コンテナ番号(Container_No)',
    '貨物名(Item_Name)',
    '管理番号(SKU)',
    '配置X(mm)',
    '配置Y(mm)',
    '配置Z(mm)',
    '長さ(mm)',
    '幅(mm)',
    '高さ(mm)',
    '重量(kg)',
    '累積重量(kg)',
    '段数(Layer)',
    '天地無用/割れ物',
    '床置き指定',
    'カラー(Hex)'
  ];

  // 12 realistic sample packed items inside a 40ft container
  const rows = [
    [1, 1, 'PURY-P350YNW-A2', 'PURY-P350YNW-A2', 0, 0, 0, 760, 1270, 1920, 292, 292, 1, '割れ物', '床置き', '#ff0055'],
    [2, 1, 'PURY-P350YNW-A2', 'PURY-P350YNW-A2', 760, 0, 0, 760, 1270, 1920, 292, 584, 1, '割れ物', '床置き', '#ff0055'],
    [3, 1, 'PURY-M200YNW-A1', 'PURY-M200YNW-A1', 1520, 0, 0, 760, 950, 1920, 244, 828, 1, '割れ物', '床置き', '#00e5ff'],
    [4, 1, 'CMB-M108V-KB1', 'CMB-M108V-KB1', 0, 1270, 0, 700, 1100, 1230, 125, 953, 1, '通常', '通常', '#ffd600'],
    [5, 1, 'CMB-M108V-KB1', 'CMB-M108V-KB1', 700, 1270, 0, 700, 1100, 1230, 125, 1078, 1, '通常', '通常', '#ffd600'],
    [6, 1, 'CMB-M104V-J1', 'CMB-M104V-J1', 0, 1270, 1230, 700, 1070, 380, 32, 1110, 2, '通常', '通常', '#00e676'],
    [7, 1, 'CMB-M104V-J1', 'CMB-M104V-J1', 700, 1270, 1230, 700, 1070, 380, 32, 1142, 2, '通常', '通常', '#00e676'],
    [8, 1, 'CMB-M106V-J1', 'CMB-M106V-J1', 2280, 0, 0, 700, 1070, 380, 35, 1177, 1, '通常', '通常', '#ff6d00'],
    [9, 1, 'CMB-M106V-J1', 'CMB-M106V-J1', 2280, 0, 380, 700, 1070, 380, 35, 1212, 2, '通常', '通常', '#ff6d00'],
    [10, 1, 'CMB-M108V-J1', 'CMB-M108V-J1', 2280, 1070, 0, 700, 1070, 380, 39, 1251, 1, '通常', '通常', '#d946ef'],
    [11, 1, 'CMB-M108V-J1', 'CMB-M108V-J1', 2280, 1070, 380, 700, 1070, 380, 39, 1290, 2, '通常', '通常', '#d946ef'],
    [12, 1, 'CMB-M1012V-J1', 'CMB-M1012V-J1', 2980, 0, 0, 840, 1380, 380, 58, 1348, 1, '通常', '通常', '#7928ca']
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '積載指示マニフェスト');
  XLSX.writeFile(wb, 'Loading_Manifest_Sample_Template.xlsx');
}

/**
 * Downloads a sample Loading Manifest CSV file
 */
export function downloadSampleManifestCsv(): void {
  const headers = [
    '積載順序(No)',
    'コンテナ番号(Container_No)',
    '貨物名(Item_Name)',
    '管理番号(SKU)',
    '配置X(mm)',
    '配置Y(mm)',
    '配置Z(mm)',
    '長さ(mm)',
    '幅(mm)',
    '高さ(mm)',
    '重量(kg)',
    '累積重量(kg)',
    '段数(Layer)',
    '天地無用/割れ物',
    '床置き指定',
    'カラー'
  ];

  const rows = [
    [1, 1, 'PURY-P350YNW-A2', 'PURY-P350YNW-A2', 0, 0, 0, 760, 1270, 1920, 292, 292, 1, '割れ物', '床置き', '#ff0055'],
    [2, 1, 'PURY-P350YNW-A2', 'PURY-P350YNW-A2', 760, 0, 0, 760, 1270, 1920, 292, 584, 1, '割れ物', '床置き', '#ff0055'],
    [3, 1, 'PURY-M200YNW-A1', 'PURY-M200YNW-A1', 1520, 0, 0, 760, 950, 1920, 244, 828, 1, '割れ物', '床置き', '#00e5ff'],
    [4, 1, 'CMB-M108V-KB1', 'CMB-M108V-KB1', 0, 1270, 0, 700, 1100, 1230, 125, 953, 1, '通常', '通常', '#ffd600'],
    [5, 1, 'CMB-M108V-KB1', 'CMB-M108V-KB1', 700, 1270, 0, 700, 1100, 1230, 125, 1078, 1, '通常', '通常', '#ffd600'],
    [6, 1, 'CMB-M104V-J1', 'CMB-M104V-J1', 0, 1270, 1230, 700, 1070, 380, 32, 1110, 2, '通常', '通常', '#00e676'],
    [7, 1, 'CMB-M104V-J1', 'CMB-M104V-J1', 700, 1270, 1230, 700, 1070, 380, 32, 1142, 2, '通常', '通常', '#00e676'],
    [8, 1, 'CMB-M106V-J1', 'CMB-M106V-J1', 2280, 0, 0, 700, 1070, 380, 35, 1177, 1, '通常', '通常', '#ff6d00'],
    [9, 1, 'CMB-M106V-J1', 'CMB-M106V-J1', 2280, 0, 380, 700, 1070, 380, 35, 1212, 2, '通常', '通常', '#ff6d00'],
    [10, 1, 'CMB-M108V-J1', 'CMB-M108V-J1', 2280, 1070, 0, 700, 1070, 380, 39, 1251, 1, '通常', '通常', '#d946ef'],
    [11, 1, 'CMB-M108V-J1', 'CMB-M108V-J1', 2280, 1070, 380, 700, 1070, 380, 39, 1290, 2, '通常', '通常', '#d946ef'],
    [12, 1, 'CMB-M1012V-J1', 'CMB-M1012V-J1', 2980, 0, 0, 840, 1380, 380, 58, 1348, 1, '通常', '通常', '#7928ca']
  ];

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'Loading_Manifest_Sample_Template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports current loading plan to styled Excel spreadsheet
 */
export function exportManifestToExcel(
  packedItems: PackedItem[],
  container: Container,
  fileName?: string
): void {
  const headers = [
    '積載順序(No)',
    'コンテナ番号(Container_No)',
    '貨物名(Item_Name)',
    '管理番号(SKU)',
    '配置X(mm)',
    '配置Y(mm)',
    '配置Z(mm)',
    '長さ(mm)',
    '幅(mm)',
    '高さ(mm)',
    '重量(kg)',
    '累積重量(kg)',
    '段数(Layer)',
    '天地無用/割れ物',
    '床置き指定',
    'カラー'
  ];

  let cumulativeWeight = 0;
  const rows = packedItems.map(p => {
    cumulativeWeight += p.weight;
    return [
      p.sequenceNumber,
      p.containerIndex || 1,
      p.name,
      p.sku,
      p.x,
      p.y,
      p.z,
      p.length,
      p.width,
      p.height,
      p.weight,
      cumulativeWeight,
      p.layer,
      p.fragile ? '割れ物' : '通常',
      p.floorPlacement ? '床置き' : '通常',
      p.color
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '積載マニフェスト');
  const actualFileName = fileName || `Loading_Manifest_${container.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, actualFileName);
}
