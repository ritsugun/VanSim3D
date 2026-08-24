import { UnitSystem } from '../types';

/**
 * Utility functions for consistent unit conversion, formatting, and display
 * across Metric (mm, m, kg, t, m³) and Imperial (in, ft, lbs, tons, ft³).
 */

// Conversion constants
export const MM_TO_INCH = 1 / 25.4; // 0.0393701
export const MM_TO_FOOT = 1 / 304.8; // 0.00328084
export const KG_TO_LBS = 2.20462262185;
export const CBM_TO_CFT = 35.3146667;

/**
 * Format 3D Box Dimensions (L × W × H)
 * In Metric: shows mm (and m for large items/containers)
 * In Imperial: shows in (and ft for large items/containers)
 */
export function formatDimensions(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  unitSystem: UnitSystem = 'metric',
  compact: boolean = false
): string {
  if (unitSystem === 'imperial') {
    const lIn = (lengthMm * MM_TO_INCH).toFixed(1);
    const wIn = (widthMm * MM_TO_INCH).toFixed(1);
    const hIn = (heightMm * MM_TO_INCH).toFixed(1);
    
    if (!compact && (lengthMm >= 1000 || widthMm >= 1000 || heightMm >= 1000)) {
      const lFt = (lengthMm * MM_TO_FOOT).toFixed(1);
      const wFt = (widthMm * MM_TO_FOOT).toFixed(1);
      const hFt = (heightMm * MM_TO_FOOT).toFixed(1);
      return `${lIn} × ${wIn} × ${hIn} in (${lFt} × ${wFt} × ${hFt} ft)`;
    }
    return `${lIn} × ${wIn} × ${hIn} in`;
  }

  // Metric
  const lMm = Math.round(lengthMm).toLocaleString();
  const wMm = Math.round(widthMm).toLocaleString();
  const hMm = Math.round(heightMm).toLocaleString();

  if (!compact && (lengthMm >= 1000 || widthMm >= 1000 || heightMm >= 1000)) {
    const lM = (lengthMm / 1000).toFixed(2);
    const wM = (widthMm / 1000).toFixed(2);
    const hM = (heightMm / 1000).toFixed(2);
    return `${lMm} × ${wMm} × ${hMm} mm (${lM} × ${wM} × ${hM} m)`;
  }

  return `${lMm} × ${wMm} × ${hMm} mm`;
}

/**
 * Format weight with proper units (kg / t or lbs / tons)
 */
export function formatWeight(
  weightKg: number,
  unitSystem: UnitSystem = 'metric',
  precision: number = 1
): string {
  if (unitSystem === 'imperial') {
    const lbs = weightKg * KG_TO_LBS;
    if (lbs >= 2000) {
      const tons = (lbs / 2000).toFixed(precision);
      return `${lbs.toLocaleString(undefined, { maximumFractionDigits: 0 })} lbs (${tons} tons)`;
    }
    return `${lbs.toLocaleString(undefined, { maximumFractionDigits: precision })} lbs`;
  }

  // Metric
  if (weightKg >= 1000) {
    const t = (weightKg / 1000).toFixed(precision);
    return `${weightKg.toLocaleString(undefined, { maximumFractionDigits: precision })} kg (${t} t)`;
  }
  return `${weightKg.toLocaleString(undefined, { maximumFractionDigits: precision })} kg`;
}

/**
 * Format single weight for short/compact display
 */
export function formatWeightCompact(
  weightKg: number,
  unitSystem: UnitSystem = 'metric'
): string {
  if (unitSystem === 'imperial') {
    const lbs = weightKg * KG_TO_LBS;
    return `${lbs.toLocaleString(undefined, { maximumFractionDigits: 0 })} lbs`;
  }
  return `${weightKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}

/**
 * Format Volume in m³ or ft³
 */
export function formatVolume(
  volCbm: number,
  unitSystem: UnitSystem = 'metric',
  precision: number = 2
): string {
  if (unitSystem === 'imperial') {
    const cft = volCbm * CBM_TO_CFT;
    return `${cft.toFixed(precision)} ft³`;
  }
  return `${volCbm.toFixed(precision)} m³`;
}

/**
 * Format single dimension (e.g. Length or Height)
 */
export function formatLength(
  lengthMm: number,
  unitSystem: UnitSystem = 'metric',
  precision: number = 2
): string {
  if (unitSystem === 'imperial') {
    const inVal = (lengthMm * MM_TO_INCH).toFixed(1);
    if (lengthMm >= 1000) {
      const ftVal = (lengthMm * MM_TO_FOOT).toFixed(precision);
      return `${inVal} in (${ftVal} ft)`;
    }
    return `${inVal} in`;
  }

  if (lengthMm >= 1000) {
    const mVal = (lengthMm / 1000).toFixed(precision);
    return `${Math.round(lengthMm).toLocaleString()} mm (${mVal} m)`;
  }
  return `${Math.round(lengthMm).toLocaleString()} mm`;
}

/**
 * Format 3D position coordinates (X, Y, Z)
 */
export function formatCoordinates(
  xMm: number,
  yMm: number,
  zMm: number,
  unitSystem: UnitSystem = 'metric'
): { x: string; y: string; z: string; unit: string } {
  if (unitSystem === 'imperial') {
    return {
      x: (xMm * MM_TO_INCH).toFixed(1),
      y: (yMm * MM_TO_INCH).toFixed(1),
      z: (zMm * MM_TO_INCH).toFixed(1),
      unit: 'in'
    };
  }
  return {
    x: Math.round(xMm).toLocaleString(),
    y: Math.round(yMm).toLocaleString(),
    z: Math.round(zMm).toLocaleString(),
    unit: 'mm'
  };
}
