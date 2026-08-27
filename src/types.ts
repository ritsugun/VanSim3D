export type UnitSystem = 'metric' | 'imperial';
export type Language = 'ja' | 'en';

export type AlgorithmType = 
  | 'extreme_points_bfd' 
  | 'wall_building' 
  | 'layer_stacking' 
  | 'weight_balanced';

export interface Container {
  id: string;
  name: string;
  category: 'iso_sea' | 'truck' | 'pallet' | 'custom';
  length: number; // mm
  width: number;  // mm
  height: number; // mm
  maxWeight: number; // kg
  tareWeight: number; // kg
  costEstimate?: number; // USD / JPY
  color?: string;
  description?: string;
}

export interface CargoItem {
  id: string;
  sku: string;
  name: string;
  length: number; // mm (奥行 / 奥行き / Depth / Length)
  width: number;  // mm (幅 / Width)
  height: number; // mm (高さ / Height)
  weight: number; // kg
  quantity: number;
  minQuantity?: number; // 最小個数
  maxQuantity?: number; // 最大個数
  color: string;
  allowTilt: boolean;  // Allow rotation along X
  allowRoll: boolean;  // Allow rotation along Y
  allowYaw: boolean;   // Allow rotation along Z (standard 90 deg yaw)
  maxStackWeight?: number; // kg that can be placed on top of this item
  fragile?: boolean;   // If fragile, nothing can be stacked on top (or max stack weight = 0)
  priority?: number;   // 1 = High / Load first (or unload last), 3 = Normal, 5 = Unload first (at door)
  group?: string;
}

export interface PackedItem {
  id: string;
  cargoItemId: string;
  sku: string;
  name: string;
  x: number; // mm (from front-bottom-left: X=Length, Y=Width, Z=Height)
  y: number; // mm
  z: number; // mm
  length: number; // mm (oriented)
  width: number;  // mm (oriented)
  height: number; // mm (oriented)
  weight: number; // kg
  color: string;
  fragile: boolean;
  sequenceNumber: number; // 1, 2, 3... loading sequence
  stepIndex: number;
  rotationIndex: number; // 0..5
  containerIndex: number; // 0 for primary container
  layer: number;
}

export interface UnplacedItem {
  cargoItemId: string;
  sku: string;
  name: string;
  reason: 'exceeds_weight' | 'no_spatial_fit' | 'stacking_constraint';
  dimensions: { length: number; width: number; height: number };
  weight: number;
  count: number;
}

export interface PackingMetrics {
  containerVolumeCbm: number;
  packedVolumeCbm: number;
  freeVolumeCbm: number;
  volumeUtilization: number; // %
  
  containerMaxWeightKg: number;
  packedWeightKg: number;
  weightUtilization: number; // %
  
  totalItemCount: number;
  packedCount: number;
  unplacedCount: number;
  
  centerOfGravity: {
    x: number; // mm
    y: number; // mm
    z: number; // mm
    offsetXPercent: number; // offset from center (-50% to +50%)
    offsetYPercent: number; // offset from center (-50% to +50%)
    offsetZPercent: number; // offset from height center
  };
  
  axleDistribution: {
    frontAxlePercent: number;
    rearAxlePercent: number;
    frontAxleKg: number;
    rearAxleKg: number;
  };
  
  calculationTimeMs: number;
  algorithm: AlgorithmType;
  containersNeeded: number;
}

export interface ContainerLoad {
  containerIndex: number;
  container: Container;
  packedItems: PackedItem[];
  metrics: PackingMetrics;
}

export interface OverallPackingMetrics {
  totalContainers: number;
  totalCapacityVolumeCbm: number;
  totalPackedVolumeCbm: number;
  totalCapacityWeightKg: number;
  totalPackedWeightKg: number;
  overallVolumeUtilization: number;
  overallWeightUtilization: number;
  totalItemCount: number;
  totalPackedCount: number;
  totalUnplacedCount: number;
  totalCostEstimate?: number;
  totalContainersCount?: number;
  totalItemsCount?: number;
}

export interface PackingResult {
  container: Container;
  containers: ContainerLoad[];
  packedItems: PackedItem[];
  unplacedItems: UnplacedItem[];
  metrics: PackingMetrics;
  overallMetrics?: OverallPackingMetrics;
}

export interface AiConsultantResponse {
  score: number;
  scoreTitle: string;
  summary: string;
  stabilityAnalysis: string;
  dunnageAdvice: string;
  actionableTips: string[];
}
