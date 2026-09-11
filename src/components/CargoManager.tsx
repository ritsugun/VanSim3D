import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { CargoItem, Container, UnitSystem, Language } from '../types';
import { SAMPLE_CARGO_PRESETS, CargoPreset, SAMPLE_CSV_TEMPLATE } from '../data/presets';
import { 
  Plus, Trash2, Upload, Download, Sparkles, 
  ShieldAlert, Check, FileSpreadsheet, FileDown,
  Edit2, Sliders, CheckSquare, Square, CheckCheck, XSquare, RotateCw, Layers, ArrowDownToLine,
  AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Search, X, RotateCcw, ChevronDown
} from 'lucide-react';
import { formatVolume, formatWeight, formatWeightCompact } from '../utils/units';
import { VIVID_NEON_PALETTE } from '../utils/colors';

interface CargoManagerProps {
  cargoList: CargoItem[];
  onChangeCargoList: (newList: CargoItem[]) => void;
  container: Container;
  unitSystem: UnitSystem;
  language: Language;
  onSelectContainer?: (containerId: string) => void;
  onOpenImportManifest?: () => void;
}

const COLOR_PALETTE = VIVID_NEON_PALETTE;

export const CargoManager: React.FC<CargoManagerProps> = ({
  cargoList,
  onChangeCargoList,
  container,
  unitSystem,
  language,
  onSelectContainer,
  onOpenImportManifest
}) => {
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showPresetsModal, setShowPresetsModal] = useState<boolean>(false);
  const [importNotification, setImportNotification] = useState<string | null>(null);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState<boolean>(false);
  const [showExportDropdown, setShowExportDropdown] = useState<boolean>(false);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#download-template-btn') && !target.closest('#template-dropdown-menu')) {
        setShowTemplateDropdown(false);
      }
      if (!target.closest('#export-cargo-btn') && !target.closest('#export-dropdown-menu')) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sorting and search controls state for Cargo manifest
  const [sortField, setSortField] = useState<'none' | 'name' | 'weight' | 'quantity'>('none');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleSortToggle = (field: 'name' | 'weight' | 'quantity') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Sensible defaults: A-Z (asc) for name, heaviest (desc) for weight, highest qty (desc) for quantity
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleResetSort = () => {
    setSortField('none');
    setSortOrder('asc');
  };

  const handleApplySortToManifest = () => {
    if (sortField === 'none') return;
    const sortedEntireList = [...cargoList].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        const nameA = (a.name || a.sku || '').trim();
        const nameB = (b.name || b.sku || '').trim();
        cmp = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'weight') {
        cmp = (Number(a.weight) || 0) - (Number(b.weight) || 0);
      } else if (sortField === 'quantity') {
        cmp = (Number(a.quantity) || 0) - (Number(b.quantity) || 0);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    onChangeCargoList(sortedEntireList);
    setSortField('none');
    const fieldLabel = sortField === 'name' ? (isJa ? '品名' : 'Name') : sortField === 'weight' ? (isJa ? '重量' : 'Weight') : (isJa ? '数量' : 'Quantity');
    const orderLabel = sortOrder === 'asc' ? (isJa ? '昇順' : 'Ascending') : (isJa ? '降順' : 'Descending');
    setImportNotification(
      isJa 
        ? `${fieldLabel}（${orderLabel}）の並び順をマニフェストに反映しました` 
        : `Applied ${fieldLabel} (${orderLabel}) order to manifest`
    );
    setTimeout(() => setImportNotification(null), 3000);
  };

  // New item draft form state
  const [newItem, setNewItem] = useState<Omit<CargoItem, 'id'>>({
    sku: 'CMB-M108V-KB1',
    name: 'CMB-M108V-KB1',
    width: 1100,
    height: 1230,
    length: 700,
    weight: 125,
    quantity: 1,
    color: '#ef4444',
    allowTilt: false,
    allowRoll: false,
    allowYaw: true,
    maxStackWeight: 120,
    fragile: false,
    floorPlacement: false,
    priority: 3,
    enabled: true
  });

  const isJa = language === 'ja';

  // Handle Add Item
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const created: CargoItem = {
      ...newItem,
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      length: Math.max(10, Number(newItem.length)),
      width: Math.max(10, Number(newItem.width)),
      height: Math.max(10, Number(newItem.height)),
      weight: Math.max(0.1, Number(newItem.weight)),
      quantity: Math.max(1, Number(newItem.quantity || 1)),
      floorPlacement: !!newItem.floorPlacement,
      enabled: true
    };
    onChangeCargoList([...cargoList, created]);
    setIsAddingNew(false);
    // Reset draft for next time
    setNewItem({
      sku: `CMB-NEW-${Date.now().toString().slice(-3)}`,
      name: `CMB-NEW-${Date.now().toString().slice(-3)}`,
      width: 1000,
      height: 400,
      length: 800,
      weight: 45,
      quantity: 5,
      color: COLOR_PALETTE[(cargoList.length + 1) % COLOR_PALETTE.length],
      allowTilt: false,
      allowRoll: false,
      allowYaw: true,
      maxStackWeight: 100,
      fragile: false,
      floorPlacement: false,
      priority: 3,
      enabled: true
    });
  };

  // Delete Item
  const handleDeleteItem = (id: string) => {
    onChangeCargoList(cargoList.filter(c => c.id !== id));
  };

  // Update item field directly
  const handleUpdateItem = (id: string, updates: Partial<CargoItem>) => {
    onChangeCargoList(
      cargoList.map(c => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  // Bulk enable / disable all
  const handleToggleAll = (enable: boolean) => {
    onChangeCargoList(cargoList.map(c => ({ ...c, enabled: enable })));
  };

  // Consolidate & Aggregate identical cargo items (same SKU/name, dimensions, weight, fragile & rotation rules, and floor placement)
  const handleConsolidateDuplicates = () => {
    const map = new Map<string, CargoItem>();
    let mergedCount = 0;

    cargoList.forEach(item => {
      const key = `${item.name.trim().toLowerCase()}_${item.width}_${item.height}_${item.length}_${item.weight}_${item.allowYaw !== false}_${Boolean(item.fragile)}_${Boolean(item.floorPlacement)}`;
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.quantity += item.quantity;
        if (item.enabled !== false) existing.enabled = true;
        mergedCount++;
      } else {
        map.set(key, { ...item });
      }
    });

    if (mergedCount > 0) {
      const consolidated = Array.from(map.values());
      onChangeCargoList(consolidated);
      setImportNotification(isJa ? `重複する ${mergedCount} 件の貨物を数量集約しました！` : `Consolidated ${mergedCount} duplicate items into single entries!`);
      setTimeout(() => setImportNotification(null), 3000);
    } else {
      setImportNotification(isJa ? '重複する品目はありません' : 'No duplicate items found');
      setTimeout(() => setImportNotification(null), 2500);
    }
  };

  // Load Preset
  const handleLoadPreset = (preset: CargoPreset) => {
    onChangeCargoList(preset.items.map(it => ({ ...it, enabled: it.enabled !== false })));
    if (onSelectContainer && preset.recommendedContainerId) {
      onSelectContainer(preset.recommendedContainerId);
    }
    setShowPresetsModal(false);
  };

  // Export CSV (Following schema: 貨物名,幅(mm),高さ(mm),奥行(mm),重量(kg),個数,横回転許可(1/0),カラー(16進数),割れ物(1/0),床置き(1/0),積載対象(1/0))
  const handleExportCsv = () => {
    const headers = ['貨物名', '幅(mm)', '高さ(mm)', '奥行(mm)', '重量(kg)', '個数', '横回転許可(1/0)', 'カラー(16進数)', '割れ物(1/0)', '床置き(1/0)', '積載対象(1/0)'];
    const rows = cargoList.map(c => [
      `"${c.name}"`,
      c.width,
      c.height,
      c.length,
      c.weight,
      c.quantity,
      c.allowYaw !== false ? 1 : 0,
      c.color,
      c.fragile ? 1 : 0,
      c.floorPlacement ? 1 : 0,
      c.enabled !== false ? 1 : 0
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `cargo_manifest_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Excel (.xlsx)
  const handleExportExcel = () => {
    if (cargoList.length === 0) return;
    const headers = ['貨物名', '幅(mm)', '高さ(mm)', '奥行(mm)', '重量(kg)', '個数', '横回転許可(1/0)', 'カラー(16進数)', '割れ物(1/0)', '床置き(1/0)', '積載対象(1/0)'];
    const rows = cargoList.map(c => [
      c.name,
      c.width,
      c.height,
      c.length,
      c.weight,
      c.quantity,
      c.allowYaw !== false ? 1 : 0,
      c.color,
      c.fragile ? 1 : 0,
      c.floorPlacement ? 1 : 0,
      c.enabled !== false ? 1 : 0
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [
      { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 8 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '貨物一覧');
    XLSX.writeFile(wb, `cargo_manifest_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Download Sample CSV Template
  const handleDownloadCsvTemplate = () => {
    const blob = new Blob(['\uFEFF' + SAMPLE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'cargo_list_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Download Sample Excel Template (.xlsx)
  const handleDownloadExcelTemplate = () => {
    const headers = ['貨物名', '幅(mm)', '高さ(mm)', '奥行(mm)', '重量(kg)', '個数', '横回転許可(1/0)', 'カラー(16進数)', '割れ物(1/0)', '床置き(1/0)', '積載対象(1/0)'];
    const sampleRows = [
      ['CMB-M108V-KB1', 1100, 1230, 700, 125, 1, 1, '#ef4444', 0, 0, 0],
      ['PURY-P350YNW-A2', 1270, 1920, 760, 292, 5, 1, '#f97316', 1, 1, 0],
      ['PURY-M200YNW-A1', 950, 1920, 760, 244, 2, 1, '#ec4899', 1, 1, 0],
      ['CMB-M104V-J1', 1070, 380, 700, 32, 2, 1, '#3b82f6', 0, 0, 0],
      ['CMB-M104V-KB1', 1100, 1230, 700, 101, 1, 1, '#14b8a6', 0, 0, 0],
      ['CMB-M106V-J1', 1070, 380, 700, 35, 5, 1, '#d97706', 0, 0, 0],
      ['CMB-M108V-J1', 1070, 380, 700, 39, 5, 1, '#059669', 0, 0, 0],
      ['CMB-M1012V-J1', 1380, 380, 840, 58, 10, 1, '#0284c7', 0, 0, 0]
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = [
      { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 8 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '貨物テンプレート');
    XLSX.writeFile(wb, 'cargo_list_template.xlsx');
  };

  // Backward compatibility wrapper for template download
  const handleDownloadTemplate = handleDownloadExcelTemplate;

  // Unified parser for 2D array data (from either Excel or CSV)
  const parseRowsToCargoItems = (rawRows: any[][], fileTypeLabel: string) => {
    if (!rawRows || rawRows.length === 0) {
      setImportNotification(isJa ? `${fileTypeLabel} の中にデータが見つかりませんでした。` : `No data found in ${fileTypeLabel}.`);
      setTimeout(() => setImportNotification(null), 4000);
      return;
    }

    // Filter out completely empty rows
    const nonEmptyRows = rawRows.filter(row => Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''));
    if (nonEmptyRows.length === 0) {
      setImportNotification(isJa ? `${fileTypeLabel} の中に有効なデータ行がありませんでした。` : `No valid rows in ${fileTypeLabel}.`);
      setTimeout(() => setImportNotification(null), 4000);
      return;
    }

    // Intelligent header row detection: scan top 10 rows for keywords
    let headerRowIndex = 0;
    let maxKeywordMatches = 0;
    const headerRegex = /貨物名|品名|商品名|型番|SKU|Name|Model|Item|幅|Width|高さ|Height|奥行|奥行き|長さ|Depth|Length|重量|Weight|Kg|Wt|重さ|個数|数量|Quantity|Qty|MaxQty/i;

    const scanLimit = Math.min(10, nonEmptyRows.length);
    for (let r = 0; r < scanLimit; r++) {
      const matchCount = nonEmptyRows[r].filter(cell => typeof cell === 'string' && headerRegex.test(cell)).length;
      if (matchCount > maxKeywordMatches) {
        maxKeywordMatches = matchCount;
        headerRowIndex = r;
      }
    }

    const headerParts = (nonEmptyRows[headerRowIndex] || []).map(s => String(s ?? '').trim().replace(/^"|"$/g, ''));

    // Check column index mappings
    let nameIdx = headerParts.findIndex(h => /貨物名|品名|商品名|型番|SKU|Name|Model|Item/i.test(h));
    let widthIdx = headerParts.findIndex(h => /幅|Width|W(?![a-z])/i.test(h));
    let heightIdx = headerParts.findIndex(h => /高さ|Height|H(?![a-z])/i.test(h));
    let depthIdx = headerParts.findIndex(h => /奥行|奥行き|長さ|Depth|Length|L(?![a-z])|D(?![a-z])/i.test(h));
    let weightIdx = headerParts.findIndex(h => /重量|Weight|Kg|Wt|重さ/i.test(h));
    let qtyIdx = headerParts.findIndex(h => /個数|数量|最大個数|最大数量|Quantity|Qty|MaxQty|Count/i.test(h));
    let minQtyIdx = headerParts.findIndex(h => /最小個数|最小数量|MinQty|Min/i.test(h));
    let rotIdx = headerParts.findIndex(h => /横回転|3D回転|回転許可|回転|Rotate|Rotation|Yaw/i.test(h));
    let colorIdx = headerParts.findIndex(h => /カラー|色|Color|Hex/i.test(h));
    let fragileIdx = headerParts.findIndex(h => /割れ物|天地無用|壊れ物|壊れもの|Fragile/i.test(h));
    let floorIdx = headerParts.findIndex(h => /床置き|床面|床|Floor|FloorPlacement|MustBeOnFloor/i.test(h));
    let enabledIdx = headerParts.findIndex(h => /積載対象|積載|対象|Enabled|Active|Include|Select/i.test(h));

    // Positional fallbacks if headers couldn't be matched
    if (nameIdx === -1) nameIdx = 0;
    if (widthIdx === -1) widthIdx = 1;
    if (heightIdx === -1) heightIdx = 2;
    if (depthIdx === -1) depthIdx = 3;
    if (weightIdx === -1) weightIdx = 4;
    
    const isOld10Col = headerParts.length >= 10 || (minQtyIdx !== -1 && minQtyIdx !== qtyIdx);
    if (qtyIdx === -1) {
      qtyIdx = isOld10Col ? 6 : 5;
    }
    if (rotIdx === -1) rotIdx = isOld10Col ? 7 : 6;
    if (colorIdx === -1) colorIdx = isOld10Col ? 8 : 7;
    if (fragileIdx === -1) fragileIdx = isOld10Col ? 9 : 8;

    const newItems: CargoItem[] = [];
    const dataRows = nonEmptyRows.slice(headerRowIndex + 1);

    for (let i = 0; i < dataRows.length; i++) {
      const parts = dataRows[i];
      if (!parts || parts.length === 0) continue;

      const rawName = parts[nameIdx];
      const rawWidth = parts[widthIdx];
      const rawHeight = parts[heightIdx];
      const rawDepth = parts[depthIdx];
      const rawWeight = parts[weightIdx];
      const rawQty = parts[qtyIdx];

      // If dimensions and name are all missing or empty, skip
      if (!rawName && !rawWidth && !rawHeight && !rawDepth) continue;

      const itemName = String(rawName || '').trim() || `Cargo-${i + 1}`;
      const itemWidth = Math.max(50, Math.round(Number(rawWidth))) || 1000;
      const itemHeight = Math.max(50, Math.round(Number(rawHeight))) || 1000;
      const itemDepth = Math.max(50, Math.round(Number(rawDepth))) || 1000;
      const itemWeight = Math.max(1, Math.round(Number(rawWeight))) || 50;
      const itemQty = Math.max(1, Math.round(Number(rawQty) || (minQtyIdx !== -1 ? Number(parts[minQtyIdx]) : 1) || 1));

      // Rotation flag
      let allowRot = true;
      if (rotIdx !== -1 && parts[rotIdx] !== undefined && parts[rotIdx] !== '') {
        const rawRotStr = String(parts[rotIdx]).toLowerCase().trim();
        allowRot = rawRotStr === '1' || rawRotStr === 'true' || rawRotStr === 'yes' || rawRotStr === 'ok' || rawRotStr === '可' || rawRotStr === '許可';
      }

      // Color
      const rawColor = parts[colorIdx] !== undefined ? String(parts[colorIdx]).trim() : '';
      const validHex = /^#[0-9A-Fa-f]{6}$/.test(rawColor) ? rawColor : COLOR_PALETTE[i % COLOR_PALETTE.length];

      // Explicit Fragile Flag
      let isFragile = false;
      if (fragileIdx !== -1 && parts[fragileIdx] !== undefined && parts[fragileIdx] !== '') {
        const rawFrag = String(parts[fragileIdx]).toLowerCase().trim();
        isFragile = rawFrag === '1' || rawFrag === 'true' || rawFrag === 'yes' || rawFrag === '割れ物' || rawFrag === '天地無用';
      } else {
        isFragile = itemHeight > 1800;
      }

      // Explicit Floor Placement Check
      let isFloorPlacement = false;
      if (floorIdx !== -1 && parts[floorIdx] !== undefined && parts[floorIdx] !== '') {
        const rawFloor = String(parts[floorIdx]).toLowerCase().trim();
        isFloorPlacement = rawFloor === '1' || rawFloor === 'true' || rawFloor === 'yes' || rawFloor === '床置き' || rawFloor === '要';
      }

      // Explicit Enabled / Selected Flag Check - Default initial state is Deselect (enabled: false) per user request
      let isEnabled = false;
      if (enabledIdx !== -1 && parts[enabledIdx] !== undefined && parts[enabledIdx] !== '') {
        const rawEn = String(parts[enabledIdx]).toLowerCase().trim();
        isEnabled = rawEn === '1' || rawEn === 'true' || rawEn === 'yes' || rawEn === 'ok' || rawEn === '対象' || rawEn === '選択' || rawEn === 'select';
      }

      newItems.push({
        id: `import_${Date.now()}_${i}`,
        sku: itemName,
        name: itemName,
        width: itemWidth,
        height: itemHeight,
        length: itemDepth,
        weight: itemWeight,
        quantity: itemQty,
        color: validHex,
        allowTilt: false,
        allowRoll: false,
        allowYaw: allowRot,
        maxStackWeight: isFragile ? 0 : (itemHeight > 1800 ? 0 : 150),
        fragile: isFragile,
        floorPlacement: isFloorPlacement,
        priority: itemWeight > 200 ? 1 : (itemWeight > 80 ? 2 : 3),
        enabled: isEnabled
      });
    }

    if (newItems.length > 0) {
      onChangeCargoList(newItems);
      const totalUnits = newItems.reduce((sum, item) => sum + item.quantity, 0);
      setImportNotification(
        isJa
          ? `${fileTypeLabel} から ${newItems.length} 品目（合計 ${totalUnits.toLocaleString()} 個）を取り込みました（初期状態: 未選択）。`
          : `Successfully imported ${newItems.length} items (${totalUnits.toLocaleString()} units) from ${fileTypeLabel} (initially deselected).`
      );
      setTimeout(() => setImportNotification(null), 4500);
    } else {
      setImportNotification(
        isJa
          ? `${fileTypeLabel} 内に有効な貨物データが見つかりませんでした。列構成をご確認ください。`
          : `No valid cargo data rows found in ${fileTypeLabel}. Please check column structure.`
      );
      setTimeout(() => setImportNotification(null), 5000);
    }
  };

  // Import Handler for both Excel (.xlsx, .xls) and CSV (.csv, .txt)
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const lowerName = fileName.toLowerCase();
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');

    try {
      if (isExcel) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new Error(isJa ? 'Excelファイル内にシートが見つかりませんでした。' : 'No worksheets found in the Excel file.');
        }
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
        parseRowsToCargoItems(rawRows, `Excel (${lowerName.endsWith('.xls') ? '.xls' : '.xlsx'})`);
      } else {
        // CSV or Text file with BOM & quotes handling
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
        parseRowsToCargoItems(rawRows, 'CSV');
      }
    } catch (err: any) {
      console.error('Error importing file:', err);
      setImportNotification(
        isJa
          ? `ファイルの読み込みに失敗しました: ${err?.message || 'ファイル形式をご確認ください'}`
          : `Failed to import file: ${err?.message || 'Please check file format'}`
      );
      setTimeout(() => setImportNotification(null), 5000);
    }

    e.target.value = '';
  };

  // Backward compatibility
  const handleImportCsv = handleImportFile;

  // Active / Selected items calculations
  const activeCargoList = cargoList.filter(c => c.enabled !== false);
  const activeCount = activeCargoList.length;
  const totalCount = cargoList.length;
  const hasDisabledItems = activeCount < totalCount;
  const isAllSelected = totalCount > 0 && activeCount === totalCount;
  const isNoneSelected = activeCount === 0;

  // Check if duplicate items exist
  const hasDuplicateItems = useMemo(() => {
    const seen = new Set<string>();
    for (const item of cargoList) {
      const key = `${item.name.trim().toLowerCase()}_${item.width}_${item.height}_${item.length}_${item.weight}_${item.allowYaw !== false}_${Boolean(item.fragile)}_${Boolean(item.floorPlacement)}`;
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [cargoList]);

  const totalQuantity = cargoList.reduce((sum, c) => sum + (c.quantity || 0), 0);
  const activeQuantity = activeCargoList.reduce((sum, c) => sum + (c.quantity || 0), 0);
  
  const activeVolumeCbm = activeCargoList.reduce((sum, c) => sum + (c.length * c.width * c.height * c.quantity) / 1_000_000_000, 0);
  const activeWeightKg = activeCargoList.reduce((sum, c) => sum + (c.weight * c.quantity), 0);
  const containerVolCbm = (container.length * container.width * container.height) / 1_000_000_000;

  // Filtered and sorted manifest items
  const displayedCargoList = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? cargoList.filter(item => 
          (item.name && item.name.toLowerCase().includes(query)) ||
          (item.sku && item.sku.toLowerCase().includes(query))
        )
      : [...cargoList];

    if (sortField === 'none') {
      return filtered;
    }

    const originalIndices = new Map(cargoList.map((item, i) => [item.id, i]));

    return filtered.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        const nameA = (a.name || a.sku || '').trim();
        const nameB = (b.name || b.sku || '').trim();
        cmp = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'weight') {
        cmp = (Number(a.weight) || 0) - (Number(b.weight) || 0);
      } else if (sortField === 'quantity') {
        cmp = (Number(a.quantity) || 0) - (Number(b.quantity) || 0);
      }

      if (cmp === 0) {
        cmp = (originalIndices.get(a.id) ?? 0) - (originalIndices.get(b.id) ?? 0);
      }

      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [cargoList, sortField, sortOrder, searchQuery]);

  return (
    <div id="cargo-manager-root" className="bg-white border border-slate-200 rounded-xl p-3 sm:p-3.5 shadow-xs text-slate-800 flex flex-col h-full">
      {/* Header with Title & Action Buttons */}
      <div className="flex items-center justify-between gap-2 mb-2.5 pb-2.5 border-b border-slate-100 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
            {isJa ? '積載貨物リスト' : 'Cargo Items'}
          </h2>
          <div className="flex items-center gap-1 text-xs">
            <span className={`px-2 py-0.5 rounded-full border font-semibold text-[10.5px] ${
              hasDisabledItems 
                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              {isJa 
                ? `積載対象: ${activeCount}/${totalCount}種 (${activeQuantity}/${totalQuantity}個)` 
                : `Active: ${activeCount}/${totalCount} (${activeQuantity}/${totalQuantity} pcs)`}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons Toolbar - Reordered & Grouped Logically */}
      <div id="cargo-action-buttons-toolbar" className="space-y-1.5 mb-2.5">
        {/* Row 1: Cargo Input & File Operations (+ Add -> Import -> Export -> Template -> Preset -> Reproduce) */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {/* 1. + Add Cargo (Primary Creation Action) */}
          <button
            type="button"
            id="add-new-cargo-btn"
            onClick={() => setIsAddingNew(!isAddingNew)}
            title={isJa ? '新しい貨物を手動入力で追加' : 'Add new cargo item manually'}
            className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 shadow-xs transition-all active:scale-95 text-xs cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isJa ? '追加' : 'Add'}</span>
          </button>

          {/* 2. Import Cargo (Accepts both Excel .xlsx/.xls and CSV) */}
          <label 
            id="import-cargo-label" 
            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer font-semibold flex items-center gap-1 transition-colors text-xs shadow-2xs shrink-0"
            title={isJa ? 'Excelファイル (.xlsx, .xls) または CSVファイルから一括取込' : 'Import from Excel (.xlsx/.xls) or CSV'}
          >
            <Upload className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isJa ? '取込' : 'Import'}</span>
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv, text/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
              onChange={handleImportFile} 
              className="hidden" 
            />
          </label>

          {/* 3. Export Cargo (Excel & CSV) */}
          <div className="relative shrink-0">
            <button
              type="button"
              id="export-cargo-btn"
              onClick={() => {
                setShowExportDropdown(!showExportDropdown);
                setShowTemplateDropdown(false);
              }}
              disabled={cargoList.length === 0}
              title={isJa ? '貨物リストをExcel (.xlsx) または CSVで出力保存' : 'Export Cargo List as Excel or CSV'}
              className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-xs cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>{isJa ? '保存' : 'Export'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showExportDropdown && cargoList.length > 0 && (
              <div 
                id="export-dropdown-menu"
                className="absolute top-full mt-1.5 left-0 z-30 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[175px] animate-fade-in text-xs font-medium"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleExportExcel();
                    setShowExportDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-800">{isJa ? 'Excel保存' : 'Export Excel'}</div>
                    <div className="text-[10px] text-slate-400">.xlsx 形式</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleExportCsv();
                    setShowExportDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-slate-700 hover:text-blue-800 flex items-center gap-2 cursor-pointer transition-colors border-t border-slate-100"
                >
                  <Download className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-800">{isJa ? 'CSV保存' : 'Export CSV'}</div>
                    <div className="text-[10px] text-slate-400">.csv (カンマ区切り)</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* 4. Template Download (Excel & CSV) */}
          <div className="relative shrink-0">
            <button
              type="button"
              id="download-template-btn"
              onClick={() => {
                setShowTemplateDropdown(!showTemplateDropdown);
                setShowExportDropdown(false);
              }}
              title={isJa ? 'Excel (.xlsx) または CSV形式の雛形テンプレートをダウンロード' : 'Download Excel or CSV Template'}
              className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium flex items-center gap-1 transition-colors text-xs cursor-pointer shadow-2xs"
            >
              <FileDown className="w-3.5 h-3.5 text-slate-600" />
              <span>{isJa ? '雛形' : 'Template'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showTemplateDropdown && (
              <div 
                id="template-dropdown-menu"
                className="absolute top-full mt-1.5 left-0 z-30 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[175px] animate-fade-in text-xs font-medium"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadExcelTemplate();
                    setShowTemplateDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-800">{isJa ? 'Excel雛形' : 'Excel Template'}</div>
                    <div className="text-[10px] text-slate-400">.xlsx (列幅・サンプル設定済)</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadCsvTemplate();
                    setShowTemplateDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-slate-700 hover:text-blue-800 flex items-center gap-2 cursor-pointer transition-colors border-t border-slate-100"
                >
                  <FileDown className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-800">{isJa ? 'CSV雛形' : 'CSV Template'}</div>
                    <div className="text-[10px] text-slate-400">.csv (UTF-8 BOM付き)</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* 5. Preset (Prebuilt Demo Cargoes) */}
          <button
            type="button"
            id="open-presets-btn"
            onClick={() => setShowPresetsModal(true)}
            title={isJa ? '標準出荷サンプルのプリセットをワンクリック読込' : 'Load preconfigured cargo presets'}
            className="px-2 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold flex items-center gap-1 transition-colors text-xs cursor-pointer shadow-2xs shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>{isJa ? 'プリセット' : 'Preset'}</span>
          </button>

          {/* 6. Loading_Manifest Import & 3D Reproduction */}
          {onOpenImportManifest && (
            <button
              type="button"
              id="cargo-manager-open-manifest-btn"
              onClick={onOpenImportManifest}
              title={isJa ? 'Loading_Manifestファイルから座標(X,Y,Z)を読み込み、3D積載を完全再現' : 'Import Loading Manifest and reproduce 3D loading placement'}
              className="px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold flex items-center gap-1 transition-all active:scale-95 text-xs shadow-2xs cursor-pointer shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              <span>{isJa ? '再現' : 'Reproduce'}</span>
            </button>
          )}
        </div>

        {/* Row 2: List Selection & Appearance (Select All / Deselect All, Vivid Colors, Duplicate Consolidate) */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap text-xs pt-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* 7. Quick Select All / Deselect All */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-2xs shrink-0">
              <button
                type="button"
                id="select-all-cargo-btn"
                onClick={() => handleToggleAll(true)}
                disabled={isAllSelected}
                title={isJa ? 'すべての貨物を積載対象にする' : 'Select all items'}
                className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  isAllSelected 
                    ? 'text-slate-400 cursor-not-allowed' 
                    : 'bg-white text-blue-700 shadow-2xs hover:bg-blue-50'
                }`}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{isJa ? '全選択' : 'Select All'}</span>
              </button>
              <button
                type="button"
                id="deselect-all-cargo-btn"
                onClick={() => handleToggleAll(false)}
                disabled={isNoneSelected}
                title={isJa ? 'すべての貨物の積載を解除する' : 'Deselect all items'}
                className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  isNoneSelected 
                    ? 'text-slate-400 cursor-not-allowed' 
                    : 'bg-white text-slate-700 shadow-2xs hover:bg-slate-50'
                }`}
              >
                <XSquare className="w-3.5 h-3.5" />
                <span>{isJa ? '全解除' : 'Deselect All'}</span>
              </button>
            </div>

            {/* Duplicate consolidation button if duplicates exist */}
            {hasDuplicateItems && (
              <button
                type="button"
                id="consolidate-duplicates-btn"
                onClick={handleConsolidateDuplicates}
                title={isJa ? '同一の品名・寸法・特性を持つ貨物を1行にまとめて数量集約' : 'Aggregate duplicate cargo entries into single rows'}
                className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold flex items-center gap-1 transition-colors animate-pulse text-xs cursor-pointer shrink-0"
              >
                <Layers className="w-3.5 h-3.5 text-amber-600" />
                <span>{isJa ? '重複集約' : 'Aggregate'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Import / Clear Notification Banner */}
      {importNotification && (
        <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2 animate-fade-in shadow-2xs">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{importNotification}</span>
        </div>
      )}

      {/* Real-Time Total Metrics - Simplified Single Row */}
      <div 
        id="cargo-summary-metrics-bar"
        className="flex items-center justify-between gap-1 sm:gap-2 mb-2 px-2.5 py-1.5 bg-slate-50/90 rounded-lg border border-slate-200 text-xs shadow-2xs"
      >
        {/* Volume Metric */}
        <div 
          className="flex items-center gap-1 min-w-0" 
          title={isJa ? `容積: ${formatVolume(activeVolumeCbm, unitSystem, 2)} / 上限 ${formatVolume(containerVolCbm, unitSystem, 2)}` : `Volume: ${formatVolume(activeVolumeCbm, unitSystem, 2)} / Limit ${formatVolume(containerVolCbm, unitSystem, 2)}`}
        >
          <span className="text-[10px] sm:text-[10.5px] text-slate-500 font-medium shrink-0">{isJa ? '容積' : 'Vol'}:</span>
          <div className="flex items-baseline gap-0.5 font-mono text-[11px] sm:text-xs">
            <span className="font-bold text-blue-600">
              {formatVolume(activeVolumeCbm, unitSystem, 1)}
            </span>
            <span className="text-slate-400 text-[10px]">/{formatVolume(containerVolCbm, unitSystem, 0)}</span>
          </div>
        </div>

        <div className="w-px h-3.5 bg-slate-200 shrink-0" />

        {/* Weight Metric */}
        <div 
          className="flex items-center gap-1 min-w-0" 
          title={isJa ? `重量: ${formatWeightCompact(activeWeightKg, unitSystem)} / 最大積載 ${formatWeightCompact(container.maxWeight, unitSystem)}` : `Weight: ${formatWeightCompact(activeWeightKg, unitSystem)} / Max ${formatWeightCompact(container.maxWeight, unitSystem)}`}
        >
          <span className="text-[10px] sm:text-[10.5px] text-slate-500 font-medium shrink-0">{isJa ? '重量' : 'Wt'}:</span>
          <div className="flex items-baseline gap-0.5 font-mono text-[11px] sm:text-xs">
            <span className={`font-bold ${activeWeightKg > container.maxWeight ? 'text-red-600' : 'text-emerald-600'}`}>
              {formatWeightCompact(activeWeightKg, unitSystem)}
            </span>
            <span className="text-slate-400 text-[10px]">/{formatWeightCompact(container.maxWeight, unitSystem)}</span>
          </div>
        </div>

        <div className="w-px h-3.5 bg-slate-200 shrink-0" />

        {/* Fill Percentage Metric */}
        <div 
          className="flex items-center gap-1 min-w-0 shrink-0" 
          title={isJa ? 'コンテナ容積利用率(目安)' : 'Estimated Volume Fill Rate'}
        >
          <span className="text-[10px] sm:text-[10.5px] text-slate-500 font-medium shrink-0">{isJa ? '利用率' : 'Fill'}:</span>
          <span className={`font-mono font-bold text-[11px] sm:text-xs ${activeVolumeCbm > containerVolCbm ? 'text-red-600' : 'text-slate-800'}`}>
            {containerVolCbm > 0 ? ((activeVolumeCbm / containerVolCbm) * 100).toFixed(1) : 0}%
          </span>
          {activeVolumeCbm > containerVolCbm && (
            <span className="text-[9px] text-red-600 font-bold px-1 bg-red-100 rounded">(!)</span>
          )}
        </div>
      </div>

      {/* Add New Cargo Inline Form */}
      {isAddingNew && (
        <form onSubmit={handleAddItem} className="mb-4 bg-slate-50 border border-blue-200 rounded-xl p-4 text-xs shadow-xs">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
            <h3 className="font-bold text-blue-800 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              {isJa ? '新規貨物の追加' : 'Add New Cargo'}
            </h3>
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="text-slate-400 hover:text-slate-600 text-xs p-1"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
            <div className="sm:col-span-1">
              <label className="text-slate-600 font-medium text-[10px] block mb-1">{isJa ? '貨物名 / 型番' : 'Cargo Name / Model'}</label>
              <input
                type="text"
                required
                value={newItem.name}
                onChange={e => setNewItem({ ...newItem, name: e.target.value, sku: e.target.value })}
                placeholder="CMB-M108V-KB1"
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-600 font-medium text-[10px] block mb-1">{isJa ? '個数 (数量)' : 'Quantity'}</label>
              <input
                type="number"
                min="1"
                required
                value={newItem.quantity}
                onChange={e => setNewItem({ ...newItem, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-amber-600 font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-600 font-medium text-[10px] block mb-1">
                {isJa ? '重量 (kg)' : 'Weight (kg)'}
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                required
                value={newItem.weight}
                onChange={e => setNewItem({ ...newItem, weight: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-emerald-600 font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 mb-3">
            <div>
              <label className="text-slate-600 font-medium text-[10px] block mb-1">
                {isJa ? '幅 W (mm)' : 'Width (mm)'}
                <span className="text-slate-400 font-normal ml-1">({(newItem.width / 1000).toFixed(2)} m)</span>
              </label>
              <input
                type="number"
                min="10"
                required
                value={newItem.width}
                onChange={e => setNewItem({ ...newItem, width: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-600 font-medium text-[10px] block mb-1">
                {isJa ? '高さ H (mm)' : 'Height (mm)'}
                <span className="text-slate-400 font-normal ml-1">({(newItem.height / 1000).toFixed(2)} m)</span>
              </label>
              <input
                type="number"
                min="10"
                required
                value={newItem.height}
                onChange={e => setNewItem({ ...newItem, height: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-600 font-medium text-[10px] block mb-1">
                {isJa ? '奥行 D (mm)' : 'Depth / Length (mm)'}
                <span className="text-slate-400 font-normal ml-1">({(newItem.length / 1000).toFixed(2)} m)</span>
              </label>
              <input
                type="number"
                min="10"
                required
                value={newItem.length}
                onChange={e => setNewItem({ ...newItem, length: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Color & Rotation Toggles */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 font-medium">{isJa ? 'カラー:' : 'Color:'}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewItem({ ...newItem, color: c })}
                    className={`w-4 h-4 rounded-full border transition-all ${newItem.color === c ? 'border-slate-800 scale-125 shadow-xs ring-1 ring-slate-900' : 'border-transparent opacity-80 hover:opacity-100 hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={newItem.color}
                  onChange={e => setNewItem({ ...newItem, color: e.target.value })}
                  title={isJa ? 'カスタム色を指定' : 'Custom color'}
                  className="w-4 h-4 rounded cursor-pointer border border-slate-300 p-0 overflow-hidden"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={newItem.allowYaw !== false}
                  onChange={e => setNewItem({ 
                    ...newItem, 
                    allowYaw: e.target.checked,
                    allowTilt: false, 
                    allowRoll: false 
                  })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{isJa ? '横回転許可 (1/0)' : 'Allow Horizontal Rotation'}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-red-700 font-medium">
                <input
                  type="checkbox"
                  checked={newItem.fragile}
                  onChange={e => setNewItem({ ...newItem, fragile: e.target.checked, maxStackWeight: e.target.checked ? 0 : 100 })}
                  className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span>{isJa ? '天地無用 / 割れ物' : 'Fragile / Top Only'}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                <input
                  type="checkbox"
                  checked={!!newItem.floorPlacement}
                  onChange={e => setNewItem({ ...newItem, floorPlacement: e.target.checked })}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="flex items-center gap-1">
                  <ArrowDownToLine className="w-3 h-3 text-amber-700" />
                  {isJa ? '床置き (必ず床面配置)' : 'Floor Placement (z=0)'}
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs transition-colors ml-auto"
            >
              {isJa ? '確定して追加' : 'Confirm'}
            </button>
          </div>
        </form>
      )}

      {/* Manifest Search & Sorting Toolbar - Compact & Non-overflowing */}
      {cargoList.length > 0 && (
        <div 
          id="cargo-manifest-controls" 
          className="space-y-1.5 mb-2.5 bg-slate-50/90 p-2 sm:p-2.5 rounded-xl border border-slate-200 shadow-2xs"
        >
          {/* Quick Search Field - Full width for seamless typing without clipping */}
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              id="cargo-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isJa ? '品名・型番で検索...' : 'Search items or SKU...'}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-7 py-1 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                id="clear-cargo-search-btn"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                title={isJa ? '検索解除' : 'Clear search'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Controls Row - Neatly arranged, guaranteed no horizontal overflow */}
          <div className="flex items-center justify-between gap-1.5 flex-wrap text-xs pt-0.5">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] sm:text-[10.5px] font-medium text-slate-500 flex items-center gap-0.5 shrink-0">
                <ArrowUpDown className="w-3 h-3 text-slate-400" />
                <span>{isJa ? '並替:' : 'Sort:'}</span>
              </span>

              {/* Sort Field Segmented Buttons */}
              <div className="inline-flex items-center bg-white border border-slate-200 rounded-md p-0.5 shadow-2xs">
                {/* Sort by Name */}
                <button
                  type="button"
                  id="sort-by-name-btn"
                  onClick={() => handleSortToggle('name')}
                  title={isJa 
                    ? (sortField === 'name' ? (sortOrder === 'asc' ? '品名: A→Z (昇順)' : '品名: Z→A (降順)') : '品名で並び替え') 
                    : 'Sort by name'}
                  className={`px-2 py-0.5 rounded text-[10.5px] sm:text-[11px] font-semibold flex items-center gap-0.5 transition-all cursor-pointer ${
                    sortField === 'name'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>{isJa ? '品名' : 'Name'}</span>
                  {sortField === 'name' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />
                  )}
                </button>

                {/* Sort by Weight */}
                <button
                  type="button"
                  id="sort-by-weight-btn"
                  onClick={() => handleSortToggle('weight')}
                  title={isJa 
                    ? (sortField === 'weight' ? (sortOrder === 'asc' ? '重量: 昇順' : '重量: 降順') : '重量で並び替え') 
                    : 'Sort by weight'}
                  className={`px-2 py-0.5 rounded text-[10.5px] sm:text-[11px] font-semibold flex items-center gap-0.5 transition-all cursor-pointer ${
                    sortField === 'weight'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>{isJa ? '重量' : 'Weight'}</span>
                  {sortField === 'weight' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />
                  )}
                </button>

                {/* Sort by Quantity */}
                <button
                  type="button"
                  id="sort-by-quantity-btn"
                  onClick={() => handleSortToggle('quantity')}
                  title={isJa 
                    ? (sortField === 'quantity' ? (sortOrder === 'asc' ? '数量: 昇順' : '数量: 降順') : '数量で並び替え') 
                    : 'Sort by quantity'}
                  className={`px-2 py-0.5 rounded text-[10.5px] sm:text-[11px] font-semibold flex items-center gap-0.5 transition-all cursor-pointer ${
                    sortField === 'quantity'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>{isJa ? '数量' : 'Qty'}</span>
                  {sortField === 'quantity' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />
                  )}
                </button>
              </div>

              {/* Reset to Original Manifest Order */}
              {sortField !== 'none' && (
                <button
                  type="button"
                  id="reset-sort-btn"
                  onClick={handleResetSort}
                  title={isJa ? '元の登録順に戻す' : 'Reset to original manifest order'}
                  className="px-1.5 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 rounded text-[10px] sm:text-[10.5px] font-medium flex items-center gap-0.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5 text-slate-400" />
                  <span>{isJa ? '解除' : 'Reset'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {/* Apply sorted order to manifest */}
              {sortField !== 'none' && (
                <button
                  type="button"
                  id="apply-sort-order-btn"
                  onClick={handleApplySortToManifest}
                  title={isJa ? '現在の並び順をマニフェスト（登録順）に保存して固定' : 'Save current order to manifest list'}
                  className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[10px] sm:text-[10.5px] font-bold flex items-center gap-0.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Check className="w-2.5 h-2.5 text-indigo-600" />
                  <span>{isJa ? '順固定' : 'Save'}</span>
                </button>
              )}

              {/* Display count */}
              <span className="text-[10px] text-slate-400 font-mono">
                {displayedCargoList.length}/{cargoList.length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Cargo List Items Table */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 max-h-[540px] xl:max-h-[600px] custom-scrollbar">
        {cargoList.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs space-y-3 bg-slate-50/70 rounded-xl border border-dashed border-slate-300 p-6">
            <FileSpreadsheet className="w-9 h-9 mx-auto text-slate-300" />
            <div className="space-y-1">
              <p className="font-bold text-slate-700 text-sm">
                {isJa ? '貨物が登録されていません' : 'No cargo items yet'}
              </p>
              <p className="text-slate-500 text-[11px]">
                {isJa ? '「新規貨物の追加」「Excel / CSV取込」または「混載プリセット」を選択してください。' : 'Add items manually, import an Excel/CSV file, or load a sample preset.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
              <button
                type="button"
                id="empty-open-presets-btn"
                onClick={() => setShowPresetsModal(true)}
                className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold flex items-center gap-1 text-xs cursor-pointer shadow-2xs transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>{isJa ? '混載プリセット読込' : 'Load Preset'}</span>
              </button>
              <label 
                id="empty-import-file-label" 
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold flex items-center gap-1.5 text-xs cursor-pointer shadow-2xs transition-colors"
                title={isJa ? 'Excel (.xlsx/.xls) または CSVファイルから一括取込' : 'Import from Excel or CSV'}
              >
                <Upload className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isJa ? 'Excel / CSV取込' : 'Import Excel / CSV'}</span>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv, text/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
                  onChange={handleImportFile} 
                  className="hidden" 
                />
              </label>
              <button
                type="button"
                id="empty-add-item-btn"
                onClick={() => setIsAddingNew(true)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 text-xs cursor-pointer shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isJa ? '新規貨物を追加' : 'Add New Item'}</span>
              </button>
            </div>
          </div>
        ) : displayedCargoList.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
            <Search className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
            <p className="font-semibold text-slate-600">
              {isJa ? `「${searchQuery}」に一致する貨物が見つかりません` : `No cargo items matching "${searchQuery}"`}
            </p>
            <button
              type="button"
              id="empty-clear-search-btn"
              onClick={() => setSearchQuery('')}
              className="mt-2 text-blue-600 hover:text-blue-700 font-medium underline text-xs cursor-pointer"
            >
              {isJa ? '検索条件をクリア' : 'Clear search'}
            </button>
          </div>
        ) : (
          displayedCargoList.map((cargo) => {
            const isEditing = editingItemId === cargo.id;
            const isEnabled = cargo.enabled !== false;

            return (
              <div
                key={cargo.id}
                className={`border rounded-lg p-2 sm:p-2.5 transition-all text-xs shadow-2xs ${
                  isEditing 
                    ? 'border-blue-500 ring-1 ring-blue-500/20 bg-blue-50/20' 
                    : isEnabled
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-slate-50/80 border-slate-200/60 opacity-60 hover:opacity-90'
                }`}
              >
                <div className="space-y-1">
                  {/* Top Primary Row: Checkbox, Color, Name, and Actions (Qty, Edit, Delete) */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {/* Enable / Disable Checkbox Toggle */}
                      <button
                        type="button"
                        id={`toggle-cargo-${cargo.id}`}
                        onClick={() => handleUpdateItem(cargo.id, { enabled: !isEnabled })}
                        title={isJa ? (isEnabled ? 'クリックして積載から除外' : 'クリックして積載対象に含める') : (isEnabled ? 'Click to exclude from packing' : 'Click to include in packing')}
                        className={`p-0.5 rounded transition-colors shrink-0 ${
                          isEnabled 
                            ? 'text-blue-600 hover:bg-blue-50' 
                            : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                      >
                        {isEnabled ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      {/* Color Indicator */}
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/15 shadow-2xs cursor-pointer hover:scale-125 transition-transform"
                        style={{ backgroundColor: cargo.color }}
                        title={isJa ? `カラー: ${cargo.color} (クリックで編集)` : `Color: ${cargo.color}`}
                        onClick={() => setEditingItemId(isEditing ? null : cargo.id)}
                      />

                      {/* Cargo SKU / Name */}
                      <span 
                        className={`font-bold truncate text-[11.5px] sm:text-xs ${isEnabled ? 'text-slate-900' : 'text-slate-400 line-through'}`}
                        title={cargo.name}
                      >
                        {cargo.name}
                      </span>
                    </div>

                    {/* Quantity & Action Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1 py-0.5 shadow-2xs">
                        <span className="text-[9.5px] text-slate-500 mr-0.5 font-medium">{isJa ? '数量:' : 'Qty:'}</span>
                        <input
                          type="number"
                          min="1"
                          value={cargo.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value) || 1);
                            handleUpdateItem(cargo.id, { quantity: val });
                          }}
                          className="w-9 sm:w-10 bg-transparent text-center font-bold text-amber-600 outline-none text-xs"
                        />
                      </div>

                      {cargo.quantity > 500 && (
                        <span 
                          title={isJa 
                            ? `安全リミット適用中: ${cargo.quantity.toLocaleString()}個中 500個を計算対象とし、${(cargo.quantity - 500).toLocaleString()}個を除外しています` 
                            : `Safety limit: 500 of ${cargo.quantity.toLocaleString()} calculated, ${(cargo.quantity - 500).toLocaleString()} excluded`}
                          className="bg-amber-100 text-amber-900 border border-amber-300 text-[9.5px] px-1 py-0.5 rounded font-bold flex items-center gap-0.5 cursor-help shrink-0"
                        >
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                          <span>-{(cargo.quantity - 500).toLocaleString()}</span>
                        </span>
                      )}

                      <button
                        onClick={() => setEditingItemId(isEditing ? null : cargo.id)}
                        title={isJa ? '寸法・重量を編集' : 'Edit dimensions'}
                        className={`p-1 rounded transition-colors ${
                          isEditing ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteItem(cargo.id)}
                        title={isJa ? '削除' : 'Delete'}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Sub-row: Dimensions, Weight, and Quick Toggle Rules */}
                  <div className="flex items-center justify-between gap-1.5 pt-0.5 text-slate-600 flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0 font-mono text-[10px] sm:text-[10.5px]">
                      <span className="font-semibold text-slate-700 bg-slate-100 px-1 py-0.5 rounded text-[9.5px] sm:text-[10px] shrink-0">
                        {cargo.width}×{cargo.height}×{cargo.length}
                      </span>
                      <span className="text-emerald-700 font-bold shrink-0">
                        {formatWeightCompact(cargo.weight, unitSystem)}
                      </span>
                      <span className="text-slate-400 text-[9.5px] truncate hidden sm:inline">
                        ({formatVolume((cargo.length * cargo.width * cargo.height * cargo.quantity) / 1_000_000_000, unitSystem)})
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      {/* Horizontal Rotation Toggle */}
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(cargo.id, { 
                          allowYaw: cargo.allowYaw === false ? true : false,
                          allowTilt: false,
                          allowRoll: false
                        })}
                        title={isJa ? 'クリックで横回転許可(90度旋回)を切替' : 'Toggle rotation'}
                        className={`text-[9.5px] px-1.5 py-0.5 rounded font-medium cursor-pointer transition-colors border flex items-center gap-0.5 ${
                          cargo.allowYaw !== false 
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' 
                            : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200 hover:text-slate-600'
                        }`}
                      >
                        <RotateCw className="w-2.5 h-2.5" />
                        <span>{isJa ? (cargo.allowYaw !== false ? '回転' : '固定') : (cargo.allowYaw !== false ? 'Rot' : 'Lock')}</span>
                      </button>

                      {/* Fragile Toggle */}
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(cargo.id, { 
                          fragile: !cargo.fragile,
                          maxStackWeight: !cargo.fragile ? 0 : 150
                        })}
                        title={isJa ? 'クリックで割れ物(上積み禁止)を切替' : 'Toggle fragile'}
                        className={`text-[9.5px] px-1.5 py-0.5 rounded font-medium cursor-pointer transition-colors flex items-center gap-0.5 border ${
                          cargo.fragile
                            ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 font-bold'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
                        }`}
                      >
                        <ShieldAlert className="w-2.5 h-2.5" />
                        <span>{cargo.fragile ? (isJa ? '割物' : 'Fragile') : (isJa ? '割無' : 'No')}</span>
                      </button>

                      {/* Floor Placement Toggle */}
                      <button
                        type="button"
                        id={`toggle-floor-${cargo.id}`}
                        onClick={() => handleUpdateItem(cargo.id, { 
                          floorPlacement: !cargo.floorPlacement 
                        })}
                        title={isJa ? 'クリックで床置き指定(コンテナ床面に配置)を切替' : 'Toggle floor placement'}
                        className={`text-[9.5px] px-1.5 py-0.5 rounded font-medium cursor-pointer transition-colors flex items-center gap-0.5 border ${
                          cargo.floorPlacement
                            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 font-bold'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
                        }`}
                      >
                        <ArrowDownToLine className="w-2.5 h-2.5" />
                        <span>{cargo.floorPlacement ? (isJa ? '床置' : 'Floor') : (isJa ? '床無' : 'No')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline Dimension Editor Panel when expanded */}
                {isEditing && (
                  <div className="mt-3 pt-3 border-t border-blue-100 bg-white p-3 rounded-lg border space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-blue-600" />
                        {isJa ? '寸法・重量のリアルタイム変更' : 'Edit Dimensions & Weight (Real-time)'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingItemId(null)}
                        className="text-[10px] text-blue-600 hover:text-blue-800 font-bold px-2 py-0.5 bg-blue-50 hover:bg-blue-100 rounded"
                      >
                        ✓ {isJa ? '確定' : 'Done'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium block mb-0.5">
                          {isJa ? '幅 W (mm)' : 'Width W (mm)'}
                        </label>
                        <input
                          type="number"
                          min="10"
                          step="10"
                          value={cargo.width}
                          onChange={(e) => handleUpdateItem(cargo.id, { width: Math.max(10, Number(e.target.value) || 10) })}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 font-mono font-bold text-slate-800 focus:bg-white focus:border-blue-500 outline-none text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium block mb-0.5">
                          {isJa ? '高さ H (mm)' : 'Height H (mm)'}
                        </label>
                        <input
                          type="number"
                          min="10"
                          step="10"
                          value={cargo.height}
                          onChange={(e) => handleUpdateItem(cargo.id, { height: Math.max(10, Number(e.target.value) || 10) })}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 font-mono font-bold text-slate-800 focus:bg-white focus:border-blue-500 outline-none text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium block mb-0.5">
                          {isJa ? '奥行 D / 長 (mm)' : 'Depth / Length (mm)'}
                        </label>
                        <input
                          type="number"
                          min="10"
                          step="10"
                          value={cargo.length}
                          onChange={(e) => handleUpdateItem(cargo.id, { length: Math.max(10, Number(e.target.value) || 10) })}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 font-mono font-bold text-slate-800 focus:bg-white focus:border-blue-500 outline-none text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium block mb-0.5">
                          {isJa ? '重量 (kg)' : 'Weight (kg)'}
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.5"
                          value={cargo.weight}
                          onChange={(e) => handleUpdateItem(cargo.id, { weight: Math.max(0.1, Number(e.target.value) || 0.1) })}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 font-mono font-bold text-emerald-600 focus:bg-white focus:border-blue-500 outline-none text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-slate-500 font-medium">{isJa ? '色:' : 'Color:'}</span>
                        {COLOR_PALETTE.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => handleUpdateItem(cargo.id, { color: c })}
                            className={`w-3.5 h-3.5 rounded-full border transition-all ${cargo.color === c ? 'border-slate-800 scale-125 shadow-xs ring-1 ring-slate-900' : 'border-transparent opacity-80 hover:opacity-100 hover:scale-110'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                        <input
                          type="color"
                          value={cargo.color}
                          onChange={e => handleUpdateItem(cargo.id, { color: e.target.value })}
                          title={isJa ? 'カスタム色を指定' : 'Custom color'}
                          className="w-3.5 h-3.5 rounded cursor-pointer border border-slate-300 p-0 overflow-hidden"
                        />
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap">
                        <label className="flex items-center gap-1 cursor-pointer text-[10px] text-slate-700 font-medium">
                          <input
                            type="checkbox"
                            checked={cargo.allowYaw !== false}
                            onChange={e => handleUpdateItem(cargo.id, { 
                              allowYaw: e.target.checked,
                              allowTilt: false, 
                              allowRoll: false 
                            })}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 text-xs"
                          />
                          <span>{isJa ? '横回転' : 'Rot'}</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer text-[10px] text-red-700 font-medium">
                          <input
                            type="checkbox"
                            checked={cargo.fragile}
                            onChange={e => handleUpdateItem(cargo.id, { 
                              fragile: e.target.checked,
                              maxStackWeight: e.target.checked ? 0 : 150
                            })}
                            className="rounded border-slate-300 text-red-600 focus:ring-red-500 text-xs"
                          />
                          <span>{isJa ? '割れ物' : 'Fragile'}</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer text-[10px] text-amber-800 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          <input
                            type="checkbox"
                            checked={!!cargo.floorPlacement}
                            onChange={e => handleUpdateItem(cargo.id, { 
                              floorPlacement: e.target.checked
                            })}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 text-xs"
                          />
                          <span className="flex items-center gap-0.5">
                            <ArrowDownToLine className="w-2.5 h-2.5 text-amber-700" />
                            {isJa ? '床置き' : 'Floor'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Presets Modal */}
      {showPresetsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {isJa ? '混載貨物サンプルプリセット選択' : 'Select Cargo Preset'}
                </h3>
              </div>
              <button
                onClick={() => setShowPresetsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 custom-scrollbar">
              <p className="text-xs text-slate-600 mb-2">
                {isJa 
                  ? '実務の輸送シナリオに基づいた混載プリセットです。選択すると該当する貨物データが一括ロードされます。'
                  : 'Realistic multi-cargo mix scenarios. Loading a preset will replace your current cargo manifest.'}
              </p>

              {SAMPLE_CARGO_PRESETS.map((preset) => {
                const pQty = preset.items.reduce((s, i) => s + i.quantity, 0);
                const pVol = preset.items.reduce((s, i) => s + (i.length * i.width * i.height * i.quantity) / 1_000_000_000, 0);
                const pWt = preset.items.reduce((s, i) => s + (i.weight * i.quantity), 0);

                return (
                  <div
                    key={preset.id}
                    className="border border-slate-200 hover:border-indigo-400 rounded-xl p-3.5 hover:bg-indigo-50/20 transition-all cursor-pointer text-xs"
                    onClick={() => handleLoadPreset(preset)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        {isJa ? preset.nameJa : preset.nameEn}
                        {preset.recommendedContainerId && (
                          <span className="text-[10px] font-normal px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-mono">
                            {preset.recommendedContainerId.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shrink-0 shadow-xs"
                      >
                        {isJa ? '適用する' : 'Load'}
                      </button>
                    </div>

                    <p className="text-slate-500 text-[11px] mb-2 leading-relaxed">
                      {isJa ? preset.descriptionJa : preset.descriptionEn}
                    </p>

                    <div className="flex items-center gap-3 text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg font-mono">
                      <span>{isJa ? '品目数' : 'Types'}: <strong className="text-slate-800">{preset.items.length}</strong></span>
                      <span>{isJa ? '総数量' : 'Total Qty'}: <strong className="text-amber-600">{pQty}個</strong></span>
                      <span>{isJa ? '総容積' : 'Vol'}: <strong className="text-blue-600">{formatVolume(pVol, unitSystem, 1)}</strong></span>
                      <span>{isJa ? '総重量' : 'Wt'}: <strong className="text-emerald-600">{formatWeight(pWt, unitSystem)}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
