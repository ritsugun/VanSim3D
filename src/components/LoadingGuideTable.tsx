import React, { useState, useMemo } from 'react';
import { PackedItem, Language, UnitSystem, Container } from '../types';
import { 
  ClipboardList, Search, Download, Printer, 
  ShieldAlert, Check, ArrowUpDown, Filter, Eye 
} from 'lucide-react';
import { formatDimensions, formatCoordinates, formatWeightCompact } from '../utils/units';

interface LoadingGuideTableProps {
  packedItems: PackedItem[];
  container: Container;
  language: Language;
  unitSystem: UnitSystem;
  onSelectItem: (item: PackedItem | null) => void;
  selectedItem: PackedItem | null;
}

export const LoadingGuideTable: React.FC<LoadingGuideTableProps> = ({
  packedItems,
  container,
  language,
  unitSystem,
  onSelectItem,
  selectedItem
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLayer, setSelectedLayer] = useState<string>('all');
  const [sortField, setSortField] = useState<'seq' | 'weight' | 'name' | 'z'>('seq');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const isJa = language === 'ja';

  // Extract unique layers
  const layers = useMemo(() => {
    const set = new Set<number>();
    packedItems.forEach(p => set.add(p.layer));
    return Array.from(set).sort((a, b) => a - b);
  }, [packedItems]);

  // Filtered & Sorted items
  const displayItems = useMemo(() => {
    return packedItems
      .filter(item => {
        const matchesQuery = 
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.sku.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesLayer = selectedLayer === 'all' || item.layer === Number(selectedLayer);
        return matchesQuery && matchesLayer;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'seq') cmp = a.sequenceNumber - b.sequenceNumber;
        else if (sortField === 'weight') cmp = a.weight - b.weight;
        else if (sortField === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortField === 'z') cmp = a.z - b.z;
        return sortAsc ? cmp : -cmp;
      });
  }, [packedItems, searchQuery, selectedLayer, sortField, sortAsc]);

  // Cumulative weight up to each item
  const cumulativeWeights = useMemo(() => {
    const map = new Map<number, number>();
    let sum = 0;
    packedItems.forEach(p => {
      sum += p.weight;
      map.set(p.sequenceNumber, sum);
    });
    return map;
  }, [packedItems]);

  // Export Loading Manifest CSV
  const handleExportManifestCsv = () => {
    const headers = [
      '積載順序(No)',
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
      '天地無用/割れ物'
    ];

    const rows = packedItems.map(p => [
      p.sequenceNumber,
      `"${p.name}"`,
      p.sku,
      p.x,
      p.y,
      p.z,
      p.length,
      p.width,
      p.height,
      p.weight,
      cumulativeWeights.get(p.sequenceNumber) || p.weight,
      p.layer,
      p.fragile ? (isJa ? '割れ物' : 'YES') : (isJa ? '通常' : 'NO')
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Loading_Manifest_${container.id}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="loading-guide-table-root" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs text-slate-800 flex flex-col">
      {/* Title & Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-600" />
            {isJa ? '積載指示マニフェスト (Step-by-Step Loading Manifest)' : 'Step-by-Step Loading Guide'}
            <span className="text-xs font-normal text-slate-500 font-mono">
              ({displayItems.length} / {packedItems.length} {isJa ? '点' : 'items'})
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isJa ? '現場作業員・フォークリフト用の積込順序・配置座標・重量指示書' : 'Warehouse loading sequence, spatial coordinates, and weight instructions'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={isJa ? '品名・SKU検索...' : 'Search item...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none w-36 sm:w-44"
            />
          </div>

          {/* Layer Filter */}
          <select
            value={selectedLayer}
            onChange={e => setSelectedLayer(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          >
            <option value="all">{isJa ? 'すべての段 (All Layers)' : 'All Layers'}</option>
            {layers.map(l => (
              <option key={l} value={l}>{isJa ? `第 ${l} 段` : `Layer ${l}`}</option>
            ))}
          </select>

          {/* CSV Download Button */}
          <button
            onClick={handleExportManifestCsv}
            title={isJa ? 'マニフェストCSV出力' : 'Export Loading Manifest'}
            className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>{isJa ? 'CSV出力' : 'CSV'}</span>
          </button>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            title={isJa ? '作業指示書を印刷' : 'Print Loading Sheet'}
            className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isJa ? '印刷' : 'Print'}</span>
          </button>
        </div>
      </div>

      {/* Manifest Table */}
      <div className="overflow-x-auto overflow-y-auto max-h-[380px] rounded-xl border border-slate-200 custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 text-slate-600 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                <button 
                  onClick={() => { setSortField('seq'); setSortAsc(!sortAsc); }}
                  className="flex items-center gap-1 hover:text-slate-900"
                >
                  <span>{isJa ? '手順' : 'Step'}</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '品名 / SKU' : 'Item Name & SKU'}</th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                {isJa ? `配置座標 (X, Y, Z ${unitSystem === 'imperial' ? 'in' : 'mm'})` : `Position (${unitSystem === 'imperial' ? 'in' : 'mm'})`}
              </th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                {isJa ? `寸法 (L×W×H ${unitSystem === 'imperial' ? 'in' : 'mm'})` : `Dimensions (${unitSystem === 'imperial' ? 'in' : 'mm'})`}
              </th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                <button 
                  onClick={() => { setSortField('weight'); setSortAsc(!sortAsc); }}
                  className="flex items-center gap-1 hover:text-slate-900"
                >
                  <span>{isJa ? `単体 / 累積重量 (${unitSystem === 'imperial' ? 'lbs' : 'kg'})` : `Weight / Total (${unitSystem === 'imperial' ? 'lbs' : 'kg'})`}</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '段数' : 'Layer'}</th>
              <th className="py-2.5 px-3.5 whitespace-nowrap text-right">{isJa ? '確認' : 'Action'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white font-mono">
            {displayItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400 text-xs font-sans">
                  {isJa ? '該当する荷物が見つかりません' : 'No matching items found.'}
                </td>
              </tr>
            ) : (
              displayItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const cumWeight = cumulativeWeights.get(item.sequenceNumber) || item.weight;
                const coords = formatCoordinates(item.x, item.y, item.z, unitSystem);

                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectItem(isSelected ? null : item)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/80 text-blue-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {/* Sequence Badge */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-bold">
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px] border border-blue-200">
                        #{item.sequenceNumber}
                      </span>
                    </td>

                    {/* Name & SKU */}
                    <td className="py-2.5 px-3.5 font-sans">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10" 
                          style={{ backgroundColor: item.color }} 
                        />
                        <span className="font-semibold text-slate-900 truncate max-w-[180px]">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1 py-0.5 rounded border border-slate-200">
                          {item.sku}
                        </span>
                        {item.fragile && (
                          <span className="text-red-600" title={isJa ? '割れ物' : 'Fragile'}>
                            <ShieldAlert className="w-3.5 h-3.5 inline" />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Position Coordinates */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">
                      X: <strong className="text-amber-600">{coords.x}</strong>, Y: <strong className="text-blue-600">{coords.y}</strong>, Z: <strong className="text-emerald-600">{coords.z}</strong>
                    </td>

                    {/* Dimensions */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-700">
                      {formatDimensions(item.length, item.width, item.height, unitSystem, true)}
                    </td>

                    {/* Weight */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="text-emerald-600 font-bold">{formatWeightCompact(item.weight, unitSystem)}</span>
                      <span className="text-slate-400 text-[10px] ml-1.5 font-sans">
                        ({isJa ? '累計' : 'Total'}: {formatWeightCompact(cumWeight, unitSystem)})
                      </span>
                    </td>

                    {/* Layer */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-sans">
                      <span className="text-[11px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md font-medium">
                        {isJa ? `第 ${item.layer} 段` : `L${item.layer}`}
                      </span>
                    </td>

                    {/* 3D Inspect Action */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right font-sans">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(isSelected ? null : item);
                        }}
                        className={`p-1.5 rounded-lg text-xs transition-colors ${
                          isSelected ? 'text-blue-600 bg-blue-100 font-bold' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'
                        }`}
                        title={isJa ? '3Dビューでハイライト' : 'Highlight in 3D'}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
