import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Container, PackedItem, UnitSystem, Language } from '../types';
import { 
  Play, Pause, SkipBack, SkipForward, RotateCcw, 
  Eye, Layers, Camera, Maximize2, ShieldAlert, 
  Compass, Crosshair, Sparkles, SlidersHorizontal, Info, Box
} from 'lucide-react';
import { formatDimensions, formatCoordinates, formatWeightCompact } from '../utils/units';

interface ContainerViewer3DProps {
  container: Container;
  packedItems: PackedItem[];
  centerOfGravity: { x: number; y: number; z: number };
  unitSystem: UnitSystem;
  language: Language;
  onSelectItem?: (item: PackedItem | null) => void;
  selectedItem?: PackedItem | null;
}

export const ContainerViewer3D: React.FC<ContainerViewer3DProps> = ({
  container,
  packedItems,
  centerOfGravity,
  unitSystem,
  language,
  onSelectItem,
  selectedItem: externalSelectedItem
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boxMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const cogMeshRef = useRef<THREE.Group | null>(null);
  const containerGroupRef = useRef<THREE.Group | null>(null);

  // Interaction & Display States
  const [currentStep, setCurrentStep] = useState<number>(packedItems.length);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showCoG, setShowCoG] = useState<boolean>(true);
  const [showWireframeOnly, setShowWireframeOnly] = useState<boolean>(false);
  const [showDimensions, setShowDimensions] = useState<boolean>(true);
  const [colorMode, setColorMode] = useState<'cargo' | 'weight' | 'sequence'>('cargo');
  const [zSlicePercent, setZSlicePercent] = useState<number>(100);
  const [xSlicePercent, setXSlicePercent] = useState<number>(100);
  const [hoveredItem, setHoveredItem] = useState<PackedItem | null>(null);
  const [internalSelectedItem, setInternalSelectedItem] = useState<PackedItem | null>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  const activeSelectedItem = externalSelectedItem || internalSelectedItem;

  // Max weight for weight color mapping
  const maxItemWeight = useMemo(() => {
    return Math.max(1, ...packedItems.map(p => p.weight));
  }, [packedItems]);

  // Sync currentStep when packedItems changes
  useEffect(() => {
    setCurrentStep(packedItems.length);
    setIsPlaying(false);
  }, [packedItems]);

  // Playback timer
  useEffect(() => {
    let interval: any = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= packedItems.length) {
            setIsPlaying(false);
            return packedItems.length;
          }
          return prev + 1;
        });
      }, 400 / playbackSpeed);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, playbackSpeed, packedItems.length]);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 560;

    // Scale down mm to meters for Three.js coordinates (1 meter = 1000 mm = 1.0 unit in 3D)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc); // Slate 50 clean neutral background
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Don't go below floor
    controlsRef.current = controls;

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(10, 20, 15);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.45);
    dirLight2.position.set(-15, 10, -10);
    scene.add(dirLight2);

    // Initial Camera Position
    const contLengthM = container.length / 1000;
    const contHeightM = container.height / 1000;
    const contWidthM = container.width / 1000;

    camera.position.set(contLengthM * 1.5, contHeightM * 1.8, contWidthM * 2.2);
    controls.target.set(contLengthM / 2, contHeightM / 2, contWidthM / 2);
    controls.update();

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
      cameraRef.current.aspect = newW / newH;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newW, newH);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, []);

  // Update Container Geometry & Visual Walls
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (containerGroupRef.current) {
      scene.remove(containerGroupRef.current);
    }

    const cGroup = new THREE.Group();
    containerGroupRef.current = cGroup;

    const lenM = container.length / 1000;
    const widM = container.width / 1000;
    const heiM = container.height / 1000;

    // Floor Plane
    const floorGeo = new THREE.PlaneGeometry(lenM, widM);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0, // Slate 200 clean floor
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = Math.PI / 2;
    floorMesh.position.set(lenM / 2, 0, widM / 2);
    floorMesh.receiveShadow = true;
    cGroup.add(floorMesh);

    // Floor Grid lines (every 1m)
    const gridHelper = new THREE.GridHelper(Math.max(lenM, widM) * 1.5, 30, 0x94a3b8, 0xcbd5e1);
    gridHelper.position.set(lenM / 2, -0.005, widM / 2);
    cGroup.add(gridHelper);

    // Bounding Box Outline (Wireframe container)
    const boxGeo = new THREE.BoxGeometry(lenM, heiM, widM);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2563eb, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.position.set(lenM / 2, heiM / 2, widM / 2);
    cGroup.add(wireframe);

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
    wallMesh.position.set(lenM / 2, heiM / 2, widM / 2);
    cGroup.add(wallMesh);

    // Cargo Door Indicator at the front (X = Length)
    const doorFrameGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(lenM, 0, 0),
      new THREE.Vector3(lenM, heiM, 0),
      new THREE.Vector3(lenM, heiM, widM),
      new THREE.Vector3(lenM, 0, widM),
      new THREE.Vector3(lenM, 0, 0)
    ]);
    const doorMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 3 });
    const doorLines = new THREE.Line(doorFrameGeo, doorMat);
    cGroup.add(doorLines);

    // Dimension labels / markers
    // Origin marker (0,0,0)
    const originAxes = new THREE.AxesHelper(Math.min(lenM, widM, heiM) * 0.4);
    originAxes.position.set(0, 0.01, 0);
    cGroup.add(originAxes);

    scene.add(cGroup);

    // Re-center camera controls target
    if (controlsRef.current && cameraRef.current) {
      controlsRef.current.target.set(lenM / 2, heiM / 2, widM / 2);
      controlsRef.current.update();
    }
  }, [container]);

  // Update Cargo Box Meshes in Three.js Scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old box meshes
    boxMeshesRef.current.forEach(mesh => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    boxMeshesRef.current.clear();

    const maxZLimit = (container.height * zSlicePercent) / 100;
    const maxXLimit = (container.length * xSlicePercent) / 100;

    packedItems.slice(0, currentStep).forEach((item) => {
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

      const isSelected = activeSelectedItem?.id === item.id;
      const isHovered = hoveredItem?.id === item.id;

      // Color mapping
      let boxColor = new THREE.Color(item.color || '#3b82f6');
      if (colorMode === 'weight') {
        // Gradient from Green (Light) to Red (Heavy)
        const weightRatio = item.weight / maxItemWeight;
        boxColor = new THREE.Color().setHSL(0.33 * (1 - weightRatio), 0.85, 0.5);
      } else if (colorMode === 'sequence') {
        // Gradient along sequence
        const seqRatio = item.sequenceNumber / Math.max(1, packedItems.length);
        boxColor = new THREE.Color().setHSL(seqRatio * 0.8, 0.8, 0.5);
      }

      if (isSelected) {
        boxColor = new THREE.Color(0xfacc15); // Vibrant Yellow for selection
      } else if (isHovered) {
        boxColor = boxColor.clone().offsetHSL(0, 0, 0.15);
      }

      const boxGeo = new THREE.BoxGeometry(lenM, heiM, widM);
      const boxMat = new THREE.MeshStandardMaterial({
        color: boxColor,
        roughness: 0.4,
        metalness: 0.1,
        wireframe: showWireframeOnly,
        transparent: isHovered || isSelected,
        opacity: isHovered || isSelected ? 0.92 : 1.0
      });

      const mesh = new THREE.Mesh(boxGeo, boxMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Position: Center of the box in Three.js coordinates
      // X = Length, Y = Height in 3D, Z = Width in 3D
      mesh.position.set(
        xM + lenM / 2,
        zM + heiM / 2,
        yM + widM / 2
      );
      mesh.userData = { packedItem: item };

      // Add crisp edges outline
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      const edgeLineMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0x000000 : 0x1e293b,
        linewidth: isSelected ? 3 : 1
      });
      const edgeLines = new THREE.LineSegments(edgesGeo, edgeLineMat);
      mesh.add(edgeLines);

      scene.add(mesh);
      boxMeshesRef.current.set(item.id, mesh);
    });
  }, [
    packedItems, currentStep, colorMode, showWireframeOnly, 
    zSlicePercent, xSlicePercent, hoveredItem, activeSelectedItem, 
    maxItemWeight, container
  ]);

  // Center of Gravity 3D Marker
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (cogMeshRef.current) {
      scene.remove(cogMeshRef.current);
    }

    if (!showCoG || packedItems.length === 0) return;

    const cogGroup = new THREE.Group();
    cogMeshRef.current = cogGroup;

    const cogXM = centerOfGravity.x / 1000;
    const cogYM = centerOfGravity.y / 1000;
    const cogZM = centerOfGravity.z / 1000;

    // Glowing Sphere
    const sphereGeo = new THREE.SphereGeometry(0.12, 24, 24);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Red
      emissive: 0xef4444,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    sphereMesh.position.set(cogXM, cogZM, cogYM);
    cogGroup.add(sphereMesh);

    // Floor Target Shadow / Crosshair
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
    cogGroup.add(targetMesh);

    // Vertical line connecting sphere to floor target
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
    cogGroup.add(line);

    scene.add(cogGroup);
  }, [centerOfGravity, showCoG, packedItems.length]);

  // Raycasting for Mouse Hover & Click
  useEffect(() => {
    const containerEl = containerRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!containerEl || !camera || !scene) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseMove = (event: MouseEvent) => {
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
        containerEl.style.cursor = 'pointer';
      } else {
        setHoveredItem(null);
        containerEl.style.cursor = 'default';
      }
    };

    const handleClick = (event: MouseEvent) => {
      const rect = containerEl.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes: THREE.Object3D[] = Array.from(boxMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const targetMesh = intersects[0].object as THREE.Mesh;
        const item = targetMesh.userData.packedItem as PackedItem;
        setInternalSelectedItem(item);
        if (onSelectItem) onSelectItem(item);
      } else {
        setInternalSelectedItem(null);
        if (onSelectItem) onSelectItem(null);
      }
    };

    containerEl.addEventListener('mousemove', handleMouseMove);
    containerEl.addEventListener('click', handleClick);

    return () => {
      containerEl.removeEventListener('mousemove', handleMouseMove);
      containerEl.removeEventListener('click', handleClick);
    };
  }, [onSelectItem]);

  // Camera preset views
  const setCameraView = (type: 'iso' | 'top' | 'side' | 'front' | 'door') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const lenM = container.length / 1000;
    const widM = container.width / 1000;
    const heiM = container.height / 1000;
    const target = new THREE.Vector3(lenM / 2, heiM / 2, widM / 2);
    controlsRef.current.target.copy(target);

    if (type === 'iso') {
      cameraRef.current.position.set(lenM * 1.5, heiM * 1.8, widM * 2.2);
    } else if (type === 'top') {
      cameraRef.current.position.set(lenM / 2, heiM * 3.5, widM / 2 + 0.001);
    } else if (type === 'side') {
      cameraRef.current.position.set(lenM / 2, heiM / 2, widM * 3.2);
    } else if (type === 'front') {
      // Rear/Front view looking down length
      cameraRef.current.position.set(-lenM * 1.5, heiM / 2, widM / 2);
    } else if (type === 'door') {
      // Looking directly into the open cargo doors (X = Length)
      cameraRef.current.position.set(lenM * 2.4, heiM * 0.8, widM / 2);
    }
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

  const isJa = language === 'ja';

  return (
    <div 
      id="container-viewer-3d-root" 
      className={`relative flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs text-slate-800 ${
        isFullScreen ? 'fixed inset-0 z-50 rounded-none' : 'w-full h-full min-h-[580px]'
      }`}
    >
      {/* 3D Canvas Viewport */}
      <div 
        ref={containerRef} 
        className="w-full flex-1 relative bg-slate-50 select-none outline-none"
      />

      {/* Top Floating View Controls & Quick Badges */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none gap-2 flex-wrap z-10">
        <div className="flex items-center gap-2 pointer-events-auto bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm text-xs text-slate-800">
          <Box className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-slate-900">{container.name}</span>
          <span className="text-slate-300">|</span>
          <span className="text-emerald-600 font-mono font-bold">
            {packedItems.length} {isJa ? '個 積載完了' : 'Boxes Loaded'}
          </span>
        </div>

        {/* Camera Preset Toolbar */}
        <div className="flex items-center gap-1 pointer-events-auto bg-white/90 backdrop-blur-md p-1 rounded-lg border border-slate-200 shadow-sm text-xs">
          <button
            id="camera-view-iso-btn"
            onClick={() => setCameraView('iso')}
            title={isJa ? '斜視図 (3D Isometric)' : '3D Isometric'}
            className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1 font-semibold"
          >
            <Compass className="w-3.5 h-3.5 text-blue-600" />
            <span>3D</span>
          </button>
          <button
            id="camera-view-top-btn"
            onClick={() => setCameraView('top')}
            title={isJa ? '上面図 (Top Plan)' : 'Top Plan'}
            className="px-2.5 py-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors font-medium"
          >
            {isJa ? '天面' : 'Top'}
          </button>
          <button
            id="camera-view-side-btn"
            onClick={() => setCameraView('side')}
            title={isJa ? '側面図 (Side View)' : 'Side View'}
            className="px-2.5 py-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors font-medium"
          >
            {isJa ? '側面' : 'Side'}
          </button>
          <button
            id="camera-view-door-btn"
            onClick={() => setCameraView('door')}
            title={isJa ? '扉側 (Door Entrance)' : 'Door'}
            className="px-2.5 py-1 rounded-md hover:bg-slate-100 text-amber-600 transition-colors font-medium"
          >
            {isJa ? '扉側' : 'Door'}
          </button>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button
            id="toggle-cog-btn"
            onClick={() => setShowCoG(!showCoG)}
            title={isJa ? '重心マーカー表示切替' : 'Toggle Center of Gravity'}
            className={`p-1.5 rounded-md transition-colors ${showCoG ? 'bg-red-50 text-red-600 border border-red-200' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            id="snapshot-3d-btn"
            onClick={captureSnapshot}
            title={isJa ? '3D画像保存 (PNG)' : 'Save 3D Snapshot'}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <Camera className="w-3.5 h-3.5 text-blue-600" />
          </button>
          <button
            id="fullscreen-3d-btn"
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isJa ? '全画面表示' : 'Full Screen'}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Floating Hover/Selected Box Inspector Card */}
      {(hoveredItem || activeSelectedItem) && (
        <div className="absolute top-16 left-3 pointer-events-auto bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 shadow-xl text-xs max-w-xs z-20 animate-fade-in text-slate-800">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span 
                className="w-3 h-3 rounded-full shrink-0 border border-black/10" 
                style={{ backgroundColor: (activeSelectedItem || hoveredItem)?.color }} 
              />
              <span className="font-bold text-slate-900 truncate">
                {(activeSelectedItem || hoveredItem)?.name}
              </span>
            </div>
            <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border border-blue-200">
              #{(activeSelectedItem || hoveredItem)?.sequenceNumber}
            </span>
          </div>

          {(() => {
            const target = activeSelectedItem || hoveredItem;
            if (!target) return null;
            const coords = formatCoordinates(target.x, target.y, target.z, unitSystem);
            return (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-600">
                <div>
                  <span className="text-slate-400 block">{isJa ? 'SKU / 識別:' : 'SKU:'}</span>
                  <span className="font-mono font-semibold text-slate-800">{target.sku}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">{isJa ? '単体重量:' : 'Weight:'}</span>
                  <span className="font-mono font-bold text-emerald-600">
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
                  <span className="font-mono text-slate-800 font-medium">
                    {coords.x}, {coords.y}, {coords.z}
                  </span>
                </div>
              </div>
            );
          })()}

          {(activeSelectedItem || hoveredItem)?.fragile && (
            <div className="mt-2.5 flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded text-[10px] font-semibold">
              <ShieldAlert className="w-3 h-3 text-red-600 shrink-0" />
              <span>{isJa ? '天地無用 / 割れ物 (上に積載不可)' : 'Fragile / Do Not Stack On Top'}</span>
            </div>
          )}
        </div>
      )}

      {/* Layer Slicing & X-Ray Sliders (Floating Right) */}
      <div className="absolute top-16 right-3 pointer-events-auto bg-white/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-200 shadow-md text-xs space-y-3 z-10 w-44 text-slate-700">
        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
            <span className="flex items-center gap-1 font-medium">
              <Layers className="w-3 h-3 text-blue-600" />
              {isJa ? '高さ断面 (Z)' : 'Height Slice (Z)'}
            </span>
            <span className="font-mono text-slate-800 font-bold">{zSlicePercent}%</span>
          </div>
          <input
            id="z-slice-slider"
            type="range"
            min="10"
            max="100"
            value={zSlicePercent}
            onChange={(e) => setZSlicePercent(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
            <span className="flex items-center gap-1 font-medium">
              <SlidersHorizontal className="w-3 h-3 text-emerald-600" />
              {isJa ? '奥行断面 (X)' : 'Depth Slice (X)'}
            </span>
            <span className="font-mono text-slate-800 font-bold">{xSlicePercent}%</span>
          </div>
          <input
            id="x-slice-slider"
            type="range"
            min="10"
            max="100"
            value={xSlicePercent}
            onChange={(e) => setXSlicePercent(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
          />
        </div>

        {/* Color Mode Switcher */}
        <div className="border-t border-slate-200 pt-2">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-semibold">
            {isJa ? '配色モード' : 'Color Scheme'}
          </span>
          <div className="grid grid-cols-3 gap-1 text-[10px]">
            <button
              onClick={() => setColorMode('cargo')}
              className={`py-1 rounded-md text-center transition-colors font-semibold ${
                colorMode === 'cargo' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isJa ? '種別' : 'Cargo'}
            </button>
            <button
              onClick={() => setColorMode('weight')}
              className={`py-1 rounded-md text-center transition-colors font-semibold ${
                colorMode === 'weight' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isJa ? '重量' : 'Weight'}
            </button>
            <button
              onClick={() => setColorMode('sequence')}
              className={`py-1 rounded-md text-center transition-colors font-semibold ${
                colorMode === 'sequence' ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isJa ? '順序' : 'Seq'}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Loading Sequence Player & Progress Controller */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs z-20 text-white">
        {/* Play / Step Buttons */}
        <div className="flex items-center gap-2">
          <button
            id="seq-reset-btn"
            onClick={() => {
              setIsPlaying(false);
              setCurrentStep(0);
            }}
            title={isJa ? '最初に戻る' : 'Reset to Start'}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            id="seq-prev-btn"
            onClick={() => {
              setIsPlaying(false);
              setCurrentStep(prev => Math.max(0, prev - 1));
            }}
            disabled={currentStep === 0}
            title={isJa ? '前の荷物' : 'Previous Step'}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            id="seq-play-pause-btn"
            onClick={() => {
              if (currentStep >= packedItems.length) {
                setCurrentStep(0);
              }
              setIsPlaying(!isPlaying);
            }}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                <span>{isJa ? '一時停止' : 'Pause'}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>{isJa ? '積載シミュレーション再生' : 'Play Load'}</span>
              </>
            )}
          </button>
          <button
            id="seq-next-btn"
            onClick={() => {
              setIsPlaying(false);
              setCurrentStep(prev => Math.min(packedItems.length, prev + 1));
            }}
            disabled={currentStep >= packedItems.length}
            title={isJa ? '次の荷物' : 'Next Step'}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Speed Selector */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 text-[11px] font-semibold text-slate-300">
            {[1, 2, 4].map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-0.5 rounded ${playbackSpeed === speed ? 'bg-blue-600 text-white' : 'hover:text-white'}`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Step Slider & Numeric Progress */}
        <div className="flex-1 w-full flex items-center gap-3 max-w-xl">
          <span className="text-slate-400 text-[11px] whitespace-nowrap">
            {isJa ? '積込手順:' : 'Step:'}
          </span>
          <input
            id="loading-step-slider"
            type="range"
            min="0"
            max={packedItems.length}
            value={currentStep}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentStep(Number(e.target.value));
            }}
            className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="font-mono text-white font-bold text-xs whitespace-nowrap min-w-[56px] text-right">
            {currentStep} / {packedItems.length}
          </span>
        </div>
      </div>
    </div>
  );
};
