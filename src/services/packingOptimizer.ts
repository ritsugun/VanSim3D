import { Container, CargoItem, PackedItem, UnplacedItem, PackingResult, AlgorithmType, ContainerLoad, OverallPackingMetrics } from '../types';

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface BoxOrientation {
  length: number;
  width: number;
  height: number;
  rotationIndex: number;
}

interface UnpackedInstance {
  instanceId: string;
  item: CargoItem;
  volume: number;
  baseArea: number;
}

/**
 * Generates all permitted orientations for a cargo item based on horizontal rotation flag.
 * Vertical rotation (changing height/tilting) is strictly prohibited.
 */
function getValidOrientations(item: CargoItem): BoxOrientation[] {
  const { length: l, width: w, height: h } = item;
  const orientations: BoxOrientation[] = [];
  const added = new Set<string>();

  const pushUnique = (len: number, wid: number, hei: number, rotIndex: number) => {
    const key = `${len}x${wid}x${hei}`;
    if (!added.has(key)) {
      added.add(key);
      orientations.push({ length: len, width: wid, height: hei, rotationIndex: rotIndex });
    }
  };

  // Orientation 0: Original upright orientation (L, W, H)
  pushUnique(l, w, h, 0);

  // Horizontal / Yaw rotation (swap L and W, Height H remains strictly upright)
  // Allowed when allowYaw is true (or undefined by default)
  const canRotateHorizontal = item.allowYaw !== false;
  if (canRotateHorizontal) {
    pushUnique(w, l, h, 1);
  }

  // Note: Vertical rotations (Tilt / Roll) are disabled to ensure cargo is never stood on its side or flipped vertically.
  return orientations;
}

/**
 * Checks if a candidate box collides with any already placed item
 */
function checkCollision(
  cand: { x: number; y: number; z: number; length: number; width: number; height: number },
  placedItems: PackedItem[]
): boolean {
  const cX2 = cand.x + cand.length;
  const cY2 = cand.y + cand.width;
  const cZ2 = cand.z + cand.height;

  for (let i = 0; i < placedItems.length; i++) {
    const p = placedItems[i];
    const pX2 = p.x + p.length;
    const pY2 = p.y + p.width;
    const pZ2 = p.z + p.height;

    // Intersection test (strictly inside or overlapping)
    if (
      cand.x < pX2 && cX2 > p.x &&
      cand.y < pY2 && cY2 > p.y &&
      cand.z < pZ2 && cZ2 > p.z
    ) {
      return true; // Collision detected
    }
  }
  return false;
}

/**
 * Checks bottom support (Gravity constraint):
 * The item must either rest on the container floor (z === 0),
 * or have at least 60% of its bottom surface area supported by the tops of other items.
 * Also checks that no items directly beneath it are fragile or exceeding their maxStackWeight.
 */
function checkSupportAndStacking(
  cand: { x: number; y: number; z: number; length: number; width: number; height: number; weight: number },
  placedItems: PackedItem[]
): boolean {
  if (cand.z === 0) return true; // Direct floor support

  const candBaseArea = cand.length * cand.width;
  let supportedArea = 0;
  const candX2 = cand.x + cand.length;
  const candY2 = cand.y + cand.width;

  for (let i = 0; i < placedItems.length; i++) {
    const p = placedItems[i];
    const pZ2 = p.z + p.height;

    // Is item p directly beneath candidate? (within 1mm tolerance)
    if (Math.abs(pZ2 - cand.z) <= 1) {
      const pX2 = p.x + p.length;
      const pY2 = p.y + p.width;

      // Calculate intersection on the XY plane
      const overlapX = Math.max(0, Math.min(candX2, pX2) - Math.max(cand.x, p.x));
      const overlapY = Math.max(0, Math.min(candY2, pY2) - Math.max(cand.y, p.y));
      const overlapArea = overlapX * overlapY;

      if (overlapArea > 0) {
        // If supporting item is fragile, we cannot place anything on it!
        if (p.fragile) {
          return false;
        }
        supportedArea += overlapArea;
      }
    }
  }

  // Require at least 50% base area support to ensure physical stability
  return (supportedArea / candBaseArea) >= 0.50;
}

