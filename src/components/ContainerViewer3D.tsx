import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Container, PackedItem, UnitSystem, Language, ContainerLoad, UnplacedItem, CargoItem } from '../types';
import { 
  Play, Pause, SkipBack, SkipForward, RotateCcw, 
  Layers, Camera, Maximize2, Minimize2, ShieldAlert, 
  Compass, Crosshair, SlidersHorizontal, Box, Grid3X3, X,
  GripVertical, Blend, Sparkles, Palette,
  Hand, Move, RotateCw, Trash2, Magnet, Check, AlertCircle, ArrowDownToLine, 
  RefreshCw, Undo2, Redo2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Scale, LayoutGrid, List, Search, Plus, PackagePlus, PackageMinus,
  HelpCircle, Keyboard
} from 'lucide-react';
import { formatDimensions, formatCoordinates, formatWeightCompact, formatMeters } from '../utils/units';
import { VIVID_NEON_PALETTE, boostHexToVivid } from '../utils/colors';
import { 
  calculateSupportHeight, calculateDropSupportHeight, checkContainerBounds, 
  isRestingOnFragile, check3DItemCollision, findMaxNonCollidingPosition, 
  findDeepestBackLeftPosition, applyMagneticEdgeSnap, MagneticSnapCandidate 
} from '../utils/manualAdjustment';
import { ManualShortcutsHelpModal } from './ManualShortcutsHelpModal';

interface ContainerViewer3DProps {
  container: Container;
  containers?: ContainerLoad[];
  activeContainerIndex?: number | 'all';
  onChangeActiveContainerIndex?: (index: number | 'all') => void;
  packedItems: PackedItem[];
  centerOfGravity: { x: number; y: number; z: number };
  unitSystem: UnitSystem;
  language: Language;
  onSelectItem?: (item: PackedItem | null) => void;
  selectedItem?: PackedItem | null;
  onApplyVividColors?: (paletteId?: any) => void;
  isCalculating?: boolean;
  unplacedItems?: UnplacedItem[];
  cargoList?: CargoItem[];
  onManualPlaceItem?: (unplacedItem: UnplacedItem, placement: { x: number; y: number; z: number; length: number; width: number; height: number; rotationIndex?: number; color?: string; containerIndex?: number }) => void;
  onManualMoveItem?: (itemId: string, newCoords: { x: number; y: number; z: number; rotationIndex?: number; length?: number; width?: number; height?: number }) => void;
  onManualRemoveItem?: (itemId: string) => void;
  onManualUnloadContainer?: (containerIndex?: number | 'all') => void;
  onResetToAlgorithm?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  hasManualAdjustments?: boolean;
  manualAdjustmentsCount?: number;
  isManualMode?: boolean;
  isManualModeActive?: boolean;
  onToggleManualMode?: (active: boolean) => void;
}

