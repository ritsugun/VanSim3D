import React, { useState, useMemo, useEffect, useRef } from 'react';
import { PackedItem, CargoItem, Language, UnitSystem, Container, ContainerLoad, PackingMetrics, OverallPackingMetrics, UnplacedItem } from '../types';
import { 
  ClipboardList, Search, FileOutput, Printer, FileText, FileSpreadsheet, FileInput,
  ShieldAlert, Check, ArrowUpDown, Filter, Eye, Box, ArrowDownToLine, Sparkles, RefreshCw,
  Download, ChevronDown, FileCode, Upload
} from 'lucide-react';
import { formatDimensions, formatCoordinates, formatWeightCompact } from '../utils/units';
import { WarehousePdfExportModal } from './WarehousePdfExportModal';
import { exportManifestToExcel } from '../utils/manifestParser';

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
  metrics?: PackingMetrics;
  overallMetrics?: OverallPackingMetrics;
  unplacedItems?: UnplacedItem[];
  cargoList?: CargoItem[];
  algorithmName?: string;
  hasManualAdjustments?: boolean;
  onOpenImportManifest?: () => void;
  isManifestReplayActive?: boolean;
  manifestFileName?: string;
  onResetToAlgorithm?: () => void;
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
  onSelectContainerIndex,
  metrics,
  overallMetrics,
  unplacedItems = [],
  cargoList = [],
  algorithmName = 'Extreme Points 3D (BFD)',
  hasManualAdjustments = false,
  onOpenImportManifest,
  isManifestReplayActive = false,
  manifestFileName,
  onResetToAlgorithm
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLayer, setSelectedLayer] = useState<string>('all');
  const [selectedContainerFilter, setSelectedContainerFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'seq' | 'weight' | 'name' | 'z' | 'container'>('seq');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [showExportPlanDropdown, setShowExportPlanDropdown] = useState<boolean>(false);
  const exportPlanDropdownRef = useRef<HTMLDivElement>(null);

  // Close Export Current Plan dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#export-current-plan-btn') && !target.closest('#export-current-plan-dropdown')) {
        setShowExportPlanDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isJa = language === 'ja';
  const hasMultipleContainers = containers && containers.length > 1;

  // All items across all containers or current single container
  const allPackedItems = useMemo(() => {
    if (hasMultipleContainers) {
      return containers.flatMap(c => c.packedItems);
    }
    return packedItems;
  }, [containers, hasMultipleContainers, packedItems]);

  const effectiveMetrics = useMemo<PackingMetrics>(() => {
    if (metrics) return metrics;
    const vol = allPackedItems.reduce((s, p) => s + (p.length * p.width * p.height) / 1e9, 0);
    const contVol = (container.length * container.width * container.height) / 1e9;
    const wt = allPackedItems.reduce((s, p) => s + p.weight, 0);
    return {
      containerVolumeCbm: contVol,
      packedVolumeCbm: vol,
      freeVolumeCbm: Math.max(0, contVol - vol),
      volumeUtilization: contVol > 0 ? (vol / contVol) * 100 : 0,
      containerMaxWeightKg: container.maxWeight,
      packedWeightKg: wt,
      weightUtilization: container.maxWeight > 0 ? (wt / container.maxWeight) * 100 : 0,
      totalItemCount: allPackedItems.length,
      packedCount: allPackedItems.length,
      unplacedCount: unplacedItems.reduce((s, u) => s + u.count, 0),
      centerOfGravity: {
        x: container.length / 2,
        y: container.width / 2,
        z: container.height / 2,
        offsetXPercent: 0,
        offsetYPercent: 0,
        offsetZPercent: 0
      },
      axleDistribution: {
        frontAxlePercent: 50,
        rearAxlePercent: 50,
        frontAxleKg: wt / 2,
        rearAxleKg: wt / 2
      },
      calculationTimeMs: 0,
      algorithm: 'extreme_points_bfd',
      containersNeeded: 1
    };
  }, [metrics, allPackedItems, container, unplacedItems]);

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

  const handleExportManifestExcel = () => {
    exportManifestToExcel(allPackedItems, container);
  };

  const handlePrint = () => {
    window.print();
  };

  // Export Current Plan as structured JSON (all 3D coordinates, orientations & container metadata)
  const handleExportPlanJson = () => {
    const containerList = (hasMultipleContainers ? containers : [
      {
        containerIndex: 1,
        container,
        packedItems: allPackedItems,
        metrics: effectiveMetrics
      }
    ]).map(c => ({
      containerIndex: c.containerIndex ?? 1,
      containerId: c.container?.id || container.id,
      containerName: c.container?.name || container.name,
      dimensionsMm: {
        length: c.container?.length || container.length,
        width: c.container?.width || container.width,
        height: c.container?.height || container.height
      },
      volumeCbm: Number((((c.container?.length || container.length) * (c.container?.width || container.width) * (c.container?.height || container.height)) / 1e9).toFixed(3)),
      maxWeightKg: c.container?.maxWeight || container.maxWeight,
      tareWeightKg: c.container?.tareWeight || container.tareWeight || 0,
      metrics: {
        packedCount: c.packedItems.length,
        packedWeightKg: c.packedItems.reduce((s, it) => s + it.weight, 0),
        packedVolumeCbm: Number((c.packedItems.reduce((s, it) => s + (it.length * it.width * it.height) / 1e9, 0)).toFixed(3)),
        volumeUtilizationPercent: Number((c.metrics?.volumeUtilization ?? 0).toFixed(2)),
        weightUtilizationPercent: Number((c.metrics?.weightUtilization ?? 0).toFixed(2)),
        centerOfGravityMm: c.metrics?.centerOfGravity ? {
          x: Math.round(c.metrics.centerOfGravity.x),
          y: Math.round(c.metrics.centerOfGravity.y),
          z: Math.round(c.metrics.centerOfGravity.z)
        } : undefined
      },
      itemCount: c.packedItems.length
    }));

    const planData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      software: "AI 3D Container Loading Planner",
      algorithm: algorithmName,
      hasManualAdjustments,
      container: {
        id: container.id,
        name: container.name,
        category: container.category,
        dimensionsMm: {
          length: container.length,
          width: container.width,
          height: container.height
        },
        volumeCbm: Number(((container.length * container.width * container.height) / 1e9).toFixed(3)),
        maxPayloadWeightKg: container.maxWeight,
        tareWeightKg: container.tareWeight || 0,
        costEstimate: container.costEstimate
      },
      summary: {
        totalContainers: hasMultipleContainers ? containers.length : 1,
        totalPackedItems: allPackedItems.length,
        totalPackedWeightKg: Math.round(allPackedItems.reduce((s, p) => s + p.weight, 0)),
        totalPackedVolumeCbm: Number((allPackedItems.reduce((s, p) => s + (p.length * p.width * p.height) / 1e9, 0)).toFixed(3)),
        volumeUtilizationPercent: Number((effectiveMetrics.volumeUtilization || 0).toFixed(2)),
        weightUtilizationPercent: Number((effectiveMetrics.weightUtilization || 0).toFixed(2)),
        unplacedItemsCount: unplacedItems.reduce((s, u) => s + u.count, 0),
        centerOfGravityMm: {
          x: Math.round(effectiveMetrics.centerOfGravity?.x ?? container.length / 2),
          y: Math.round(effectiveMetrics.centerOfGravity?.y ?? container.width / 2),
          z: Math.round(effectiveMetrics.centerOfGravity?.z ?? container.height / 2)
        },
        axleDistribution: effectiveMetrics.axleDistribution
      },
      containers: containerList,
      packedItems: allPackedItems.map(p => ({
        sequenceNumber: p.sequenceNumber,
        containerIndex: p.containerIndex || 1,
        id: p.id,
        sku: p.sku,
        name: p.name,
        positionMm: {
          x: Math.round(p.x),
          y: Math.round(p.y),
          z: Math.round(p.z)
        },
        dimensionsMm: {
          length: Math.round(p.length),
          width: Math.round(p.width),
          height: Math.round(p.height)
        },
        orientation: {
          rotationIndex: p.rotationIndex ?? 0,
          isRotatedYaw: (p.rotationIndex ?? 0) === 1,
          yawDegrees: (p.rotationIndex ?? 0) === 1 ? 90 : 0,
          description: (p.rotationIndex ?? 0) === 1 ? 'Rotated 90° (Yaw)' : 'Standard 0°'
        },
        weightKg: p.weight,
        cumulativeWeightKg: cumulativeWeights.get(p.sequenceNumber) || p.weight,
        layer: p.layer,
        fragile: !!p.fragile,
        floorPlacement: !!p.floorPlacement,
        color: p.color,
        isManual: !!p.isManual
      })),
      unplacedItems: unplacedItems.map(u => ({
        sku: u.sku,
        name: u.name,
        count: u.count,
        dimensionsMm: u.dimensions,
        weightKg: u.weight,
        reason: u.reason
      })),
      cargoList: (cargoList || []).map(c => ({
        id: c.id,
        sku: c.sku,
        name: c.name,
        length: c.length,
        width: c.width,
        height: c.height,
        weight: c.weight,
        quantity: c.quantity,
        color: c.color,
        allowYaw: c.allowYaw,
        fragile: !!c.fragile,
        floorPlacement: !!c.floorPlacement,
        priority: c.priority ?? (c.weight > 200 ? 1 : 3),
        enabled: c.enabled !== false
      }))
    };

    const jsonStr = JSON.stringify(planData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Loading_Plan_${container.id}_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Current Plan as structured CSV (with container metadata, 3D positions, and orientations)
  const handleExportPlanCsv = () => {
    const metaCommentRows = [
      `# AI 3D Container Loading Planner - Current Loading Plan Export`,
      `# Exported At: ${new Date().toISOString()}`,
      `# Container: ${container.name} (${container.id}) | Dimensions: ${container.length}x${container.width}x${container.height} mm | Volume: ${((container.length * container.width * container.height) / 1e9).toFixed(2)} m3 | Max Payload: ${container.maxWeight} kg`,
      `# Algorithm: ${algorithmName} | Total Packed: ${allPackedItems.length} pcs | Total Weight: ${Math.round(allPackedItems.reduce((s, p) => s + p.weight, 0))} kg | Volume Util: ${effectiveMetrics.volumeUtilization.toFixed(1)}% | Weight Util: ${effectiveMetrics.weightUtilization.toFixed(1)}%`,
      `# CoG: X=${Math.round(effectiveMetrics.centerOfGravity?.x ?? 0)}mm, Y=${Math.round(effectiveMetrics.centerOfGravity?.y ?? 0)}mm, Z=${Math.round(effectiveMetrics.centerOfGravity?.z ?? 0)}mm`,
      `#`
    ];

    const headers = [
      'Sequence_No',
      'Container_No',
      'Container_ID',
      'Container_Length_mm',
      'Container_Width_mm',
      'Container_Height_mm',
      'Item_Name',
      'SKU',
      'Pos_X_mm',
      'Pos_Y_mm',
      'Pos_Z_mm',
      'Dim_Length_mm',
      'Dim_Width_mm',
      'Dim_Height_mm',
      'Weight_kg',
      'Cumulative_Weight_kg',
      'Rotation_Index',
      'Orientation_Yaw_Deg',
      'Layer',
      'Fragile',
      'Floor_Placement',
      'Color',
      'Manual_Adjusted'
    ];

    const rows = allPackedItems.map(p => {
      const cObj = (containers && p.containerIndex)
        ? (containers.find(c => c.containerIndex === p.containerIndex)?.container || container)
        : container;

      return [
        p.sequenceNumber,
        p.containerIndex || 1,
        `"${cObj.id}"`,
        cObj.length,
        cObj.width,
        cObj.height,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.sku.replace(/"/g, '""')}"`,
        Math.round(p.x),
        Math.round(p.y),
        Math.round(p.z),
        Math.round(p.length),
        Math.round(p.width),
        Math.round(p.height),
        p.weight,
        cumulativeWeights.get(p.sequenceNumber) || p.weight,
        p.rotationIndex ?? 0,
        (p.rotationIndex ?? 0) === 1 ? 90 : 0,
        p.layer,
        p.fragile ? 1 : 0,
        p.floorPlacement ? 1 : 0,
        `"${p.color}"`,
        p.isManual ? 1 : 0
      ];
    });

    const csvContent = '\uFEFF' + [
      ...metaCommentRows,
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Loading_Plan_${container.id}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="loading-guide-table-root" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs text-slate-800 flex flex-col">
      {/* Manifest Replay Mode Ribbon if active */}
      {isManifestReplayActive && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                {isJa ? '外部マニフェスト再現モード中' : 'External Manifest Replay Active'}
                {manifestFileName && (
                  <span className="font-mono text-[11px] bg-white border border-blue-300 text-blue-800 px-1.5 py-0.5 rounded">
                    {manifestFileName}
                  </span>
                )}
              </span>
              <p className="text-[11px] text-blue-700">
                {isJa 
                  ? 'ファイルから読み込んだ配置座標(X,Y,Z)と積載段数を忠実に再現しています。' 
                  : 'Displaying exact 3D coordinates and tier levels loaded from the manifest file.'}
              </p>
            </div>
          </div>
          {onResetToAlgorithm && (
            <button
              type="button"
              onClick={onResetToAlgorithm}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isJa ? 'AI最適化へ戻す' : 'Reset to AI Optimizer'}</span>
            </button>
          )}
        </div>
      )}

      {/* Title & Toolbar */}
      <div className="mb-4 pb-3 border-b border-slate-100 space-y-3">
        {/* Title Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{isJa ? '積載指示マニフェスト' : 'Step-by-Step Loading Guide'}</span>
              <span className="text-xs font-normal text-slate-500 font-mono">
                ({displayItems.length} / {allPackedItems.length} {isJa ? '点' : 'items'})
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isJa ? '現場作業員・フォークリフト用の積込順序・配置座標・重量指示書' : 'Warehouse loading sequence, spatial coordinates, and weight instructions'}
            </p>
          </div>
        </div>

        {/* Toolbar: Filters on Left, Unified Exports & Import on Right */}
        <div className="flex items-center justify-between gap-2.5 flex-wrap text-xs">
          {/* Left: Filter & Search Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={isJa ? '品名・SKU検索...' : 'Search item...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none w-36 sm:w-44 shadow-2xs transition-all"
              />
            </div>

            {/* Container Filter if multiple containers exist */}
            {hasMultipleContainers && (
              <select
                value={selectedContainerFilter}
                onChange={e => setSelectedContainerFilter(e.target.value)}
                className="bg-white border border-slate-200 text-slate-700 font-medium rounded-lg px-2.5 py-1.5 text-xs focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none shadow-2xs cursor-pointer"
              >
                <option value="all">{isJa ? '全コンテナ' : 'All Containers'}</option>
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
              className="bg-white border border-slate-200 text-slate-700 font-medium rounded-lg px-2.5 py-1.5 text-xs focus:border-slate-400 focus:ring-1 focus:ring-slate-300 outline-none shadow-2xs cursor-pointer"
            >
              <option value="all">{isJa ? 'すべての段' : 'All Layers'}</option>
              {layers.map(l => (
                <option key={l} value={l}>{isJa ? `第 ${l} 段` : `Layer ${l}`}</option>
              ))}
            </select>
          </div>

          {/* Right: Export Current Plan, Unified Export Group & Import Action */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export Current Plan Button & Dropdown */}
            <div className="relative" ref={exportPlanDropdownRef}>
              <button
                type="button"
                id="export-current-plan-btn"
                onClick={() => setShowExportPlanDropdown(prev => !prev)}
                title={isJa ? '現在の積載計画（座標・回転・コンテナ仕様）を出力' : 'Export Current Plan with positions, orientations & container metadata (JSON/CSV)'}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isJa ? '計画を出力 (Export Current Plan)' : 'Export Current Plan'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExportPlanDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showExportPlanDropdown && (
                <div 
                  id="export-current-plan-dropdown"
                  className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1.5 animate-fadeIn text-slate-800"
                >
                  <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] text-slate-500 font-medium">
                    {isJa ? '出力形式を選択 (外部システム・API連携用)' : 'Select Format (For External Systems & APIs)'}
                  </div>

                  {/* JSON Option */}
                  <button
                    type="button"
                    id="export-plan-json-btn"
                    onClick={() => {
                      handleExportPlanJson();
                      setShowExportPlanDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50/80 flex items-start gap-2.5 transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-mono font-bold text-xs mt-0.5 group-hover:bg-amber-200">
                      <FileCode className="w-4 h-4 text-amber-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-blue-900">
                          {isJa ? '構造化 JSON (.json)' : 'Structured JSON (.json)'}
                        </span>
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                          JSON
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {isJa 
                          ? '3D座標(X,Y,Z)・回転角・コンテナ仕様・物理計算メトリクス' 
                          : '3D coords, orientations, container metadata & physical metrics'}
                      </p>
                    </div>
                  </button>

                  {/* CSV Option */}
                  <button
                    type="button"
                    id="export-plan-csv-btn"
                    onClick={() => {
                      handleExportPlanCsv();
                      setShowExportPlanDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50/80 flex items-start gap-2.5 transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5 group-hover:bg-blue-200">
                      <FileOutput className="w-4 h-4 text-blue-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-blue-900">
                          {isJa ? '詳細積載 CSV (.csv)' : 'Structured CSV (.csv)'}
                        </span>
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                          CSV
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {isJa 
                          ? 'コンテナ寸法・3D座標・回転角・段数付きの表形式データ' 
                          : 'Tabular data with container specs, 3D coords, rotation & layers'}
                      </p>
                    </div>
                  </button>

                  {/* Divider */}
                  <div className="my-1 border-t border-slate-100" />

                  {/* Import Link from Dropdown */}
                  {onOpenImportManifest && (
                    <button
                      type="button"
                      id="export-dropdown-import-plan-btn"
                      onClick={() => {
                        setShowExportPlanDropdown(false);
                        onOpenImportManifest();
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-emerald-50/80 flex items-start gap-2.5 transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5 group-hover:bg-emerald-200">
                        <Upload className="w-4 h-4 text-emerald-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-emerald-900">
                            {isJa ? '計画データ(JSON/CSV)を取込' : 'Import Plan File'}
                          </span>
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                            IMPORT
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          {isJa 
                            ? 'Export Current Planの出力データ(JSON/CSV)を読み込んで3D再現' 
                            : 'Load JSON/CSV plan data to reproduce exact 3D layout'}
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Direct Import Plan Button paired with Export Current Plan */}
            {onOpenImportManifest && (
              <button
                type="button"
                id="import-current-plan-btn"
                onClick={onOpenImportManifest}
                title={isJa ? 'Export Current Planの出力データ(JSON/CSV)やマニフェストを取込して3D再現' : 'Import Exported Plan (JSON/CSV) or Loading Manifest'}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer text-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isJa ? '計画を取込 (Import Plan)' : 'Import Plan'}</span>
              </button>
            )}

            {/* Unified Export Group (PDF | Excel | CSV | Print) */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white shadow-2xs divide-x divide-slate-200 overflow-hidden">
              {/* PDF Manifest Export */}
              <button
                type="button"
                id="export-pdf-manifest-btn"
                onClick={() => setIsPdfModalOpen(true)}
                title={isJa ? '現場用PDF作業指示書・マニフェストを出力' : 'Export Warehouse PDF Manifest & Stowage Plan'}
                className="px-2.5 sm:px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-rose-500" />
                <span>PDF</span>
              </button>

              {/* Excel Export */}
              <button
                type="button"
                id="export-excel-manifest-btn"
                onClick={handleExportManifestExcel}
                title={isJa ? 'マニフェストExcel出力 (.xlsx - 再現取込対応)' : 'Export Loading Manifest as Excel'}
                className="px-2.5 sm:px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Excel</span>
              </button>

              {/* CSV Export */}
              <button
                type="button"
                id="export-csv-manifest-btn"
                onClick={handleExportManifestCsv}
                title={isJa ? 'マニフェストCSV出力 (.csv)' : 'Export Loading Manifest as CSV'}
                className="px-2.5 sm:px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileOutput className="w-3.5 h-3.5 text-blue-600" />
                <span>CSV</span>
              </button>

              {/* Print */}
              <button
                type="button"
                id="print-guide-btn"
                onClick={handlePrint}
                title={isJa ? '作業指示書を印刷' : 'Print Loading Sheet'}
                className="px-2.5 sm:px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>{isJa ? '印刷' : 'Print'}</span>
              </button>
            </div>

            {/* Manifest Import Action */}
            {onOpenImportManifest && (
              <button
                type="button"
                id="import-manifest-from-guide-btn"
                onClick={onOpenImportManifest}
                title={isJa ? 'Loading_Manifestファイル取込 & 3D積載再現' : 'Import Loading Manifest & Reproduce 3D Layout'}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <FileInput className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isJa ? '取込' : 'Import'}</span>
              </button>
            )}
          </div>
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
                {isJa ? '配置座標 (X, Y, Z m)' : 'Position (m)'}
              </th>
              <th className="py-2.5 px-3.5 whitespace-nowrap">
                {isJa ? '寸法 (L×W×H m)' : 'Dimensions (m)'}
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

      {/* Warehouse PDF Export Modal */}
      <WarehousePdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        container={container}
        containers={containers}
        packedItems={packedItems}
        metrics={effectiveMetrics}
        overallMetrics={overallMetrics}
        unplacedItems={unplacedItems}
        activeContainerIndex={activeContainerIndex}
        language={language}
        unitSystem={unitSystem}
        algorithmName={algorithmName}
        hasManualAdjustments={hasManualAdjustments}
      />
    </div>
  );
};
