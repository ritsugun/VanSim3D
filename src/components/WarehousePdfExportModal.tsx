import React, { useState } from 'react';
import { 
  FileText, Download, Check, X, Printer, Shield, 
  Layers, Box, Truck, Compass, Settings2, Sparkles, AlertCircle 
} from 'lucide-react';
import { Container, PackedItem, PackingMetrics, UnplacedItem, ContainerLoad, OverallPackingMetrics, Language, UnitSystem, AlgorithmType } from '../types';
import { exportWarehouseLoadingManifestPdf, preloadJapaneseFont } from '../utils/pdfExport';
import { formatWeightCompact } from '../utils/units';

interface WarehousePdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
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
}

export const WarehousePdfExportModal: React.FC<WarehousePdfExportModalProps> = ({
  isOpen,
  onClose,
  container,
  containers,
  packedItems,
  metrics,
  overallMetrics,
  unplacedItems = [],
  activeContainerIndex = 'all',
  language,
  unitSystem,
  algorithmName = 'Extreme Points 3D',
  hasManualAdjustments = false
}) => {
  const isJa = language === 'ja';
  const hasMultipleContainers = !!(containers && containers.length > 1);

  // Export settings state
  const [selectedContainerFilter, setSelectedContainerFilter] = useState<string>(
    activeContainerIndex === 'all' ? 'all' : String(activeContainerIndex)
  );
  const [includeDiagrams, setIncludeDiagrams] = useState<boolean>(true);
  const [includeSummaryTable, setIncludeSummaryTable] = useState<boolean>(true);
  const [includeStepTable, setIncludeStepTable] = useState<boolean>(true);
  const [includeSignoff, setIncludeSignoff] = useState<boolean>(true);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [pdfLanguage, setPdfLanguage] = useState<Language>(language);
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customNotes, setCustomNotes] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  // Filtered items count for preview
  const previewItemCount = selectedContainerFilter === 'all'
    ? (hasMultipleContainers ? containers!.reduce((s, c) => s + c.packedItems.length, 0) : packedItems.length)
    : (containers?.find(c => String(c.containerIndex) === selectedContainerFilter)?.packedItems.length || packedItems.length);

  const previewWeight = selectedContainerFilter === 'all'
    ? (hasMultipleContainers ? containers!.reduce((s, c) => s + c.metrics.packedWeightKg, 0) : metrics.packedWeightKg)
    : (containers?.find(c => String(c.containerIndex) === selectedContainerFilter)?.metrics.packedWeightKg || metrics.packedWeightKg);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportSuccess(false);

      const targetContIndex = selectedContainerFilter === 'all' ? 'all' : Number(selectedContainerFilter);

      await exportWarehouseLoadingManifestPdf({
        container,
        containers,
        packedItems,
        metrics,
        overallMetrics,
        unplacedItems,
        activeContainerIndex: targetContIndex,
        language: pdfLanguage,
        unitSystem,
        algorithmName,
        hasManualAdjustments,
        includeDiagrams,
        includeSummaryTable,
        includeStepTable,
        includeSignoff,
        orientation,
        documentTitle: customTitle.trim() || undefined,
        notes: customNotes.trim() || undefined
      });

      setIsExporting(false);
      setExportSuccess(true);
      setTimeout(() => {
        setExportSuccess(false);
      }, 3500);
    } catch (err) {
      console.error('PDF export failed:', err);
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-fadeIn">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-scaleUp"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/90 text-white flex items-center justify-center shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{isJa ? 'PDF積載指示マニフェスト出力' : 'Export Warehouse Loading Manifest PDF'}</span>
                <span className="text-[10px] bg-red-500/30 text-red-200 border border-red-400/40 px-2 py-0.5 rounded-full font-mono">
                  ISO 1496-1
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                {isJa 
                  ? '倉庫作業員・フォークリフト用の積載手順書・配置図面・検収署名付き公式PDF' 
                  : 'Stowage plans, step-by-step checklist & sign-off sheet for warehouse crew'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar text-xs text-slate-700">
          
          {/* Quick Document Highlights / Target Overview */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-blue-600" />
                {container.name}
              </span>
              <span className="font-mono text-slate-500">
                {previewItemCount} {isJa ? '個積載' : 'units loaded'} ({formatWeightCompact(previewWeight, unitSystem)})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
              <div>
                <span className="text-slate-400 block text-[10px]">{isJa ? '容積率' : 'Volume'}</span>
                <span className="font-bold text-slate-900">{metrics.volumeUtilization.toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">{isJa ? '重量率' : 'Payload'}</span>
                <span className="font-bold text-slate-900">{metrics.weightUtilization.toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">{isJa ? '前後重心' : 'CoG Offset'}</span>
                <span className="font-bold text-emerald-700">{metrics.centerOfGravity.offsetXPercent.toFixed(1)}% (SAFE)</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">{isJa ? '計算エンジン' : 'Strategy'}</span>
                <span className="font-semibold text-slate-700 truncate block">
                  {algorithmName.split(' ')[0]} {hasManualAdjustments ? '★' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Export Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Scope Selection */}
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                {isJa ? '出力対象コンテナ' : 'Container Scope'}
              </label>
              {hasMultipleContainers ? (
                <select
                  value={selectedContainerFilter}
                  onChange={e => setSelectedContainerFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="all">{isJa ? '全コンテナ一括 (All Containers Fleet)' : 'All Containers'}</option>
                  {containers?.map(c => (
                    <option key={c.containerIndex} value={String(c.containerIndex)}>
                      {isJa ? `コンテナ #${c.containerIndex} (${c.packedItems.length} 個)` : `Container #${c.containerIndex} (${c.packedItems.length} pcs)`}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 font-medium">
                  {container.name} (1 Unit)
                </div>
              )}
            </div>

            {/* Language Selection */}
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                {isJa ? 'ドキュメント言語' : 'Document Language'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPdfLanguage('ja')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    pdfLanguage === 'ja'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {pdfLanguage === 'ja' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>日本語 (Japanese)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPdfLanguage('en')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    pdfLanguage === 'en'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {pdfLanguage === 'en' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>English (Global)</span>
                </button>
              </div>
            </div>

            {/* Paper Orientation */}
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                {isJa ? '用紙の向き' : 'Page Orientation'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    orientation === 'landscape'
                      ? 'bg-blue-50 text-blue-800 border-blue-300 font-bold'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {orientation === 'landscape' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  <span>{isJa ? '横向き (推奨・ワイド表)' : 'Landscape (Recommended)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    orientation === 'portrait'
                      ? 'bg-blue-50 text-blue-800 border-blue-300 font-bold'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {orientation === 'portrait' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  <span>{isJa ? '縦向き (A4 縦)' : 'Portrait'}</span>
                </button>
              </div>
            </div>

            {/* Custom Manifest Title */}
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                {isJa ? '指示書タイトル（任意）' : 'Document Title (Optional)'}
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder={isJa ? '例: 第4便 大阪港行き 40HC積載指示書' : 'e.g., Hamburg Export Loading Guide'}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none placeholder-slate-400"
              />
            </div>
          </div>

          {/* Section Inclusion Toggles */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="block text-[11px] font-bold text-slate-800">
              {isJa ? '出力に含めるコンテンツ項目' : 'Included Content Sections'}
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includeDiagrams}
                  onChange={e => setIncludeDiagrams(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <div>
                  <span className="font-semibold text-slate-800 block text-xs">
                    {isJa ? '2D配置図面 (平面図・側面図)' : '2D Stowage Schematics'}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {isJa ? '荷物の配置位置・ドア開口部・重心位置' : 'Top floor plan & vertical elevation diagrams'}
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includeSummaryTable}
                  onChange={e => setIncludeSummaryTable(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <div>
                  <span className="font-semibold text-slate-800 block text-xs">
                    {isJa ? '品目別集計表 (Bill of Items)' : 'Consolidated SKU Breakdown'}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {isJa ? 'SKUごとの個数・寸法・合計重量' : 'Total quantity and weight grouped by SKU'}
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includeStepTable}
                  onChange={e => setIncludeStepTable(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <div>
                  <span className="font-semibold text-slate-800 block text-xs">
                    {isJa ? '手順別積込表 & チェックボックス' : 'Step-by-Step Stowage Table'}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {isJa ? '1点ごとのX/Y/Z座標・積込順・確認欄' : 'Sequential positions and verification checkboxes'}
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includeSignoff}
                  onChange={e => setIncludeSignoff(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <div>
                  <span className="font-semibold text-slate-800 block text-xs">
                    {isJa ? '現場署名・封印シール番号欄' : 'Sign-Off & QA Inspection Box'}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {isJa ? '作業員・検査員署名、ボルトシール欄' : 'Checker sign-off line & container bolt seal field'}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Success Banner */}
          {exportSuccess && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 text-emerald-900 flex items-center gap-2 animate-fadeIn">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium text-xs">
                {isJa 
                  ? 'PDF作業指示書が正常に出力されました！ダウンロードをご確認ください。' 
                  : 'Warehouse PDF manifest generated and downloaded successfully!'}
              </span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            {isJa ? '閉じる' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            {isExporting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{isJa ? 'PDF生成中...' : 'Generating PDF...'}</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>{isJa ? 'PDF作業指示書を生成・保存' : 'Generate & Download PDF'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
