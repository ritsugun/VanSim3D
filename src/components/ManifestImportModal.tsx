import React, { useState, useRef } from 'react';
import { 
  Upload, FileSpreadsheet, FileText, CheckCircle2, AlertTriangle, 
  X, Download, Eye, Box, ArrowRight, Layers, Sparkles, RefreshCw
} from 'lucide-react';
import { Container, CargoItem, PackingResult } from '../types';
import { 
  parseManifestFile, 
  ManifestParseResult, 
  downloadSampleManifestExcel, 
  downloadSampleManifestCsv 
} from '../utils/manifestParser';

interface ManifestImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'ja' | 'en';
  currentContainer: Container;
  onApplyManifestResult: (
    packingResult: PackingResult,
    reconstructedCargo: CargoItem[],
    detectedContainer: Container,
    manifestMeta: {
      fileName: string;
      totalItems: number;
      totalWeightKg: number;
      warnings: string[];
    }
  ) => void;
  onApplyAsCargoListOnly?: (cargoItems: CargoItem[], container?: Container) => void;
}

export const ManifestImportModal: React.FC<ManifestImportModalProps> = ({
  isOpen,
  onClose,
  language,
  currentContainer,
  onApplyManifestResult,
  onApplyAsCargoListOnly
}) => {
  const isJa = language === 'ja';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseResult, setParseResult] = useState<ManifestParseResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'reproduce_3d' | 'cargo_only'>('reproduce_3d');

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setParseResult(null);

    try {
      const res = await parseManifestFile(file, currentContainer);
      if (res.success) {
        setParseResult(res);
      } else {
        setErrorMessage(res.error || (isJa ? 'ファイルの解析に失敗しました。' : 'Failed to parse manifest file.'));
      }
    } catch (err: any) {
      setErrorMessage(err?.message || (isJa ? '予期せぬエラーが発生しました。' : 'An unexpected error occurred.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleConfirm = () => {
    if (!parseResult || !parseResult.success) return;

    if (importMode === 'reproduce_3d') {
      onApplyManifestResult(
        parseResult.packingResult,
        parseResult.cargoList,
        parseResult.detectedContainer,
        {
          fileName: parseResult.fileName,
          totalItems: parseResult.totalItems,
          totalWeightKg: parseResult.totalWeightKg,
          warnings: parseResult.warnings
        }
      );
    } else if (onApplyAsCargoListOnly) {
      onApplyAsCargoListOnly(parseResult.cargoList, parseResult.detectedContainer);
    }

    onClose();
  };

  const handleReset = () => {
    setParseResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {isJa ? 'Loading_Manifest 取込 & 3D積載再現' : 'Import Loading Manifest & Reproduce 3D Layout'}
                <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded">
                  XLSX / CSV / JSON
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {isJa 
                  ? '外部ファイルから座標(X,Y,Z)・積載順序・段数を読み込み、3Dコンテナ内へ忠実に再現配置します' 
                  : 'Import exact 3D coordinates (X,Y,Z), sequence, and tiers to recreate the container load plan'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Quick template download helpers */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 flex-wrap gap-2">
            <div className="flex items-center gap-2 text-slate-700">
              <Download className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-xs">
                {isJa ? 'マニフェスト雛形フォーマット' : 'Sample Manifest Templates:'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadSampleManifestExcel}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isJa ? 'Excel雛形 (.xlsx)' : 'Excel Sample'}</span>
              </button>
              <button
                type="button"
                onClick={downloadSampleManifestCsv}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>{isJa ? 'CSV雛形 (.csv)' : 'CSV Sample'}</span>
              </button>
            </div>
          </div>

          {/* Upload Drop Area */}
          {!parseResult && (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50/60 scale-[0.99]' 
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/40 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={handleFileInputChange}
                className="hidden"
              />
              
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 shadow-xs border border-blue-100">
                {isProcessing ? (
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                ) : (
                  <Upload className="w-6 h-6" />
                )}
              </div>

              <p className="text-sm font-bold text-slate-800 mb-1">
                {isProcessing 
                  ? (isJa ? 'ファイルを解析中...' : 'Parsing manifest file...')
                  : (isJa ? 'Loading_Manifest ファイルをここにドラッグ＆ドロップ' : 'Drag & drop your Loading Manifest file here')}
              </p>
              <p className="text-slate-500 text-xs mb-3">
                {isJa 
                  ? 'またはクリックしてファイルを選択 (対応形式: .xlsx, .xls, .csv, .json)' 
                  : 'or click to browse (.xlsx, .xls, .csv, .json supported)'}
              </p>

              <div className="inline-flex items-center gap-3 text-[11px] text-slate-600 bg-white border border-slate-200 px-3 py-1 rounded-full font-mono shadow-2xs">
                <span>✓ X, Y, Z 配置座標</span>
                <span>✓ 長さ・幅・高さ・重量</span>
                <span>✓ 積載順序 & 段数</span>
                <span>✓ 天地無用・床置き</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">{isJa ? '取込エラー' : 'Import Error'}</p>
                <p className="text-xs text-red-600">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Parsed Result Preview */}
          {parseResult && parseResult.success && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-emerald-900 text-sm">
                      {isJa ? 'マニフェスト解析完了' : 'Manifest Successfully Parsed'}
                    </span>
                    <span className="font-mono text-xs text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md border border-emerald-200">
                      {parseResult.fileName}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    {isJa ? '別のファイルを選択' : 'Choose another file'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-white border border-emerald-200/80 rounded-lg p-2.5">
                    <span className="text-[10px] text-slate-500 block">{isJa ? '積載個数' : 'Total Items'}</span>
                    <span className="text-sm font-bold text-slate-900 font-mono">
                      {parseResult.totalItems.toLocaleString()} {isJa ? '個' : 'pcs'}
                    </span>
                  </div>
                  <div className="bg-white border border-emerald-200/80 rounded-lg p-2.5">
                    <span className="text-[10px] text-slate-500 block">{isJa ? '総重量' : 'Total Weight'}</span>
                    <span className="text-sm font-bold text-slate-900 font-mono">
                      {parseResult.totalWeightKg.toLocaleString()} kg
                    </span>
                  </div>
                  <div className="bg-white border border-emerald-200/80 rounded-lg p-2.5">
                    <span className="text-[10px] text-slate-500 block">{isJa ? 'コンテナ本数' : 'Containers'}</span>
                    <span className="text-sm font-bold text-slate-900 font-mono">
                      {parseResult.containerCount} {isJa ? '本' : 'units'}
                    </span>
                  </div>
                  <div className="bg-white border border-emerald-200/80 rounded-lg p-2.5">
                    <span className="text-[10px] text-slate-500 block">{isJa ? '適合コンテナ' : 'Container Type'}</span>
                    <span className="text-xs font-bold text-blue-700 truncate block" title={parseResult.detectedContainer.name}>
                      {parseResult.detectedContainer.name}
                    </span>
                  </div>
                </div>

                {parseResult.warnings.length > 0 && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-800 space-y-1">
                    {parseResult.warnings.map((w, idx) => (
                      <p key={idx} className="flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>{w}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Mode Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  {isJa ? '反映方法の選択:' : 'Select Apply Mode:'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label 
                    className={`border rounded-xl p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                      importMode === 'reproduce_3d' 
                        ? 'border-blue-600 bg-blue-50/50 shadow-xs' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'reproduce_3d'}
                      onChange={() => setImportMode('reproduce_3d')}
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 text-xs block flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-blue-600" />
                        {isJa ? '【推奨】配置座標を完全再現 (3D積載再現)' : 'Reproduce 3D Layout Exactly'}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {isJa 
                          ? 'ファイル内のX, Y, Z座標・段数・積載順序をそのまま3Dビューアと積載表に再現します。' 
                          : 'Keeps the exact X,Y,Z coordinates, tier sequence, and container assignment from the manifest.'}
                      </p>
                    </div>
                  </label>

                  <label 
                    className={`border rounded-xl p-3.5 flex items-start gap-3 cursor-pointer transition-all ${
                      importMode === 'cargo_only' 
                        ? 'border-blue-600 bg-blue-50/50 shadow-xs' 
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'cargo_only'}
                      onChange={() => setImportMode('cargo_only')}
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <span className="font-bold text-slate-900 text-xs block flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        {isJa ? '貨物リストとして登録して再最適化' : 'Import as Cargo List & Re-optimize'}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {isJa 
                          ? '貨物マスタ・荷物一覧として登録し、選択中のAIアルゴリズムで新たに積載計算を実行します。' 
                          : 'Imports items into cargo inventory and lets AI optimizer recalculate placements.'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Items Preview Table */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    {isJa ? '配置プレビュー (先頭6件):' : 'Placement Preview (First 6 items):'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {parseResult.packingResult.packedItems.length} {isJa ? '件の積載データ' : 'packed items'}
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-48 custom-scrollbar">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                      <tr>
                        <th className="py-2 px-2.5">No</th>
                        <th className="py-2 px-2.5">Cont#</th>
                        <th className="py-2 px-2.5">{isJa ? '品名 / SKU' : 'Item / SKU'}</th>
                        <th className="py-2 px-2.5 font-mono">X (m)</th>
                        <th className="py-2 px-2.5 font-mono">Y (m)</th>
                        <th className="py-2 px-2.5 font-mono">Z (m)</th>
                        <th className="py-2 px-2.5 font-mono">L×W×H (m)</th>
                        <th className="py-2 px-2.5">{isJa ? '重量' : 'Weight'}</th>
                        <th className="py-2 px-2.5">{isJa ? '段数' : 'Layer'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {parseResult.packingResult.packedItems.slice(0, 6).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          <td className="py-1.5 px-2.5 font-bold text-slate-900">{item.sequenceNumber}</td>
                          <td className="py-1.5 px-2.5 text-blue-600 font-semibold">#{item.containerIndex}</td>
                          <td className="py-1.5 px-2.5 font-sans font-medium text-slate-800 truncate max-w-[140px]" title={item.name}>
                            {item.name}
                          </td>
                          <td className="py-1.5 px-2.5 text-slate-600">{(item.x / 1000).toFixed(2)}</td>
                          <td className="py-1.5 px-2.5 text-slate-600">{(item.y / 1000).toFixed(2)}</td>
                          <td className="py-1.5 px-2.5 text-slate-600">{(item.z / 1000).toFixed(2)}</td>
                          <td className="py-1.5 px-2.5 text-slate-600">{(item.length / 1000).toFixed(2)}×{(item.width / 1000).toFixed(2)}×{(item.height / 1000).toFixed(2)}</td>
                          <td className="py-1.5 px-2.5 text-slate-900 font-bold">{item.weight} kg</td>
                          <td className="py-1.5 px-2.5 text-slate-600">{item.layer}段</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-300 transition-colors"
          >
            {isJa ? 'キャンセル' : 'Cancel'}
          </button>

          <button
            type="button"
            id="manifest-confirm-apply-btn"
            disabled={!parseResult || !parseResult.success}
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {importMode === 'reproduce_3d' 
                ? (isJa ? '3D積載を完全再現する' : 'Reproduce 3D Loading Plan')
                : (isJa ? '貨物登録して再計算' : 'Import & Re-optimize')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
