import React, { useState } from 'react';
import { CargoItem, Container, UnitSystem, Language } from '../types';
import { SAMPLE_CARGO_PRESETS, CargoPreset, SAMPLE_CSV_TEMPLATE } from '../data/presets';
import { 
  Plus, Trash2, Upload, Download, Sparkles, 
  ShieldAlert, Check, FileSpreadsheet, FileDown,
  Edit2, Sliders, CheckSquare, Square, CheckCheck, XSquare, RotateCw
} from 'lucide-react';
import { formatVolume, formatWeight, formatWeightCompact } from '../utils/units';

interface CargoManagerProps {
  cargoList: CargoItem[];
  onChangeCargoList: (newList: CargoItem[]) => void;
  container: Container;
  unitSystem: UnitSystem;
  language: Language;
  onSelectContainer?: (containerId: string) => void;
}

const COLOR_PALETTE = [
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#eab308', // Yellow
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f97316', // Orange
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#d97706', // Amber
  '#059669', // Dark Emerald
  '#4f46e5', // Deep Indigo
  '#e11d48', // Rose
  '#0284c7', // Sky
  '#7c3aed', // Purple
];

export const CargoManager: React.FC<CargoManagerProps> = ({
  cargoList,
  onChangeCargoList,
  container,
  unitSystem,
  language,
  onSelectContainer
}) => {
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showPresetsModal, setShowPresetsModal] = useState<boolean>(false);
  const [importNotification, setImportNotification] = useState<string | null>(null);

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

  // Load Preset
  const handleLoadPreset = (preset: CargoPreset) => {
    onChangeCargoList(preset.items.map(it => ({ ...it, enabled: it.enabled !== false })));
    if (onSelectContainer && preset.recommendedContainerId) {
      onSelectContainer(preset.recommendedContainerId);
    }
    setShowPresetsModal(false);
  };

  // Export CSV (Following schema: 貨物名,幅(mm),高さ(mm),奥行(mm),重量(kg),個数,横回転許可(1/0),カラー(16進数),割れ物(1/0),積載対象(1/0))
  const handleExportCsv = () => {
    const headers = ['貨物名', '幅(mm)', '高さ(mm)', '奥行(mm)', '重量(kg)', '個数', '横回転許可(1/0)', 'カラー(16進数)', '割れ物(1/0)', '積載対象(1/0)'];
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

  // Download Sample CSV Template
  const handleDownloadTemplate = () => {
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

  // Import CSV - Smart detection for both the 10-column & 11-column format
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      // Strip BOM and clean lines
      const cleanText = text.replace(/^\uFEFF/, '');
      const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length <= 1) return;

      const headerParts = lines[0].split(',').map(s => s.trim().replace(/^"|"$/g, ''));

      // Check column index mappings
      let nameIdx = headerParts.findIndex(h => /貨物名|品名|商品名|型番|SKU|Name|Model/i.test(h));
      let widthIdx = headerParts.findIndex(h => /幅|Width|W/i.test(h));
      let heightIdx = headerParts.findIndex(h => /高さ|Height|H/i.test(h));
      let depthIdx = headerParts.findIndex(h => /奥行|奥行き|長さ|Depth|Length|L|D/i.test(h));
      let weightIdx = headerParts.findIndex(h => /重量|Weight|Kg|Wt/i.test(h));
      let qtyIdx = headerParts.findIndex(h => /個数|数量|最大個数|最大数量|Quantity|Qty|MaxQty|Max/i.test(h));
      let minQtyIdx = headerParts.findIndex(h => /最小個数|最小数量|MinQty|Min/i.test(h));
      let rotIdx = headerParts.findIndex(h => /横回転|3D回転|回転許可|回転|Rotate|Rotation|Yaw/i.test(h));
      let colorIdx = headerParts.findIndex(h => /カラー|色|Color|Hex/i.test(h));
      let fragileIdx = headerParts.findIndex(h => /割れ物|天地無用|壊れ物|壊れもの|Fragile/i.test(h));
      let enabledIdx = headerParts.findIndex(h => /積載対象|積載|対象|Enabled|Active|Include|Select/i.test(h));

      // Positional fallbacks
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
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        if (parts.length < 4) continue;

        const itemName = parts[nameIdx] || `Cargo-${i}`;
        const itemWidth = Number(parts[widthIdx]) || 1000;
        const itemHeight = Number(parts[heightIdx]) || 1000;
        const itemDepth = Number(parts[depthIdx]) || 1000;
        const itemWeight = Number(parts[weightIdx]) || 50;
        const itemQty = Number(parts[qtyIdx]) || (minQtyIdx !== -1 ? Number(parts[minQtyIdx]) : 1) || 1;
        const rawRot = parts[rotIdx]?.toLowerCase();
        const allowRot = rotIdx === -1 || rawRot === '1' || rawRot === 'true' || rawRot === 'yes' || rawRot === 'ok';
        const rawColor = parts[colorIdx];
        const validHex = /^#[0-9A-Fa-f]{6}$/.test(rawColor) ? rawColor : COLOR_PALETTE[(i - 1) % COLOR_PALETTE.length];

        // Explicit Fragile Flag Check (1/0 or true/false)
        let isFragile = false;
        if (fragileIdx !== -1 && parts[fragileIdx] !== undefined && parts[fragileIdx] !== '') {
          const rawFrag = parts[fragileIdx].toLowerCase().trim();
          isFragile = rawFrag === '1' || rawFrag === 'true' || rawFrag === 'yes' || rawFrag === '割れ物' || rawFrag === '天地無用';
        } else {
          // Fallback heuristic if column is omitted
          isFragile = itemHeight > 1800;
        }

        // Explicit Enabled / Selected Flag Check
        let isEnabled = true;
        if (enabledIdx !== -1 && parts[enabledIdx] !== undefined && parts[enabledIdx] !== '') {
          const rawEn = parts[enabledIdx].toLowerCase().trim();
          isEnabled = rawEn === '1' || rawEn === 'true' || rawEn === 'yes' || rawEn === 'ok' || rawEn === '対象';
        }

        newItems.push({
          id: `csv_${Date.now()}_${i}`,
          sku: itemName,
          name: itemName,
          width: itemWidth,
          height: itemHeight,
          length: itemDepth,
          weight: itemWeight,
          quantity: Math.max(1, itemQty),
          color: validHex,
          allowTilt: false,
          allowRoll: false,
          allowYaw: allowRot,
          maxStackWeight: isFragile ? 0 : (itemHeight > 1800 ? 0 : 150),
          fragile: isFragile,
          priority: itemWeight > 200 ? 1 : (itemWeight > 80 ? 2 : 3),
          enabled: isEnabled
        });
      }

      if (newItems.length > 0) {
        onChangeCargoList(newItems);
        setImportNotification(isJa ? `CSVから ${newItems.length} 件の貨物データを正常に取り込みました！（割れ物・積載フラグ反映済）` : `Successfully imported ${newItems.length} cargo items from CSV with settings!`);
        setTimeout(() => setImportNotification(null), 4000);
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  // Active / Selected items calculations
  const activeCargoList = cargoList.filter(c => c.enabled !== false);
  const activeCount = activeCargoList.length;
  const totalCount = cargoList.length;
  const hasDisabledItems = activeCount < totalCount;
  const isAllSelected = totalCount > 0 && activeCount === totalCount;
  const isNoneSelected = activeCount === 0;

  const totalQuantity = cargoList.reduce((sum, c) => sum + (c.quantity || 0), 0);
  const activeQuantity = activeCargoList.reduce((sum, c) => sum + (c.quantity || 0), 0);
  
  const activeVolumeCbm = activeCargoList.reduce((sum, c) => sum + (c.length * c.width * c.height * c.quantity) / 1_000_000_000, 0);
  const activeWeightKg = activeCargoList.reduce((sum, c) => sum + (c.weight * c.quantity), 0);
  const containerVolCbm = (container.length * container.width * container.height) / 1_000_000_000;

  return (
    <div id="cargo-manager-root" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs text-slate-800 flex flex-col h-full">
      {/* Header with Title & Action Buttons */}
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            {isJa ? '積載貨物リスト (Cargo Manifest)' : 'Cargo Items'}
          </h2>
          <div className="flex items-center gap-1.5 text-xs">
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${
              hasDisabledItems 
                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              {isJa 
                ? `積載対象: ${activeCount}/${totalCount} 種類 (${activeQuantity}/${totalQuantity} 個)` 
                : `Active: ${activeCount}/${totalCount} types (${activeQuantity}/${totalQuantity} pcs)`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Quick Select All / Deselect All */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              id="select-all-cargo-btn"
              onClick={() => handleToggleAll(true)}
              disabled={isAllSelected}
              title={isJa ? 'すべての貨物を積載対象にする' : 'Select all items'}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
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
              className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                isNoneSelected 
                  ? 'text-slate-400 cursor-not-allowed' 
                  : 'bg-white text-slate-700 shadow-2xs hover:bg-slate-50'
              }`}
            >
              <XSquare className="w-3.5 h-3.5" />
              <span>{isJa ? '全解除' : 'Deselect All'}</span>
            </button>
          </div>

          <button
            id="open-presets-btn"
            onClick={() => setShowPresetsModal(true)}
            className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>{isJa ? 'サンプル混載プリセット' : 'Load Preset'}</span>
          </button>

          <button
            id="download-template-btn"
            onClick={handleDownloadTemplate}
            title={isJa ? '指定フォーマットのCSV雛形をダウンロード' : 'Download CSV Template'}
            className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium flex items-center gap-1.5 transition-colors"
          >
            <FileDown className="w-3.5 h-3.5 text-slate-600" />
            <span>{isJa ? 'CSV雛形' : 'Template'}</span>
          </button>

          <label 
            id="import-csv-label" 
            className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer font-medium flex items-center gap-1.5 transition-colors"
            title={isJa ? 'CSVファイルから一括取込 (貨物名,幅,高さ,奥行,重量,個数,横回転許可,カラー,割れ物,積載対象)' : 'Import from CSV'}
          >
            <Upload className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isJa ? 'CSV取込' : 'Import'}</span>
            <input type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
          </label>

          <button
            id="export-csv-btn"
            onClick={handleExportCsv}
            title={isJa ? '貨物リストをCSV出力' : 'Export CSV'}
            className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>{isJa ? 'CSV保存' : 'Export'}</span>
          </button>

          <button
            id="add-new-cargo-btn"
            onClick={() => setIsAddingNew(!isAddingNew)}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>{isJa ? '荷物を追加' : 'Add Item'}</span>
          </button>
        </div>
      </div>

      {/* Import Notification Banner */}
      {importNotification && (
        <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{importNotification}</span>
        </div>
      )}

      {/* Real-Time Total Metrics for Active / Enabled Items vs Container Limit */}
      <div className="grid grid-cols-3 gap-2.5 mb-4 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div>
          <span className="text-slate-500 block text-[11px] font-medium">
            {isJa ? '積載対象 総容積' : 'Active Volume:'}
            {hasDisabledItems && <span className="text-amber-600 font-bold ml-1">({isJa ? '対象のみ' : 'Filtered'})</span>}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="font-mono font-bold text-blue-600 text-sm">
              {formatVolume(activeVolumeCbm, unitSystem, 2)}
            </span>
            <span className="text-slate-400 text-[10px]">/ {formatVolume(containerVolCbm, unitSystem, 1)}</span>
          </div>
        </div>
        <div>
          <span className="text-slate-500 block text-[11px] font-medium">
            {isJa ? '積載対象 総重量' : 'Active Weight:'}
            {hasDisabledItems && <span className="text-amber-600 font-bold ml-1">({isJa ? '対象のみ' : 'Filtered'})</span>}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`font-mono font-bold text-sm ${activeWeightKg > container.maxWeight ? 'text-red-600' : 'text-emerald-600'}`}>
              {formatWeight(activeWeightKg, unitSystem)}
            </span>
            <span className="text-slate-400 text-[10px]">/ {formatWeight(container.maxWeight, unitSystem)}</span>
          </div>
        </div>
        <div>
          <span className="text-slate-500 block text-[11px] font-medium">{isJa ? 'コンテナ利用率(目安)' : 'Est. Fill:'}</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`font-mono font-bold text-sm ${activeVolumeCbm > containerVolCbm ? 'text-red-600' : 'text-slate-800'}`}>
              {containerVolCbm > 0 ? ((activeVolumeCbm / containerVolCbm) * 100).toFixed(1) : 0}%
            </span>
            {activeVolumeCbm > containerVolCbm && (
              <span className="text-[10px] text-red-600 font-bold ml-1">({isJa ? '容量超過' : 'Over'})</span>
            )}
          </div>
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
                {COLOR_PALETTE.slice(0, 10).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewItem({ ...newItem, color: c })}
                    className={`w-4 h-4 rounded-full border transition-all ${newItem.color === c ? 'border-slate-800 scale-110 shadow-xs' : 'border-transparent opacity-70'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
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

      {/* Cargo List Items Table */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 max-h-[540px] xl:max-h-[600px] custom-scrollbar">
        {cargoList.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs">
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p>{isJa ? '貨物が登録されていません。「CSV取込」または「サンプル混載プリセット」を選択してください。' : 'No cargo items yet. Click "Import" or load a sample preset.'}</p>
          </div>
        ) : (
          cargoList.map((cargo) => {
            const isEditing = editingItemId === cargo.id;
            const isEnabled = cargo.enabled !== false;

            return (
              <div
                key={cargo.id}
                className={`border rounded-xl p-3 transition-all text-xs shadow-xs ${
                  isEditing 
                    ? 'border-blue-500 ring-1 ring-blue-500/20 bg-blue-50/20' 
                    : isEnabled
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-slate-50/80 border-slate-200/60 opacity-60 hover:opacity-90'
                }`}
              >
                <div className="space-y-1.5">
                  {/* Top Primary Row: Checkbox, Color, Name, and Actions (Qty, Edit, Delete) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {/* Enable / Disable Checkbox Toggle */}
                      <button
                        type="button"
                        id={`toggle-cargo-${cargo.id}`}
                        onClick={() => handleUpdateItem(cargo.id, { enabled: !isEnabled })}
                        title={isJa ? (isEnabled ? 'クリックして積載から除外' : 'クリックして積載対象に含める') : (isEnabled ? 'Click to exclude from packing' : 'Click to include in packing')}
                        className={`p-0.5 rounded transition-colors ${
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
                        className="w-3 h-3 rounded-full shrink-0 border border-black/15 shadow-2xs cursor-pointer hover:scale-110 transition-transform"
                        style={{ backgroundColor: cargo.color }}
                        title={isJa ? `カラー: ${cargo.color} (クリックで編集)` : `Color: ${cargo.color}`}
                        onClick={() => setEditingItemId(isEditing ? null : cargo.id)}
                      />

                      {/* Cargo SKU / Name */}
                      <span 
                        className={`font-bold truncate text-xs ${isEnabled ? 'text-slate-900' : 'text-slate-400 line-through'}`}
                        title={cargo.name}
                      >
                        {cargo.name}
                      </span>
                    </div>

                    {/* Quantity & Action Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5">
                        <span className="text-[10px] text-slate-500 mr-1 font-medium">{isJa ? '数量:' : 'Qty:'}</span>
                        <input
                          type="number"
                          min="1"
                          value={cargo.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value) || 1);
                            handleUpdateItem(cargo.id, { quantity: val });
                          }}
                          className="w-9 bg-transparent text-center font-bold text-amber-600 outline-none text-xs"
                        />
                      </div>

                      <button
                        onClick={() => setEditingItemId(isEditing ? null : cargo.id)}
                        title={isJa ? '寸法・重量を編集' : 'Edit dimensions'}
                        className={`p-1.5 rounded-md transition-colors ${
                          isEditing ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteItem(cargo.id)}
                        title={isJa ? '削除' : 'Delete'}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Sub-row: Dimensions, Weight, and Quick Toggle Rules */}
                  <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] text-slate-600 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-semibold bg-slate-100 px-1.5 py-0.5 rounded text-[10.5px] text-slate-700">
                        {cargo.width} × {cargo.height} × {cargo.length} mm
                      </span>
                      <span className="text-emerald-600 font-bold font-mono text-[10.5px]">
                        {formatWeightCompact(cargo.weight, unitSystem)}
                      </span>
                      <span className="text-slate-400 font-mono text-[10px]">
                        ({formatVolume((cargo.length * cargo.width * cargo.height * cargo.quantity) / 1_000_000_000, unitSystem)})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Horizontal Rotation Toggle */}
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(cargo.id, { 
                          allowYaw: cargo.allowYaw === false ? true : false,
                          allowTilt: false,
                          allowRoll: false
                        })}
                        title={isJa ? 'クリックで横回転許可(天面維持・90度旋回)を切替' : 'Toggle horizontal rotation (keep height upright)'}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium cursor-pointer transition-colors border flex items-center gap-1 ${
                          cargo.allowYaw !== false 
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' 
                            : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200 hover:text-slate-600'
                        }`}
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>{isJa ? `横回転:${cargo.allowYaw !== false ? '可' : '否'}` : `Rot:${cargo.allowYaw !== false ? 'ON' : 'OFF'}`}</span>
                      </button>

                      {/* Fragile Toggle */}
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(cargo.id, { 
                          fragile: !cargo.fragile,
                          maxStackWeight: !cargo.fragile ? 0 : 150
                        })}
                        title={isJa ? 'クリックで割れ物(上積み禁止)を切替' : 'Toggle fragile'}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium cursor-pointer transition-colors flex items-center gap-1 border ${
                          cargo.fragile
                            ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 font-bold'
                            : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200 hover:text-slate-600'
                        }`}
                      >
                        <ShieldAlert className="w-3 h-3" />
                        <span>{isJa ? `割れ物:${cargo.fragile ? '有' : '無'}` : `Fragile:${cargo.fragile ? 'YES' : 'NO'}`}</span>
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

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-slate-500 font-medium">{isJa ? '色:' : 'Color:'}</span>
                        {COLOR_PALETTE.slice(0, 10).map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => handleUpdateItem(cargo.id, { color: c })}
                            className={`w-3.5 h-3.5 rounded-full border transition-all ${cargo.color === c ? 'border-slate-800 scale-110 shadow-xs' : 'border-transparent opacity-70'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-3">
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
