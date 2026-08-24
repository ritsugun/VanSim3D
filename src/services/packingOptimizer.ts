import { Container, CargoItem, PackedItem, UnplacedItem, PackingResult, AlgorithmType } from '../types';

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

/**
 * Generates all permitted 3D rotations for a cargo item based on its rotation flags
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

  // Orientation 0: Original (L, W, H)
  pushUnique(l, w, h, 0);

  // Yaw rotation (swap L and W, Height remains upright)
  if (item.allowYaw || item.allowYaw === undefined) {
    pushUnique(w, l, h, 1);
  }

  // Roll rotation (swap W and H) - Only if allowed
  if (item.allowRoll && !item.fragile) {
    pushUnique(l, h, w, 2);
    if (item.allowYaw) {
      pushUnique(h, l, w, 3);
    }
  }

  // Tilt rotation (swap L and H) - Only if allowed
  if (item.allowTilt && !item.fragile) {
    pushUnique(h, w, l, 4);
    if (item.allowYaw) {
      pushUnique(w, h, l, 5);
    }
  }

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

  // Require at least 60% base area support to ensure physical stability
  return (supportedArea / candBaseArea) >= 0.60;
}

/**
 * Core 3D Packing Optimization Engine with multiple heuristics
 */
export function run3DPackingOptimizer(
  container: Container,
  cargoList: CargoItem[],
  algorithm: AlgorithmType = 'extreme_points_bfd'
): PackingResult {
  const startTime = performance.now();

  // Expand all items based on quantity
  interface UnpackedInstance {
    instanceId: string;
    item: CargoItem;
    volume: number;
    baseArea: number;
  }

  const instances: UnpackedInstance[] = [];
  cargoList.forEach((cargo) => {
    const vol = cargo.length * cargo.width * cargo.height;
    const base = cargo.length * cargo.width;
    for (let q = 0; q < cargo.quantity; q++) {
      instances.push({
        instanceId: `${cargo.id}_${q + 1}`,
        item: cargo,
        volume: vol,
        baseArea: base
      });
    }
  });

  // Sorting heuristics based on algorithm
  if (algorithm === 'weight_balanced') {
    // Heaviest first, then priority, then largest volume
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
    // Longest along X first, then height
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
    // Non-increasing height, then non-increasing base area
    instances.sort((a, b) => {
      if (b.item.height !== a.item.height) {
        return b.item.height - a.item.height;
      }
      return b.baseArea - a.baseArea;
    });
  } else {
    // Extreme Points Best-Fit Decreasing (Default)
    // Priority first -> Volume descending -> Weight descending
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

  const packedItems: PackedItem[] = [];
  const unplacedMap = new Map<string, { cargo: CargoItem; reason: 'exceeds_weight' | 'no_spatial_fit'; count: number }>();
  let currentTotalWeight = 0;

  // Extreme Points Set (initialized at origin [0, 0, 0])
  const extremePoints: Point3D[] = [{ x: 0, y: 0, z: 0 }];

  const addExtremePoint = (x: number, y: number, z: number) => {
    // Validate bounds
    if (x < 0 || y < 0 || z < 0) return;
    if (x >= container.length || y >= container.width || z >= container.height) return;

    // Check if point already exists or is enveloped inside an existing box
    for (let i = 0; i < extremePoints.length; i++) {
      const ep = extremePoints[i];
      if (ep.x === x && ep.y === y && ep.z === z) return;
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

  // Process all cargo instances
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const cargo = inst.item;

    // Check weight limit
    if (currentTotalWeight + cargo.weight > container.maxWeight) {
      const existing = unplacedMap.get(cargo.id) || { cargo, reason: 'exceeds_weight', count: 0 };
      existing.count++;
      unplacedMap.set(cargo.id, existing);
      continue;
    }

    const orientations = getValidOrientations(cargo);
    let bestPlacement: {
      point: Point3D;
      orientation: BoxOrientation;
      score: number;
    } | null = null;

    // Sort extreme points to encourage dense loading
    // Wall-building biases packing towards back (X=0) and bottom (Z=0)
    extremePoints.sort((a, b) => {
      if (algorithm === 'wall_building') {
        if (a.x !== b.x) return a.x - b.x; // Pack along length in walls
        if (a.z !== b.z) return a.z - b.z; // Pack floor up
        return a.y - b.y;
      } else if (algorithm === 'weight_balanced') {
        // Bias heavy items to floor (z=0) and container middle-width (y = W/2)
        const aDistY = Math.abs(a.y - container.width / 2);
        const bDistY = Math.abs(b.y - container.width / 2);
        if (a.z !== b.z) return a.z - b.z;
        if (a.x !== b.x) return a.x - b.x;
        return aDistY - bDistY;
      } else {
        // Standard EP: Ground first (Z=0), Back first (X=0), Left first (Y=0)
        if (a.x !== b.x) return a.x - b.x;
        if (a.y !== b.y) return a.y - b.y;
        return a.z - b.z;
      }
    });

    // Test extreme points and orientations
    for (let pIdx = 0; pIdx < extremePoints.length; pIdx++) {
      const pt = extremePoints[pIdx];

      for (let oIdx = 0; oIdx < orientations.length; oIdx++) {
        const ori = orientations[oIdx];

        // Container boundary check
        if (
          pt.x + ori.length > container.length ||
          pt.y + ori.width > container.width ||
          pt.z + ori.height > container.height
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
          weight: cargo.weight
        };

        // Collision check
        if (checkCollision(candidate, packedItems)) {
          continue;
        }

        // Support and stacking check
        if (!checkSupportAndStacking(candidate, packedItems)) {
          continue;
        }

        // Scoring heuristic for Best-Fit
        // Score minimizes empty void created and distance from back-left-bottom corner
        const cornerDistScore = (pt.x * 1.5) + (pt.y * 1.0) + (pt.z * 2.0);
        const heightPenalty = pt.z * 1.2;
        const score = cornerDistScore + heightPenalty;

        if (!bestPlacement || score < bestPlacement.score) {
          bestPlacement = {
            point: pt,
            orientation: ori,
            score
          };
        }
      }

      // If we found a good floor placement at earliest X, break early for speed
      if (bestPlacement && bestPlacement.point.z === 0 && bestPlacement.point.x === pt.x) {
        break;
      }
    }

    if (bestPlacement) {
      const { point, orientation } = bestPlacement;
      const layerNumber = Math.floor(point.z / (orientation.height || 100)) + 1;

      const newPackedItem: PackedItem = {
        id: `packed_${packedItems.length + 1}`,
        cargoItemId: cargo.id,
        sku: cargo.sku,
        name: cargo.name,
        x: point.x,
        y: point.y,
        z: point.z,
        length: orientation.length,
        width: orientation.width,
        height: orientation.height,
        weight: cargo.weight,
        color: cargo.color,
        fragile: !!cargo.fragile,
        sequenceNumber: packedItems.length + 1,
        stepIndex: packedItems.length,
        rotationIndex: orientation.rotationIndex,
        containerIndex: 0,
        layer: layerNumber
      };

      packedItems.push(newPackedItem);
      currentTotalWeight += cargo.weight;

      // Generate new Extreme Points around the placed item
      const pX2 = point.x + orientation.length;
      const pY2 = point.y + orientation.width;
      const pZ2 = point.z + orientation.height;

      addExtremePoint(pX2, point.y, point.z);
      addExtremePoint(point.x, pY2, point.z);
      addExtremePoint(point.x, point.y, pZ2);
      addExtremePoint(pX2, pY2, point.z);
      addExtremePoint(pX2, point.y, pZ2);
      addExtremePoint(point.x, pY2, pZ2);

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
    } else {
      const existing = unplacedMap.get(cargo.id) || { cargo, reason: 'no_spatial_fit', count: 0 };
      existing.count++;
      unplacedMap.set(cargo.id, existing);
    }
  }

  // Format unplaced items
  const unplacedItems: UnplacedItem[] = Array.from(unplacedMap.values()).map(val => ({
    cargoItemId: val.cargo.id,
    sku: val.cargo.sku,
    name: val.cargo.name,
    reason: val.reason,
    dimensions: { length: val.cargo.length, width: val.cargo.width, height: val.cargo.height },
    weight: val.cargo.weight,
    count: val.count
  }));

  // Calculate Metrics
  const containerVolMm3 = container.length * container.width * container.height;
  const containerVolumeCbm = containerVolMm3 / 1_000_000_000;

  let packedVolMm3 = 0;
  let cogWeightedX = 0;
  let cogWeightedY = 0;
  let cogWeightedZ = 0;

  for (let i = 0; i < packedItems.length; i++) {
    const p = packedItems[i];
    const itemVol = p.length * p.width * p.height;
    packedVolMm3 += itemVol;

    // Item center
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

  // Center of Gravity (CoG)
  const cogX = currentTotalWeight > 0 ? cogWeightedX / currentTotalWeight : container.length / 2;
  const cogY = currentTotalWeight > 0 ? cogWeightedY / currentTotalWeight : container.width / 2;
  const cogZ = currentTotalWeight > 0 ? cogWeightedZ / currentTotalWeight : container.height / 2;

  // Offsets from geometric center in percentage (-50% to +50%)
  const offsetXPercent = ((cogX - container.length / 2) / container.length) * 100;
  const offsetYPercent = ((cogY - container.width / 2) / container.width) * 100;
  const offsetZPercent = ((cogZ - container.height / 2) / container.height) * 100;

  // Road Axle Weight Distribution Calculation
  // Front axle is at X=0 (Kingpin / Drive axle), Rear tandem axle is at X=0.85 * Length
  const frontRatio = Math.max(0, Math.min(1, 1 - (cogX / (container.length * 0.85))));
  const rearRatio = 1 - frontRatio;
  const frontAxleKg = currentTotalWeight * frontRatio;
  const rearAxleKg = currentTotalWeight * rearRatio;

  const totalItemCount = cargoList.reduce((acc, c) => acc + c.quantity, 0);
  const unplacedCount = unplacedItems.reduce((acc, u) => acc + u.count, 0);
  const endTime = performance.now();

  const metrics = {
    containerVolumeCbm,
    packedVolumeCbm,
    freeVolumeCbm,
    volumeUtilization: Math.min(100, volumeUtilization),
    containerMaxWeightKg: container.maxWeight,
    packedWeightKg: currentTotalWeight,
    weightUtilization: Math.min(100, weightUtilization),
    totalItemCount,
    packedCount: packedItems.length,
    unplacedCount,
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
    calculationTimeMs: Math.round(endTime - startTime),
    algorithm,
    containersNeeded: unplacedCount > 0 ? Math.ceil(totalItemCount / Math.max(1, packedItems.length)) : 1
  };

  return {
    container,
    packedItems,
    unplacedItems,
    metrics
  };
}
