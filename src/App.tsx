import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Container, CargoItem, PackedItem, PackingResult, AlgorithmType, UnitSystem, Language } from './types';
import { STANDARD_CONTAINERS, SAMPLE_CARGO_PRESETS } from './data/presets';
import { run3DPackingOptimizer } from './services/packingOptimizer';
import { Header } from './components/Header';
import { ContainerViewer3D } from './components/ContainerViewer3D';
import { CargoManager } from './components/CargoManager';
import { ContainerSelector } from './components/ContainerSelector';
import { PackingAnalytics } from './components/PackingAnalytics';
import { LoadingGuideTable } from './components/LoadingGuideTable';
import { AiConsultantModal } from './components/AiConsultantModal';
import { 
  Box, BarChart3, ListOrdered, Truck, Sparkles, 
  Layers, Sliders, CheckCircle2, ShieldAlert 
} from 'lucide-react';

export default function App() {
  // Application State
  const [language, setLanguage] = useState<Language>('en');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [algorithm, setAlgorithm] = useState<AlgorithmType>('extreme_points_bfd');
  const [selectedContainer, setSelectedContainer] = useState<Container>(STANDARD_CONTAINERS[1]); // 40GP default for full HVAC manifest
  const [cargoList, setCargoList] = useState<CargoItem[]>(SAMPLE_CARGO_PRESETS[0].items); // HVAC CSV Dataset default
  const [activeTab, setActiveTab] = useState<'3d' | 'cargo' | 'container' | 'analytics' | 'manifest'>('3d');
  const [selectedItem, setSelectedItem] = useState<PackedItem | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  const isJa = language === 'ja';

  // Run Packing Optimization Calculation
  const packingResult: PackingResult = useMemo(() => {
    return run3DPackingOptimizer(selectedContainer, cargoList, algorithm);
  }, [selectedContainer, cargoList, algorithm]);

  // Re-optimize action trigger with subtle celebration effect
  const handleReoptimize = useCallback(() => {
    setIsCalculating(true);
    setTimeout(() => {
      setIsCalculating(false);
      if (packingResult.metrics.volumeUtilization > 75 || packingResult.metrics.unplacedCount === 0) {
        try {
          confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.85 }
          });
        } catch (e) {
          // Ignore if canvas confetti unavailable
        }
      }
    }, 250);
  }, [packingResult]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <Header
        algorithm={algorithm}
        onChangeAlgorithm={setAlgorithm}
        language={language}
        onChangeLanguage={setLanguage}
        unitSystem={unitSystem}
        onChangeUnitSystem={setUnitSystem}
        onOpenAiConsultant={() => setIsAiModalOpen(true)}
        onReoptimize={handleReoptimize}
        isCalculating={isCalculating}
      />

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5 overflow-x-auto custom-scrollbar">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <button
              id="tab-3d-btn"
              onClick={() => setActiveTab('3d')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === '3d'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Box className="w-4 h-4" />
              <span>{isJa ? '3D 積載ビュー & 操作' : '3D Load View'}</span>
            </button>

            <button
              id="tab-cargo-btn"
              onClick={() => setActiveTab('cargo')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'cargo'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>{isJa ? '貨物・荷物設定' : 'Cargo Items'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'cargo' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-blue-600'
              }`}>
                {cargoList.reduce((s, c) => s + c.quantity, 0)}
              </span>
            </button>

            <button
              id="tab-container-btn"
              onClick={() => setActiveTab('container')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'container'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>{isJa ? 'コンテナ・車両選択' : 'Container'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                activeTab === 'container' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-amber-600'
              }`}>
                {selectedContainer.name.split(' ')[0]}
              </span>
            </button>

            <button
              id="tab-analytics-btn"
              onClick={() => setActiveTab('analytics')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'analytics'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>{isJa ? '重心・積載解析' : 'Analytics & CoG'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                activeTab === 'analytics' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-emerald-600'
              }`}>
                {packingResult.metrics.volumeUtilization.toFixed(0)}%
              </span>
            </button>

            <button
              id="tab-manifest-btn"
              onClick={() => setActiveTab('manifest')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'manifest'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              <span>{isJa ? '積載指示マニフェスト' : 'Loading Manifest'}</span>
            </button>
          </div>

          {/* Quick Summary Pill on Right */}
          <div className="hidden lg:flex items-center gap-3 text-xs bg-white border border-slate-200 px-3.5 py-1.5 rounded-lg text-slate-600 shadow-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {isJa ? '積載容積:' : 'Volume:'} <strong className="text-slate-900 font-mono">{packingResult.metrics.packedVolumeCbm.toFixed(1)} m³</strong> ({packingResult.metrics.volumeUtilization.toFixed(1)}%)
            </span>
            <span className="text-slate-300">|</span>
            <span>
              {isJa ? '積載重量:' : 'Weight:'} <strong className="text-emerald-600 font-mono">{packingResult.metrics.packedWeightKg.toLocaleString()} kg</strong> ({packingResult.metrics.weightUtilization.toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* Tab Views Content */}
        {activeTab === '3d' && (
          <div className="space-y-4 animate-fade-in">
            {/* Top 3D Interactive Viewport */}
            <div className="w-full h-[580px]">
              <ContainerViewer3D
                container={selectedContainer}
                packedItems={packingResult.packedItems}
                centerOfGravity={packingResult.metrics.centerOfGravity}
                unitSystem={unitSystem}
                language={language}
                onSelectItem={setSelectedItem}
                selectedItem={selectedItem}
              />
            </div>

            {/* Bottom Quick Analytics & CoG Snapshot */}
            <PackingAnalytics
              metrics={packingResult.metrics}
              container={selectedContainer}
              unplacedItems={packingResult.unplacedItems}
              language={language}
              unitSystem={unitSystem}
            />
          </div>
        )}

        {activeTab === 'cargo' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-fade-in">
            <div className="lg:col-span-8">
              <CargoManager
                cargoList={cargoList}
                onChangeCargoList={setCargoList}
                container={selectedContainer}
                unitSystem={unitSystem}
                language={language}
                onSelectContainer={(containerId) => {
                  const target = STANDARD_CONTAINERS.find(c => c.id === containerId);
                  if (target) setSelectedContainer(target);
                }}
              />
            </div>
            <div className="lg:col-span-4 h-full">
              <div className="h-full min-h-[460px]">
                <ContainerViewer3D
                  container={selectedContainer}
                  packedItems={packingResult.packedItems}
                  centerOfGravity={packingResult.metrics.centerOfGravity}
                  unitSystem={unitSystem}
                  language={language}
                  onSelectItem={setSelectedItem}
                  selectedItem={selectedItem}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'container' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-fade-in">
            <div className="lg:col-span-8">
              <ContainerSelector
                selectedContainer={selectedContainer}
                onSelectContainer={setSelectedContainer}
                language={language}
              />
            </div>
            <div className="lg:col-span-4 h-full">
              <div className="h-full min-h-[460px]">
                <ContainerViewer3D
                  container={selectedContainer}
                  packedItems={packingResult.packedItems}
                  centerOfGravity={packingResult.metrics.centerOfGravity}
                  unitSystem={unitSystem}
                  language={language}
                  onSelectItem={setSelectedItem}
                  selectedItem={selectedItem}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-4 animate-fade-in">
            <PackingAnalytics
              metrics={packingResult.metrics}
              container={selectedContainer}
              unplacedItems={packingResult.unplacedItems}
              language={language}
              unitSystem={unitSystem}
            />

            <div className="w-full h-[480px]">
              <ContainerViewer3D
                container={selectedContainer}
                packedItems={packingResult.packedItems}
                centerOfGravity={packingResult.metrics.centerOfGravity}
                unitSystem={unitSystem}
                language={language}
                onSelectItem={setSelectedItem}
                selectedItem={selectedItem}
              />
            </div>
          </div>
        )}

        {activeTab === 'manifest' && (
          <div className="space-y-4 animate-fade-in">
            <LoadingGuideTable
              packedItems={packingResult.packedItems}
              container={selectedContainer}
              language={language}
              unitSystem={unitSystem}
              onSelectItem={setSelectedItem}
              selectedItem={selectedItem}
            />
          </div>
        )}
      </main>

      {/* AI Consultant Modal */}
      <AiConsultantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        container={selectedContainer}
        cargoList={cargoList}
        metrics={packingResult.metrics}
        language={language}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3.5 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <span className="font-medium text-slate-600">
            PackMaster • 3D Container & Vehicle Load Planning System
          </span>
          <span className="text-slate-400">
            {isJa ? 'ISO 668 海上コンテナ & 物流トラック積載規格準拠' : 'ISO 668 Ocean Containers & Highway Fleet Compliant'}
          </span>
        </div>
      </footer>
    </div>
  );
}
