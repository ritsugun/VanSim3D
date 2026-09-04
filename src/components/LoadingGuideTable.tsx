import React, { useState, useMemo } from 'react';
import { PackedItem, Language, UnitSystem, Container, ContainerLoad } from '../types';
import { 
  ClipboardList, Search, Download, Printer, 
  ShieldAlert, Check, ArrowUpDown, Filter, Eye, Box, ArrowDownToLine 
} from 'lucide-react';
import { formatDimensions, formatCoordinates, formatWeightCompact } from '../utils/units';

interface LoadingGuideTableProps {
  packedItems: PackedItem[];
  container: Container;
  language: Language;
  unitSystem: UnitSystem;
  onSelectItem: (item: PackedItem | null) => void;
  selectedItem: PackedItem | null;
  containers?: ContainerLoad[];
  activeContainerIndex?: number | 'all';
  onSelectContainerIndex?: (index: number | 'all') => void;
}

export const LoadingGuideTable: React.FC<LoadingGuideTableProps> = ({
  packedItems,
  container,
  language,
  unitSystem,
  onSelectItem,
  selectedItem,
  containers,
  activeContainerIndex = 'all',
  onSelectContainerIndex
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLayer, setSelectedLayer] = useState<string>('all');
  const [selectedContainerFilter, setSelectedContainerFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'seq' | 'weight' | 'name' | 'z' | 'container'>('seq');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const isJa = language === 'ja';
  const hasMultipleContainers = containers && containers.length > 1;

  // All items across all containers or current single container
  const allPackedItems = useMemo(() => {
    if (hasMultipleContainers) {
      return containers.flatMap(c => c.packedItems);
    }
    return packedItems;
  }, [containers, hasMultipleContainers, packedItems]);

  // Extract unique layers
  const layers = useMemo(() => {
    const set = new Set<number>();
    allPackedItems.forEach(p => set.add(p.layer));
    return Array.from(set).sort((a, b) => a - b);
  }, [allPackedItems]);

  // Filtered & Sorted items
  const displayItems = useMemo(() => {
    return allPackedItems
      .filter(item => {
        const matchesQuery = 
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.sku.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesLayer = selectedLayer === 'all' || item.layer === Number(selectedLayer);
        const matchesContainer = 
          selectedContainerFilter === 'all' || 
          (item.containerIndex !== undefined && item.containerIndex === Number(selectedContainerFilter));
        return matchesQuery && matchesLayer && matchesContainer;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'seq') cmp = a.sequenceNumber - b.sequenceNumber;
        else if (sortField === 'weight') cmp = a.weight - b.weight;
        else if (sortField === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortField === 'z') cmp = a.z - b.z;
        else if (sortField === 'container') cmp = (a.containerIndex || 1) - (b.containerIndex || 1);
        return sortAsc ? cmp : -cmp;
      });
  }, [allPackedItems, searchQuery, selectedLayer, selectedContainerFilter, sortField, sortAsc]);

  // Cumulative weight up to each item
  const cumulativeWeights = useMemo(() => {
    const map = new Map<number, number>();
    let sum = 0;
    allPackedItems.forEach(p => {
      sum += p.weight;
      map.set(p.sequenceNumber, sum);
    });
    return map;
  }, [allPackedItems]);

  // Summary of items and counts per container
  const containerCargoSummaries = useMemo(() => {
    const containerLoadsList = hasMultipleContainers 
      ? containers 
      : [{ containerIndex: 1, container, packedItems, metrics: {} as any }];

    return containerLoadsList.map(c => {
      const itemMap = new Map<string, { name: string; sku: string; color: string; count: number; weight: number }>();
      c.packedItems.forEach(item => {
        const key = item.sku;
        const existing = itemMap.get(key);
        if (existing) {
          existing.count += 1;
          existing.weight += item.weight;
        } else {
          itemMap.set(key, {
            name: item.name,
            sku: item.sku,
            color: item.color,
            count: 1,
            weight: item.weight
          });
        }
      });
      return {
        containerIndex: c.containerIndex,
        containerName: c.container?.name || `Container #${c.containerIndex}`,
        totalCount: c.packedItems.length,
        totalWeight: c.packedItems.reduce((sum, item) => sum + item.weight, 0),
        items: Array.from(itemMap.values()).sort((a, b) => b.count - a.count)
      };
    });
  }, [containers, hasMultipleContainers, packedItems, container]);

  // Export Loading Manifest CSV
  const handleExportManifestCsv = () => {
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
      '床置き指定'
    ];

    const rows = allPackedItems.map(p => [
      p.sequenceNumber,
      p.containerIndex || 1,
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
      p.fragile ? (isJa ? '割れ物' : 'YES') : (isJa ? '通常' : 'NO'),
      p.floorPlacement ? (isJa ? '床置き' : 'YES') : (isJa ? '通常' : 'NO')
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
              ({displayItems.length} / {allPackedItems.length} {isJa ? '点' : 'items'})
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

          {/* Container Filter if multiple containers exist */}
          {hasMultipleContainers && (
            <select
              value={selectedContainerFilter}
              onChange={e => setSelectedContainerFilter(e.target.value)}
              className="bg-purple-50 border border-purple-200 text-purple-800 font-semibold rounded-lg px-2.5 py-1.5 text-xs focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
            >
              <option value="all">{isJa ? '全コンテナ (All Containers)' : 'All Containers'}</option>
              {containers.map(c => (
                <option key={c.containerIndex} value={c.containerIndex}>
                  {isJa ? `コンテナ #${c.containerIndex} (${c.packedItems.length}個)` : `Container #${c.containerIndex} (${c.packedItems.length} pcs)`}
                </option>
              ))}
            </select>
          )}

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

      {/* Container Cargo Breakdown Summary Pills */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
            <Box className="w-3.5 h-3.5 text-blue-600" />
            {isJa ? 'コンテナ別 積載品目・個数クイック集計' : 'Cargo Quantities per Container Summary'}
          </span>
          <span className="text-[10px] text-slate-400">
            {isJa ? 'クリックで検索フィルター適用' : 'Click item to filter'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {containerCargoSummaries.map((cSummary, idx) => (
            <div key={idx} className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-blue-600 text-white text-[10px] font-mono flex items-center justify-center font-bold">
                    #{cSummary.containerIndex}
                  </span>
                  {cSummary.containerName}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {cSummary.totalCount} {isJa ? '個' : 'pcs'} ({formatWeightCompact(cSummary.totalWeight, unitSystem)})
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {cSummary.items.map((item, iIdx) => (
                  <button
                    key={iIdx}
                    type="button"
                    onClick={() => setSearchQuery(item.sku)}
                    title={`${item.name} (${item.sku})`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 text-[11px] font-medium transition-colors"
                  >
                    <span 
                      className="w-2 h-2 rounded-xs shrink-0" 
                      style={{ backgroundColor: item.color }} 
                    />
                    <span className="truncate max-w-[110px] font-semibold">{item.name}:</span>
                    <span className="font-mono font-bold text-blue-600 bg-blue-50/80 px-1 rounded text-[10px]">
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
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
              {hasMultipleContainers && (
                <th className="py-2.5 px-3.5 whitespace-nowrap">
                  <button 
                    onClick={() => { setSortField('container'); setSortAsc(!sortAsc); }}
                    className="flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>{isJa ? 'コンテナ' : 'Container'}</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
              )}
              <th className="py-2.5 px-3.5 whitespace-nowrap">{isJa ? '品名 / SKU' : 'Item Name & SKU'}</th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                {isJa ? '配置座標 (X, Y, Z mm)' : 'Position (mm)'}
              </th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                {isJa ? '寸法 (L×W×H mm)' : 'Dimensions (mm)'}
              </th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                <button 
                  onClick={() => { setSortField('weight'); setSortAsc(!sortAsc); }}
                  className="flex items-center gap-1 hover:text-slate-900"
                >
                  <span>{isJa ? '単体 / 累積重量 (kg)' : 'Weight / Total (kg)'}</span>
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
                <td colSpan={hasMultipleContainers ? 8 : 7} className="py-8 text-center text-slate-400 font-sans">
                  {isJa ? '該当する積載指示データがありません' : 'No items match your filter criteria'}
                </td>
              </tr>
            ) : (
              displayItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const coords = formatCoordinates(item.x, item.y, item.z, unitSystem);
                const cumWeight = cumulativeWeights.get(item.sequenceNumber) || item.weight;

                return (
                  <tr 
                    key={item.id}
                    onClick={() => onSelectItem(isSelected ? null : item)}
                    className={`cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-amber-50/80 text-slate-900 font-semibold' 
                        : 'hover:bg-blue-50/40 text-slate-700'
                    }`}
                  >
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold">
                        #{item.sequenceNumber}
                      </span>
                    </td>

                    {hasMultipleContainers && (
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded text-[11px] font-bold">
                          <Box className="w-3 h-3" />
                          <span>#{item.containerIndex || 1}</span>
                        </span>
                      </td>
                    )}

                    <td className="py-2.5 px-3.5 font-sans">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10" 
                          style={{ backgroundColor: item.color }} 
                        />
                        <div className="truncate max-w-[180px]">
                          <span className="font-semibold text-slate-900 block truncate">{item.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{item.sku}</span>
                        </div>
                        {item.fragile && (
                          <span title={isJa ? '割れ物・天地無用' : 'Fragile'} className="text-red-500">
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {item.floorPlacement && (
                          <span title={isJa ? '床置き指定 (床面 z=0)' : 'Floor Placement (z=0)'} className="text-amber-600 bg-amber-50 px-1 py-0.5 rounded text-[9px] font-bold border border-amber-200 flex items-center gap-0.5">
                            <ArrowDownToLine className="w-2.5 h-2.5" />
                            <span>{isJa ? '床' : 'Floor'}</span>
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600">
                      X: {coords.x}, Y: {coords.y}, Z: {coords.z}
                    </td>

                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600">
                      {formatDimensions(item.length, item.width, item.height, unitSystem, true)}
                    </td>

                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="text-emerald-600 font-bold">
                        {formatWeightCompact(item.weight, unitSystem)}
                      </span>
                      <span className="text-slate-400 text-[10px] ml-1.5">
                        (累計: {formatWeightCompact(cumWeight, unitSystem)})
                      </span>
                    </td>

                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-sans font-medium">
                        L{item.layer}
                      </span>
                    </td>

                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right font-sans">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(isSelected ? null : item);
                        }}
                        className={`p-1 rounded transition-colors ${
                          isSelected ? 'bg-amber-200 text-amber-900' : 'hover:bg-slate-100 text-slate-500'
                        }`}
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