/**
 * Packs instances into a single container
 */
function packSingleContainer(
  container: Container,
  containerIndex: number,
  availableInstances: UnpackedInstance[],
  algorithm: AlgorithmType,
  startSequenceNumber: number
): {
  containerLoad: ContainerLoad;
  remainingInstances: UnpackedInstance[];
  placedInstancesCount: number;
} {
  // Sanitize container dimensions
  const safeLength = Math.max(100, Number(container.length) || 6000);
  const safeWidth = Math.max(100, Number(container.width) || 2400);
  const safeHeight = Math.max(100, Number(container.height) || 2400);
  const safeMaxWeight = Math.max(10, Number(container.maxWeight) || 20000);

  const safeContainer: Container = {
    ...container,
    length: safeLength,
    width: safeWidth,
    height: safeHeight,
    maxWeight: safeMaxWeight
  };

  const packedItems: PackedItem[] = [];
  const remainingInstances: UnpackedInstance[] = [];
  let currentTotalWeight = 0;

  // Extreme Points Set (initialized at origin [0, 0, 0])
  let extremePoints: Point3D[] = [{ x: 0, y: 0, z: 0 }];

  const sortPoints = (pts: Point3D[]) => {
    pts.sort((a, b) => {
      if (algorithm === 'wall_building') {
        if (a.x !== b.x) return a.x - b.x;
        if (a.z !== b.z) return a.z - b.z;
        return a.y - b.y;
      } else if (algorithm === 'weight_balanced') {
        const aDistY = Math.abs(a.y - safeContainer.width / 2);
        const bDistY = Math.abs(b.y - safeContainer.width / 2);
        if (a.z !== b.z) return a.z - b.z;
        if (a.x !== b.x) return a.x - b.x;
        return aDistY - bDistY;
      } else if (algorithm === 'layer_stacking') {
        if (a.z !== b.z) return a.z - b.z;
        if (a.x !== b.x) return a.x - b.x;
        return a.y - b.y;
      } else {
        // Extreme Points Best Fit: prioritize bottom (z), then back (x), then left (y)
        if (a.z !== b.z) return a.z - b.z;
        if (a.x !== b.x) return a.x - b.x;
        return a.y - b.y;
      }
    });
  };

  const addExtremePoint = (x: number, y: number, z: number) => {
    // Validate bounds
    if (x < 0 || y < 0 || z < 0) return;
    if (x >= safeContainer.length || y >= safeContainer.width || z >= safeContainer.height) return;

    // Check if point already exists
    for (let i = 0; i < extremePoints.length; i++) {
      const ep = extremePoints[i];
      if (Math.abs(ep.x - x) < 2 && Math.abs(ep.y - y) < 2 && Math.abs(ep.z - z) < 2) return;
    }

    // Ensure point is not strictly inside an existing placed box
    for (let i = 0; i < packedItems.length; i++) {
      const p = packedItems[i];
      if (
        x >= p.x && x < p.x + p.length &&
        y >= p.y && y < p.y + p.width &&
        z >= p.z && z < p.z + p.height
      ) {
        return; // Inside a box
      }
    }

    extremePoints.push({ x, y, z });
  };

  // Iterate through available instances
  for (let i = 0; i < availableInstances.length; i++) {
    const inst = availableInstances[i];
    const cargo = inst.item;

    // Validate cargo dimensions
    const cL = Math.max(10, Number(cargo.length) || 100);
    const cW = Math.max(10, Number(cargo.width) || 100);
    const cH = Math.max(10, Number(cargo.height) || 100);
    const cWt = Math.max(0.1, Number(cargo.weight) || 1);

    const safeCargo = { ...cargo, length: cL, width: cW, height: cH, weight: cWt };

    // Check weight limit
    if (currentTotalWeight + safeCargo.weight > safeContainer.maxWeight) {
      remainingInstances.push(inst);
      continue;
    }

    // Quick fit check: if min dimension is larger than container max dimension, skip
    const minItemDim = Math.min(cL, cW, cH);
    const maxContDim = Math.max(safeContainer.length, safeContainer.width, safeContainer.height);
    if (minItemDim > maxContDim) {
      remainingInstances.push(inst);
      continue;
    }

    const orientations = getValidOrientations(safeCargo);
    let bestPlacement: {
      point: Point3D;
      orientation: BoxOrientation;
      score: number;
    } | null = null;

    // Test active extreme points (up to 250 points)
    const pointsToTest = extremePoints.slice(0, 250);

    // Test extreme points and orientations
    for (let pIdx = 0; pIdx < pointsToTest.length; pIdx++) {
      const pt = pointsToTest[pIdx];

      for (let oIdx = 0; oIdx < orientations.length; oIdx++) {
        const ori = orientations[oIdx];

        // Container boundary check
        if (
          pt.x + ori.length > safeContainer.length ||
          pt.y + ori.width > safeContainer.width ||
          pt.z + ori.height > safeContainer.height
        ) {
          continue;
        }

        const candidate = {
          x: pt.x,
          y: pt.y,
          z: pt.z,
          length: ori.length,
          width: ori.width,
          height: ori.height,
          weight: safeCargo.weight
        };

        // Collision check
        if (checkCollision(candidate, packedItems)) {
          continue;
        }

        // Support and stacking check
        if (!checkSupportAndStacking(candidate, packedItems)) {
          continue;
        }

        // Score based on position (favoring low Z, low X, low Y)
        const cornerDistScore = (pt.z * 10.0) + (pt.x * 1.5) + (pt.y * 1.0);
        const score = cornerDistScore;

        if (!bestPlacement || score < bestPlacement.score) {
          bestPlacement = {
            point: pt,
            orientation: ori,
            score
          };
        }
      }
    }

    if (bestPlacement) {
      const { point, orientation } = bestPlacement;
      const layerNumber = Math.floor(point.z / (orientation.height || 100)) + 1;

      const newPackedItem: PackedItem = {
        id: `packed_c${containerIndex + 1}_${packedItems.length + 1}`,
        cargoItemId: safeCargo.id,
        sku: safeCargo.sku,
        name: safeCargo.name,
        x: point.x,
        y: point.y,
        z: point.z,
        length: orientation.length,
        width: orientation.width,
        height: orientation.height,
        weight: safeCargo.weight,
        color: safeCargo.color,
        fragile: !!safeCargo.fragile,
        sequenceNumber: startSequenceNumber + packedItems.length + 1,
        stepIndex: packedItems.length,
        rotationIndex: orientation.rotationIndex,
        containerIndex,
        layer: layerNumber
      };

      packedItems.push(newPackedItem);
      currentTotalWeight += safeCargo.weight;

      // Add extreme points around newly placed item
      const pX2 = point.x + orientation.length;
      const pY2 = point.y + orientation.width;
      const pZ2 = point.z + orientation.height;

      addExtremePoint(pX2, point.y, point.z);
      addExtremePoint(point.x, pY2, point.z);
      addExtremePoint(point.x, point.y, pZ2);
      addExtremePoint(pX2, pY2, point.z);
      addExtremePoint(pX2, point.y, pZ2);
      addExtremePoint(point.x, pY2, pZ2);

      // Project corner points against surrounding placed boxes
      for (let k = 0; k < packedItems.length - 1; k++) {
        const other = packedItems[k];
        const oX2 = other.x + other.length;
        const oY2 = other.y + other.width;
        const oZ2 = other.z + other.height;

        if (oX2 <= safeContainer.length) addExtremePoint(oX2, point.y, point.z);
        if (oY2 <= safeContainer.width) addExtremePoint(point.x, oY2, point.z);
        if (oZ2 <= safeContainer.height) addExtremePoint(point.x, point.y, oZ2);
      }

      // Clean up extreme points enveloped by this new box
      for (let epIdx = extremePoints.length - 1; epIdx >= 0; epIdx--) {
        const ep = extremePoints[epIdx];
        if (
          ep.x >= point.x && ep.x < pX2 &&
          ep.y >= point.y && ep.y < pY2 &&
          ep.z >= point.z && ep.z < pZ2
        ) {
          extremePoints.splice(epIdx, 1);
        }
      }

      // Sort points once after placement
      sortPoints(extremePoints);
      if (extremePoints.length > 250) {
        extremePoints = extremePoints.slice(0, 250);
      }
    } else {
      remainingInstances.push(inst);
    }
  }

  // Calculate container metrics
  const containerVolMm3 = safeContainer.length * safeContainer.width * safeContainer.height;
  const containerVolumeCbm = containerVolMm3 / 1_000_000_000;

  let packedVolMm3 = 0;
  let cogWeightedX = 0;
  let cogWeightedY = 0;
  let cogWeightedZ = 0;

  for (let i = 0; i < packedItems.length; i++) {
    const p = packedItems[i];
    const itemVol = p.length * p.width * p.height;
    packedVolMm3 += itemVol;

    const itemCenterX = p.x + p.length / 2;
    const itemCenterY = p.y + p.width / 2;
    const itemCenterZ = p.z + p.height / 2;

    cogWeightedX += itemCenterX * p.weight;
    cogWeightedY += itemCenterY * p.weight;
    cogWeightedZ += itemCenterZ * p.weight;
  }

  const packedVolumeCbm = packedVolMm3 / 1_000_000_000;
  const freeVolumeCbm = Math.max(0, containerVolumeCbm - packedVolumeCbm);
  const volumeUtilization = (packedVolMm3 / containerVolMm3) * 100;
  const weightUtilization = (currentTotalWeight / container.maxWeight) * 100;

  const cogX = currentTotalWeight > 0 ? cogWeightedX / currentTotalWeight : container.length / 2;
  const cogY = currentTotalWeight > 0 ? cogWeightedY / currentTotalWeight : container.width / 2;
  const cogZ = currentTotalWeight > 0 ? cogWeightedZ / currentTotalWeight : container.height / 2;

  const offsetXPercent = ((cogX - container.length / 2) / container.length) * 100;
  const offsetYPercent = ((cogY - container.width / 2) / container.width) * 100;
  const offsetZPercent = ((cogZ - container.height / 2) / container.height) * 100;

  const frontRatio = Math.max(0, Math.min(1, 1 - (cogX / (container.length * 0.85))));
  const rearRatio = 1 - frontRatio;
  const frontAxleKg = currentTotalWeight * frontRatio;
  const rearAxleKg = currentTotalWeight * rearRatio;

  const metrics = {
    containerVolumeCbm,
    packedVolumeCbm,
    freeVolumeCbm,
    volumeUtilization: Math.min(100, volumeUtilization),
    containerMaxWeightKg: container.maxWeight,
    packedWeightKg: currentTotalWeight,
    weightUtilization: Math.min(100, weightUtilization),
    totalItemCount: availableInstances.length,
    packedCount: packedItems.length,
    unplacedCount: remainingInstances.length,
    centerOfGravity: {
      x: cogX,
      y: cogY,
      z: cogZ,
      offsetXPercent,
      offsetYPercent,
      offsetZPercent
    },
    axleDistribution: {
      frontAxlePercent: frontRatio * 100,
      rearAxlePercent: rearRatio * 100,
      frontAxleKg,
      rearAxleKg
    },
    calculationTimeMs: 0,
    algorithm,
    containersNeeded: 1
  };

  return {
    containerLoad: {
      containerIndex,
      container,
      packedItems,
      metrics
    },
    remainingInstances,
    placedInstancesCount: packedItems.length
  };
}

