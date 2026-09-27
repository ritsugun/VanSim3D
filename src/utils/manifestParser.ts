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
  isExportCurrentPlan?: boolean;
  algorithmName?: string;
  exportedAt?: string;
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

  // Extract metadata comments (lines starting with '#')
  const commentRows = rawRows.filter(row => 
    Array.isArray(row) && row.length > 0 && String(row[0] || '').trim().startsWith('#')
  );

  let metaContainerId: string | null = null;
  let metaContainerDims: { length: number; width: number; height: number } | null = null;
  let isExportCurrentPlan = false;
  let metaAlgorithmName: string | undefined;
  let metaExportedAt: string | undefined;

  for (const cRow of commentRows) {
    const text = cRow.join(' ');
    if (/AI 3D Container Loading Planner - Current Loading Plan Export/i.test(text)) {
      isExportCurrentPlan = true;
    }
    const algoMatch = text.match(/Algorithm:\s*([^|]+)/i);
    if (algoMatch) {
      metaAlgorithmName = algoMatch[1].trim();
    }
    const dateMatch = text.match(/Exported At:\s*([^\s|]+)/i);
    if (dateMatch) {
      metaExportedAt = dateMatch[1].trim();
    }
    // Match e.g. # Container: 40ft High Cube Container (40HC) (40hc) | Dimensions: 12032x2352x2698 mm
    const idMatch = text.match(/\((20gp|40gp|40hc|4t_truck|CC_Box|[a-zA-Z0-9_-]+)\)/i);
    if (idMatch) {
      metaContainerId = idMatch[1];
    }
    const dimMatch = text.match(/Dimensions:\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i);
    if (dimMatch) {
      metaContainerDims = {
        length: parseInt(dimMatch[1], 10),
        width: parseInt(dimMatch[2], 10),
        height: parseInt(dimMatch[3], 10)
      };
    }
  }

  // Filter out comments and completely empty rows
  const nonEmptyRows = rawRows.filter(row => 
    Array.isArray(row) && 
    row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '') &&
    !String(row[0] || '').trim().startsWith('#')
  );

  if (nonEmptyRows.length <= 1) {
    throw new Error('マニフェストファイル内に有効なデータ行が見つかりませんでした。');
  }

  // Find header row by scanning first 15 rows for manifest keywords
  let headerRowIndex = 0;
  let maxKeywordScore = 0;
  const manifestKeywords = [
    /積載順序|順序|^No$|Seq|Step|ステップ|順|番号|Sequence_No/i,
    /コンテナ番号|Container_No|ContainerNo|^Container$|Cont/i,
    /貨物名|品名|商品名|型番|Item_Name|^Name$|Item|Description/i,
    /管理番号|^SKU$|Code|品番/i,
    /配置X|座標X|X座標|X\(mm\)|PosX|Pos_X|CoordX|^X$/i,
    /配置Y|座標Y|Y座標|Y\(mm\)|PosY|Pos_Y|CoordY|^Y$/i,
    /配置Z|座標Z|Z座標|Z\(mm\)|PosZ|Pos_Z|CoordZ|^Z$/i,
    /Dim_Length|長さ|奥行|奥行き|Length|Depth|L\(mm\)|DimX|Dx|^L$/i,
    /Dim_Width|幅|横幅|Width|W\(mm\)|DimY|Dy|^W$/i,
    /Dim_Height|高さ|Height|H\(mm\)|DimZ|Dz|^H$/i,
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
  let seqIdx = headerParts.findIndex(h => /積載順序|順序|^No$|Seq|Step|ステップ|順|番号|Sequence_No/i.test(h));
  let contIdx = headerParts.findIndex(h => /コンテナ番号|Container_No|ContainerNo|^Container$|Cont/i.test(h));
  let contIdIdx = headerParts.findIndex(h => /^Container_ID$|^コンテナID$/i.test(h));
  let contLenIdx = headerParts.findIndex(h => /^Container_Length/i.test(h));
  let contWidthIdx = headerParts.findIndex(h => /^Container_Width/i.test(h));
  let contHeightIdx = headerParts.findIndex(h => /^Container_Height/i.test(h));

  let nameIdx = headerParts.findIndex(h => /貨物名|品名|商品名|型番|Item_Name|^Name$|Item|Description/i.test(h));
  let skuIdx = headerParts.findIndex(h => /管理番号|^SKU$|Code|品番/i.test(h));
  let xIdx = headerParts.findIndex(h => /配置X|座標X|X座標|X\(mm\)|PosX|Pos_X|CoordX|^X$/i.test(h));
  let yIdx = headerParts.findIndex(h => /配置Y|座標Y|Y座標|Y\(mm\)|PosY|Pos_Y|CoordY|^Y$/i.test(h));
  let zIdx = headerParts.findIndex(h => /配置Z|座標Z|Z座標|Z\(mm\)|PosZ|Pos_Z|CoordZ|^Z$/i.test(h));

  // Item dimensions: distinguish Dim_Length from Container_Length
  let lenIdx = headerParts.findIndex(h => /Dim_Length|貨物長さ|貨物奥行/i.test(h));
  if (lenIdx === -1) {
    lenIdx = headerParts.findIndex(h => !/Container/i.test(h) && /長さ|奥行|奥行き|Length|Depth|L\(mm\)|DimX|Dx|^L$/i.test(h));
  }

  let widthIdx = headerParts.findIndex(h => /Dim_Width|貨物幅|貨物横幅/i.test(h));
  if (widthIdx === -1) {
    widthIdx = headerParts.findIndex(h => !/Container/i.test(h) && /幅|横幅|Width|W\(mm\)|DimY|Dy|^W$/i.test(h));
  }

  let heightIdx = headerParts.findIndex(h => /Dim_Height|貨物高さ/i.test(h));
  if (heightIdx === -1) {
    heightIdx = headerParts.findIndex(h => !/Container/i.test(h) && /高さ|Height|H\(mm\)|DimZ|Dz|^H$/i.test(h));
  }

  let weightIdx = headerParts.findIndex(h => !/Cumulative/i.test(h) && /重量|重さ|Weight|Wt|Mass/i.test(h));
  let rotIdx = headerParts.findIndex(h => /Rotation_Index|RotationIndex|横回転|3D回転|回転|Orientation|Rotation|Yaw/i.test(h));
  let layerIdx = headerParts.findIndex(h => /段数|段|Layer|Tier/i.test(h));
  let fragileIdx = headerParts.findIndex(h => /天地無用|割れ物|壊れ物|壊れもの|Fragile/i.test(h));
  let floorIdx = headerParts.findIndex(h => /床置き|床面|床置き指定|直置き|Floor|FloorPlacement/i.test(h));
  let colorIdx = headerParts.findIndex(h => /カラー|色|Color|Hex/i.test(h));
  let manualIdx = headerParts.findIndex(h => /Manual_Adjusted|Manual|手動/i.test(h));

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

    // Rotation Index
    let rotationIndex = 0;
    if (rotIdx !== -1 && row[rotIdx] !== undefined && row[rotIdx] !== '') {
      const parsedRot = parseInt(String(row[rotIdx]), 10);
      if (!isNaN(parsedRot)) rotationIndex = parsedRot;
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

    // Manual Adjusted
    let isManual = false;
    if (manualIdx !== -1 && row[manualIdx] !== undefined && row[manualIdx] !== '') {
      const manStr = String(row[manualIdx]).toLowerCase().trim();
      isManual = manStr === '1' || manStr === 'true' || manStr === 'yes';
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
      rotationIndex,
      containerIndex,
      layer,
      isManual
    });
  }

  if (packedItems.length === 0) {
    throw new Error('マニフェストファイルから有効な積載貨物データを抽出できませんでした。');
  }

  // Sort packedItems by sequenceNumber
  packedItems.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // Determine container dimensions and type
  let detectedContainer = { ...fallbackContainer };
  let matchedStandard: Container | undefined;

  // Detect container from metadata comments or table columns
  let specifiedContId = metaContainerId;
  if (!specifiedContId && contIdIdx !== -1 && dataRows[0] && dataRows[0][contIdIdx]) {
    specifiedContId = String(dataRows[0][contIdIdx]).replace(/"/g, '').trim();
  }

  if (specifiedContId) {
    matchedStandard = STANDARD_CONTAINERS.find(c => c.id.toLowerCase() === specifiedContId!.toLowerCase());
    if (matchedStandard) {
      detectedContainer = { ...matchedStandard };
    } else {
      detectedContainer = {
        ...detectedContainer,
        id: specifiedContId,
        name: specifiedContId
      };
    }
  }

  if (metaContainerDims) {
    if (!matchedStandard) {
      const matchByDims = STANDARD_CONTAINERS.find(c =>
        c.length === metaContainerDims!.length &&
        c.width === metaContainerDims!.width &&
        c.height === metaContainerDims!.height
      );
      if (matchByDims) {
        detectedContainer = { ...matchByDims };
      } else {
        detectedContainer = {
          ...detectedContainer,
          length: metaContainerDims.length,
          width: metaContainerDims.width,
          height: metaContainerDims.height
        };
      }
    }
  } else if (contLenIdx !== -1 && contWidthIdx !== -1 && contHeightIdx !== -1 && dataRows[0]) {
    const cL = parseInt(String(dataRows[0][contLenIdx]), 10);
    const cW = parseInt(String(dataRows[0][contWidthIdx]), 10);
    const cH = parseInt(String(dataRows[0][contHeightIdx]), 10);
    if (!isNaN(cL) && !isNaN(cW) && !isNaN(cH) && cL > 0 && cW > 0 && cH > 0) {
      if (!matchedStandard) {
        const matchByCols = STANDARD_CONTAINERS.find(c => c.length === cL && c.width === cW && c.height === cH);
        if (matchByCols) {
          detectedContainer = { ...matchByCols };
        } else {
          detectedContainer = {
            ...detectedContainer,
            length: cL,
            width: cW,
            height: cH
          };
        }
      }
    }
  }
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
    id: `cargo_${g.sku.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
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
    hasManualAdjustments: packedItems.some(p => p.isManual)
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
    warnings,
    isExportCurrentPlan,
    algorithmName: metaAlgorithmName,
    exportedAt: metaExportedAt
  };
}

/**
 * Parses JSON format manifest or Export Current Plan JSON
 */
export function parseManifestJson(
  jsonText: string,
  fileName: string,
  fallbackContainer: Container
): ManifestParseResult {
  const parsed = JSON.parse(jsonText);
  const warnings: string[] = [];

  let rawPackedItems: any[] = [];
  let detectedContainer: Container = { ...fallbackContainer };

  // 1. Detect and restore container metadata
  if (parsed.container) {
    const cObj = parsed.container;
    const matched = cObj.id ? STANDARD_CONTAINERS.find(c => c.id.toLowerCase() === String(cObj.id).toLowerCase()) : undefined;
    const len = cObj.dimensionsMm?.length ?? cObj.length ?? matched?.length ?? fallbackContainer.length;
    const wid = cObj.dimensionsMm?.width ?? cObj.width ?? matched?.width ?? fallbackContainer.width;
    const hei = cObj.dimensionsMm?.height ?? cObj.height ?? matched?.height ?? fallbackContainer.height;
    const maxWt = cObj.maxPayloadWeightKg ?? cObj.maxWeight ?? matched?.maxWeight ?? fallbackContainer.maxWeight;
    const tare = cObj.tareWeightKg ?? cObj.tareWeight ?? matched?.tareWeight ?? fallbackContainer.tareWeight;

    detectedContainer = {
      ...(matched || fallbackContainer),
      id: cObj.id || matched?.id || fallbackContainer.id,
      name: cObj.name || matched?.name || fallbackContainer.name,
      category: cObj.category || matched?.category || fallbackContainer.category,
      length: len,
      width: wid,
      height: hei,
      maxWeight: maxWt,
      tareWeight: tare,
      costEstimate: cObj.costEstimate ?? matched?.costEstimate ?? fallbackContainer.costEstimate
    };
  }

  // 2. Extract packed items list
  if (Array.isArray(parsed)) {
    rawPackedItems = parsed;
  } else if (parsed && Array.isArray(parsed.packedItems)) {
    rawPackedItems = parsed.packedItems;
  } else if (parsed && Array.isArray(parsed.items)) {
    rawPackedItems = parsed.items;
  } else {
    throw new Error('JSON内に積載データ (packedItems 配列) が見つかりませんでした。');
  }

  const packedItems: PackedItem[] = [];
  const colorMap = new Map<string, string>();
  let colorCounter = 0;

  for (let i = 0; i < rawPackedItems.length; i++) {
    const p = rawPackedItems[i];
    if (!p) continue;

    const itemName = String(p.name || '').trim() || `Item-${i + 1}`;
    const sku = String(p.sku || p.name || '').trim() || itemName;

    // Handle nested positionMm: { x, y, z } or flat x, y, z
    const x = p.positionMm ? Math.max(0, Math.round(Number(p.positionMm.x) || 0)) : Math.max(0, Math.round(Number(p.x) || 0));
    const y = p.positionMm ? Math.max(0, Math.round(Number(p.positionMm.y) || 0)) : Math.max(0, Math.round(Number(p.y) || 0));
    const z = p.positionMm ? Math.max(0, Math.round(Number(p.positionMm.z) || 0)) : Math.max(0, Math.round(Number(p.z) || 0));

    // Handle nested dimensionsMm: { length, width, height } or flat length, width, height
    const length = p.dimensionsMm ? Math.max(10, Math.round(Number(p.dimensionsMm.length) || 1000)) : Math.max(10, Math.round(Number(p.length) || 1000));
    const width = p.dimensionsMm ? Math.max(10, Math.round(Number(p.dimensionsMm.width) || 1000)) : Math.max(10, Math.round(Number(p.width) || 1000));
    const height = p.dimensionsMm ? Math.max(10, Math.round(Number(p.dimensionsMm.height) || 1000)) : Math.max(10, Math.round(Number(p.height) || 1000));

    // Handle weightKg or weight
    const weight = Math.max(0.1, Math.round(Number(p.weightKg !== undefined ? p.weightKg : (p.weight !== undefined ? p.weight : 50))));

    // Rotation: handle orientation.rotationIndex, flat rotationIndex, or isRotatedYaw
    let rotationIndex = 0;
    if (p.orientation?.rotationIndex !== undefined) {
      rotationIndex = Number(p.orientation.rotationIndex) || 0;
    } else if (p.rotationIndex !== undefined) {
      rotationIndex = Number(p.rotationIndex) || 0;
    } else if (p.orientation?.isRotatedYaw) {
      rotationIndex = 1;
    }

    const seq = p.sequenceNumber !== undefined ? (parseInt(String(p.sequenceNumber), 10) || (i + 1)) : (i + 1);
    const containerIndex = p.containerIndex !== undefined ? (parseInt(String(p.containerIndex), 10) || 1) : 1;
    const layer = p.layer !== undefined ? Number(p.layer) : (z === 0 ? 1 : Math.max(1, Math.floor(z / Math.max(100, height * 0.8)) + 1));
    const fragile = Boolean(p.fragile);
    const floorPlacement = Boolean(p.floorPlacement);
    const isManual = Boolean(p.isManual);

    let color = p.color;
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      const colorKey = sku || itemName;
      if (!colorMap.has(colorKey)) {
        colorMap.set(colorKey, VIVID_NEON_PALETTE[colorCounter % VIVID_NEON_PALETTE.length]);
        colorCounter++;
      }
      color = colorMap.get(colorKey)!;
    }

    packedItems.push({
      id: p.id || `manifest_item_${i + 1}_${Date.now()}`,
      cargoItemId: p.cargoItemId || `cargo_${sku.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
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
      rotationIndex,
      containerIndex,
      layer,
      isManual
    });
  }

  // Sort by sequenceNumber
  packedItems.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // Restore unplacedItems if present
  const unplacedItems: UnplacedItem[] = [];
  if (parsed.unplacedItems && Array.isArray(parsed.unplacedItems)) {
    for (let uIdx = 0; uIdx < parsed.unplacedItems.length; uIdx++) {
      const u = parsed.unplacedItems[uIdx];
      if (!u) continue;
      const uSku = String(u.sku || u.name || `SKU-${uIdx + 1}`).trim();
      let safeReason: UnplacedItem['reason'] = 'no_spatial_fit';
      if (u.reason === 'exceeds_weight' || u.reason === 'stacking_constraint' || u.reason === 'floor_constraint') {
        safeReason = u.reason;
      }
      unplacedItems.push({
        cargoItemId: u.cargoItemId || `cargo_${uSku.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        sku: uSku,
        name: u.name || `Unplaced-${uIdx + 1}`,
        count: Math.max(1, Number(u.count) || 1),
        dimensions: {
          length: u.dimensionsMm?.length ?? u.dimensions?.length ?? 1000,
          width: u.dimensionsMm?.width ?? u.dimensions?.width ?? 1000,
          height: u.dimensionsMm?.height ?? u.dimensions?.height ?? 1000
        },
        weight: u.weightKg !== undefined ? Number(u.weightKg) : (u.weight !== undefined ? Number(u.weight) : 50),
        reason: safeReason
      });
    }
  }

  // Group packed items by container index
  const containerIndices = Array.from(new Set(packedItems.map(p => p.containerIndex))).sort((a, b) => a - b);
  if (containerIndices.length === 0) containerIndices.push(1);

  const containerLoads: ContainerLoad[] = [];

  for (const cIdx of containerIndices) {
    const cItems = packedItems.filter(p => p.containerIndex === cIdx);
    let contForLoad = detectedContainer;
    if (parsed.containers && Array.isArray(parsed.containers)) {
      const foundContMeta = parsed.containers.find((c: any) => c.containerIndex === cIdx);
      if (foundContMeta) {
        const matched = foundContMeta.containerId ? STANDARD_CONTAINERS.find(c => c.id.toLowerCase() === String(foundContMeta.containerId).toLowerCase()) : undefined;
        contForLoad = {
          ...(matched || detectedContainer),
          id: foundContMeta.containerId || matched?.id || detectedContainer.id,
          name: foundContMeta.containerName || matched?.name || detectedContainer.name,
          length: foundContMeta.dimensionsMm?.length ?? matched?.length ?? detectedContainer.length,
          width: foundContMeta.dimensionsMm?.width ?? matched?.width ?? detectedContainer.width,
          height: foundContMeta.dimensionsMm?.height ?? matched?.height ?? detectedContainer.height,
          maxWeight: foundContMeta.maxWeightKg ?? matched?.maxWeight ?? detectedContainer.maxWeight,
          tareWeight: foundContMeta.tareWeightKg ?? matched?.tareWeight ?? detectedContainer.tareWeight
        };
      }
    }
    const cMetrics = calculateContainerMetrics(contForLoad, cItems);
    containerLoads.push({
      containerIndex: cIdx,
      container: contForLoad,
      packedItems: cItems,
      metrics: cMetrics
    });
  }

  // Overall metrics
  const totalItemCount = packedItems.length;
  const totalPackedWeightKg = packedItems.reduce((s, p) => s + p.weight, 0);
  const totalCapacityVolumeCbm = containerLoads.reduce((s, c) => s + (c.container.length * c.container.width * c.container.height) / 1_000_000_000, 0);
  const totalPackedVolumeCbm = containerLoads.reduce((s, c) => s + c.metrics.packedVolumeCbm, 0);
  const totalCapacityWeightKg = containerLoads.reduce((s, c) => s + c.container.maxWeight, 0);

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
    totalUnplacedCount: unplacedItems.reduce((s, u) => s + u.count, 0),
    totalCostEstimate: containerLoads.reduce((s, c) => s + (c.container.costEstimate || 2000), 0)
  };

  const primaryMetrics = containerLoads[0]?.metrics || calculateContainerMetrics(detectedContainer, packedItems);

  // Restore or reconstruct CargoItem list for inventory synchronization
  let finalCargoList: CargoItem[] = [];

  if (parsed.cargoList && Array.isArray(parsed.cargoList) && parsed.cargoList.length > 0) {
    // Direct fidelity restoration from Export Current Plan
    finalCargoList = parsed.cargoList.map((c: any, idx: number) => {
      const sku = String(c.sku || c.name || `SKU-${idx + 1}`).trim();
      const safeId = String(c.id || `cargo_${sku.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
      return {
        id: safeId,
        sku,
        name: String(c.name || `Cargo-${idx + 1}`),
        length: Math.max(10, Math.round(Number(c.length) || 1000)),
        width: Math.max(10, Math.round(Number(c.width) || 1000)),
        height: Math.max(10, Math.round(Number(c.height) || 1000)),
        weight: Math.max(0.1, Number(Number(c.weight || 50).toFixed(2))),
        quantity: Math.max(1, Math.round(Number(c.quantity) || 1)),
        color: c.color && /^#[0-9A-Fa-f]{6}$/.test(c.color) ? c.color : VIVID_NEON_PALETTE[idx % VIVID_NEON_PALETTE.length],
        allowYaw: c.allowYaw !== undefined ? Boolean(c.allowYaw) : true,
        allowTilt: false,
        allowRoll: false,
        maxStackWeight: c.maxStackWeight !== undefined ? Number(c.maxStackWeight) : (c.fragile ? 0 : 200),
        fragile: Boolean(c.fragile),
        floorPlacement: Boolean(c.floorPlacement),
        priority: c.priority !== undefined ? Number(c.priority) : (Number(c.weight) > 200 ? 1 : 3),
        enabled: c.enabled !== undefined ? Boolean(c.enabled) : true
      };
    });
  } else {
    // Reconstruct CargoItem list from packed items + unplaced items
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

    for (const u of unplacedItems) {
      const key = `${u.sku}__${u.name}__${u.dimensions.length}__${u.dimensions.width}__${u.dimensions.height}__${u.weight}`;
      const existing = cargoGroupMap.get(key);
      if (existing) {
        existing.count += u.count;
      } else {
        cargoGroupMap.set(key, {
          sku: u.sku,
          name: u.name,
          length: u.dimensions.length,
          width: u.dimensions.width,
          height: u.dimensions.height,
          weight: u.weight,
          color: '#64748b',
          fragile: false,
          floorPlacement: false,
          count: u.count
        });
      }
    }

    finalCargoList = Array.from(cargoGroupMap.values()).map((g, idx) => ({
      id: `cargo_${g.sku.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
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
  }

  const isExportCurrentPlan = Boolean(
    parsed.version === "1.0" || 
    parsed.software === "AI 3D Container Loading Planner" || 
    (parsed.summary && parsed.packedItems && parsed.container)
  );

  const packingResult: PackingResult = {
    container: detectedContainer,
    containers: containerLoads,
    packedItems,
    unplacedItems,
    metrics: primaryMetrics,
    overallMetrics,
    rawTotalItemCount: totalItemCount,
    safetyLimitTruncatedCount: 0,
    hasManualAdjustments: Boolean(parsed.hasManualAdjustments || packedItems.some(p => p.isManual))
  };

  return {
    success: true,
    fileName,
    totalItems: packedItems.length,
    totalWeightKg: totalPackedWeightKg,
    containerCount: containerLoads.length,
    detectedContainer,
    cargoList: finalCargoList,
    packingResult,
    warnings,
    isExportCurrentPlan,
    algorithmName: parsed.algorithm,
    exportedAt: parsed.exportedAt
  };
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

/**
 * Downloads a sample Export Current Plan structured JSON template
 */
export function downloadSamplePlanJson(): void {
  const samplePlanData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    software: "AI 3D Container Loading Planner",
    algorithm: "Extreme Points 3D (BFD)",
    hasManualAdjustments: false,
    container: {
      id: "40hc",
      name: "40ft High Cube Container (40HC)",
      category: "iso_sea",
      dimensionsMm: {
        length: 12032,
        width: 2352,
        height: 2698
      },
      volumeCbm: 76.4,
      maxPayloadWeightKg: 28500,
      tareWeightKg: 3900,
      costEstimate: 2800
    },
    summary: {
      totalContainers: 1,
      totalPackedItems: 6,
      totalPackedWeightKg: 1047,
      totalPackedVolumeCbm: 8.42,
      volumeUtilizationPercent: 11.02,
      weightUtilizationPercent: 3.67,
      unplacedItemsCount: 0,
      centerOfGravityMm: {
        x: 1200,
        y: 850,
        z: 600
      }
    },
    containers: [
      {
        containerIndex: 1,
        containerId: "40hc",
        containerName: "40ft High Cube Container (40HC)",
        dimensionsMm: {
          length: 12032,
          width: 2352,
          height: 2698
        },
        volumeCbm: 76.4,
        maxWeightKg: 28500,
        tareWeightKg: 3900,
        metrics: {
          packedCount: 6,
          packedWeightKg: 1047,
          packedVolumeCbm: 8.42,
          volumeUtilizationPercent: 11.02,
          weightUtilizationPercent: 3.67
        },
        itemCount: 6
      }
    ],
    packedItems: [
      {
        sequenceNumber: 1,
        containerIndex: 1,
        id: "plan_item_1",
        sku: "PURY-P350YNW-A2",
        name: "PURY-P350YNW-A2",
        positionMm: { x: 0, y: 0, z: 0 },
        dimensionsMm: { length: 760, width: 1270, height: 1920 },
        orientation: { rotationIndex: 0, isRotatedYaw: false, yawDegrees: 0, description: "Standard 0°" },
        weightKg: 292,
        cumulativeWeightKg: 292,
        layer: 1,
        fragile: true,
        floorPlacement: true,
        color: "#ff0055",
        isManual: false
      },
      {
        sequenceNumber: 2,
        containerIndex: 1,
        id: "plan_item_2",
        sku: "PURY-P350YNW-A2",
        name: "PURY-P350YNW-A2",
        positionMm: { x: 760, y: 0, z: 0 },
        dimensionsMm: { length: 760, width: 1270, height: 1920 },
        orientation: { rotationIndex: 0, isRotatedYaw: false, yawDegrees: 0, description: "Standard 0°" },
        weightKg: 292,
        cumulativeWeightKg: 584,
        layer: 1,
        fragile: true,
        floorPlacement: true,
        color: "#ff0055",
        isManual: false
      },
      {
        sequenceNumber: 3,
        containerIndex: 1,
        id: "plan_item_3",
        sku: "PURY-M200YNW-A1",
        name: "PURY-M200YNW-A1",
        positionMm: { x: 1520, y: 0, z: 0 },
        dimensionsMm: { length: 760, width: 950, height: 1920 },
        orientation: { rotationIndex: 0, isRotatedYaw: false, yawDegrees: 0, description: "Standard 0°" },
        weightKg: 244,
        cumulativeWeightKg: 828,
        layer: 1,
        fragile: true,
        floorPlacement: true,
        color: "#00e5ff",
        isManual: false
      },
      {
        sequenceNumber: 4,
        containerIndex: 1,
        id: "plan_item_4",
        sku: "CMB-M108V-KB1",
        name: "CMB-M108V-KB1",
        positionMm: { x: 0, y: 1270, z: 0 },
        dimensionsMm: { length: 700, width: 1100, height: 1230 },
        orientation: { rotationIndex: 0, isRotatedYaw: false, yawDegrees: 0, description: "Standard 0°" },
        weightKg: 125,
        cumulativeWeightKg: 953,
        layer: 1,
        fragile: false,
        floorPlacement: false,
        color: "#ffd600",
        isManual: false
      },
      {
        sequenceNumber: 5,
        containerIndex: 1,
        id: "plan_item_5",
        sku: "CMB-M104V-J1",
        name: "CMB-M104V-J1",
        positionMm: { x: 0, y: 1270, z: 1230 },
        dimensionsMm: { length: 700, width: 1070, height: 380 },
        orientation: { rotationIndex: 0, isRotatedYaw: false, yawDegrees: 0, description: "Standard 0°" },
        weightKg: 32,
        cumulativeWeightKg: 985,
        layer: 2,
        fragile: false,
        floorPlacement: false,
        color: "#00e676",
        isManual: false
      },
      {
        sequenceNumber: 6,
        containerIndex: 1,
        id: "plan_item_6",
        sku: "CMB-M106V-J1",
        name: "CMB-M106V-J1",
        positionMm: { x: 700, y: 1270, z: 1230 },
        dimensionsMm: { length: 700, width: 1070, height: 380 },
        orientation: { rotationIndex: 0, isRotatedYaw: false, yawDegrees: 0, description: "Standard 0°" },
        weightKg: 35,
        cumulativeWeightKg: 1020,
        layer: 2,
        fragile: false,
        floorPlacement: false,
        color: "#ff6d00",
        isManual: false
      }
    ],
    unplacedItems: [],
    cargoList: [
      {
        id: "cargo_PURY_P350YNW_A2",
        sku: "PURY-P350YNW-A2",
        name: "PURY-P350YNW-A2",
        length: 760,
        width: 1270,
        height: 1920,
        weight: 292,
        quantity: 2,
        color: "#ff0055",
        allowYaw: true,
        fragile: true,
        floorPlacement: true,
        priority: 1,
        enabled: true
      },
      {
        id: "cargo_PURY_M200YNW_A1",
        sku: "PURY-M200YNW-A1",
        name: "PURY-M200YNW-A1",
        length: 760,
        width: 950,
        height: 1920,
        weight: 244,
        quantity: 1,
        color: "#00e5ff",
        allowYaw: true,
        fragile: true,
        floorPlacement: true,
        priority: 1,
        enabled: true
      },
      {
        id: "cargo_CMB_M108V_KB1",
        sku: "CMB-M108V-KB1",
        name: "CMB-M108V-KB1",
        length: 700,
        width: 1100,
        height: 1230,
        weight: 125,
        quantity: 1,
        color: "#ffd600",
        allowYaw: true,
        fragile: false,
        floorPlacement: false,
        priority: 3,
        enabled: true
      },
      {
        id: "cargo_CMB_M104V_J1",
        sku: "CMB-M104V-J1",
        name: "CMB-M104V-J1",
        length: 700,
        width: 1070,
        height: 380,
        weight: 32,
        quantity: 1,
        color: "#00e676",
        allowYaw: true,
        fragile: false,
        floorPlacement: false,
        priority: 3,
        enabled: true
      },
      {
        id: "cargo_CMB_M106V_J1",
        sku: "CMB-M106V-J1",
        name: "CMB-M106V-J1",
        length: 700,
        width: 1070,
        height: 380,
        weight: 35,
        quantity: 1,
        color: "#ff6d00",
        allowYaw: true,
        fragile: false,
        floorPlacement: false,
        priority: 3,
        enabled: true
      }
    ]
  };

  const jsonContent = JSON.stringify(samplePlanData, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'Loading_Plan_Sample_Template.json');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