export const ContainerViewer3D: React.FC<ContainerViewer3DProps> = ({
  container,
  containers,
  activeContainerIndex = 1,
  onChangeActiveContainerIndex,
  packedItems,
  centerOfGravity,
  unitSystem,
  language,
  onSelectItem,
  selectedItem: externalSelectedItem,
  onApplyVividColors,
  isCalculating = false,
  unplacedItems = [],
  cargoList = [],
  onManualPlaceItem,
  onManualMoveItem,
  onManualRemoveItem,
  onManualUnloadContainer,
  onResetToAlgorithm,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  hasManualAdjustments = false,
  manualAdjustmentsCount = 0,
  isManualMode: isManualModeProp,
  isManualModeActive,
  onToggleManualMode
}) => {
  const isJa = language === 'ja';
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boxMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const cogGroupRef = useRef<THREE.Group | null>(null);
  const containersGroupRef = useRef<THREE.Group | null>(null);
  const ghostGroupRef = useRef<THREE.Group | null>(null);
  const snapGridGroupRef = useRef<THREE.Group | null>(null);
  const magneticGuideGroupRef = useRef<THREE.Group | null>(null);
  const lastNonZeroGridSnapMm = useRef<number>(50);
  const lastNonZeroMagSnapMm = useRef<number>(75);
  const draggedUnplacedRef = useRef<{ unplaced: UnplacedItem; rotation: 0 | 1; color: string } | null>(null);
  const lastCameraLayoutRef = useRef<{
    containerId: string;
    lenM: number;
    widM: number;
    heiM: number;
    isSideBySide: boolean;
    countToRender: number;
  } | null>(null);

  // Manual Adjustment State
  const [internalManualMode, setInternalManualMode] = useState<boolean>(false);
  const [isTrayCollapsed, setIsTrayCollapsed] = useState<boolean>(false);
  // Unplaced Cargo Tray Sorting & View Modes
  const [traySortOrder, setTraySortOrder] = useState<'weight-desc' | 'weight-asc' | 'name-asc' | 'count-desc'>('weight-desc');
  const [trayViewMode, setTrayViewMode] = useState<'scroll' | 'grid'>('scroll');
  const [traySearchQuery, setTraySearchQuery] = useState<string>('');
  const trayScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(true);
  const isManualMode = isManualModeProp !== undefined 
    ? isManualModeProp 
    : (isManualModeActive !== undefined ? isManualModeActive : internalManualMode);
  const setIsManualMode = useCallback((val: boolean) => {
    if (onToggleManualMode) {
      onToggleManualMode(val);
    } else {
      setInternalManualMode(val);
    }
  }, [onToggleManualMode]);

  const [heldUnplacedItem, setHeldUnplacedItem] = useState<{
    unplaced: UnplacedItem;
    rotation: 0 | 1;
    color: string;
  } | null>(null);
  const [gridSnapMm, setGridSnapMm] = useState<number>(50);
  const [magneticSnapMm, setMagneticSnapMm] = useState<number>(75);
  const [showUnplacedTray, setShowUnplacedTray] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDraggingExistingItem, setIsDraggingExistingItem] = useState<PackedItem | null>(null);
  const [ghostCoords, setGhostCoords] = useState<{
    x: number;
    y: number;
    z: number;
    length: number;
    width: number;
    height: number;
    isValid: boolean;
    invalidReason?: string;
    offsetZ?: number;
    containerIndex?: number;
    magneticSnap?: MagneticSnapCandidate;
  } | null>(null);

  const [confirmingUnload, setConfirmingUnload] = useState<boolean>(false);
  const confirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState<boolean>(false);
  const containerTabsScrollRef = useRef<HTMLDivElement | null>(null);

  // Key hold acceleration tracking for manual mode arrow navigation
  const [activeSpeedMultiplier, setActiveSpeedMultiplier] = useState<number>(1);
  const keyHoldTrackerRef = useRef<{
    key: string | null;
    startTime: number;
    count: number;
    resetTimeout: any;
  }>({ key: null, startTime: 0, count: 0, resetTimeout: null });
  const lastBlockToastTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  // Synchronize held unplaced item when unplacedItems changes or stock runs out
  useEffect(() => {
    if (!isManualMode) {
      if (heldUnplacedItem) {
        setHeldUnplacedItem(null);
        setGhostCoords(null);
      }
      return;
    }
    if (heldUnplacedItem) {
      const current = unplacedItems?.find(
        u => (u.cargoItemId && u.cargoItemId === heldUnplacedItem.unplaced.cargoItemId) ||
             (u.sku && u.sku === heldUnplacedItem.unplaced.sku)
      );
      if (!current || current.count <= 0) {
        setHeldUnplacedItem(null);
        setGhostCoords(null);
      } else if (current.count !== heldUnplacedItem.unplaced.count) {
        setHeldUnplacedItem(prev => prev ? { ...prev, unplaced: current } : null);
      }
    }
  }, [unplacedItems, isManualMode]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 3500);
  }, []);

  // Toggle between Grid Snap and Free-form placement
  const toggleGridSnap = useCallback(() => {
    setGridSnapMm(prev => {
      if (prev > 0) {
        lastNonZeroGridSnapMm.current = prev;
        showToast(isJa ? '自由配置 (Free-form) に切り替えました [S]' : 'Switched to Free-form placement [S]');
        return 0;
      } else {
        const restored = lastNonZeroGridSnapMm.current > 0 ? lastNonZeroGridSnapMm.current : 50;
        showToast(isJa 
          ? `グリッドスナップを有効にしました (${formatMeters(restored)}m) [S]` 
          : `Snap-to-Grid enabled (${formatMeters(restored)}m) [S]`);
        return restored;
      }
    });
  }, [isJa, showToast]);

  // Select incremental snap grid step
  const handleSelectGridSnap = useCallback((valMm: number) => {
    setGridSnapMm(valMm);
    if (valMm > 0) {
      lastNonZeroGridSnapMm.current = valMm;
      showToast(isJa 
        ? `スナップ刻み幅を ${formatMeters(valMm)}m に設定しました` 
        : `Snap grid interval set to ${formatMeters(valMm)}m`);
    } else {
      showToast(isJa ? '自由配置 (Free-form) に切り替えました' : 'Switched to Free-form placement');
    }
  }, [isJa, showToast]);

  // Toggle magnetic edge snap between enabled (e.g. 75mm) and off (0mm)
  const toggleMagneticSnap = useCallback(() => {
    setMagneticSnapMm(prev => {
      if (prev > 0) {
        lastNonZeroMagSnapMm.current = prev;
        showToast(isJa ? '🧲 マグネット吸着を解除しました (自由移動) [B]' : '🧲 Magnetic snap disabled (Free move) [B]');
        return 0;
      } else {
        const restored = lastNonZeroMagSnapMm.current > 0 ? lastNonZeroMagSnapMm.current : 75;
        showToast(isJa 
          ? `🧲 マグネット吸着を有効化しました (${restored}mm 以内の端面に吸着) [B]` 
          : `🧲 Magnetic snap enabled (${restored}mm threshold) [B]`);
        return restored;
      }
    });
  }, [isJa, showToast]);

  // Select magnetic edge snap attraction threshold distance
  const handleSelectMagneticSnap = useCallback((valMm: number) => {
    setMagneticSnapMm(valMm);
    if (valMm > 0) {
      lastNonZeroMagSnapMm.current = valMm;
      showToast(isJa 
        ? `🧲 マグネット吸着距離を ${valMm}mm (${valMm / 10}cm) に設定しました` 
        : `🧲 Magnetic snap threshold set to ${valMm}mm`);
    } else {
      showToast(isJa ? '🧲 マグネット吸着を無効化しました' : '🧲 Magnetic snap disabled');
    }
  }, [isJa, showToast]);

  // Resolve authentic item color from unplaced item, cargoList, or packedItems
  const getUnplacedItemColor = useCallback((item: UnplacedItem): string => {
    if (item.color) return item.color;
    const foundInCargo = cargoList.find(c => 
      (item.cargoItemId && c.id === item.cargoItemId) || 
      (item.sku && c.sku === item.sku) ||
      (item.name && c.name === item.name)
    );
    if (foundInCargo?.color) return foundInCargo.color;
    const foundInPacked = packedItems.find(p => 
      (item.cargoItemId && p.cargoItemId === item.cargoItemId) || 
      (item.sku && p.sku === item.sku) ||
      (item.name && p.name === item.name)
    );
    if (foundInPacked?.color) return foundInPacked.color;
    return '#3b82f6';
  }, [cargoList, packedItems]);

  // Unplaced cargo items filtered and sorted (Weight descending by default for heavy-cargo-first placement)
  const sortedUnplacedItems = useMemo(() => {
    if (!unplacedItems || unplacedItems.length === 0) return [];
    let items = [...unplacedItems];
    if (traySearchQuery.trim()) {
      const q = traySearchQuery.toLowerCase().trim();
      items = items.filter(it => 
        (it.name && it.name.toLowerCase().includes(q)) || 
        (it.sku && it.sku.toLowerCase().includes(q))
      );
    }
    switch (traySortOrder) {
      case 'weight-desc':
        return items.sort((a, b) => b.weight - a.weight);
      case 'weight-asc':
        return items.sort((a, b) => a.weight - b.weight);
      case 'count-desc':
        return items.sort((a, b) => (b.count || 1) - (a.count || 1));
      case 'name-asc':
        return items.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return items;
    }
  }, [unplacedItems, traySortOrder, traySearchQuery]);

  const checkTrayScrollBounds = useCallback(() => {
    const el = trayScrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  const handleScrollTray = useCallback((direction: 'left' | 'right') => {
    const el = trayScrollContainerRef.current;
    if (!el) return;
    const scrollAmount = Math.max(280, Math.floor(el.clientWidth * 0.75));
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
    setTimeout(checkTrayScrollBounds, 350);
  }, [checkTrayScrollBounds]);

  const handleTrayWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (trayViewMode === 'scroll' && trayScrollContainerRef.current) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        trayScrollContainerRef.current.scrollLeft += e.deltaY;
        checkTrayScrollBounds();
      }
    }
  }, [trayViewMode, checkTrayScrollBounds]);

  useEffect(() => {
    checkTrayScrollBounds();
  }, [sortedUnplacedItems, trayViewMode, checkTrayScrollBounds]);

  // Interaction & Display States
  const [internalActiveTab, setInternalActiveTab] = useState<number | 'all'>(activeContainerIndex);
  const [sceneReady, setSceneReady] = useState<number>(0);
  const [webglError, setWebglError] = useState<string | null>(null);
  const currentTab = onChangeActiveContainerIndex ? activeContainerIndex : internalActiveTab;
  const setTab = (tab: number | 'all') => {
    if (onChangeActiveContainerIndex) {
      onChangeActiveContainerIndex(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };

  // Active items based on selected tab
  const activeItemsToDisplay = useMemo(() => {
    if (containers && containers.length > 0) {
      if (currentTab === 'all') {
        return containers.flatMap(c => c.packedItems);
      }
      const target = containers.find(c => c.containerIndex === currentTab) 
        || containers[(typeof currentTab === 'number' && currentTab >= 1 ? currentTab - 1 : 0)] 
        || containers[0];
      return target.packedItems;
    }
    return packedItems;
  }, [containers, currentTab, packedItems]);

  const [currentStep, setCurrentStep] = useState<number>(activeItemsToDisplay.length);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showCoG, setShowCoG] = useState<boolean>(false); // Default to false (off) per user request
  const [showWireframeOnly, setShowWireframeOnly] = useState<boolean>(false);
  const [isTranslucent, setIsTranslucent] = useState<boolean>(false); // Default to false (100% opaque) per user request: "貨物透明度の初期値は１００％不透明にして"
  const [cargoOpacity, setCargoOpacity] = useState<number>(100); // 100% opaque default
  const [colorMode, setColorMode] = useState<'cargo' | 'vivid' | 'weight' | 'sequence'>('cargo');
  const [isVividBoost, setIsVividBoost] = useState<boolean>(true); // High vibrancy and emissive boost
  const [activeCameraView, setActiveCameraView] = useState<'iso' | 'top' | 'side' | 'door'>('iso');
  const [showSliceControls, setShowSliceControls] = useState<boolean>(false);
  const [zSlicePercent, setZSlicePercent] = useState<number>(100);
  const [xSlicePercent, setXSlicePercent] = useState<number>(100);
  const [hoveredItem, setHoveredItem] = useState<PackedItem | null>(null);
  const [internalSelectedItem, setInternalSelectedItem] = useState<PackedItem | null>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  // Keep internalSelectedItem in sync with packedItems updates (e.g. after undo/redo/manual move)
  useEffect(() => {
    if (internalSelectedItem) {
      const found = packedItems.find(p => p.id === internalSelectedItem.id);
      if (found) {
        if (
          found.x !== internalSelectedItem.x ||
          found.y !== internalSelectedItem.y ||
          found.z !== internalSelectedItem.z ||
          found.rotationIndex !== internalSelectedItem.rotationIndex ||
          found.width !== internalSelectedItem.width ||
          found.length !== internalSelectedItem.length ||
          found.height !== internalSelectedItem.height
        ) {
          setInternalSelectedItem(found);
        }
      } else {
        setInternalSelectedItem(null);
      }
    }
  }, [packedItems, internalSelectedItem]);

  // Drag-and-drop state for floating Controls panel
  const viewerWrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Drag-and-drop state for floating Selected Box Inspector Card
  const inspectorCardRef = useRef<HTMLDivElement>(null);
  const [inspectorPos, setInspectorPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingInspector, setIsDraggingInspector] = useState<boolean>(false);
  const inspectorDragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle Controls Panel Drag Start
  const handlePanelDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    // Avoid dragging when clicking inside interactive elements like buttons, inputs, selects
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) {
      return;
    }

    if (!panelRef.current || !viewerWrapperRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const panelRect = panelRef.current.getBoundingClientRect();
    const wrapperRect = viewerWrapperRef.current.getBoundingClientRect();

    dragStartOffset.current = {
      x: clientX - panelRect.left,
      y: clientY - panelRect.top,
    };

    if (!panelPos) {
      setPanelPos({
        x: panelRect.left - wrapperRect.left,
        y: panelRect.top - wrapperRect.top,
      });
    }

    setIsDragging(true);
  };

  // Handle Inspector Card Drag Start
  const handleInspectorDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    // Avoid dragging when clicking inside interactive elements like buttons, inputs, selects
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) {
      return;
    }

    if (!inspectorCardRef.current || !viewerWrapperRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const cardRect = inspectorCardRef.current.getBoundingClientRect();
    const wrapperRect = viewerWrapperRef.current.getBoundingClientRect();

    inspectorDragStartOffset.current = {
      x: clientX - cardRect.left,
      y: clientY - cardRect.top,
    };

    if (!inspectorPos) {
      setInspectorPos({
        x: cardRect.left - wrapperRect.left,
        y: cardRect.top - wrapperRect.top,
      });
    }

    setIsDraggingInspector(true);
  };

  // Window-level mouse/touch move & up listeners for inspector card dragging
  useEffect(() => {
    if (!isDraggingInspector) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!viewerWrapperRef.current || !inspectorCardRef.current) return;

      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      const wrapperRect = viewerWrapperRef.current.getBoundingClientRect();
      const cardWidth = inspectorCardRef.current.offsetWidth || 300;
      const cardHeight = inspectorCardRef.current.offsetHeight || 380;

      let newX = clientX - wrapperRect.left - inspectorDragStartOffset.current.x;
      let newY = clientY - wrapperRect.top - inspectorDragStartOffset.current.y;

      // Bound clamping inside viewer with 8px margin
      const minX = 8;
      const maxX = Math.max(minX, wrapperRect.width - cardWidth - 8);
      const minY = 8;
      const maxY = Math.max(minY, wrapperRect.height - cardHeight - 8);

      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));

      setInspectorPos({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      setIsDraggingInspector(false);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
    };
  }, [isDraggingInspector]);

  // Window-level mouse/touch move & up listeners for smooth non-blocking dragging
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!viewerWrapperRef.current || !panelRef.current) return;

      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      const wrapperRect = viewerWrapperRef.current.getBoundingClientRect();
      const panelWidth = panelRef.current.offsetWidth || 288;
      const panelHeight = panelRef.current.offsetHeight || 420;

      let newX = clientX - wrapperRect.left - dragStartOffset.current.x;
      let newY = clientY - wrapperRect.top - dragStartOffset.current.y;

      // Bound clamping inside viewer with 8px margin
      const minX = 8;
      const maxX = Math.max(minX, wrapperRect.width - panelWidth - 8);
      const minY = 8;
      const maxY = Math.max(minY, wrapperRect.height - panelHeight - 8);

      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));

      setPanelPos({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
    };
  }, [isDragging]);

  // Toggle Full Screen handler supporting both native Fullscreen API and CSS-based fullscreen fallback
  const toggleFullScreen = useCallback(async () => {
    const wrapper = viewerWrapperRef.current;
    if (!wrapper) return;

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (err) {
        console.warn('Exit fullscreen failed:', err);
      }
      setIsFullScreen(false);
    } else {
      try {
        if (wrapper.requestFullscreen) {
          await wrapper.requestFullscreen();
          setIsFullScreen(true);
        } else {
          setIsFullScreen(prev => !prev);
        }
      } catch (err) {
        // In environments/iframes where requestFullscreen is blocked or unsupported, fallback to full-viewport CSS
        console.info('Native requestFullscreen failed or blocked by sandbox, using CSS fullscreen:', err);
        setIsFullScreen(prev => !prev);
      }
    }
  }, []);

  // Listen to native fullscreen changes and ESC key
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(Boolean(document.fullscreenElement));
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen && !document.fullscreenElement) {
        setIsFullScreen(false);
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 100);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreen]);

  // Trigger resize observer event when isFullScreen toggles so Three.js camera & canvas immediately adapt
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 150);
    return () => clearTimeout(timer);
  }, [isFullScreen]);

  const rawSelectedItem = externalSelectedItem || internalSelectedItem;
  const activeSelectedItem = useMemo(() => {
    if (!rawSelectedItem) return null;
    const found = packedItems.find(p => p.id === rawSelectedItem.id);
    return found || rawSelectedItem;
  }, [rawSelectedItem, packedItems]);

  const activeSelectedItemRef = useRef<PackedItem | null>(activeSelectedItem);
  activeSelectedItemRef.current = activeSelectedItem;

  const heldUnplacedItemRef = useRef(heldUnplacedItem);
  heldUnplacedItemRef.current = heldUnplacedItem;

  const isDraggingExistingItemRef = useRef(isDraggingExistingItem);
  isDraggingExistingItemRef.current = isDraggingExistingItem;

  const isManualModeRef = useRef(isManualMode);
  isManualModeRef.current = isManualMode;

  const showShortcutsHelpRef = useRef(showShortcutsHelp);
  showShortcutsHelpRef.current = showShortcutsHelp;

  // Cancel active placement or reposition mode with top priority
  const cancelPlacementMode = useCallback((): boolean => {
    const wasRepositioning = isDraggingExistingItemRef.current;
    const wasHoldingUnplaced = heldUnplacedItemRef.current || draggedUnplacedRef.current;

    if (wasRepositioning) {
      const targetItem = wasRepositioning;
      setIsDraggingExistingItem(null);
      isDraggingExistingItemRef.current = null;
      setGhostCoords(null);
      // Re-select original item so user retains control
      setInternalSelectedItem(targetItem);
      activeSelectedItemRef.current = targetItem;
      if (onSelectItem) onSelectItem(targetItem);
      showToast(isJa 
        ? `「${targetItem.name}」の再配置をキャンセルしました (Esc / C)`
        : `Cancelled repositioning "${targetItem.name}" (Esc / C)`);
      return true;
    }

    if (wasHoldingUnplaced) {
      const unplacedItem = heldUnplacedItemRef.current?.unplaced || draggedUnplacedRef.current?.unplaced;
      const targetName = unplacedItem?.name || (isJa ? '荷物' : 'item');
      setHeldUnplacedItem(null);
      heldUnplacedItemRef.current = null;
      draggedUnplacedRef.current = null;
      setGhostCoords(null);
      showToast(isJa 
        ? `「${targetName}」の配置モードをキャンセルしました (Esc / C)`
        : `Cancelled placement mode for "${targetName}" (Esc / C)`);
      return true;
    }

    return false;
  }, [isJa, onSelectItem, showToast]);

  // Drop selected cargo to nearest underlying support (floor or top of underlying box)
  const handleDropItemToSupport = useCallback((targetItem?: PackedItem | null) => {
    const raw = targetItem || activeSelectedItemRef.current || activeSelectedItem;
    if (!raw || !onManualMoveItem) return;
    const item = packedItems.find(p => p.id === raw.id) || raw;

    // Find container items
    const activeContLoad = (containers && containers.length > 0)
      ? (containers.find(c => c.containerIndex === (item.containerIndex ?? (typeof currentTab === 'number' ? currentTab : 1))) || containers[0])
      : null;
    const contItems = activeContLoad ? activeContLoad.packedItems : packedItems;

    // Calculate landing Z strictly beneath the item under gravity
    const targetZ = calculateDropSupportHeight(item, contItems, container.height);

    if (Math.abs(item.z - targetZ) <= 1) {
      showToast(isJa 
        ? `「${item.name}」は既に最下部（Z: ${formatMeters(item.z)}m）に接地しています` 
        : `"${item.name}" is already resting at Z: ${formatMeters(item.z)}m`);
      return;
    }

    const updated = {
      ...item,
      z: targetZ
    };
    activeSelectedItemRef.current = updated;

    onManualMoveItem(item.id, {
      x: item.x,
      y: item.y,
      z: targetZ,
      length: item.length,
      width: item.width,
      height: item.height,
      rotationIndex: item.rotationIndex
    });

    if (onSelectItem) {
      onSelectItem(updated);
    }

    showToast(isJa 
      ? `「${item.name}」を着地させました (Z: ${formatMeters(item.z)}m → ${formatMeters(targetZ)}m)` 
      : `Dropped "${item.name}" to Z: ${formatMeters(targetZ)}m`);
  }, [activeSelectedItem, onManualMoveItem, containers, currentTab, packedItems, container.height, isJa, showToast, onSelectItem]);

  // Move selected cargo to the deepest back-left available position in the container (Q key shortcut)
  const handleMoveToDeepestBackLeft = useCallback((targetItem?: PackedItem | null) => {
    const raw = targetItem || activeSelectedItemRef.current || activeSelectedItem;
    if (!raw || !onManualMoveItem) return;
    const item = packedItems.find(p => p.id === raw.id) || raw;

    const targetContNum = item.containerIndex ?? (typeof currentTab === 'number' ? currentTab : 1);
    const activeContLoad = (containers && containers.length > 0)
      ? (containers.find(c => c.containerIndex === targetContNum) || containers[0])
      : null;
    const contItems = activeContLoad ? activeContLoad.packedItems : packedItems;
    const targetCont = activeContLoad?.container || container;

    const bestPos = findDeepestBackLeftPosition(item, contItems, targetCont, gridSnapMm);

    if (!bestPos) {
      showToast(isJa
        ? `「${item.name}」を配置できる奥左側の空きスペースが見つかりませんでした`
        : `No valid back-left placement position found for "${item.name}"`);
      return;
    }

    if (bestPos.x === item.x && bestPos.y === item.y && bestPos.z === item.z) {
      showToast(isJa
        ? `「${item.name}」は既に一番奥左の置ける場所に配置されています (X: 0.00m / Y: ${formatMeters(item.y)}m)`
        : `"${item.name}" is already at the furthest back-left valid position`);
      return;
    }

    const updated = {
      ...item,
      x: bestPos.x,
      y: bestPos.y,
      z: bestPos.z
    };
    activeSelectedItemRef.current = updated;

    onManualMoveItem(item.id, {
      x: bestPos.x,
      y: bestPos.y,
      z: bestPos.z,
      length: item.length,
      width: item.width,
      height: item.height,
      rotationIndex: item.rotationIndex
    });

    if (onSelectItem) {
      onSelectItem(updated);
    }

    showToast(isJa
      ? `「${item.name}」を一番奥左の置ける位置へ移動しました (奥: ${formatMeters(bestPos.x)}m, 左: ${formatMeters(bestPos.y)}m, 高さ: ${formatMeters(bestPos.z)}m)`
      : `Moved "${item.name}" to furthest back-left position (X:${formatMeters(bestPos.x)}m, Y:${formatMeters(bestPos.y)}m, Z:${formatMeters(bestPos.z)}m)`);
  }, [activeSelectedItem, onManualMoveItem, containers, currentTab, packedItems, container, gridSnapMm, isJa, showToast, onSelectItem]);

  // Safely nudge an item along an axis without penetrating walls or other packed items
  const handleNudgeItem = useCallback((
    targetItem: PackedItem,
    delta: { dx?: number; dy?: number; dz?: number }
  ) => {
    if (!onManualMoveItem) return;

    const dx = delta.dx || 0;
    const dy = delta.dy || 0;
    const dz = delta.dz || 0;

    const targetContNum = targetItem.containerIndex ?? (typeof currentTab === 'number' ? currentTab : 1);
    const activeContLoad = (containers && containers.length > 0)
      ? (containers.find(c => c.containerIndex === targetContNum) || containers[0])
      : null;
    const contItems = activeContLoad ? activeContLoad.packedItems : packedItems;

    const nonColliding = findMaxNonCollidingPosition(
      {
        x: targetItem.x,
        y: targetItem.y,
        z: targetItem.z,
        length: targetItem.length,
        width: targetItem.width,
        height: targetItem.height
      },
      {
        x: targetItem.x + dx,
        y: targetItem.y + dy,
        z: targetItem.z + dz
      },
      contItems,
      container,
      targetItem.id
    );

    if (nonColliding.x !== targetItem.x || nonColliding.y !== targetItem.y || nonColliding.z !== targetItem.z) {
      const updated = {
        ...targetItem,
        x: nonColliding.x,
        y: nonColliding.y,
        z: nonColliding.z
      };
      activeSelectedItemRef.current = updated;
      onManualMoveItem(targetItem.id, {
        x: nonColliding.x,
        y: nonColliding.y,
        z: nonColliding.z
      });
      if (onSelectItem) {
        onSelectItem(updated);
      }
      const now = Date.now();
      const canToast = now - lastBlockToastTimeRef.current > 1200;

      if (nonColliding.blocked && nonColliding.collidingItem) {
        if (canToast) {
          lastBlockToastTimeRef.current = now;
          showToast(isJa
            ? `「${nonColliding.collidingItem.name}」と接触するためこれ以上移動できません`
            : `Blocked by "${nonColliding.collidingItem.name}"`);
        }
      }
    } else if (nonColliding.blocked && nonColliding.collidingItem) {
      const now = Date.now();
      if (now - lastBlockToastTimeRef.current > 1200) {
        lastBlockToastTimeRef.current = now;
        showToast(isJa
          ? `「${nonColliding.collidingItem.name}」と接触するため移動できません`
          : `Movement blocked by "${nonColliding.collidingItem.name}"`);
      }
    } else if (nonColliding.blocked) {
      const now = Date.now();
      if (now - lastBlockToastTimeRef.current > 1200) {
        lastBlockToastTimeRef.current = now;
        showToast(isJa
          ? `コンテナの端に到達したためこれ以上移動できません`
          : `Reached container boundary`);
      }
    }
  }, [onManualMoveItem, containers, currentTab, packedItems, container, onSelectItem, isJa, showToast]);

  // Unload all cargo items in the active container (or all containers) to unplaced tray
  const handleUnloadContainerAll = useCallback(() => {
    if (!onManualUnloadContainer) return;

    const targetContIdx = currentTab === 'all' ? 'all' : (typeof currentTab === 'number' ? currentTab : 1);
    const itemsInTarget = packedItems.filter(p => {
      if (targetContIdx === 'all') return true;
      return (p.containerIndex || 1) === targetContIdx;
    });

    if (itemsInTarget.length === 0) {
      showToast(isJa ? '現在コンテナ内に配置されている貨物はありません' : 'No cargo currently loaded in container');
      return;
    }

    if (!confirmingUnload) {
      setConfirmingUnload(true);
      showToast(isJa 
        ? `【確認】もう一度「一括アンロード」を押すと、${targetContIdx === 'all' ? '全コンテナ' : `コンテナ #${targetContIdx}`}内の全${itemsInTarget.length}個の貨物をアンロードします` 
        : `Click "Unload All" again to unload ${itemsInTarget.length} items from ${targetContIdx === 'all' ? 'all containers' : `Container #${targetContIdx}`}`);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => {
        setConfirmingUnload(false);
      }, 4000);
      return;
    }

    // User confirmed
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setConfirmingUnload(false);

    onManualUnloadContainer(targetContIdx);
    setInternalSelectedItem(null);
    activeSelectedItemRef.current = null;
    if (onSelectItem) onSelectItem(null);
    setHeldUnplacedItem(null);
    setIsDraggingExistingItem(null);
    setGhostCoords(null);
    setIsTrayCollapsed(false); // Automatically open cargo tray for manual packing

    showToast(isJa 
      ? `コンテナ内の全${itemsInTarget.length}個の貨物を一括アンロードしました。トレイから自由に積載できます (Ctrl+Zで復元可能)` 
      : `Unloaded all ${itemsInTarget.length} items to tray. Ready for manual placement (Ctrl+Z to undo)`);
  }, [onManualUnloadContainer, currentTab, packedItems, confirmingUnload, isJa, showToast, onSelectItem]);

  // Max weight for weight color mapping
  const maxItemWeight = useMemo(() => {
    return Math.max(1, ...activeItemsToDisplay.map(p => p.weight));
  }, [activeItemsToDisplay]);

  // Single container volume utilization for quick badge display
  const singleContainerUtilization = useMemo(() => {
    if (containers && containers.length > 0) {
      return containers[0].metrics?.volumeUtilization || 0;
    }
    const contVol = container.length * container.width * container.height;
    if (contVol <= 0) return 0;
    const packedVol = packedItems.reduce((acc, item) => acc + (item.length * item.width * item.height), 0);
    return Math.min(100, (packedVol / contVol) * 100);
  }, [containers, container, packedItems]);

  // Current active container load for utilization and detail display
  const currentActiveContainerLoad = useMemo(() => {
    if (!containers || containers.length === 0) return null;
    if (typeof currentTab === 'number') {
      return containers.find(c => c.containerIndex === currentTab) 
        || containers[Math.max(0, currentTab - 1)] 
        || containers[0];
    }
    return containers[0];
  }, [containers, currentTab]);

  const currentActiveUtilization = useMemo(() => {
    if (currentActiveContainerLoad?.metrics?.volumeUtilization !== undefined) {
      return currentActiveContainerLoad.metrics.volumeUtilization;
    }
    return singleContainerUtilization || 0;
  }, [currentActiveContainerLoad, singleContainerUtilization]);

  const handlePrevContainer = () => {
    if (!containers || containers.length <= 1) return;
    if (currentTab === 'all') {
      setTab(containers.length);
    } else {
      const cur = typeof currentTab === 'number' ? currentTab : 1;
      const prev = cur > 1 ? cur - 1 : containers.length;
      setTab(prev);
    }
  };

  const handleNextContainer = () => {
    if (!containers || containers.length <= 1) return;
    if (currentTab === 'all') {
      setTab(1);
    } else {
      const cur = typeof currentTab === 'number' ? currentTab : 1;
      const next = cur < containers.length ? cur + 1 : 1;
      setTab(next);
    }
  };

  // Sync currentStep when items change
  useEffect(() => {
    setCurrentStep(activeItemsToDisplay.length);
    setIsPlaying(false);
  }, [activeItemsToDisplay]);

  // Playback timer
  useEffect(() => {
    let interval: any = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= activeItemsToDisplay.length) {
            setIsPlaying(false);
            return activeItemsToDisplay.length;
          }
          return prev + 1;
        });
      }, 400 / playbackSpeed);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, playbackSpeed, activeItemsToDisplay.length]);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const width = Math.max(containerRef.current.clientWidth || 600, 300);
      const height = Math.max(containerRef.current.clientHeight || 560, 300);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf8fafc); // Slate 50 neutral background
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      rendererRef.current = renderer;

      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controlsRef.current = controls;

      // Lighting setup
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambientLight);

      const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
      dirLight1.position.set(15, 25, 20);
      dirLight1.castShadow = true;
      dirLight1.shadow.mapSize.width = 2048;
      dirLight1.shadow.mapSize.height = 2048;
      scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.45);
      dirLight2.position.set(-15, 15, -15);
      scene.add(dirLight2);

      // Initial Camera Position
      const contLengthM = container.length / 1000;
      const contHeightM = container.height / 1000;
      const contWidthM = container.width / 1000;

      camera.position.set(contLengthM * 1.5, contHeightM * 1.8, contWidthM * 2.2);
      controls.target.set(contLengthM / 2, contHeightM / 2, contWidthM / 2);
      controls.update();

      // Lock vertical rotation (polar angle) so rotation is purely horizontal (yaw only)
      const initialPolar = controls.getPolarAngle();
      controls.minPolarAngle = initialPolar;
      controls.maxPolarAngle = initialPolar;
      controls.update();

      // Signal scene is ready for mesh population
      setSceneReady(prev => prev + 1);

      // Render loop
      let animationFrameId: number;
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Resize observer
      const handleResize = () => {
        if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
        const newW = containerRef.current.clientWidth;
        const newH = containerRef.current.clientHeight || 560;
        if (newW > 0 && newH > 0) {
          cameraRef.current.aspect = newW / newH;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(newW, newH);
        }
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);

      return () => {
        cancelAnimationFrame(animationFrameId);
        resizeObserver.disconnect();
        if (rendererRef.current) {
          rendererRef.current.dispose();
          rendererRef.current = null;
        }
        sceneRef.current = null;
        cameraRef.current = null;
        controlsRef.current = null;
        containersGroupRef.current = null;
        lastCameraLayoutRef.current = null;
        boxMeshesRef.current.clear();
        cogGroupRef.current = null;
        ghostGroupRef.current = null;
        snapGridGroupRef.current = null;
      };
    } catch (err: any) {
      console.error('Three.js / WebGL initialization error:', err);
      setWebglError(err?.message || 'WebGL not supported or failed to initialize');
    }
  }, []);

  // Update Container Geometry & Visual Walls (Supports single or multi side-by-side)
  // Always ensures container meshes exist in the active scene, while only re-centering camera when container layout changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const lenM = container.length / 1000;
    const widM = container.width / 1000;
    const heiM = container.height / 1000;

    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const countToRender = isSideBySide ? containers.length : 1;
    const spacingM = widM + 1.2;

    // Clean up previous container meshes in scene
    if (containersGroupRef.current) {
      scene.remove(containersGroupRef.current);
      containersGroupRef.current = null;
    }

    const allContainersGroup = new THREE.Group();
    containersGroupRef.current = allContainersGroup;

    for (let cIdx = 0; cIdx < countToRender; cIdx++) {
      const zOffsetM = isSideBySide ? cIdx * spacingM : 0;
      const singleGroup = new THREE.Group();

      // Floor Plane
      const floorGeo = new THREE.PlaneGeometry(lenM, widM);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.DoubleSide
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = Math.PI / 2;
      floorMesh.position.set(lenM / 2, 0, widM / 2 + zOffsetM);
      floorMesh.receiveShadow = true;
      singleGroup.add(floorMesh);

      // Floor Grid lines
      const gridHelper = new THREE.GridHelper(Math.max(lenM, widM) * 1.5, 30, 0x94a3b8, 0xcbd5e1);
      gridHelper.position.set(lenM / 2, -0.005, widM / 2 + zOffsetM);
      singleGroup.add(gridHelper);

      // Bounding Box Outline (Wireframe container)
      const boxGeo = new THREE.BoxGeometry(lenM, heiM, widM);
      const edges = new THREE.EdgesGeometry(boxGeo);
      const lineMat = new THREE.LineBasicMaterial({ 
        color: isSideBySide ? (cIdx === 0 ? 0x2563eb : 0x7c3aed) : 0x2563eb, 
        linewidth: 2 
      });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      wireframe.position.set(lenM / 2, heiM / 2, widM / 2 + zOffsetM);
      singleGroup.add(wireframe);

      // Semi-transparent side walls and roof
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.04,
        roughness: 0.1,
        metalness: 0.1,
        side: THREE.BackSide
      });
      const wallMesh = new THREE.Mesh(boxGeo, wallMat);
      wallMesh.position.set(lenM / 2, heiM / 2, widM / 2 + zOffsetM);
      singleGroup.add(wallMesh);

      // Cargo Door Indicator at the front (X = Length)
      const doorFrameGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(lenM, 0, zOffsetM),
        new THREE.Vector3(lenM, heiM, zOffsetM),
        new THREE.Vector3(lenM, heiM, widM + zOffsetM),
        new THREE.Vector3(lenM, 0, widM + zOffsetM),
        new THREE.Vector3(lenM, 0, zOffsetM)
      ]);
      const doorMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 3 });
      const doorLines = new THREE.Line(doorFrameGeo, doorMat);
      singleGroup.add(doorLines);

      // Origin Axes Marker
      const originAxes = new THREE.AxesHelper(Math.min(lenM, widM, heiM) * 0.35);
      originAxes.position.set(0, 0.01, zOffsetM);
      singleGroup.add(originAxes);

      allContainersGroup.add(singleGroup);
    }

    scene.add(allContainersGroup);

    // Re-center camera controls target ONLY when layout actually changed (mount or side-by-side mode switch)
    // Never re-center or disrupt camera angle during cargo deletions or manual item adjustments!
    const lastLayout = lastCameraLayoutRef.current;
    const layoutChanged = !lastLayout ||
      lastLayout.containerId !== container.id ||
      lastLayout.lenM !== lenM ||
      lastLayout.widM !== widM ||
      lastLayout.heiM !== heiM ||
      lastLayout.isSideBySide !== Boolean(isSideBySide) ||
      lastLayout.countToRender !== countToRender;

    if (layoutChanged && controlsRef.current && cameraRef.current) {
      controlsRef.current.minPolarAngle = 0;
      controlsRef.current.maxPolarAngle = Math.PI;
      if (isSideBySide) {
        const totalZ = (countToRender - 1) * spacingM + widM;
        controlsRef.current.target.set(lenM / 2, heiM / 2, totalZ / 2);
        cameraRef.current.position.set(lenM * 1.6, heiM * 2.2 + totalZ * 0.4, totalZ * 1.3);
      } else {
        controlsRef.current.target.set(lenM / 2, heiM / 2, widM / 2);
      }
      controlsRef.current.update();
      const currentPolar = controlsRef.current.getPolarAngle();
      controlsRef.current.minPolarAngle = currentPolar;
      controlsRef.current.maxPolarAngle = currentPolar;
      controlsRef.current.update();
    }

    lastCameraLayoutRef.current = {
      containerId: container.id,
      lenM,
      widM,
      heiM,
      isSideBySide: Boolean(isSideBySide),
      countToRender
    };
  }, [container.id, container.length, container.width, container.height, currentTab, (containers ? containers.length : 1), sceneReady]);

  // Update Cargo Box Meshes in Three.js Scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old box meshes
    boxMeshesRef.current.forEach(mesh => {
      scene.remove(mesh);
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    });
    boxMeshesRef.current.clear();

    const maxZLimit = (container.height * zSlicePercent) / 100;
    const maxXLimit = (container.length * xSlicePercent) / 100;
    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const spacingM = (container.width / 1000) + 1.2;

    activeItemsToDisplay.slice(0, currentStep).forEach((item) => {
      // Slicing filters
      if (item.z > maxZLimit || item.x > maxXLimit) {
        return;
      }

      const lenM = item.length / 1000;
      const widM = item.width / 1000;
      const heiM = item.height / 1000;
      const xM = item.x / 1000;
      const yM = item.y / 1000;
      const zM = item.z / 1000;

      // In side-by-side mode, offset each item by its container index along Z-axis
      const itemContIdx = typeof item.containerIndex === 'number' ? item.containerIndex : 1;
      const containerOffsetZ = isSideBySide ? Math.max(0, itemContIdx - 1) * spacingM : 0;

      const isSelected = activeSelectedItem?.id === item.id;
      const isHovered = hoveredItem?.id === item.id;

      // Color mapping with high-saturation vivid mode support
      let boxColor = new THREE.Color(item.color || '#3b82f6');
      if (colorMode === 'vivid') {
        const vividHex = VIVID_NEON_PALETTE[Math.abs(item.sequenceNumber - 1) % VIVID_NEON_PALETTE.length];
        boxColor = new THREE.Color(vividHex);
      } else if (colorMode === 'weight') {
        const weightRatio = item.weight / maxItemWeight;
        boxColor = new THREE.Color().setHSL(0.33 * (1 - weightRatio), 0.95, 0.5);
      } else if (colorMode === 'sequence') {
        const seqRatio = item.sequenceNumber / Math.max(1, activeItemsToDisplay.length);
        boxColor = new THREE.Color().setHSL(seqRatio * 0.85, 0.95, 0.52);
      } else if (isVividBoost && item.color) {
        // Boost saturation and brightness of base color
        boxColor = new THREE.Color(boostHexToVivid(item.color));
      }

      if (isSelected) {
        boxColor = new THREE.Color(0xfacc15); // Vibrant Yellow for selection
      } else if (isHovered) {
        boxColor = boxColor.clone().offsetHSL(0, 0, 0.18);
      }

      const isSemiTransparent = isTranslucent && cargoOpacity < 100;
      let effectiveOpacity = 1.0;
      if (isSemiTransparent) {
        if (isSelected) {
          effectiveOpacity = 0.95;
        } else if (isHovered) {
          effectiveOpacity = Math.min(1.0, (cargoOpacity / 100) + 0.25);
        } else {
          effectiveOpacity = cargoOpacity / 100;
        }
      } else {
        effectiveOpacity = (isHovered || isSelected) ? 0.92 : 1.0;
      }

      const boxGeo = new THREE.BoxGeometry(lenM, heiM, widM);
      const boxMat = new THREE.MeshStandardMaterial({
        color: boxColor,
        roughness: 0.28,
        metalness: 0.05,
        wireframe: showWireframeOnly,
        transparent: isSemiTransparent || isHovered || isSelected,
        opacity: effectiveOpacity,
        depthWrite: !isSemiTransparent,
        emissive: boxColor.clone().multiplyScalar(isVividBoost ? 0.15 : 0.08),
      });

      const mesh = new THREE.Mesh(boxGeo, boxMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Position: Center of the box in Three.js coordinates
      // X = Length, Y = Height in 3D, Z = Width in 3D
      mesh.position.set(
        xM + lenM / 2,
        zM + heiM / 2,
        yM + widM / 2 + containerOffsetZ
      );
      mesh.userData = { packedItem: item };

      // Edges outline
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      const edgeLineMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0x000000 : (item.isManual ? 0xf59e0b : 0x0f172a),
        linewidth: isSelected ? 3 : (item.isManual ? 2 : 1),
        transparent: isSemiTransparent,
        opacity: isSemiTransparent ? 0.85 : 1.0
      });
      const edgeLines = new THREE.LineSegments(edgesGeo, edgeLineMat);
      mesh.add(edgeLines);

      scene.add(mesh);
      boxMeshesRef.current.set(item.id, mesh);
    });
  }, [
    activeItemsToDisplay, currentStep, colorMode, isVividBoost, showWireframeOnly, 
    isTranslucent, cargoOpacity,
    zSlicePercent, xSlicePercent, hoveredItem, activeSelectedItem, 
    maxItemWeight, container, currentTab, containers, sceneReady
  ]);

  // Center of Gravity 3D Marker
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (cogGroupRef.current) {
      scene.remove(cogGroupRef.current);
    }

    if (!showCoG || activeItemsToDisplay.length === 0) return;

    const allCogGroup = new THREE.Group();
    cogGroupRef.current = allCogGroup;

    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const spacingM = (container.width / 1000) + 1.2;

    if (isSideBySide) {
      // Render CoG for each individual container
      containers.forEach((cLoad, cIdx) => {
        if (cLoad.packedItems.length === 0) return;
        const cCog = cLoad.metrics.centerOfGravity;
        const cogXM = cCog.x / 1000;
        const cogYM = cCog.y / 1000 + cIdx * spacingM;
        const cogZM = cCog.z / 1000;

        const sphereGeo = new THREE.SphereGeometry(0.12, 24, 24);
        const sphereMat = new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xef4444,
          emissiveIntensity: 0.6,
          roughness: 0.2
        });
        const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
        sphereMesh.position.set(cogXM, cogZM, cogYM);
        allCogGroup.add(sphereMesh);

        const targetGeo = new THREE.RingGeometry(0.15, 0.25, 32);
        const targetMat = new THREE.MeshBasicMaterial({
          color: 0xef4444,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8
        });
        const targetMesh = new THREE.Mesh(targetGeo, targetMat);
        targetMesh.rotation.x = Math.PI / 2;
        targetMesh.position.set(cogXM, 0.02, cogYM);
        allCogGroup.add(targetMesh);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(cogXM, 0.02, cogYM),
          new THREE.Vector3(cogXM, cogZM, cogYM)
        ]);
        const lineMat = new THREE.LineDashedMaterial({
          color: 0xef4444,
          dashSize: 0.05,
          gapSize: 0.03
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        allCogGroup.add(line);
      });
    } else {
      // Single container CoG
      const activeContLoad = (typeof currentTab === 'number' && containers)
        ? (containers.find(c => c.containerIndex === currentTab) || containers[Math.max(0, currentTab - 1)])
        : undefined;
      const currentCoG = activeContLoad
        ? activeContLoad.metrics.centerOfGravity
        : centerOfGravity;

      const cogXM = currentCoG.x / 1000;
      const cogYM = currentCoG.y / 1000;
      const cogZM = currentCoG.z / 1000;

      const sphereGeo = new THREE.SphereGeometry(0.12, 24, 24);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xef4444,
        emissiveIntensity: 0.6,
        roughness: 0.2
      });
      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.position.set(cogXM, cogZM, cogYM);
      allCogGroup.add(sphereMesh);

      const targetGeo = new THREE.RingGeometry(0.15, 0.25, 32);
      const targetMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      const targetMesh = new THREE.Mesh(targetGeo, targetMat);
      targetMesh.rotation.x = Math.PI / 2;
      targetMesh.position.set(cogXM, 0.02, cogYM);
      allCogGroup.add(targetMesh);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cogXM, 0.02, cogYM),
        new THREE.Vector3(cogXM, cogZM, cogYM)
      ]);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xef4444,
        dashSize: 0.05,
        gapSize: 0.03
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      allCogGroup.add(line);
    }

    scene.add(allCogGroup);
  }, [centerOfGravity, showCoG, activeItemsToDisplay.length, currentTab, containers, container, sceneReady]);

  // Update Ghost Box in 3D Scene & Magnetic snap lines
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!isManualMode || !ghostCoords) {
      if (ghostGroupRef.current) {
        ghostGroupRef.current.visible = false;
      }
      if (magneticGuideGroupRef.current) {
        magneticGuideGroupRef.current.visible = false;
      }
      return;
    }

    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const targetCont0 = typeof currentTab === 'number' ? Math.max(0, currentTab - 1) : 0;
    const spacingM = (container.width / 1000) + 1.2;
    const targetOffsetZ = isSideBySide ? targetCont0 * spacingM : 0;
    const activeOffsetZ = ghostCoords.offsetZ !== undefined ? ghostCoords.offsetZ : targetOffsetZ;

    let group = ghostGroupRef.current;
    if (!group) {
      group = new THREE.Group();
      group.name = 'manual-ghost-group';
      scene.add(group);
      ghostGroupRef.current = group;
    }

    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      if ((obj as any).geometry) (obj as any).geometry.dispose();
      if ((obj as any).material) {
        if (Array.isArray((obj as any).material)) (obj as any).material.forEach((m: any) => m.dispose());
        else (obj as any).material.dispose();
      }
    }

    // Render Magnetic Edge Snap Contact Guide Lines in world space
    let magGroup = magneticGuideGroupRef.current;
    if (!magGroup) {
      magGroup = new THREE.Group();
      magGroup.name = 'magnetic-guide-group';
      scene.add(magGroup);
      magneticGuideGroupRef.current = magGroup;
    }

    while (magGroup.children.length > 0) {
      const obj = magGroup.children[0];
      magGroup.remove(obj);
      if ((obj as any).geometry) (obj as any).geometry.dispose();
      if ((obj as any).material) {
        if (Array.isArray((obj as any).material)) (obj as any).material.forEach((m: any) => m.dispose());
        else (obj as any).material.dispose();
      }
    }

    const isSnapped = !!(ghostCoords.magneticSnap && (ghostCoords.magneticSnap.isSnappedX || ghostCoords.magneticSnap.isSnappedY));

    if (ghostCoords.magneticSnap?.guideLines && ghostCoords.magneticSnap.guideLines.length > 0) {
      for (const gLine of ghostCoords.magneticSnap.guideLines) {
        // gLine start/end: [x, z, y] in meters in container local coordinates
        const p1 = new THREE.Vector3(gLine.start[0], gLine.start[1] + 0.006, gLine.start[2] + activeOffsetZ);
        const p2 = new THREE.Vector3(gLine.end[0], gLine.end[1] + 0.006, gLine.end[2] + activeOffsetZ);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x06b6d4, // Vivid Cyan for Magnetic Snap contact edge
          linewidth: 4,
          transparent: true,
          opacity: 0.95
        });
        const snapLine = new THREE.Line(lineGeo, lineMat);
        magGroup.add(snapLine);

        // Glowing contact endpoints
        const markerGeo = new THREE.SphereGeometry(0.016, 8, 8);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
        const m1 = new THREE.Mesh(markerGeo, markerMat);
        m1.position.copy(p1);
        const m2 = new THREE.Mesh(markerGeo, markerMat);
        m2.position.copy(p2);
        magGroup.add(m1);
        magGroup.add(m2);
      }
      magGroup.visible = true;
    } else {
      magGroup.visible = false;
    }

    const lenM = ghostCoords.length / 1000;
    const heiM = ghostCoords.height / 1000;
    const widM = ghostCoords.width / 1000;

    const boxGeo = new THREE.BoxGeometry(lenM, heiM, widM);
    const colorHex = !ghostCoords.isValid ? 0xef4444 : (isSnapped ? 0x06b6d4 : 0x10b981);
    const boxMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      transparent: true,
      opacity: isSnapped ? 0.72 : 0.65,
      roughness: 0.2,
      metalness: 0.1,
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: isSnapped ? 0.6 : 0.45
    });

    const mesh = new THREE.Mesh(boxGeo, boxMat);
    group.add(mesh);

    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const edgeLineMat = new THREE.LineBasicMaterial({
      color: !ghostCoords.isValid ? 0xb91c1c : (isSnapped ? 0x22d3ee : 0x047857),
      linewidth: 3
    });
    const edgeLines = new THREE.LineSegments(edgesGeo, edgeLineMat);
    group.add(edgeLines);

    // Floor footprint projection outline at container floor showing alignment
    const footprintOffsetDown = (ghostCoords.z / 1000);
    const footprintGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-lenM / 2, -heiM / 2 - footprintOffsetDown + 0.003, -widM / 2),
      new THREE.Vector3(lenM / 2, -heiM / 2 - footprintOffsetDown + 0.003, -widM / 2),
      new THREE.Vector3(lenM / 2, -heiM / 2 - footprintOffsetDown + 0.003, widM / 2),
      new THREE.Vector3(-lenM / 2, -heiM / 2 - footprintOffsetDown + 0.003, widM / 2),
      new THREE.Vector3(-lenM / 2, -heiM / 2 - footprintOffsetDown + 0.003, -widM / 2),
    ]);
    const footprintMat = new THREE.LineBasicMaterial({
      color: !ghostCoords.isValid ? 0xdc2626 : (isSnapped ? 0x0891b2 : 0x059669),
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });
    const footprintLine = new THREE.Line(footprintGeo, footprintMat);
    group.add(footprintLine);

    // If grid snap is enabled, show an alignment crosshair at footprint center
    if (gridSnapMm > 0) {
      const crossPoints: THREE.Vector3[] = [
        new THREE.Vector3(-lenM * 0.25, -heiM / 2 - footprintOffsetDown + 0.004, 0),
        new THREE.Vector3(lenM * 0.25, -heiM / 2 - footprintOffsetDown + 0.004, 0),
        new THREE.Vector3(0, -heiM / 2 - footprintOffsetDown + 0.004, -widM * 0.25),
        new THREE.Vector3(0, -heiM / 2 - footprintOffsetDown + 0.004, widM * 0.25),
      ];
      const crossGeo = new THREE.BufferGeometry().setFromPoints(crossPoints);
      const crossMat = new THREE.LineBasicMaterial({
        color: isSnapped ? 0x06b6d4 : 0x0284c7, // Cyan or Sky blue crosshair
        linewidth: 2,
        transparent: true,
        opacity: 0.9
      });
      const crossLines = new THREE.LineSegments(crossGeo, crossMat);
      group.add(crossLines);
    }

    group.position.set(
      (ghostCoords.x + ghostCoords.length / 2) / 1000,
      (ghostCoords.z + ghostCoords.height / 2) / 1000,
      (ghostCoords.y + ghostCoords.width / 2) / 1000 + activeOffsetZ
    );
    group.visible = true;
  }, [isManualMode, ghostCoords, currentTab, containers, container, gridSnapMm, magneticSnapMm]);

  // Update Visual Snap Grid in 3D scene when snap is enabled
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!snapGridGroupRef.current) {
      const g = new THREE.Group();
      g.name = 'snap-grid-group';
      scene.add(g);
      snapGridGroupRef.current = g;
    }

    const group = snapGridGroupRef.current;

    // Clear existing grid lines
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) {
        if (Array.isArray((child as any).material)) (child as any).material.forEach((m: any) => m.dispose());
        else (child as any).material.dispose();
      }
    }

    // Only display 3D visual snap grid when in manual mode and snap > 0
    if (!isManualMode || gridSnapMm <= 0) {
      group.visible = false;
      return;
    }

    group.visible = true;

    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const contCount = isSideBySide ? containers.length : 1;
    const lenM = container.length / 1000;
    const widM = container.width / 1000;
    const spacingM = widM + 1.2;
    const stepM = Math.max(0.01, gridSnapMm / 1000);

    for (let c = 0; c < contCount; c++) {
      const zOffsetM = isSideBySide ? c * spacingM : 0;
      const points: THREE.Vector3[] = [];

      // Avoid excessive lines for 1cm step on very long containers
      const effectiveStep = (gridSnapMm < 20 && (lenM / stepM > 600)) ? 0.05 : stepM;

      for (let x = 0; x <= lenM + 0.001; x += effectiveStep) {
        points.push(new THREE.Vector3(x, 0.002, zOffsetM));
        points.push(new THREE.Vector3(x, 0.002, widM + zOffsetM));
      }
      for (let z = 0; z <= widM + 0.001; z += effectiveStep) {
        points.push(new THREE.Vector3(0, 0.002, z + zOffsetM));
        points.push(new THREE.Vector3(lenM, 0.002, z + zOffsetM));
      }

      if (points.length > 0) {
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
          color: 0x0284c7, // Sky-600 metric snap grid
          transparent: true,
          opacity: 0.35,
          depthWrite: false
        });
        const lines = new THREE.LineSegments(geo, mat);
        group.add(lines);
      }
    }
  }, [isManualMode, gridSnapMm, container, containers, currentTab]);

  // Clean up ghost mesh and snap grid on unmount
  useEffect(() => {
    return () => {
      const scene = sceneRef.current;
      if (scene) {
        if (ghostGroupRef.current) {
          scene.remove(ghostGroupRef.current);
          ghostGroupRef.current = null;
        }
        if (snapGridGroupRef.current) {
          scene.remove(snapGridGroupRef.current);
          snapGridGroupRef.current = null;
        }
        if (magneticGuideGroupRef.current) {
          scene.remove(magneticGuideGroupRef.current);
          magneticGuideGroupRef.current = null;
        }
      }
    };
  }, []);

  // Raycasting for Mouse Hover, Click & Drag Placement
  useEffect(() => {
    const containerEl = containerRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!containerEl || !camera || !scene) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const calculatePlacementAtMouse = (
      clientX: number,
      clientY: number,
      itemDim: { length: number; width: number; height: number; rotation: number },
      overrideSnapMm?: number,
      overrideMagSnapMm?: number
    ) => {
      const rect = containerEl.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPoint = new THREE.Vector3();
      const hasHit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
      if (!hasHit) return null;

      // Also raycast existing boxes to find if hovering over a box top
      const candidateMeshes = Array.from(boxMeshesRef.current.values()).filter(m => {
        if (isDraggingExistingItem && m.userData?.packedItem?.id === isDraggingExistingItem.id) return false;
        return true;
      });
      const boxHits = raycaster.intersectObjects(candidateMeshes, false);
      if (boxHits.length > 0) {
        hitPoint.x = boxHits[0].point.x;
        hitPoint.z = boxHits[0].point.z;
      }

      const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
      const widM = container.width / 1000;
      const spacingM = widM + 1.2;

      let targetContNum = typeof currentTab === 'number' ? currentTab : 1;
      let targetOffsetZ = 0;

      if (isSideBySide && containers && containers.length > 1) {
        // Calculate which container hitPoint.z is nearest to
        const approxIdx = Math.floor((hitPoint.z + 0.6) / spacingM);
        const clampedIdx = Math.max(0, Math.min(containers.length - 1, approxIdx));
        targetOffsetZ = clampedIdx * spacingM;
        targetContNum = containers[clampedIdx].containerIndex ?? (clampedIdx + 1);
      } else if (typeof currentTab === 'number') {
        targetContNum = currentTab;
        targetOffsetZ = 0;
      }

      const isRot = itemDim.rotation === 1;
      const length = isRot ? itemDim.width : itemDim.length;
      const width = isRot ? itemDim.length : itemDim.width;
      const height = itemDim.height;

      let rawX = (hitPoint.x * 1000) - length / 2;
      let rawY = ((hitPoint.z - targetOffsetZ) * 1000) - width / 2;

      const activeSnapMm = overrideSnapMm !== undefined ? overrideSnapMm : gridSnapMm;

      if (activeSnapMm > 0) {
        rawX = Math.round(rawX / activeSnapMm) * activeSnapMm;
        rawY = Math.round(rawY / activeSnapMm) * activeSnapMm;
      } else {
        rawX = Math.round(rawX);
        rawY = Math.round(rawY);
      }

      rawX = Math.max(0, Math.min(container.length - length, rawX));
      rawY = Math.max(0, Math.min(container.width - width, rawY));

      const activeContLoad = (containers && containers.length > 0)
        ? (containers.find(c => c.containerIndex === targetContNum) || containers[0])
        : null;
      const contItems = activeContLoad ? activeContLoad.packedItems : packedItems;
      const ignoreId = isDraggingExistingItem ? isDraggingExistingItem.id : undefined;
      const targetCont = activeContLoad?.container || container;

      // Magnetic snap calculation (snaps flush to adjacent cargo edges, container walls, alignments)
      let finalX = rawX;
      let finalY = rawY;
      let finalZ = calculateSupportHeight(rawX, rawY, length, width, contItems, ignoreId);
      let magResult: MagneticSnapCandidate | undefined;

      const activeMagMm = overrideMagSnapMm !== undefined ? overrideMagSnapMm : magneticSnapMm;

      if (activeMagMm > 0) {
        magResult = applyMagneticEdgeSnap(
          rawX,
          rawY,
          length,
          width,
          height,
          contItems,
          targetCont,
          {
            thresholdMm: activeMagMm,
            ignoreItemId: ignoreId,
            snapToAdjacentCargo: true,
            snapToWalls: true,
            snapToAlignments: true
          }
        );

        if (magResult.isSnappedX || magResult.isSnappedY) {
          finalX = magResult.x;
          finalY = magResult.y;
          finalZ = magResult.z;
        }
      }

      const bounds = checkContainerBounds(finalX, finalY, finalZ, length, width, height, targetCont);
      const restingOnFragile = isRestingOnFragile(finalX, finalY, finalZ, length, width, contItems, ignoreId);
      const collisionCheck = check3DItemCollision(finalX, finalY, finalZ, length, width, height, contItems, ignoreId);

      // Check container payload capacity if maxWeight is defined
      const itemWeight = heldUnplacedItem?.unplaced.weight ?? isDraggingExistingItem?.weight ?? 0;
      const currentContWeight = contItems.reduce((s, i) => (ignoreId && i.id === ignoreId ? s : s + i.weight), 0);
      const exceedsWeight = targetCont.maxWeight > 0 && (currentContWeight + itemWeight) > targetCont.maxWeight;

      let invalidReason: string | undefined;
      if (!bounds.isValid) {
        if (bounds.exceedsHeight) {
          invalidReason = language === 'ja' ? 'コンテナの天井高さを超過しています' : 'Exceeds container ceiling height';
        } else {
          invalidReason = language === 'ja' ? 'コンテナの境界寸法を超過しています' : 'Exceeds container boundary dimensions';
        }
      } else if (collisionCheck.hasCollision) {
        invalidReason = language === 'ja' 
          ? `「${collisionCheck.collidingItem?.name || '他の貨物'}」と干渉するため配置できません` 
          : `Collides with "${collisionCheck.collidingItem?.name || 'existing cargo'}"`;
      } else if (restingOnFragile) {
        invalidReason = language === 'ja' ? '割れ物（Fragile）指定の荷物の上には積載できません' : 'Cannot stack on top of fragile cargo';
      } else if (exceedsWeight) {
        invalidReason = language === 'ja' ? 'コンテナの最大積載重量を超過します' : 'Exceeds container max weight limit';
      }

      const isValid = bounds.isValid && !restingOnFragile && !exceedsWeight && !collisionCheck.hasCollision;

      return {
        x: finalX,
        y: finalY,
        z: finalZ,
        length,
        width,
        height,
        isValid,
        invalidReason,
        offsetZ: targetOffsetZ,
        containerIndex: targetContNum,
        magneticSnap: magResult
      };
    };

    const handleMouseMove = (event: MouseEvent) => {
      const activeHeld = heldUnplacedItem || (draggedUnplacedRef.current ? {
        unplaced: draggedUnplacedRef.current.unplaced,
        rotation: draggedUnplacedRef.current.rotation,
        color: draggedUnplacedRef.current.color
      } : null);

      if (isManualMode && (activeHeld || isDraggingExistingItem)) {
        const itemDim = activeHeld ? {
          length: activeHeld.unplaced.dimensions.length,
          width: activeHeld.unplaced.dimensions.width,
          height: activeHeld.unplaced.dimensions.height,
          rotation: activeHeld.rotation
        } : {
          length: isDraggingExistingItem!.length,
          width: isDraggingExistingItem!.width,
          height: isDraggingExistingItem!.height,
          rotation: 0
        };

        const effectiveSnapMm = event.altKey 
          ? (gridSnapMm > 0 ? 0 : (lastNonZeroGridSnapMm.current || 50)) 
          : gridSnapMm;
        const effectiveMagSnapMm = event.altKey ? 0 : magneticSnapMm;
        const result = calculatePlacementAtMouse(event.clientX, event.clientY, itemDim, effectiveSnapMm, effectiveMagSnapMm);
        if (result) {
          setGhostCoords(result);
          containerEl.style.cursor = 'crosshair';
        }
        return;
      }

      // Normal raycast for hover
      const rect = containerEl.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes: THREE.Object3D[] = Array.from(boxMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const targetMesh = intersects[0].object as THREE.Mesh;
        const item = targetMesh.userData.packedItem as PackedItem;
        setHoveredItem(item);
        containerEl.style.cursor = isManualMode ? 'grab' : 'pointer';
      } else {
        setHoveredItem(null);
        containerEl.style.cursor = 'default';
      }
    };

    let mouseDownPos = { x: 0, y: 0 };
    const handleMouseDown = (event: MouseEvent) => {
      mouseDownPos = { x: event.clientX, y: event.clientY };
    };

    const handleClick = (event: MouseEvent) => {
      // Ignore click if user was dragging/orbiting the camera (moved > 5px)
      const dx = Math.abs(event.clientX - mouseDownPos.x);
      const dy = Math.abs(event.clientY - mouseDownPos.y);
      if (dx > 5 || dy > 5) return;

      // 1. Repositioning existing item in manual mode
      if (isManualMode && isDraggingExistingItem && onManualMoveItem) {
        const itemDim = {
          length: isDraggingExistingItem.length,
          width: isDraggingExistingItem.width,
          height: isDraggingExistingItem.height,
          rotation: 0
        };
        const effectiveSnapMm = event.altKey 
          ? (gridSnapMm > 0 ? 0 : (lastNonZeroGridSnapMm.current || 50)) 
          : gridSnapMm;
        const effectiveMagSnapMm = event.altKey ? 0 : magneticSnapMm;
        const place = calculatePlacementAtMouse(event.clientX, event.clientY, itemDim, effectiveSnapMm, effectiveMagSnapMm);
        if (place) {
          if (!place.isValid) {
            showToast(place.invalidReason || (language === 'ja' ? 'コンテナの制限を超過しているため配置できません' : 'Cannot move item: exceeds container constraints'));
            return;
          }
          onManualMoveItem(isDraggingExistingItem.id, {
            x: place.x,
            y: place.y,
            z: place.z,
            length: place.length,
            width: place.width,
            height: place.height,
            rotationIndex: isDraggingExistingItem.rotationIndex
          });

          const snapDesc = place.magneticSnap && (place.magneticSnap.isSnappedX || place.magneticSnap.isSnappedY)
            ? (place.magneticSnap.snappedItem
                ? (language === 'ja' ? ` (🧲「${place.magneticSnap.snappedItem.name}」の端面に吸着)` : ` (🧲 Snapped to "${place.magneticSnap.snappedItem.name}")`)
                : (language === 'ja' ? ' (🧲 端面吸着)' : ' (🧲 Edge snapped)'))
            : '';

          showToast(language === 'ja'
            ? `「${isDraggingExistingItem.name}」の位置を変更しました (X:${formatMeters(place.x)}m Y:${formatMeters(place.y)}m Z:${formatMeters(place.z)}m)${snapDesc}`
            : `Moved "${isDraggingExistingItem.name}" to (X:${formatMeters(place.x)}m, Y:${formatMeters(place.y)}m, Z:${formatMeters(place.z)}m)${snapDesc}`);
          setIsDraggingExistingItem(null);
          setGhostCoords(null);
          return;
        }
      }

      // 2. If holding an unplaced item in manual mode, click places it
      if (isManualMode && heldUnplacedItem && onManualPlaceItem) {
        const itemDim = {
          length: heldUnplacedItem.unplaced.dimensions.length,
          width: heldUnplacedItem.unplaced.dimensions.width,
          height: heldUnplacedItem.unplaced.dimensions.height,
          rotation: heldUnplacedItem.rotation
        };
        const effectiveSnapMm = event.altKey 
          ? (gridSnapMm > 0 ? 0 : (lastNonZeroGridSnapMm.current || 50)) 
          : gridSnapMm;
        const effectiveMagSnapMm = event.altKey ? 0 : magneticSnapMm;
        const place = calculatePlacementAtMouse(event.clientX, event.clientY, itemDim, effectiveSnapMm, effectiveMagSnapMm);
        if (place) {
          if (!place.isValid) {
            showToast(place.invalidReason || (language === 'ja' ? 'コンテナの制限を超過しているため配置できません' : 'Cannot place item: exceeds container limits'));
            return;
          }

          const targetContNum = place.containerIndex ?? (typeof currentTab === 'number' ? currentTab : 1);
          onManualPlaceItem(heldUnplacedItem.unplaced, {
            x: place.x,
            y: place.y,
            z: place.z,
            length: place.length,
            width: place.width,
            height: place.height,
            rotationIndex: heldUnplacedItem.rotation,
            color: heldUnplacedItem.color,
            containerIndex: targetContNum
          });

          const snapDesc = place.magneticSnap && (place.magneticSnap.isSnappedX || place.magneticSnap.isSnappedY)
            ? (place.magneticSnap.snappedItem
                ? (language === 'ja' ? ` (🧲「${place.magneticSnap.snappedItem.name}」の端面に吸着)` : ` (🧲 Snapped to "${place.magneticSnap.snappedItem.name}")`)
                : (language === 'ja' ? ' (🧲 端面吸着)' : ' (🧲 Edge snapped)'))
            : '';

          showToast(language === 'ja' 
            ? `「${heldUnplacedItem.unplaced.name}」を手動配置しました (コンテナ#${targetContNum} X:${formatMeters(place.x)}m Y:${formatMeters(place.y)}m Z:${formatMeters(place.z)}m)${snapDesc}`
            : `Manually placed "${heldUnplacedItem.unplaced.name}" (Cont #${targetContNum} X:${formatMeters(place.x)}m, Y:${formatMeters(place.y)}m, Z:${formatMeters(place.z)}m)${snapDesc}`);
          
          if (heldUnplacedItem.unplaced.count <= 1) {
            setHeldUnplacedItem(null);
            setGhostCoords(null);
          } else {
            setHeldUnplacedItem(prev => prev ? {
              ...prev,
              unplaced: {
                ...prev.unplaced,
                count: prev.unplaced.count - 1
              }
            } : null);
          }
          return;
        }
      }

      // Normal selection click: Raycast cargo boxes
      const rect = containerEl.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes: THREE.Object3D[] = Array.from(boxMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const targetMesh = intersects[0].object as THREE.Mesh;
        const item = targetMesh.userData.packedItem as PackedItem;
        const currentlySelected = externalSelectedItem || internalSelectedItem;
        // Toggle selection: clicking the already selected item closes the tooltip
        if (currentlySelected?.id === item.id) {
          setInternalSelectedItem(null);
          activeSelectedItemRef.current = null;
          if (onSelectItem) onSelectItem(null);
        } else {
          setInternalSelectedItem(item);
          activeSelectedItemRef.current = item;
          if (onSelectItem) onSelectItem(item);
        }
      } else {
        // Clicking empty space closes the tooltip
        setInternalSelectedItem(null);
        activeSelectedItemRef.current = null;
        if (onSelectItem) onSelectItem(null);
      }
    };

    // HTML5 Drag & Drop event handlers on 3D Container
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      if (isManualMode && draggedUnplacedRef.current) {
        const itemDim = {
          length: draggedUnplacedRef.current.unplaced.dimensions.length,
          width: draggedUnplacedRef.current.unplaced.dimensions.width,
          height: draggedUnplacedRef.current.unplaced.dimensions.height,
          rotation: draggedUnplacedRef.current.rotation
        };
        const effectiveSnapMm = e.altKey 
          ? (gridSnapMm > 0 ? 0 : (lastNonZeroGridSnapMm.current || 50)) 
          : gridSnapMm;
        const effectiveMagSnapMm = e.altKey ? 0 : magneticSnapMm;
        const result = calculatePlacementAtMouse(e.clientX, e.clientY, itemDim, effectiveSnapMm, effectiveMagSnapMm);
        if (result) {
          setGhostCoords(result);
          containerEl.style.cursor = 'copy';
        }
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      if (isManualMode && draggedUnplacedRef.current && onManualPlaceItem) {
        const dragged = draggedUnplacedRef.current;
        const itemDim = {
          length: dragged.unplaced.dimensions.length,
          width: dragged.unplaced.dimensions.width,
          height: dragged.unplaced.dimensions.height,
          rotation: dragged.rotation
        };
        const effectiveSnapMm = e.altKey 
          ? (gridSnapMm > 0 ? 0 : (lastNonZeroGridSnapMm.current || 50)) 
          : gridSnapMm;
        const effectiveMagSnapMm = e.altKey ? 0 : magneticSnapMm;
        const place = calculatePlacementAtMouse(e.clientX, e.clientY, itemDim, effectiveSnapMm, effectiveMagSnapMm);
        if (place) {
          if (!place.isValid) {
            showToast(place.invalidReason || (language === 'ja' ? 'コンテナの制限を超過しているため配置できません' : 'Cannot drop item: exceeds container limits'));
            setGhostCoords(null);
            draggedUnplacedRef.current = null;
            return;
          }

          const targetContNum = place.containerIndex ?? (typeof currentTab === 'number' ? currentTab : 1);
          onManualPlaceItem(dragged.unplaced, {
            x: place.x,
            y: place.y,
            z: place.z,
            length: place.length,
            width: place.width,
            height: place.height,
            rotationIndex: dragged.rotation,
            color: dragged.color,
            containerIndex: targetContNum
          });

          const snapDesc = place.magneticSnap && (place.magneticSnap.isSnappedX || place.magneticSnap.isSnappedY)
            ? (place.magneticSnap.snappedItem
                ? (language === 'ja' ? ` (🧲「${place.magneticSnap.snappedItem.name}」の端面に吸着)` : ` (🧲 Snapped to "${place.magneticSnap.snappedItem.name}")`)
                : (language === 'ja' ? ' (🧲 端面吸着)' : ' (🧲 Edge snapped)'))
            : '';

          showToast(language === 'ja' 
            ? `「${dragged.unplaced.name}」をドロップ配置しました (コンテナ#${targetContNum} X:${formatMeters(place.x)}m Y:${formatMeters(place.y)}m Z:${formatMeters(place.z)}m)${snapDesc}`
            : `Dropped "${dragged.unplaced.name}" (Cont #${targetContNum} X:${formatMeters(place.x)}m, Y:${formatMeters(place.y)}m, Z:${formatMeters(place.z)}m)${snapDesc}`);
        }
        setGhostCoords(null);
        draggedUnplacedRef.current = null;
      }
    };

    // Keyboard shortcuts for Manual Mode & Tooltip closing
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: Ignore shortcuts if the user is typing into an input field, textarea or select
      const targetEl = e.target as HTMLElement | null;
      const tagName = (targetEl?.tagName || '').toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || targetEl?.isContentEditable) {
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z (without Shift)
      if (isManualMode && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        if (canUndo && onUndo) {
          onUndo();
          setHeldUnplacedItem(null);
          setIsDraggingExistingItem(null);
          setGhostCoords(null);
          showToast(language === 'ja' ? '操作を元に戻しました (Ctrl+Z)' : 'Undid adjustment (Ctrl+Z)');
        }
        return;
      }

      // Redo: Ctrl+Y, or Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        isManualMode && (
          ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
          ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && e.shiftKey)
        )
      ) {
        e.preventDefault();
        if (canRedo && onRedo) {
          onRedo();
          setHeldUnplacedItem(null);
          setIsDraggingExistingItem(null);
          setGhostCoords(null);
          showToast(language === 'ja' ? '操作をやり直しました (Ctrl+Y)' : 'Redid adjustment (Ctrl+Y)');
        }
        return;
      }

      // Escape or Cancel (C) key handling - HIGHEST PRIORITY
      const isEscape = e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape';
      const isCancelKey = (e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && !e.ctrlKey && !e.metaKey && !e.altKey;
      const isQuitKey = (e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ') && !e.ctrlKey && !e.metaKey && !e.altKey;

      if (isEscape || (isCancelKey && (heldUnplacedItemRef.current || isDraggingExistingItemRef.current || draggedUnplacedRef.current))) {
        e.preventDefault();
        e.stopPropagation();

        // 1. If shortcuts help modal is open and Escape was pressed, close it
        if (isEscape && showShortcutsHelpRef.current) {
          setShowShortcutsHelp(false);
          return;
        }

        // 2. HIGHEST PRIORITY: Cancel placement mode or reposition mode
        if (cancelPlacementMode()) {
          return;
        }

        // 3. Deselect current cargo item (only on Escape)
        if (isEscape) {
          const currentSelected = activeSelectedItemRef.current || internalSelectedItem || externalSelectedItem;
          if (currentSelected) {
            setInternalSelectedItem(null);
            activeSelectedItemRef.current = null;
            if (onSelectItem) onSelectItem(null);
            showToast(isJa ? '選択を解除しました' : 'Deselected item');
            return;
          }

          // 4. Exit full screen if in full screen
          if (isFullScreen && !document.fullscreenElement) {
            setIsFullScreen(false);
            return;
          }
        }
        return;
      }

      const rawTarget = externalSelectedItem || internalSelectedItem;
      const currentSelected = (activeSelectedItemRef.current && rawTarget && activeSelectedItemRef.current.id === rawTarget.id)
        ? activeSelectedItemRef.current
        : (rawTarget ? (packedItems.find(p => p.id === rawTarget.id) || rawTarget) : null);

      // S key: Toggle Grid Snap between incremental snapping and free-form placement
      if (isManualMode && (e.key === 's' || e.key === 'S' || e.code === 'KeyS') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleGridSnap();
        return;
      }

      // B key: Toggle Magnetic Snap between adjacent cargo edge snap and off
      if (isManualMode && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleMagneticSnap();
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        if (heldUnplacedItem) {
          setHeldUnplacedItem(prev => prev ? { ...prev, rotation: prev.rotation === 0 ? 1 : 0 } : null);
        } else if (isManualMode && currentSelected && onManualMoveItem) {
          e.preventDefault();
          const nextRot = (currentSelected.rotationIndex + 1) % 6;
          const updatedItem = {
            ...currentSelected,
            length: currentSelected.width,
            width: currentSelected.length,
            rotationIndex: nextRot
          };
          activeSelectedItemRef.current = updatedItem;
          onManualMoveItem(currentSelected.id, {
            x: currentSelected.x,
            y: currentSelected.y,
            z: currentSelected.z,
            length: currentSelected.width,
            width: currentSelected.length,
            height: currentSelected.height,
            rotationIndex: nextRot
          });
          if (onSelectItem) onSelectItem(updatedItem);
          showToast(language === 'ja' ? `「${currentSelected.name}」を90°回転しました` : `Rotated "${currentSelected.name}" 90°`);
        }
      } else if (e.key === ' ' || e.key === 'd' || e.key === 'D') {
        // Space or 'D': Gravity Drop selected item to nearest support/floor
        if (isManualMode) {
          e.preventDefault();
          if (heldUnplacedItem) {
            // If holding an unplaced item, Space rotates it 90 degrees
            setHeldUnplacedItem(prev => prev ? { ...prev, rotation: prev.rotation === 0 ? 1 : 0 } : null);
            showToast(isJa ? '配置向きを90°回転しました (Space / R)' : 'Rotated placement orientation 90° (Space / R)');
          } else if (currentSelected) {
            handleDropItemToSupport(currentSelected);
          } else {
            showToast(isJa 
              ? '着地させる荷物をクリックして選択してください' 
              : 'Please select a cargo item to drop');
          }
        }
      } else if (isQuitKey) {
        // Q key: Instantly snap selected cargo to deepest back-left available position
        if (isManualMode) {
          e.preventDefault();
          if (currentSelected) {
            handleMoveToDeepestBackLeft(currentSelected);
          } else {
            showToast(isJa
              ? '奥左へ移動させる荷物をクリックして選択してください (Qキー)'
              : 'Please select a cargo item to move back-left (Q key)');
          }
        }
      } else if (
        isManualMode && 
        currentSelected && 
        onManualMoveItem &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.key)
      ) {
        // Arrow Keys & PageUp/PageDown Nudge fine adjustment
        e.preventDefault();

        const now = Date.now();
        const tracker = keyHoldTrackerRef.current;
        if (tracker.key !== e.key) {
          tracker.key = e.key;
          tracker.startTime = now;
          tracker.count = 1;
        } else {
          tracker.count += 1;
        }

        if (tracker.resetTimeout) {
          clearTimeout(tracker.resetTimeout);
        }
        tracker.resetTimeout = setTimeout(() => {
          tracker.key = null;
          tracker.startTime = 0;
          tracker.count = 0;
          setActiveSpeedMultiplier(1);
        }, 300);

        const holdDuration = now - tracker.startTime;
        const count = tracker.count;

        // 加速度倍率の計算 (キーを押し続けると段階的に加速)
        let speedMultiplier = 1.0;
        if (e.repeat || count > 1 || holdDuration > 180) {
          if (holdDuration > 1600 || count >= 20) {
            speedMultiplier = 6.0;
          } else if (holdDuration > 1000 || count >= 12) {
            speedMultiplier = 4.0;
          } else if (holdDuration > 500 || count >= 6) {
            speedMultiplier = 2.5;
          } else {
            speedMultiplier = 1.5;
          }
        }

        // Shiftキーが併用されている場合はさらに高速ブースト
        if (e.shiftKey && !e.key.startsWith('Page')) {
          speedMultiplier = Math.min(8.0, speedMultiplier * 2.0);
        }

        setActiveSpeedMultiplier(speedMultiplier);

        const baseUnit = gridSnapMm > 0 ? gridSnapMm : 50;
        const effectiveStep = Math.max(10, Math.round(baseUnit * speedMultiplier));

        let dx = 0;
        let dy = 0;
        let dz = 0;

        if (e.key === 'PageUp' || (e.shiftKey && e.key === 'ArrowUp')) {
          dz = effectiveStep; // Elevation Up
        } else if (e.key === 'PageDown' || (e.shiftKey && e.key === 'ArrowDown')) {
          dz = -effectiveStep; // Elevation Down
        } else if (e.key === 'ArrowUp') {
          dx = -effectiveStep; // Inward (towards front/depth of container)
        } else if (e.key === 'ArrowDown') {
          dx = effectiveStep; // Outward (towards container doors)
        } else if (e.key === 'ArrowLeft') {
          dy = effectiveStep; // Move Left in default perspective (+Y direction in container coordinates)
        } else if (e.key === 'ArrowRight') {
          dy = -effectiveStep; // Move Right in default perspective (-Y direction in container coordinates)
        }

        handleNudgeItem(currentSelected, { dx, dy, dz });
      } else if (e.key === 'm' || e.key === 'M') {
        // M key: Toggle Manual Mode ON/OFF directly
        e.preventDefault();
        const nextMode = !isManualModeRef.current;
        if (onToggleManualMode) {
          onToggleManualMode(nextMode);
        } else {
          setInternalManualMode(nextMode);
        }
        if (!nextMode) {
          cancelPlacementMode();
        }
        showToast(language === 'ja'
          ? (nextMode ? '🛠️ 手動調整モードを有効化しました (キー: M)' : '📦 通常モードに切り替えました (キー: M)')
          : (nextMode ? '🛠️ Manual Mode ON (Key: M)' : '📦 Normal Mode ON (Key: M)'));
      } else if ((e.key === 'g' || e.key === 'G') && isManualMode) {
        // G key: Enter or toggle reposition mode for currently selected cargo (Grab & Move)
        e.preventDefault();
        if (isDraggingExistingItemRef.current) {
          cancelPlacementMode();
        } else if (currentSelected) {
          setIsDraggingExistingItem(currentSelected);
          isDraggingExistingItemRef.current = currentSelected;
          setInternalSelectedItem(null);
          activeSelectedItemRef.current = null;
          if (onSelectItem) onSelectItem(null);
          showToast(language === 'ja'
            ? `「${currentSelected.name}」の再配置モードを開始しました。移動先を3D画面内でクリックしてください (Esc / C でキャンセル)`
            : `Moving "${currentSelected.name}". Click target position in 3D scene (Esc / C to cancel)`);
        }
      } else if (e.key === '?' || (e.key === 'h' || e.key === 'H')) {
        // ? or H: Toggle shortcuts help modal
        e.preventDefault();
        setShowShortcutsHelp(prev => !prev);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && isManualMode) {
        if (currentSelected && onManualRemoveItem) {
          onManualRemoveItem(currentSelected.id);
          setInternalSelectedItem(null);
          activeSelectedItemRef.current = null;
          if (onSelectItem) onSelectItem(null);
          showToast(language === 'ja' ? `「${currentSelected.name}」を未積載リストに戻しました` : `Returned "${currentSelected.name}" to unplaced list`);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.key)) {
        if (keyHoldTrackerRef.current.key === e.key) {
          if (keyHoldTrackerRef.current.resetTimeout) {
            clearTimeout(keyHoldTrackerRef.current.resetTimeout);
          }
          keyHoldTrackerRef.current.key = null;
          keyHoldTrackerRef.current.startTime = 0;
          keyHoldTrackerRef.current.count = 0;
          setActiveSpeedMultiplier(1);
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (heldUnplacedItemRef.current || isDraggingExistingItemRef.current || draggedUnplacedRef.current) {
        e.preventDefault();
        cancelPlacementMode();
      }
    };

    containerEl.addEventListener('mousedown', handleMouseDown);
    containerEl.addEventListener('mousemove', handleMouseMove);
    containerEl.addEventListener('click', handleClick);
    containerEl.addEventListener('contextmenu', handleContextMenu);
    containerEl.addEventListener('dragover', handleDragOver);
    containerEl.addEventListener('drop', handleDrop);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      containerEl.removeEventListener('mousedown', handleMouseDown);
      containerEl.removeEventListener('mousemove', handleMouseMove);
      containerEl.removeEventListener('click', handleClick);
      containerEl.removeEventListener('contextmenu', handleContextMenu);
      containerEl.removeEventListener('dragover', handleDragOver);
      containerEl.removeEventListener('drop', handleDrop);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isManualMode, heldUnplacedItem, isDraggingExistingItem, currentTab, containers, 
    container, gridSnapMm, magneticSnapMm, toggleGridSnap, toggleMagneticSnap, onManualPlaceItem, onManualMoveItem, onManualRemoveItem, 
    onSelectItem, externalSelectedItem, internalSelectedItem, language, showToast, packedItems,
    onUndo, onRedo, canUndo, canRedo, handleDropItemToSupport, handleMoveToDeepestBackLeft, cancelPlacementMode
  ]);

  // Camera preset views
  const setCameraView = (type: 'iso' | 'top' | 'side' | 'door') => {
    setActiveCameraView(type);
    if (!cameraRef.current || !controlsRef.current) return;
    const lenM = container.length / 1000;
    const widM = container.width / 1000;
    const heiM = container.height / 1000;
    const isSideBySide = currentTab === 'all' && containers && containers.length > 1;
    const spacingM = widM + 1.2;
    const count = isSideBySide ? containers.length : 1;
    const totalZ = (count - 1) * spacingM + widM;

    const target = new THREE.Vector3(lenM / 2, heiM / 2, totalZ / 2);
    controlsRef.current.target.copy(target);

    // Temporarily allow polar repositioning
    controlsRef.current.minPolarAngle = 0;
    controlsRef.current.maxPolarAngle = Math.PI;

    if (type === 'iso') {
      cameraRef.current.position.set(lenM * 1.5, heiM * 1.8, totalZ * 1.4);
    } else if (type === 'top') {
      cameraRef.current.position.set(lenM / 2, heiM * 3.5 + totalZ * 0.5, totalZ / 2 + 0.001);
    } else if (type === 'side') {
      cameraRef.current.position.set(lenM / 2, heiM / 2, totalZ * 2.5);
    } else if (type === 'door') {
      cameraRef.current.position.set(lenM * 2.4, heiM * 0.8, totalZ / 2);
    }
    controlsRef.current.update();

    // Lock vertical rotation (polar angle) to new view's elevation for horizontal-only rotation
    const newPolar = controlsRef.current.getPolarAngle();
    controlsRef.current.minPolarAngle = newPolar;
    controlsRef.current.maxPolarAngle = newPolar;
    controlsRef.current.update();
  };

  // Capture High-Res Snapshot
  const captureSnapshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `3D-Loading-Plan-${container.name.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = dataUrl;
    link.click();
  };

  const hasMultipleContainers = containers && containers.length > 1;

  return (
    <div 
      ref={viewerWrapperRef}
      id="container-viewer-3d-root" 
      className={`flex flex-col bg-white border border-slate-200 overflow-hidden shadow-xs text-slate-800 transition-all ${
        isFullScreen 
          ? '!fixed !inset-0 !w-screen !h-screen !z-[99999] rounded-none !m-0 !p-0 border-none' 
          : 'relative w-full h-full min-h-[580px] rounded-xl'
      }`}
    >
      {/* 3D Canvas Viewport */}
      <div 
        ref={containerRef} 
        className="w-full flex-1 relative bg-slate-50 select-none outline-none min-h-[400px]"
      >
        {webglError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-50 text-slate-700 space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">3Dグラフィックス (WebGL) の初期化中または非対応です</p>
              <p className="text-xs text-slate-500 mt-1">{webglError}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors"
            >
              ページを再読み込み
            </button>
          </div>
        )}
      </div>

      {/* Top Floating Container Selector Tabs & Quick Badges */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2 z-10 min-w-0">
        <div className="flex items-center gap-1 sm:gap-1.5 pointer-events-auto bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm text-xs text-slate-800 min-w-0 max-w-[calc(100%-140px)] sm:max-w-[calc(100%-200px)] md:max-w-[calc(100%-240px)]">
          <Box className="w-4 h-4 text-blue-600 shrink-0" />
          <span 
            className="font-semibold text-slate-900 truncate max-w-[100px] sm:max-w-[140px] md:max-w-[190px] shrink min-w-0 hidden sm:inline"
            title={container.name}
          >
            {container.name}
          </span>

          {hasMultipleContainers ? (
            <div className="flex items-center gap-1 ml-1 sm:ml-2 border-l border-slate-200 pl-1 sm:pl-2 shrink-0">
              {containers.length <= 4 ? (
                // 2-4 Containers: Direct tabs for fast 1-click access
                <div className="flex items-center gap-1 shrink-0">
                  {containers.map((cLoad, idx) => {
                    const cIndex = cLoad.containerIndex || (idx + 1);
                    const isActive = currentTab === cIndex;
                    return (
                      <button
                        key={cIndex}
                        type="button"
                        onClick={() => setTab(cIndex)}
                        title={isJa ? `コンテナ #${cIndex} (容積充填率: ${(cLoad.metrics?.volumeUtilization || 0).toFixed(1)}%)` : `Container #${cIndex} (Volume Utilization: ${(cLoad.metrics?.volumeUtilization || 0).toFixed(1)}%)`}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 whitespace-nowrap transition-all cursor-pointer ${
                          isActive
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        #{cIndex} ({(cLoad.metrics?.volumeUtilization || 0).toFixed(0)}%)
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setTab(currentTab === 'all' ? 1 : 'all')}
                    title={isJa ? '全台並列表示切替' : 'Toggle Side-by-Side'}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap transition-all cursor-pointer ${
                      currentTab === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Grid3X3 className="w-3 h-3" />
                    <span className="hidden sm:inline">{isJa ? '並列' : 'Side-by-Side'}</span>
                  </button>
                </div>
              ) : (
                // 5+ Containers: Compact carousel with full container number & quick select dropdown
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handlePrevContainer}
                    className="p-1 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 shrink-0 transition-colors cursor-pointer"
                    title={isJa ? '前のコンテナへ (←)' : 'Previous container'}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <div className="relative inline-flex items-center">
                    <button
                      type="button"
                      className={`px-2.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap transition-all cursor-pointer ${
                        currentTab !== 'all'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      title={isJa ? 'クリックでコンテナを直接選択' : 'Click to select container'}
                    >
                      <span>
                        {currentTab === 'all'
                          ? (isJa ? `全台並列 (${containers.length}台)` : `All (${containers.length})`)
                          : (isJa 
                              ? `コンテナ #${currentTab} / ${containers.length} (${currentActiveUtilization.toFixed(0)}%)` 
                              : `Cont #${currentTab} / ${containers.length} (${currentActiveUtilization.toFixed(0)}%)`
                            )
                        }
                      </span>
                      <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
                    </button>
                    <select
                      id="top-container-dropdown-select"
                      value={currentTab}
                      onChange={(e) => setTab(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                      title={isJa ? 'コンテナ切り替え' : 'Switch container'}
                    >
                      {containers.map((c, idx) => {
                        const cIdx = c.containerIndex || (idx + 1);
                        const util = (c.metrics?.volumeUtilization || 0).toFixed(0);
                        const itemCount = c.packedItems?.length || 0;
                        return (
                          <option key={cIdx} value={cIdx}>
                            {isJa 
                              ? `コンテナ #${cIdx} (${util}% 充填 • ${itemCount}個)` 
                              : `Container #${cIdx} (${util}% • ${itemCount} items)`}
                          </option>
                        );
                      })}
                      <option value="all">
                        {isJa ? `全台並列 (${containers.length}台一括表示)` : `Side-by-Side (All ${containers.length} containers)`}
                      </option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleNextContainer}
                    className="p-1 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 shrink-0 transition-colors cursor-pointer"
                    title={isJa ? '次のコンテナへ (→)' : 'Next container'}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    id="top-side-by-side-btn"
                    onClick={() => setTab(currentTab === 'all' ? 1 : 'all')}
                    title={isJa ? '全台並列表示切替' : 'Toggle Side-by-Side'}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap transition-all cursor-pointer ${
                      currentTab === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Grid3X3 className="w-3 h-3" />
                    <span className="hidden sm:inline">{isJa ? '並列' : 'Side-by-Side'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 ml-1 sm:ml-2 border-l border-slate-200 pl-1 sm:pl-2 shrink-0">
              <button
                type="button"
                onClick={() => setTab(1)}
                title={isJa ? `コンテナ #1 (容積充填率: ${singleContainerUtilization.toFixed(1)}%)` : `Container #1 (Volume Utilization: ${singleContainerUtilization.toFixed(1)}%)`}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-900 text-white shadow-xs transition-all cursor-default"
              >
                #1 ({singleContainerUtilization.toFixed(0)}%)
              </button>
            </div>
          )}

          <span className="text-slate-300 mx-1 shrink-0">|</span>
          <span className="text-slate-900 font-mono font-bold shrink-0 whitespace-nowrap">
            {activeItemsToDisplay.length} {isJa ? '個 積載' : 'Boxes'}
          </span>
        </div>

        {/* Top-Right Viewer Toolbar */}
        <div className="flex items-center gap-1 pointer-events-auto bg-white/95 backdrop-blur-md px-1.5 py-1 rounded-lg border border-slate-200 shadow-sm text-xs shrink-0 z-10">
          <button
            id="toggle-slice-controls-btn"
            onClick={() => setShowSliceControls(!showSliceControls)}
            title={isJa ? '操作・視点・表示設定 (Vivid・半透明・断面・シミュレーション)' : 'Controls, Display & Slicing Settings'}
            className={`px-2 py-0.5 rounded-md transition-colors flex items-center gap-1.5 font-bold ${
              showSliceControls 
                ? 'bg-slate-900 text-white shadow-2xs' 
                : (zSlicePercent < 100 || xSlicePercent < 100 || isPlaying)
                  ? 'bg-slate-200 text-slate-900 border border-slate-300 font-bold'
                  : 'text-slate-800 hover:bg-slate-100'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="text-xs hidden md:inline">{isJa ? '表示設定' : 'Controls'}</span>
            {!showSliceControls && (isVividBoost || isTranslucent || zSlicePercent < 100 || xSlicePercent < 100 || isPlaying) && (
              <span className="flex items-center gap-1 ml-0.5">
                {isVividBoost && (
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500" title={isJa ? '鮮やかON' : 'Vivid ON'} />
                )}
                {isTranslucent && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" title={isJa ? '半透明ON' : 'Translucent ON'} />
                )}
              </span>
            )}
          </button>
          <button
            id="toggle-manual-mode-btn"
            onClick={() => {
              const next = !isManualMode;
              setIsManualMode(next);
              if (!next) {
                setHeldUnplacedItem(null);
                setGhostCoords(null);
              }
            }}
            title={isJa ? '手動調整モード切替 (Mキーで切替)' : 'Toggle Manual Adjustment Mode (M key)'}
            className={`px-2 py-0.5 rounded-md transition-all flex items-center gap-1.5 font-bold ${
              isManualMode
                ? 'bg-amber-500 text-slate-950 shadow-xs ring-2 ring-amber-400/70'
                : hasManualAdjustments
                  ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                  : 'text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Hand className={`w-3.5 h-3.5 ${isManualMode ? 'text-slate-950' : 'text-amber-500'}`} />
            <span className="text-xs hidden sm:inline">{isJa ? '手動調整' : 'Manual'}</span>
            <kbd className={`px-1 py-0.2 rounded text-[9px] font-mono font-bold ${isManualMode ? 'bg-amber-600/30 text-slate-950' : 'bg-slate-200 text-slate-600'}`}>M</kbd>
            {hasManualAdjustments && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                {manualAdjustmentsCount || '✓'}
              </span>
            )}
          </button>
          <div className="w-px h-3.5 bg-slate-200 mx-0.5" />
          <button
            id="toggle-cog-btn"
            onClick={() => setShowCoG(!showCoG)}
            title={isJa ? '重心マーカー表示切替' : 'Toggle Center of Gravity'}
            className={`p-1 rounded-md transition-colors ${showCoG ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            id="snapshot-3d-btn"
            onClick={captureSnapshot}
            title={isJa ? '3D画像保存 (PNG)' : 'Save 3D Snapshot'}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-700 transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            id="fullscreen-3d-btn"
            onClick={toggleFullScreen}
            title={isJa 
              ? (isFullScreen ? '全画面表示を解除 (Esc)' : '全画面表示') 
              : (isFullScreen ? 'Exit Full Screen (Esc)' : 'Full Screen')
            }
            className={`p-1 rounded-md transition-colors ${
              isFullScreen 
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs' 
                : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <div className="w-px h-3.5 bg-slate-200 mx-0.5" />
          <button
            id="shortcuts-help-btn"
            onClick={() => setShowShortcutsHelp(true)}
            title={isJa ? '操作・ショートカット一覧ヘルプ (?)' : 'Keyboard Shortcuts Help (?)'}
            className="p-1 rounded-md hover:bg-amber-100 text-slate-700 hover:text-amber-900 transition-colors flex items-center justify-center"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Manual Mode Active Sticky Control Strip */}
      {isManualMode && (
        <div 
          id="manual-mode-active-banner"
          className="absolute top-14 left-3 right-3 pointer-events-auto bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-md text-xs z-20 animate-fade-in flex items-center justify-between gap-3 text-slate-800 flex-wrap"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md font-bold text-[11px]">
              <Hand className="w-3.5 h-3.5 text-amber-700" />
              {isJa ? '手動調整モード' : 'Manual Mode'}
            </span>
            <span className="text-[11px] text-slate-600 font-medium">
              {heldUnplacedItem ? (
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  <ArrowDownToLine className="w-3.5 h-3.5 text-blue-600 animate-bounce" />
                  {isJa 
                    ? `配置位置を選択中: 「${heldUnplacedItem.unplaced.name}」 3D内クリックで確定 / [R]で回転` 
                    : `Positioning: "${heldUnplacedItem.unplaced.name}" - Click 3D view to place / [R] rotate`}
                </span>
              ) : activeSelectedItem ? (
                <span className="font-medium text-slate-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0 border border-black/15" style={{ backgroundColor: activeSelectedItem.color }} />
                  <span className="font-semibold truncate max-w-[140px] sm:max-w-[200px]">{activeSelectedItem.name}</span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-600">{isJa ? '[Q] 一番奥左へ移動 / [Space] 着地 / [R] 回転 / [矢印] 微動' : '[Q] Deepest Back-Left / [Space] Drop / [R] Rotate / [Arrows] Nudge'}</span>
                </span>
              ) : (
                isJa 
                  ? '未積載トレイの荷物を配置、または積載済みの荷物をクリックして選択' 
                  : 'Place tray items, or click packed cargo to select'
              )}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Undo / Redo buttons */}
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-2xs">
              <button
                id="banner-undo-btn"
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  if (canUndo && onUndo) {
                    onUndo();
                    setHeldUnplacedItem(null);
                    setIsDraggingExistingItem(null);
                    setGhostCoords(null);
                    showToast(isJa ? '操作を元に戻しました (Ctrl+Z)' : 'Undid adjustment (Ctrl+Z)');
                  }
                }}
                title={isJa ? '元に戻す (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
                className="h-7 px-2 rounded-md text-slate-700 hover:text-slate-900 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <Undo2 className="w-3.5 h-3.5 text-slate-500" />
                <span>{isJa ? '戻す' : 'Undo'}</span>
              </button>
              <button
                id="banner-redo-btn"
                type="button"
                disabled={!canRedo}
                onClick={() => {
                  if (canRedo && onRedo) {
                    onRedo();
                    setHeldUnplacedItem(null);
                    setIsDraggingExistingItem(null);
                    setGhostCoords(null);
                    showToast(isJa ? '操作をやり直しました (Ctrl+Y)' : 'Redid adjustment (Ctrl+Y)');
                  }
                }}
                title={isJa ? 'やり直す (Ctrl+Y)' : 'Redo (Ctrl+Y)'}
                className="h-7 px-2 rounded-md text-slate-700 hover:text-slate-900 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <Redo2 className="w-3.5 h-3.5 text-slate-500" />
                <span>{isJa ? 'やり直す' : 'Redo'}</span>
              </button>
            </div>

            {/* Rotate item */}
            <button
              id="banner-rotate-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                if (heldUnplacedItem) {
                  setHeldUnplacedItem(prev => prev ? { ...prev, rotation: prev.rotation === 0 ? 1 : 0 } : null);
                } else if (activeSelectedItem && onManualMoveItem) {
                  onManualMoveItem(activeSelectedItem.id, {
                    x: activeSelectedItem.x,
                    y: activeSelectedItem.y,
                    z: activeSelectedItem.z,
                    length: activeSelectedItem.width,
                    width: activeSelectedItem.length,
                    height: activeSelectedItem.height,
                    rotationIndex: (activeSelectedItem.rotationIndex + 1) % 6
                  });
                  showToast(isJa ? `90°回転しました` : `Rotated 90°`);
                }
              }}
              title={isJa ? '荷物を90°回転 (R)' : 'Rotate 90° (R)'}
              className="h-7 px-2 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 flex items-center gap-1 text-[11px] font-medium shadow-2xs transition-colors cursor-pointer"
            >
              <RotateCw className="w-3 h-3 text-slate-500" />
              <span>{isJa ? '回転 (R)' : 'Rotate (R)'}</span>
            </button>

            {/* Gravity Drop (Landing) button when cargo is selected */}
            {activeSelectedItem && (
              <>
                <button
                  id="banner-snap-backleft-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    handleMoveToDeepestBackLeft(activeSelectedItem);
                  }}
                  title={isJa ? '一番奥左の置ける場所まで一気に移動 (Qキー)' : 'Snap to deepest back-left position (Q key)'}
                  className="h-7 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-900 border border-amber-300 flex items-center gap-1 text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <ArrowDownToLine className="w-3 h-3 text-amber-700 rotate-45" />
                  <span>{isJa ? '奥左詰 (Q)' : 'Back-Left (Q)'}</span>
                </button>

                <button
                  id="banner-drop-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    handleDropItemToSupport(activeSelectedItem);
                  }}
                  title={isJa ? '真下の床・荷物天面まで着地 (Space / D)' : 'Drop onto floor or cargo (Space / D)'}
                  className="h-7 px-2 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 flex items-center gap-1 text-[11px] font-medium shadow-2xs transition-colors cursor-pointer"
                >
                  <ArrowDownToLine className="w-3 h-3 text-slate-500" />
                  <span>{isJa ? '着地 (Space)' : 'Drop (Space)'}</span>
                </button>
              </>
            )}

            {/* Grid Snap & Free-form Placement Toggle & Increment Selector */}
            <div className="h-7 flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[11px] shadow-2xs">
              <button
                type="button"
                id="toggle-snap-btn"
                onClick={toggleGridSnap}
                title={isJa 
                  ? (gridSnapMm > 0 ? 'クリックで自由配置に切り替え (S)' : 'クリックでスナップ配置に切り替え (S)') 
                  : (gridSnapMm > 0 ? 'Click to switch to Free-form (S)' : 'Click to enable Snap-to-Grid (S)')}
                className={`h-full px-2 rounded-md flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                  gridSnapMm > 0
                    ? 'bg-sky-100 text-sky-800 border border-sky-300'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <Magnet className={`w-3 h-3 ${gridSnapMm > 0 ? 'text-sky-600' : 'text-slate-400'}`} />
                <span>{gridSnapMm > 0 ? (isJa ? 'スナップ ON' : 'Snap ON') : (isJa ? '自由配置' : 'Free-form')}</span>
                <span className="text-[9px] opacity-75 font-mono ml-0.5">[S]</span>
              </button>

              <div className="w-px h-3.5 bg-slate-200 mx-1" />

              <select
                id="select-snap-step"
                value={gridSnapMm}
                onChange={(e) => handleSelectGridSnap(Number(e.target.value))}
                title={isJa ? 'スナップ刻み幅を選択' : 'Select snap grid step'}
                className="bg-transparent font-medium text-slate-800 outline-none cursor-pointer pr-1 text-[11px]"
              >
                <option value={10}>0.01m (1cm)</option>
                <option value={50}>0.05m (5cm)</option>
                <option value={100}>0.10m (10cm)</option>
                <option value={200}>0.20m (20cm)</option>
                <option value={500}>0.50m (50cm)</option>
                <option value={0}>{isJa ? 'なし (自由配置)' : 'None (Free-form)'}</option>
              </select>
            </div>

            {/* Magnetic Edge Snap (Attraction toward adjacent cargo edges & walls) */}
            <div className="h-7 flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[11px] shadow-2xs">
              <button
                type="button"
                id="toggle-magnetic-snap-btn"
                onClick={toggleMagneticSnap}
                title={isJa 
                  ? (magneticSnapMm > 0 ? 'クリックでマグネット吸着を解除 (B)' : 'クリックでマグネット吸着を有効化 (B)') 
                  : (magneticSnapMm > 0 ? 'Click to disable Magnetic Snap (B)' : 'Click to enable Magnetic Snap (B)')}
                className={`h-full px-2 rounded-md flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                  magneticSnapMm > 0
                    ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <Magnet className={`w-3 h-3 ${magneticSnapMm > 0 ? 'text-cyan-600' : 'text-slate-400'}`} />
                <span>{magneticSnapMm > 0 ? (isJa ? '吸着 ON' : 'Magnetic ON') : (isJa ? '吸着 OFF' : 'Mag OFF')}</span>
                <span className="text-[9px] opacity-75 font-mono ml-0.5">[B]</span>
              </button>

              <div className="w-px h-3.5 bg-slate-200 mx-1" />

              <select
                id="select-magnetic-snap-distance"
                value={magneticSnapMm}
                onChange={(e) => handleSelectMagneticSnap(Number(e.target.value))}
                title={isJa ? 'マグネット吸着距離（閾値）を選択' : 'Select magnetic snap threshold distance'}
                className="bg-transparent font-medium text-slate-800 outline-none cursor-pointer pr-1 text-[11px]"
              >
                <option value={30}>30mm (3cm)</option>
                <option value={50}>50mm (5cm)</option>
                <option value={75}>75mm (7.5cm)</option>
                <option value={100}>100mm (10cm)</option>
                <option value={150}>150mm (15cm)</option>
                <option value={0}>{isJa ? 'なし (OFF)' : 'None (OFF)'}</option>
              </select>
            </div>

            {/* Unload All Cargo to unplaced tray for manual packing */}
            {onManualUnloadContainer && (
              <button
                id="banner-unload-container-btn"
                type="button"
                onClick={handleUnloadContainerAll}
                title={isJa 
                  ? 'コンテナ内の貨物をすべて未積載トレイに戻します (Ctrl+Zで復元可能)' 
                  : 'Unload all cargo back to tray (Ctrl+Z to undo)'}
                className={`h-7 px-2 rounded-lg border text-[11px] font-medium shadow-2xs transition-all flex items-center gap-1 cursor-pointer ${
                  confirmingUnload 
                    ? 'bg-red-600 text-white border-red-700 animate-pulse' 
                    : 'bg-white border-red-200 text-red-700 hover:bg-red-50'
                }`}
              >
                <PackageMinus className="w-3.5 h-3.5 text-current" />
                <span>
                  {confirmingUnload 
                    ? (isJa ? '確定？' : 'Confirm?') 
                    : (isJa ? '一括アンロード' : 'Unload All')}
                </span>
              </button>
            )}

            {/* Keyboard Shortcuts Help */}
            <button
              id="banner-shortcuts-help-btn"
              type="button"
              onClick={() => setShowShortcutsHelp(true)}
              title={isJa ? '操作・ショートカット一覧 (?)' : 'Keyboard Shortcuts (?)'}
              className="h-7 px-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 flex items-center gap-1 text-[11px] font-medium shadow-2xs transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3 h-3 text-slate-500" />
              <span>{isJa ? 'ヘルプ (?)' : 'Help (?)'}</span>
            </button>

            {/* Done */}
            <button
              id="banner-done-btn"
              onClick={() => {
                setIsManualMode(false);
                setHeldUnplacedItem(null);
                heldUnplacedItemRef.current = null;
                setIsDraggingExistingItem(null);
                isDraggingExistingItemRef.current = null;
                setGhostCoords(null);
              }}
              className="h-7 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white flex items-center gap-1 text-[11px] font-medium shadow-2xs transition-colors cursor-pointer"
            >
              <Check className="w-3 h-3 text-white" />
              <span>{isJa ? '完了' : 'Done'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Placement / Reposition Active Banner with Cancel Shortcut (Esc / C) */}
      {(heldUnplacedItem || isDraggingExistingItem) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex items-center gap-2.5 bg-slate-900/95 hover:bg-slate-900 text-white px-4 py-2 rounded-full shadow-2xl border border-amber-400/80 backdrop-blur-md animate-fade-in transition-all">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <span className="truncate max-w-[160px] sm:max-w-xs text-amber-200">
              {isDraggingExistingItem ? (
                isJa ? `再配置: 「${isDraggingExistingItem.name}」` : `Repositioning: "${isDraggingExistingItem.name}"`
              ) : (
                isJa ? `配置: 「${heldUnplacedItem?.unplaced.name}」` : `Placing: "${heldUnplacedItem?.unplaced.name}"`
              )}
            </span>
            {ghostCoords && (
              <span className="font-mono text-[11px] text-sky-200 bg-sky-950/60 px-2 py-0.5 rounded-md border border-sky-400/40 hidden sm:inline-block">
                X:{formatMeters(ghostCoords.x)}m Y:{formatMeters(ghostCoords.y)}m Z:{formatMeters(ghostCoords.z)}m
              </span>
            )}
          </div>

          {/* Snap Mode toggle pill in placement banner */}
          <button
            type="button"
            id="banner-toggle-snap-btn"
            onClick={toggleGridSnap}
            title={isJa ? 'グリッドスナップ切替 (Sキー / Alt押下で一時切替)' : 'Toggle Snap-to-Grid (S key / Hold Alt for temporary toggle)'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              gridSnapMm > 0
                ? 'bg-sky-600/90 hover:bg-sky-500 text-white border-sky-300 shadow-xs'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
            }`}
          >
            <Magnet className="w-3 h-3 text-current" />
            <span>
              {gridSnapMm > 0 
                ? (isJa ? `スナップ: ${formatMeters(gridSnapMm)}m` : `Snap: ${formatMeters(gridSnapMm)}m`) 
                : (isJa ? '自由配置' : 'Free-form')}
            </span>
            <kbd className="px-1 py-0.2 rounded bg-black/40 text-[9px] font-mono border border-white/20">S</kbd>
          </button>

          <button
            id="floating-cancel-placement-btn"
            type="button"
            onClick={cancelPlacementMode}
            title={isJa ? '配置モードをキャンセル (Esc / C / 右クリック)' : 'Cancel Placement Mode (Esc / C / Right-Click)'}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>{isJa ? '配置キャンセル' : 'Cancel'}</span>
            <span className="flex items-center gap-0.5 ml-0.5">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 font-mono text-[10px] font-bold border border-slate-700">Esc</kbd>
              <span className="text-slate-900 font-bold text-[10px]">/</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 font-mono text-[10px] font-bold border border-slate-700">C</kbd>
            </span>
          </button>
        </div>
      )}

      {/* Floating Selected Box Inspector Card (Displayed on Mouse Click, Draggable) */}
      {activeSelectedItem && (
        <div 
          ref={inspectorCardRef}
          style={
            inspectorPos
              ? { top: `${inspectorPos.y}px`, left: `${inspectorPos.x}px`, right: 'auto' }
              : undefined
          }
          className={`absolute pointer-events-auto bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 shadow-xl text-xs max-w-xs z-20 animate-fade-in text-slate-800 transition-shadow ${
            !inspectorPos ? (isManualMode ? 'top-28 left-3' : 'top-16 left-3') : ''
          } ${isDraggingInspector ? 'shadow-2xl ring-2 ring-blue-500/40 select-none opacity-95' : ''}`}
        >
          {/* Header with Title, Drag Handle, Badges, Reset Position & Close Button */}
          <div 
            onMouseDown={handleInspectorDragStart}
            onTouchStart={handleInspectorDragStart}
            className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-2 mb-2 cursor-grab active:cursor-grabbing select-none group"
            title={isJa ? 'ドラッグして画面内の好きな位置へ移動できます' : 'Drag to reposition anywhere'}
          >
            <div className="flex items-center gap-1.5 truncate min-w-0">
              <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0 cursor-grab" />
              <span 
                className="w-3 h-3 rounded-full shrink-0 border border-black/10" 
                style={{ backgroundColor: activeSelectedItem.color }} 
              />
              <span className="font-bold text-slate-900 truncate" title={activeSelectedItem.name}>
                {activeSelectedItem.name}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {activeSelectedItem.isManual && (
                <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-bold text-[10px] border border-amber-300 flex items-center gap-0.5">
                  <Hand className="w-2.5 h-2.5 text-amber-700" />
                  {isJa ? '手動' : 'Manual'}
                </span>
              )}
              {activeSelectedItem.containerIndex && (
                <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border border-slate-200">
                  C#{activeSelectedItem.containerIndex}
                </span>
              )}
              <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border border-slate-200">
                #{activeSelectedItem.sequenceNumber}
              </span>
              {inspectorPos && (
                <button
                  type="button"
                  id="reset-inspector-pos-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInspectorPos(null);
                  }}
                  title={isJa ? 'カードの位置を初期位置に戻す' : 'Reset position'}
                  className="text-[9px] text-slate-500 hover:text-slate-800 font-semibold px-1 py-0.5 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  {isJa ? '位置初期化' : 'Reset Pos'}
                </button>
              )}
              <button
                type="button"
                id="close-cargo-inspector-card-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setInternalSelectedItem(null);
                  if (onSelectItem) onSelectItem(null);
                }}
                title={isJa ? '閉じる (Esc)' : 'Close (Esc)'}
                className="ml-0.5 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {(() => {
            const target = activeSelectedItem;
            if (!target) return null;
            const coords = formatCoordinates(target.x, target.y, target.z, unitSystem);
            return (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400 block">{isJa ? 'SKU / 識別:' : 'SKU:'}</span>
                    <span className="font-mono font-semibold text-slate-800">{target.sku}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isJa ? '単体重量:' : 'Weight:'}</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatWeightCompact(target.weight, unitSystem)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isJa ? '寸法 (L×W×H):' : 'Size (L×W×H):'}</span>
                    <span className="font-mono text-slate-800 font-medium">
                      {formatDimensions(target.length, target.width, target.height, unitSystem, true)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isJa ? `配置位置 (${coords.unit}):` : `Pos (${coords.unit}):`}</span>
                    <span className="font-mono text-slate-800 font-bold">
                      {coords.x}, {coords.y}, {coords.z}
                    </span>
                  </div>
                </div>

                {/* Manual Adjustment fine-tuning controls when item is selected in manual mode */}
                {isManualMode && activeSelectedItem && activeSelectedItem.id === target.id && (
                  <div className="mt-2 pt-2 border-t border-slate-200 space-y-2 bg-slate-50/80 -mx-3.5 -mb-3.5 p-3 rounded-b-xl border-t border-slate-100">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-800 flex items-center gap-1">
                        <Move className="w-3 h-3 text-slate-500" />
                        {isJa ? '位置微調整' : 'Nudge Position'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {activeSpeedMultiplier > 1 && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                            ⚡ {activeSpeedMultiplier}x
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 font-mono">
                          ±{formatMeters((gridSnapMm > 0 ? gridSnapMm : 10) * activeSpeedMultiplier)}m
                        </span>
                      </div>
                    </div>

                    {/* Coordinate Nudge Controls */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {/* X Nudge */}
                      <div className="bg-white rounded-lg border border-slate-200 px-1.5 py-1 flex items-center justify-between shadow-2xs">
                        <span className="text-[11px] font-bold text-slate-500">X</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title={isJa ? 'X奥へ微調整' : 'Nudge -X'}
                            onClick={() => {
                              const step = gridSnapMm > 0 ? gridSnapMm : 10;
                              handleNudgeItem(target, { dx: -step });
                            }}
                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer transition-colors"
                          >-</button>
                          <button
                            type="button"
                            title={isJa ? 'X手前へ微調整' : 'Nudge +X'}
                            onClick={() => {
                              const step = gridSnapMm > 0 ? gridSnapMm : 10;
                              handleNudgeItem(target, { dx: step });
                            }}
                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer transition-colors"
                          >+</button>
                        </div>
                      </div>

                      {/* Y Nudge */}
                      <div className="bg-white rounded-lg border border-slate-200 px-1.5 py-1 flex items-center justify-between shadow-2xs">
                        <span className="text-[11px] font-bold text-slate-500">Y</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title={isJa ? 'Y微調整 (-)' : 'Nudge -Y'}
                            onClick={() => {
                              const step = gridSnapMm > 0 ? gridSnapMm : 10;
                              handleNudgeItem(target, { dy: -step });
                            }}
                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer transition-colors"
                          >-</button>
                          <button
                            type="button"
                            title={isJa ? 'Y微調整 (+)' : 'Nudge +Y'}
                            onClick={() => {
                              const step = gridSnapMm > 0 ? gridSnapMm : 10;
                              handleNudgeItem(target, { dy: step });
                            }}
                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer transition-colors"
                          >+</button>
                        </div>
                      </div>

                      {/* Z Nudge */}
                      <div className="bg-white rounded-lg border border-slate-200 px-1.5 py-1 flex items-center justify-between shadow-2xs">
                        <span className="text-[11px] font-bold text-slate-500">Z</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title={isJa ? 'Z下降' : 'Nudge -Z (Down)'}
                            onClick={() => {
                              const step = gridSnapMm > 0 ? gridSnapMm : 10;
                              handleNudgeItem(target, { dz: -step });
                            }}
                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer transition-colors"
                          >-</button>
                          <button
                            type="button"
                            title={isJa ? 'Z上昇' : 'Nudge +Z (Up)'}
                            onClick={() => {
                              const step = gridSnapMm > 0 ? gridSnapMm : 10;
                              handleNudgeItem(target, { dz: step });
                            }}
                            className="w-5 h-5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded flex items-center justify-center font-bold text-slate-700 text-xs cursor-pointer transition-colors"
                          >+</button>
                        </div>
                      </div>
                    </div>

                    {/* Unified Action Button Grid */}
                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      {/* 1. Snap to Back-Left (Q) */}
                      <button
                        type="button"
                        id="inspector-snap-backleft-btn"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          handleMoveToDeepestBackLeft(target);
                        }}
                        className="h-8 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-800 border border-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                        title={isJa ? '一番奥左の置ける場所まで一気に移動 (Qキー)' : 'Snap to deepest back-left position (Q key)'}
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5 text-amber-700 rotate-45" />
                        <span>{isJa ? '奥左へ (Q)' : 'Back-Left (Q)'}</span>
                      </button>

                      {/* 2. Landing Drop (Space) */}
                      <button
                        type="button"
                        id="inspector-drop-btn"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          handleDropItemToSupport(target);
                        }}
                        className="h-8 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 text-xs font-medium flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                        title={isJa ? '真下の床または荷物天面まで着地 (Space / D)' : 'Drop to floor or underlying cargo (Space / D)'}
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5 text-blue-600" />
                        <span>{isJa ? '着地 (Space)' : 'Drop (Space)'}</span>
                      </button>

                      {/* 3. Rotate 90° (R) */}
                      <button
                        type="button"
                        id="inspector-rotate-btn"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          if (onManualMoveItem) {
                            onManualMoveItem(target.id, {
                              x: target.x,
                              y: target.y,
                              z: target.z,
                              length: target.width,
                              width: target.length,
                              height: target.height,
                              rotationIndex: (target.rotationIndex + 1) % 6
                            });
                            showToast(isJa ? `90°回転しました` : `Rotated 90°`);
                          }
                        }}
                        className="h-8 px-2 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                        title={isJa ? '荷物を90°回転 (R)' : 'Rotate 90° (R)'}
                      >
                        <RotateCw className="w-3.5 h-3.5 text-slate-500" />
                        <span>{isJa ? '回転 (R)' : 'Rotate (R)'}</span>
                      </button>

                      {/* 4. Reposition (G) */}
                      <button
                        type="button"
                        id="inspector-reposition-btn"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          setIsDraggingExistingItem(target);
                          isDraggingExistingItemRef.current = target;
                          setInternalSelectedItem(null);
                          activeSelectedItemRef.current = null;
                          if (onSelectItem) onSelectItem(null);
                          showToast(isJa
                            ? `「${target.name}」の再配置モードを開始しました。移動先を3D画面内でクリックしてください (Esc / C でキャンセル)`
                            : `Moving "${target.name}". Click target position in 3D scene (Esc / C to cancel)`);
                        }}
                        className="h-8 px-2 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                        title={isJa ? '3D画面内でクリックして位置変更 (G / Escでキャンセル)' : 'Click in 3D to reposition (G / Esc to cancel)'}
                      >
                        <Move className="w-3.5 h-3.5 text-slate-500" />
                        <span>{isJa ? '再配置 (G)' : 'Move (G)'}</span>
                      </button>
                    </div>

                    {/* Unload to tray full-width button */}
                    <div className="pt-1">
                      <button
                        type="button"
                        id="inspector-remove-btn"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          if (onManualRemoveItem) {
                            onManualRemoveItem(target.id);
                            setInternalSelectedItem(null);
                            if (onSelectItem) onSelectItem(null);
                            showToast(isJa ? `未積載に戻しました` : `Returned to unplaced`);
                          }
                        }}
                        className="w-full h-7 px-2 rounded-lg bg-white hover:bg-red-50 active:bg-red-100 text-red-700 hover:text-red-800 border border-red-200 text-[11px] font-medium flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                        title={isJa ? '未積載トレイに戻す' : 'Return to unplaced tray'}
                      >
                        <Trash2 className="w-3 h-3 text-red-600" />
                        <span>{isJa ? '未積載トレイに戻す (Del / Backspace)' : 'Return to Unplaced (Del)'}</span>
                      </button>
                    </div>

                    {/* Subtle 1-line shortcut hint with drag guidance */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                      <span title={isJa ? '上部ヘッダーをつかんで好きな位置へドラッグできます' : 'Drag header to reposition card'}>
                        {isJa ? '[矢印] 微動 / [Shift] 昇降' : '[Arrows] Nudge / [Shift] Elevate'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowShortcutsHelp(true)}
                        className="text-slate-500 hover:text-slate-800 underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <HelpCircle className="w-2.5 h-2.5" />
                        <span>{isJa ? 'ヘルプ (?)' : 'Shortcuts (?)'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {activeSelectedItem.fragile && (
            <div className="mt-2.5 flex items-center gap-1 bg-slate-100 border border-slate-300 text-slate-800 px-2 py-1 rounded text-[10px] font-semibold">
              <ShieldAlert className="w-3 h-3 text-slate-900 shrink-0" />
              <span>{isJa ? '天地無用 / 割れ物 (上に積載不可)' : 'Fragile / Do Not Stack On Top'}</span>
            </div>
          )}
        </div>
      )}

      {/* Layer Slicing, Camera Views & Sequence Player Controls (Draggable Floating Panel) */}
      {showSliceControls && (
        <div 
          ref={panelRef}
          style={
            panelPos
              ? { top: `${panelPos.y}px`, left: `${panelPos.x}px`, right: 'auto' }
              : undefined
          }
          className={`absolute pointer-events-auto bg-white/95 backdrop-blur-md p-2.5 rounded-xl border border-slate-200/90 shadow-lg text-xs space-y-2.5 z-20 w-64 text-slate-700 animate-fade-in transition-shadow ${
            !panelPos ? 'top-14 right-3' : ''
          } ${isDragging ? 'shadow-2xl ring-2 ring-slate-900/30 select-none opacity-95' : ''}`}
        >
          {/* Header with Title, Drag Handle & Close Button */}
          <div 
            onMouseDown={handlePanelDragStart}
            onTouchStart={handlePanelDragStart}
            className="flex items-center justify-between pb-1.5 border-b border-slate-100 cursor-grab active:cursor-grabbing select-none group"
            title={isJa ? 'ドラッグして画面内の好きな位置へ移動できます' : 'Drag to reposition anywhere'}
          >
            <div className="flex items-center gap-1">
              <GripVertical className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
              <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3 text-slate-700" />
                {isJa ? '操作・視点' : 'Controls & Views'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {panelPos && (
                <button
                  id="reset-panel-pos-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPanelPos(null);
                  }}
                  title={isJa ? '小窓の位置を初期位置に戻す' : 'Reset position'}
                  className="text-[9px] text-slate-500 hover:text-slate-800 font-semibold px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                >
                  {isJa ? '位置初期化' : 'Reset Pos'}
                </button>
              )}
              {(zSlicePercent < 100 || xSlicePercent < 100) && (
                <button
                  id="reset-slice-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZSlicePercent(100);
                    setXSlicePercent(100);
                  }}
                  title={isJa ? '断面を全表示に戻す (100%)' : 'Reset Slices (100%)'}
                  className="text-[9px] text-slate-700 hover:text-black font-semibold px-1 hover:underline"
                >
                  {isJa ? '全表示' : 'Reset'}
                </button>
              )}
              <button
                id="close-slice-panel-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSliceControls(false);
                }}
                title={isJa ? '閉じる' : 'Close'}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 1. Camera View Presets (3D, TOP, SIDE, DOOR) */}
          <div>
            <div className="grid grid-cols-4 p-0.5 bg-slate-100 rounded-lg text-[11px]">
              <button
                id="camera-view-iso-btn"
                onClick={() => setCameraView('iso')}
                title={isJa ? '斜視図 (3D Isometric)' : '3D Isometric'}
                className={`py-1 rounded-md transition-all font-semibold text-center ${
                  activeCameraView === 'iso'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                3D
              </button>
              <button
                id="camera-view-top-btn"
                onClick={() => setCameraView('top')}
                title={isJa ? '上面図 (Top Plan)' : 'Top Plan'}
                className={`py-1 rounded-md transition-all font-semibold text-center ${
                  activeCameraView === 'top'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '天面' : 'TOP'}
              </button>
              <button
                id="camera-view-side-btn"
                onClick={() => setCameraView('side')}
                title={isJa ? '側面図 (Side View)' : 'Side View'}
                className={`py-1 rounded-md transition-all font-semibold text-center ${
                  activeCameraView === 'side'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '側面' : 'SIDE'}
              </button>
              <button
                id="camera-view-door-btn"
                onClick={() => setCameraView('door')}
                title={isJa ? '扉側 (Door Entrance)' : 'Door'}
                className={`py-1 rounded-md transition-all font-semibold text-center ${
                  activeCameraView === 'door'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '扉側' : 'DOOR'}
              </button>
            </div>
          </div>

          {/* 2. Play Load / Loading Simulation Player */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Play className="w-2.5 h-2.5 text-slate-800 fill-slate-800" />
                {isJa ? '積載順' : 'Sequence'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-slate-600 font-semibold">
                  {currentStep}/{activeItemsToDisplay.length}
                </span>
                <div className="flex items-center bg-slate-100 rounded px-1 py-0.5 text-[9px] font-semibold text-slate-600">
                  {[1, 2, 4].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`px-1 rounded transition-colors ${
                        playbackSpeed === speed 
                          ? 'bg-white text-slate-900 font-bold shadow-2xs' 
                          : 'hover:text-slate-900'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Play, Step Buttons & Slider */}
            <div className="flex items-center gap-1">
              <button
                id="seq-reset-btn"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep(0);
                }}
                disabled={currentStep === 0}
                title={isJa ? '最初に戻る' : 'Reset to Start'}
                className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                id="seq-prev-btn"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep(prev => Math.max(0, prev - 1));
                }}
                disabled={currentStep === 0}
                title={isJa ? '前の荷物' : 'Previous Step'}
                className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors shrink-0"
              >
                <SkipBack className="w-3 h-3" />
              </button>
              <button
                id="seq-play-pause-btn"
                onClick={() => {
                  if (currentStep >= activeItemsToDisplay.length) {
                    setCurrentStep(0);
                  }
                  setIsPlaying(!isPlaying);
                }}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1 shadow-2xs transition-all active:scale-95 text-[10px] shrink-0"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-2.5 h-2.5 text-white" />
                    <span>{isJa ? '停止' : 'Pause'}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-2.5 h-2.5 fill-current text-white" />
                    <span>{isJa ? '再生' : 'Play'}</span>
                  </>
                )}
              </button>
              <button
                id="seq-next-btn"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep(prev => Math.min(activeItemsToDisplay.length, prev + 1));
                }}
                disabled={currentStep >= activeItemsToDisplay.length}
                title={isJa ? '次の荷物' : 'Next Step'}
                className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors shrink-0"
              >
                <SkipForward className="w-3 h-3" />
              </button>
              <input
                id="loading-step-slider"
                type="range"
                min="0"
                max={activeItemsToDisplay.length}
                value={currentStep}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentStep(Number(e.target.value));
                }}
                className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-slate-900"
              />
            </div>
          </div>

          {/* 3. Slicing Sliders */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                <span className="flex items-center gap-1 font-medium">
                  <Layers className="w-2.5 h-2.5 text-slate-600" />
                  {isJa ? '高さ (Z)' : 'Height (Z)'}
                </span>
                <span className="font-mono text-slate-700 font-semibold text-[10px]">{zSlicePercent}%</span>
              </div>
              <input
                id="z-slice-slider"
                type="range"
                min="10"
                max="100"
                value={zSlicePercent}
                onChange={(e) => setZSlicePercent(Number(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-slate-900"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                <span className="flex items-center gap-1 font-medium">
                  <SlidersHorizontal className="w-2.5 h-2.5 text-slate-600" />
                  {isJa ? '奥行 (X)' : 'Depth (X)'}
                </span>
                <span className="font-mono text-slate-700 font-semibold text-[10px]">{xSlicePercent}%</span>
              </div>
              <input
                id="x-slice-slider"
                type="range"
                min="10"
                max="100"
                value={xSlicePercent}
                onChange={(e) => setXSlicePercent(Number(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-slate-900"
              />
            </div>
          </div>

          {/* 4. Visual & Display Style Controls (Vivid & Translucent) */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {/* Vivid Toggle Button */}
              <button
                type="button"
                id="panel-vivid-boost-toggle"
                onClick={() => setIsVividBoost(!isVividBoost)}
                className={`py-1 px-1.5 rounded-md font-semibold flex items-center justify-between transition-colors border ${
                  isVividBoost
                    ? 'bg-pink-600 text-white border-pink-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>{isJa ? '鮮やか' : 'Vivid'}</span>
                </span>
                <span className="font-mono text-[9px] font-bold">
                  {isVividBoost ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Translucent Toggle Button */}
              <button
                type="button"
                id="panel-translucent-toggle"
                onClick={() => {
                  if (!isTranslucent && cargoOpacity >= 100) {
                    setCargoOpacity(65);
                  }
                  setIsTranslucent(!isTranslucent);
                }}
                className={`py-1 px-1.5 rounded-md font-semibold flex items-center justify-between transition-colors border ${
                  isTranslucent
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Blend className="w-3 h-3" />
                  <span>{isJa ? '半透明' : 'Translucent'}</span>
                </span>
                <span className="font-mono text-[9px] font-bold">
                  {isTranslucent ? `${cargoOpacity}%` : 'OFF'}
                </span>
              </button>
            </div>

            {/* If Translucent is ON, show compact opacity slider */}
            {isTranslucent && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[9px] text-slate-500 shrink-0 font-medium">{isJa ? '透明度' : 'Opacity'}</span>
                <input
                  id="cargo-opacity-slider"
                  type="range"
                  min="20"
                  max="95"
                  step="5"
                  value={cargoOpacity}
                  onChange={(e) => setCargoOpacity(Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-indigo-600"
                />
                <span className="font-mono text-[9px] font-semibold text-indigo-700 shrink-0 w-6 text-right">{cargoOpacity}%</span>
              </div>
            )}

            {/* Color Scheme selector */}
            <div className="grid grid-cols-4 p-0.5 bg-slate-100 rounded-md text-[9px]">
              <button
                id="color-mode-cargo-btn"
                onClick={() => setColorMode('cargo')}
                className={`py-0.5 rounded text-center transition-colors font-medium ${
                  colorMode === 'cargo' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '種別' : 'Cargo'}
              </button>
              <button
                id="color-mode-vivid-btn"
                onClick={() => setColorMode('vivid')}
                title={isJa ? '鮮やかカラー' : 'Vivid Colors'}
                className={`py-0.5 rounded text-center transition-colors font-semibold ${
                  colorMode === 'vivid' ? 'bg-pink-600 text-white font-bold shadow-2xs' : 'text-pink-700 hover:text-pink-900'
                }`}
              >
                {isJa ? '鮮やか' : 'Vivid'}
              </button>
              <button
                id="color-mode-weight-btn"
                onClick={() => setColorMode('weight')}
                className={`py-0.5 rounded text-center transition-colors font-medium ${
                  colorMode === 'weight' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '重量' : 'Weight'}
              </button>
              <button
                id="color-mode-seq-btn"
                onClick={() => setColorMode('sequence')}
                className={`py-0.5 rounded text-center transition-colors font-medium ${
                  colorMode === 'sequence' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isJa ? '順序' : 'Seq'}
              </button>
            </div>

            {onApplyVividColors && (
              <button
                type="button"
                id="panel-apply-vivid-colors-btn"
                onClick={() => onApplyVividColors('vivid_neon')}
                className="w-full py-1 rounded bg-slate-50 hover:bg-pink-50 border border-slate-200 hover:border-pink-200 text-pink-700 text-[9px] font-semibold flex items-center justify-center gap-1 transition-colors"
                title={isJa ? '貨物マニフェスト自体に鮮やかネオンカラーを一括保存' : 'Apply vivid colors directly to manifest items'}
              >
                <Palette className="w-2.5 h-2.5" />
                <span>{isJa ? '全貨物の色を鮮やかに変更' : 'Apply Vivid Colors to Cargo'}</span>
              </button>
            )}

            {/* 6. Grid Snap & Placement Mode Settings */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                <span className="flex items-center gap-1 font-medium">
                  <Magnet className="w-2.5 h-2.5 text-slate-600" />
                  {isJa ? '配置スナップ (Snap-to-Grid)' : 'Snap-to-Grid'}
                </span>
                <span className="font-mono text-slate-700 font-semibold text-[10px]">
                  {gridSnapMm > 0 ? `${formatMeters(gridSnapMm)}m` : (isJa ? '自由配置' : 'Free')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <button
                  type="button"
                  id="panel-snap-toggle-btn"
                  onClick={toggleGridSnap}
                  className={`py-1 px-1.5 rounded font-semibold text-center border transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                    gridSnapMm > 0
                      ? 'bg-sky-50 text-sky-800 border-sky-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Magnet className="w-3 h-3 text-current" />
                  <span>{gridSnapMm > 0 ? (isJa ? 'スナップ ON' : 'Snap ON') : (isJa ? '自由配置' : 'Free-form')}</span>
                </button>
                <select
                  id="panel-select-snap-step"
                  value={gridSnapMm}
                  onChange={(e) => handleSelectGridSnap(Number(e.target.value))}
                  className="py-1 px-1.5 rounded bg-slate-50 border border-slate-200 text-slate-800 font-medium text-[10px] outline-none cursor-pointer"
                >
                  <option value={10}>0.01m (1cm)</option>
                  <option value={50}>0.05m (5cm)</option>
                  <option value={100}>0.10m (10cm)</option>
                  <option value={200}>0.20m (20cm)</option>
                  <option value={500}>0.50m (50cm)</option>
                  <option value={0}>{isJa ? 'なし (自由配置)' : 'None (Free)'}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Dock: Unplaced Cargo Tray (visible when in manual mode or toggled) */}
      {isManualMode && (
        <div 
          id="unplaced-cargo-tray-dock"
          className="absolute bottom-3 left-3 right-3 pointer-events-auto bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-xl z-20 overflow-hidden flex flex-col text-slate-800 transition-all duration-200"
        >
          {/* Tray Header */}
          <div className="px-3.5 py-2 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <PackagePlus className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-bold text-slate-900">
                {isJa ? '手動配置・未積載荷物トレイ' : 'Manual Placement Cargo Tray'}
              </span>
              <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full text-[11px] font-bold border border-amber-300">
                {unplacedItems.reduce((acc, it) => acc + (it.count || 1), 0)} {isJa ? '個 未積載' : 'unplaced'}
              </span>

              {/* Weight Sort Controls */}
              {unplacedItems.length > 1 && (
                <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 shadow-2xs text-[11px]">
                  <button
                    type="button"
                    id="tray-sort-weight-btn"
                    onClick={() => {
                      const next = traySortOrder === 'weight-desc' ? 'weight-asc' : 'weight-desc';
                      setTraySortOrder(next);
                      showToast(isJa 
                        ? (next === 'weight-desc' ? '重量順（重い順 ↓）に並び替えました' : '重量順（軽い順 ↑）に並び替えました')
                        : (next === 'weight-desc' ? 'Sorted by weight (heaviest first)' : 'Sorted by weight (lightest first)'));
                    }}
                    className={`px-2 py-0.5 rounded font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      traySortOrder.startsWith('weight')
                        ? 'bg-amber-500 text-slate-950 shadow-2xs'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                    title={isJa ? '重量順で並び替え (クリックで重い順/軽い順を切替)' : 'Sort by weight (Click to toggle heavy/light)'}
                  >
                    <Scale className="w-3 h-3 text-current" />
                    <span>{isJa ? '重量順' : 'Weight'}</span>
                    {traySortOrder === 'weight-desc' ? (
                      <span className="text-[10px] font-mono font-extrabold">↓{isJa ? '重' : 'H'}</span>
                    ) : traySortOrder === 'weight-asc' ? (
                      <span className="text-[10px] font-mono font-extrabold">↑{isJa ? '軽' : 'L'}</span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    id="tray-sort-toggle-other-btn"
                    onClick={() => {
                      const next = traySortOrder === 'count-desc' ? 'name-asc' : 'count-desc';
                      setTraySortOrder(next);
                      showToast(isJa 
                        ? (next === 'count-desc' ? '個数順に並び替えました' : '品名順に並び替えました')
                        : (next === 'count-desc' ? 'Sorted by quantity' : 'Sorted by name'));
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                      !traySortOrder.startsWith('weight')
                        ? 'bg-amber-100 text-amber-950 font-bold border border-amber-300'
                        : 'hover:bg-slate-100 text-slate-500'
                    }`}
                    title={isJa ? '数量順 / 品名順で並び替え' : 'Sort by count or name'}
                  >
                    {traySortOrder === 'count-desc' ? (isJa ? '数量順' : 'Count') : traySortOrder === 'name-asc' ? (isJa ? '品名順' : 'Name') : (isJa ? '他' : 'Other')}
                  </button>
                </div>
              )}

              {/* View Mode Toggle (Single-row Horizontal Scroll vs Multi-row Grid) */}
              {unplacedItems.length > 2 && (
                <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 shadow-2xs text-[11px]">
                  <button
                    type="button"
                    id="tray-view-scroll-btn"
                    onClick={() => setTrayViewMode('scroll')}
                    className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer ${
                      trayViewMode === 'scroll' 
                        ? 'bg-slate-900 text-white shadow-2xs font-bold' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title={isJa ? '横スクロール表示 (ホイール・矢印操作対応)' : 'Horizontal scroll mode'}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{isJa ? '横スクロール' : 'Scroll'}</span>
                  </button>
                  <button
                    type="button"
                    id="tray-view-grid-btn"
                    onClick={() => setTrayViewMode('grid')}
                    className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer ${
                      trayViewMode === 'grid' 
                        ? 'bg-amber-500 text-slate-950 shadow-2xs font-bold' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title={isJa ? 'グリッド一覧展開 (大量の荷物を画面内に一括表示・縦スクロール)' : 'Grid view (Show all items)'}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{isJa ? 'グリッド展開' : 'Grid'}</span>
                  </button>
                </div>
              )}

              {/* Optional Quick Search Filter when items > 5 */}
              {unplacedItems.length > 5 && (
                <div className="relative flex items-center">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                  <input
                    type="text"
                    value={traySearchQuery}
                    onChange={(e) => setTraySearchQuery(e.target.value)}
                    placeholder={isJa ? '品名・SKU検索...' : 'Search...'}
                    className="pl-6 pr-2 py-0.5 text-[11px] bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 w-24 sm:w-28 transition-all"
                  />
                  {traySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTraySearchQuery('')}
                      className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {heldUnplacedItem && (
                <button
                  type="button"
                  onClick={cancelPlacementMode}
                  className="px-2.5 py-1 rounded bg-amber-200 hover:bg-amber-300 text-amber-950 text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                  title={isJa ? '配置モードをキャンセル (Esc / C / 右クリック)' : 'Cancel Placement Mode (Esc / C / Right-Click)'}
                >
                  <X className="w-3 h-3" />
                  <span>{isJa ? '配置キャンセル (Esc/C)' : 'Cancel (Esc/C)'}</span>
                </button>
              )}
              <button
                type="button"
                id="toggle-tray-collapse-btn"
                onClick={() => setIsTrayCollapsed(!isTrayCollapsed)}
                className="p-1 text-slate-500 hover:text-slate-800 transition-colors"
                title={isTrayCollapsed ? (isJa ? 'トレイを展開' : 'Expand Tray') : (isJa ? 'トレイを折りたたむ' : 'Collapse Tray')}
              >
                {isTrayCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Tray Body: Horizontally scrollable items or Expanded Grid */}
          {!isTrayCollapsed && (
            <div>
              {unplacedItems.length === 0 ? (
                <div className="p-3">
                  <div className="py-3 px-4 text-slate-600 text-xs flex flex-wrap items-center justify-between gap-3 w-full bg-slate-50/80 rounded-lg border border-dashed border-slate-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>
                        {isJa 
                          ? 'すべての貨物がコンテナ内に配置済みです。手動で載せ替えるには上のツールバーの「一括アンロード」ボタンをご利用ください。' 
                          : 'All items are currently loaded. To manually pack from scratch, use "Unload All" in the top toolbar.'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : sortedUnplacedItems.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  {isJa ? `「${traySearchQuery}」に一致する荷物が見つかりませんでした。` : `No unplaced items match "${traySearchQuery}".`}
                  <button 
                    type="button" 
                    onClick={() => setTraySearchQuery('')} 
                    className="ml-2 text-amber-600 underline font-semibold cursor-pointer"
                  >
                    {isJa ? '検索をクリア' : 'Clear search'}
                  </button>
                </div>
              ) : trayViewMode === 'scroll' ? (
                /* 1-Row Horizontal Scroll View with Left/Right Navigation Buttons and Wheel Support */
                <div className="relative flex items-center group/tray">
                  {/* Left Scroll Navigation Button */}
                  {sortedUnplacedItems.length > 2 && (
                    <button
                      type="button"
                      id="tray-scroll-left-btn"
                      onClick={() => handleScrollTray('left')}
                      disabled={!canScrollLeft}
                      className={`absolute left-1 z-20 p-1.5 rounded-full bg-white/95 text-slate-700 shadow-md border border-slate-200 transition-all cursor-pointer ${
                        canScrollLeft 
                          ? 'hover:bg-amber-100 hover:text-amber-950 hover:scale-110 active:scale-95 opacity-90 hover:opacity-100' 
                          : 'opacity-30 cursor-not-allowed'
                      }`}
                      title={isJa ? '左へスクロール (マウスホイールでもスクロール可能)' : 'Scroll Left (Mouse wheel also works)'}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}

                  <div 
                    ref={trayScrollContainerRef}
                    onScroll={checkTrayScrollBounds}
                    onWheel={handleTrayWheel}
                    className="p-2.5 px-9 overflow-x-auto flex items-center gap-2.5 max-h-36 scrollbar-thin w-full scroll-smooth select-none"
                  >
                    {sortedUnplacedItems.map((item, idx) => {
                      const isHeld = heldUnplacedItem?.unplaced.sku === item.sku;
                      const itemColor = getUnplacedItemColor(item);
                      return (
                        <div
                          key={`${item.sku}-${idx}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', item.sku);
                            draggedUnplacedRef.current = {
                              unplaced: item,
                              rotation: 0,
                              color: itemColor
                            };
                          }}
                          onDragEnd={() => {
                            draggedUnplacedRef.current = null;
                            setGhostCoords(null);
                          }}
                          onClick={() => {
                            if (isHeld) {
                              cancelPlacementMode();
                            } else {
                              const held = {
                                unplaced: item,
                                rotation: 0 as const,
                                color: itemColor
                              };
                              setHeldUnplacedItem(held);
                              heldUnplacedItemRef.current = held;
                              setIsDraggingExistingItem(null);
                              isDraggingExistingItemRef.current = null;
                              setInternalSelectedItem(null);
                              activeSelectedItemRef.current = null;
                              if (onSelectItem) onSelectItem(null);
                              showToast(isJa 
                                ? `「${item.name}」を選択しました。3D画面内をクリックで配置 (Esc / C でキャンセル)` 
                                : `Selected "${item.name}". Click in 3D to place (Esc / C to cancel)`);
                            }
                          }}
                          className={`shrink-0 flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all duration-150 select-none ${
                            isHeld
                              ? 'bg-amber-100/90 border-amber-500 shadow-md ring-2 ring-amber-400 scale-[1.02]'
                              : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-xs'
                          }`}
                          style={{ minWidth: '195px' }}
                        >
                          <div 
                            className="w-5 h-5 rounded-md shrink-0 border border-black/10 flex items-center justify-center text-white shadow-2xs"
                            style={{ backgroundColor: itemColor }}
                          >
                            <Box className="w-3 h-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-slate-900 truncate text-[11px]">{item.name}</span>
                              <span className="bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded font-mono font-bold text-[10px]">
                                x{item.count}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between gap-1 mt-0.5">
                              <span className="truncate">{formatDimensions(item.dimensions.length, item.dimensions.width, item.dimensions.height, unitSystem, true)}</span>
                              <span className={`px-1.5 py-0.2 rounded font-bold shrink-0 ${
                                traySortOrder.startsWith('weight') 
                                  ? 'bg-amber-100 text-amber-950 border border-amber-300' 
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {item.weight}kg
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 text-slate-400 hover:text-slate-700">
                            <Move className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right Scroll Navigation Button */}
                  {sortedUnplacedItems.length > 2 && (
                    <button
                      type="button"
                      id="tray-scroll-right-btn"
                      onClick={() => handleScrollTray('right')}
                      disabled={!canScrollRight}
                      className={`absolute right-1 z-20 p-1.5 rounded-full bg-white/95 text-slate-700 shadow-md border border-slate-200 transition-all cursor-pointer ${
                        canScrollRight 
                          ? 'hover:bg-amber-100 hover:text-amber-950 hover:scale-110 active:scale-95 opacity-90 hover:opacity-100' 
                          : 'opacity-30 cursor-not-allowed'
                      }`}
                      title={isJa ? '右へスクロール (マウスホイールでもスクロール可能)' : 'Scroll Right (Mouse wheel also works)'}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                /* Multi-row Expanded Grid View (allows browsing all items cleanly) */
                <div 
                  ref={trayScrollContainerRef}
                  className="p-3 overflow-y-auto max-h-60 sm:max-h-72 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 scrollbar-thin w-full"
                >
                  {sortedUnplacedItems.map((item, idx) => {
                    const isHeld = heldUnplacedItem?.unplaced.sku === item.sku;
                    const itemColor = getUnplacedItemColor(item);
                    return (
                      <div
                        key={`grid-${item.sku}-${idx}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', item.sku);
                          draggedUnplacedRef.current = {
                            unplaced: item,
                            rotation: 0,
                            color: itemColor
                          };
                        }}
                        onDragEnd={() => {
                          draggedUnplacedRef.current = null;
                          setGhostCoords(null);
                        }}
                        onClick={() => {
                          if (isHeld) {
                            cancelPlacementMode();
                          } else {
                            const held = {
                              unplaced: item,
                              rotation: 0 as const,
                              color: itemColor
                            };
                            setHeldUnplacedItem(held);
                            heldUnplacedItemRef.current = held;
                            setIsDraggingExistingItem(null);
                            isDraggingExistingItemRef.current = null;
                            setInternalSelectedItem(null);
                            activeSelectedItemRef.current = null;
                            if (onSelectItem) onSelectItem(null);
                            showToast(isJa 
                              ? `「${item.name}」を選択しました。3D画面内をクリックで配置 (Esc / C でキャンセル)` 
                              : `Selected "${item.name}". Click in 3D to place (Esc / C to cancel)`);
                          }
                        }}
                        className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all duration-150 select-none w-full ${
                          isHeld
                            ? 'bg-amber-100/90 border-amber-500 shadow-md ring-2 ring-amber-400 scale-[1.01]'
                            : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-xs'
                        }`}
                      >
                        <div 
                          className="w-5 h-5 rounded-md shrink-0 border border-black/10 flex items-center justify-center text-white shadow-2xs"
                          style={{ backgroundColor: itemColor }}
                        >
                          <Box className="w-3 h-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-slate-900 truncate text-[11px]">{item.name}</span>
                            <span className="bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded font-mono font-bold text-[10px]">
                              x{item.count}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between gap-1 mt-0.5">
                            <span className="truncate">{formatDimensions(item.dimensions.length, item.dimensions.width, item.dimensions.height, unitSystem, true)}</span>
                            <span className={`px-1.5 py-0.2 rounded font-bold shrink-0 ${
                              traySortOrder.startsWith('weight') 
                                ? 'bg-amber-100 text-amber-950 border border-amber-300' 
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {item.weight}kg
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 text-slate-400 hover:text-slate-700">
                          <Move className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white text-xs px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Active Key Hold Acceleration HUD */}
      {isManualMode && activeSpeedMultiplier > 1 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-amber-500/95 text-white font-bold text-xs px-3.5 py-1.5 rounded-full shadow-xl border border-amber-300/60 backdrop-blur-sm flex items-center gap-1.5 animate-in fade-in zoom-in-95 pointer-events-none">
          <span className="text-sm">⚡</span>
          <span>{isJa ? `長押し高速移動: ${activeSpeedMultiplier}x 速` : `Key Hold Speed: ${activeSpeedMultiplier}x`}</span>
          <span className="text-[10px] bg-black/25 px-1.5 py-0.5 rounded-full font-mono text-amber-100">
            ±{formatMeters((gridSnapMm || 50) * activeSpeedMultiplier)}m
          </span>
        </div>
      )}

      {/* Software Calculation in Progress 3D Viewport Overlay */}
      {isCalculating && (
        <div 
          id="viewer-3d-calculating-overlay"
          className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center text-white pointer-events-none transition-all duration-200"
        >
          <div className="p-4 sm:p-5 bg-slate-900/95 rounded-2xl border border-slate-700/80 shadow-2xl flex flex-col items-center gap-3 max-w-xs text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="relative flex items-center justify-center">
              <div className="w-10 h-10 border-3 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
              <Box className="w-4 h-4 text-blue-400 absolute" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-100 flex items-center justify-center gap-1.5">
                <span>{isJa ? '3D積載 最適化演算実行中' : '3D Packing Optimization in Progress'}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                {isJa ? '空間配置・物理干渉・重心バランシング計算中...' : 'Evaluating 3D space, interference & balance...'}
              </p>
            </div>
            <div className="w-36 bg-slate-800 h-1 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full w-2/3 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      )}
      {/* Keyboard Shortcuts Help Modal */}
      <ManualShortcutsHelpModal
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        language={language}
      />
    </div>
  );
};