/**
 * Multi-Container 3D Packing Optimization Engine
 */
export function run3DPackingOptimizer(
  container: Container,
  cargoList: CargoItem[],
  algorithm: AlgorithmType = 'extreme_points_bfd',
  containerCount: number | 'auto' = 'auto'
): PackingResult {
  const startTime = performance.now();

  const safeLength = Math.max(100, Number(container?.length) || 6000);
  const safeWidth = Math.max(100, Number(container?.width) || 2400);
  const safeHeight = Math.max(100, Number(container?.height) || 2400);
  const safeMaxWeight = Math.max(10, Number(container?.maxWeight) || 20000);

  const safeContainer: Container = {
    ...container,
    length: safeLength,
    width: safeWidth,
    height: safeHeight,
    maxWeight: safeMaxWeight
  };

  // Expand all items based on quantity
  const instances: UnpackedInstance[] = [];
  cargoList.forEach((cargo) => {
    const cL = Math.max(10, Number(cargo.length) || 100);
    const cW = Math.max(10, Number(cargo.width) || 100);
    const cH = Math.max(10, Number(cargo.height) || 100);
    const cWt = Math.max(0.1, Number(cargo.weight) || 1);
    const cQty = Math.max(0, Math.min(500, Number(cargo.quantity) || 0));

    const sanitizedCargo = {
      ...cargo,
      length: cL,
      width: cW,
      height: cH,
      weight: cWt,
      quantity: cQty
    };

    const vol = cL * cW * cH;
    const base = cL * cW;
    for (let q = 0; q < cQty; q++) {
      instances.push({
        instanceId: `${sanitizedCargo.id}_${q + 1}`,
        item: sanitizedCargo,
        volume: vol,
        baseArea: base
      });
    }
  });

  // Sorting heuristics based on algorithm
  if (algorithm === 'weight_balanced') {
    instances.sort((a, b) => {
      if ((a.item.priority || 3) !== (b.item.priority || 3)) {
        return (a.item.priority || 3) - (b.item.priority || 3);
      }
      if (b.item.weight !== a.item.weight) {
        return b.item.weight - a.item.weight;
      }
      return b.volume - a.volume;
    });
  } else if (algorithm === 'wall_building') {
    instances.sort((a, b) => {
      if ((a.item.priority || 3) !== (b.item.priority || 3)) {
        return (a.item.priority || 3) - (b.item.priority || 3);
      }
      if (b.item.length !== a.item.length) {
        return b.item.length - a.item.length;
      }
      return b.volume - a.volume;
    });
  } else if (algorithm === 'layer_stacking') {
    instances.sort((a, b) => {
      if (b.item.height !== a.item.height) {
        return b.item.height - a.item.height;
      }
      return b.baseArea - a.baseArea;
    });
  } else {
    // Extreme Points Best-Fit Decreasing (Default)
    instances.sort((a, b) => {
      if ((a.item.priority || 3) !== (b.item.priority || 3)) {
        return (a.item.priority || 3) - (b.item.priority || 3);
      }
      if (b.volume !== a.volume) {
        return b.volume - a.volume;
      }
      return b.item.weight - a.item.weight;
    });
  }

  const containerLoads: ContainerLoad[] = [];
  let remainingInstances = [...instances];
  let currentSeqNumber = 0;
  const maxAllowedContainers = containerCount === 'auto' ? 25 : Math.max(1, containerCount);

  let cIndex = 0;
  while (remainingInstances.length > 0 && cIndex < maxAllowedContainers) {
    const prevCount = remainingInstances.length;
    const result = packSingleContainer(
      safeContainer,
      cIndex,
      remainingInstances,
      algorithm,
      currentSeqNumber
    );

    // If an entire container was unable to pack even 1 single item, break to prevent infinite loops
    if (result.placedInstancesCount === 0 || result.remainingInstances.length === prevCount) {
      break;
    }

    containerLoads.push(result.containerLoad);
    currentSeqNumber += result.placedInstancesCount;
    remainingInstances = result.remainingInstances;
    cIndex++;

    // If user specified exact container count and we've reached it, stop
    if (containerCount !== 'auto' && cIndex >= containerCount) {
      break;
    }
  }

  // If no containers were packed (e.g. 0 items), add 1 empty container load
  if (containerLoads.length === 0) {
    const emptyResult = packSingleContainer(safeContainer, 0, [], algorithm, 0);
    containerLoads.push(emptyResult.containerLoad);
  }

  // Aggregate all packed items across containers
  const allPackedItems: PackedItem[] = [];
  containerLoads.forEach(load => {
    allPackedItems.push(...load.packedItems);
  });

  // Calculate unplaced items summary
  const unplacedMap = new Map<string, { cargo: CargoItem; reason: 'exceeds_weight' | 'no_spatial_fit'; count: number }>();
  remainingInstances.forEach(inst => {
    const cargo = inst.item;
    const isWeightExceeded = cargo.weight > safeContainer.maxWeight;
    const existing = unplacedMap.get(cargo.id) || {
      cargo,
      reason: isWeightExceeded ? 'exceeds_weight' : 'no_spatial_fit',
      count: 0
    };
    existing.count++;
    unplacedMap.set(cargo.id, existing);
  });

  const unplacedItems: UnplacedItem[] = Array.from(unplacedMap.values()).map(val => ({
    cargoItemId: val.cargo.id,
    sku: val.cargo.sku,
    name: val.cargo.name,
    reason: val.reason,
    dimensions: { length: val.cargo.length, width: val.cargo.width, height: val.cargo.height },
    weight: val.cargo.weight,
    count: val.count
  }));

  const endTime = performance.now();
  const calculationTimeMs = Math.round(endTime - startTime);

  // Overall metrics calculation
  const totalItemCount = instances.length;
  const totalPackedCount = allPackedItems.length;
  const totalUnplacedCount = remainingInstances.length;

  const totalCapacityVolumeCbm = (containerLoads.length * safeContainer.length * safeContainer.width * safeContainer.height) / 1_000_000_000;
  const totalPackedVolumeCbm = containerLoads.reduce((sum, c) => sum + c.metrics.packedVolumeCbm, 0);
  const totalCapacityWeightKg = containerLoads.length * safeContainer.maxWeight;
  const totalPackedWeightKg = containerLoads.reduce((sum, c) => sum + c.metrics.packedWeightKg, 0);

  const overallMetrics: OverallPackingMetrics = {
    totalContainers: containerLoads.length,
    totalContainersCount: containerLoads.length,
    totalCapacityVolumeCbm,
    totalPackedVolumeCbm,
    totalCapacityWeightKg,
    totalPackedWeightKg,
    overallVolumeUtilization: totalCapacityVolumeCbm > 0 ? (totalPackedVolumeCbm / totalCapacityVolumeCbm) * 100 : 0,
    overallWeightUtilization: totalCapacityWeightKg > 0 ? (totalPackedWeightKg / totalCapacityWeightKg) * 100 : 0,
    totalItemCount,
    totalItemsCount: totalItemCount,
    totalPackedCount,
    totalUnplacedCount,
    totalCostEstimate: containerLoads.length * (safeContainer.costEstimate || 2000)
  };

  // Primary container metrics (Container #1)
  const primaryMetrics = {
    ...containerLoads[0].metrics,
    calculationTimeMs,
    totalItemCount,
    packedCount: totalPackedCount,
    unplacedCount: totalUnplacedCount,
    containersNeeded: containerLoads.length + (totalUnplacedCount > 0 ? 1 : 0)
  };

  return {
    container: safeContainer,
    containers: containerLoads,
    packedItems: allPackedItems,
    unplacedItems,
    metrics: primaryMetrics,
    overallMetrics
  };
}
