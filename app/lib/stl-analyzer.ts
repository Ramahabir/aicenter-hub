export interface STLAnalysisResult {
  dimensions: {
    x: number; // width in mm
    y: number; // depth in mm
    z: number; // height in mm
  };
  volumeCm3: number;
  triangleCount: number;
  fitsBambuP1S: boolean;
  estimatedWeightGrams: number;
  estimatedMinutes: number;
  estimatedHours: number;
  estimatedPriceRp: number;
}

export interface STLAnalysisOptions {
  filamentType?: "PLA" | "PETG" | "ABS" | "TPU";
  infillPercent?: number; // e.g. 15, 20, 50
  ratePerHourRp?: number; // default IDR 4000/hour
}

const DENSITIES: Record<string, number> = {
  PLA: 1.24,
  PETG: 1.27,
  ABS: 1.04,
  TPU: 1.21,
};

const BAMBU_P1S_MAX_X = 256;
const BAMBU_P1S_MAX_Y = 256;
const BAMBU_P1S_MAX_Z = 256;

/**
 * Analyzes an STL file (binary or ASCII ArrayBuffer) to compute
 * bounding box dimensions, watertight volume, weight, and Bambu P1S compatibility.
 */
export function analyzeSTL(
  buffer: ArrayBuffer,
  options: STLAnalysisOptions = {}
): STLAnalysisResult {
  const filamentType = options.filamentType || "PLA";
  const infillPercent = Math.min(100, Math.max(5, options.infillPercent ?? 20));
  const ratePerHourRp = options.ratePerHourRp ?? 4000; // IDR 4000/hour
  const density = DENSITIES[filamentType] ?? 1.24;

  const dataView = new DataView(buffer);
  const isBinary = isBinarySTL(buffer, dataView);

  let triangleCount = 0;
  let signedVolumeSum = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  if (isBinary) {
    triangleCount = dataView.getUint32(80, true);
    let offset = 84;
    const byteLength = buffer.byteLength;

    for (let i = 0; i < triangleCount && offset + 48 <= byteLength; i++) {
      // Normal vector (12 bytes, 3 floats) - skipped
      offset += 12;

      // Vertex 1
      const v1x = dataView.getFloat32(offset, true);
      const v1y = dataView.getFloat32(offset + 4, true);
      const v1z = dataView.getFloat32(offset + 8, true);
      offset += 12;

      // Vertex 2
      const v2x = dataView.getFloat32(offset, true);
      const v2y = dataView.getFloat32(offset + 4, true);
      const v2z = dataView.getFloat32(offset + 8, true);
      offset += 12;

      // Vertex 3
      const v3x = dataView.getFloat32(offset, true);
      const v3y = dataView.getFloat32(offset + 4, true);
      const v3z = dataView.getFloat32(offset + 8, true);
      offset += 12;

      // Attribute byte count (2 bytes)
      offset += 2;

      // Update bounds
      if (v1x < minX) minX = v1x;
      if (v1x > maxX) maxX = v1x;
      if (v2x < minX) minX = v2x;
      if (v2x > maxX) maxX = v2x;
      if (v3x < minX) minX = v3x;
      if (v3x > maxX) maxX = v3x;

      if (v1y < minY) minY = v1y;
      if (v1y > maxY) maxY = v1y;
      if (v2y < minY) minY = v2y;
      if (v2y > maxY) maxY = v2y;
      if (v3y < minY) minY = v3y;
      if (v3y > maxY) maxY = v3y;

      if (v1z < minZ) minZ = v1z;
      if (v1z > maxZ) maxZ = v1z;
      if (v2z < minZ) minZ = v2z;
      if (v2z > maxZ) maxZ = v2z;
      if (v3z < minZ) minZ = v3z;
      if (v3z > maxZ) maxZ = v3z;

      // Signed volume of tetrahedron
      signedVolumeSum +=
        (-v3x * v2y * v1z +
          v2x * v3y * v1z +
          v3x * v1y * v2z -
          v1x * v3y * v2z -
          v2x * v1y * v3z +
          v1x * v2y * v3z) /
        6;
    }
  } else {
    // Parse ASCII STL
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(buffer);
    const vertexRegex = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    const vertices: [number, number, number][] = [];
    let match;

    while ((match = vertexRegex.exec(text)) !== null) {
      vertices.push([
        parseFloat(match[1]),
        parseFloat(match[2]),
        parseFloat(match[3]),
      ]);
    }

    triangleCount = Math.floor(vertices.length / 3);

    for (let i = 0; i < triangleCount; i++) {
      const [v1x, v1y, v1z] = vertices[i * 3];
      const [v2x, v2y, v2z] = vertices[i * 3 + 1];
      const [v3x, v3y, v3z] = vertices[i * 3 + 2];

      if (v1x < minX) minX = v1x;
      if (v1x > maxX) maxX = v1x;
      if (v2x < minX) minX = v2x;
      if (v2x > maxX) maxX = v2x;
      if (v3x < minX) minX = v3x;
      if (v3x > maxX) maxX = v3x;

      if (v1y < minY) minY = v1y;
      if (v1y > maxY) maxY = v1y;
      if (v2y < minY) minY = v2y;
      if (v2y > maxY) maxY = v2y;
      if (v3y < minY) minY = v3y;
      if (v3y > maxY) maxY = v3y;

      if (v1z < minZ) minZ = v1z;
      if (v1z > maxZ) maxZ = v1z;
      if (v2z < minZ) minZ = v2z;
      if (v2z > maxZ) maxZ = v2z;
      if (v3z < minZ) minZ = v3z;
      if (v3z > maxZ) maxZ = v3z;

      signedVolumeSum +=
        (-v3x * v2y * v1z +
          v2x * v3y * v1z +
          v3x * v1y * v2z -
          v1x * v3y * v2z -
          v2x * v1y * v3z +
          v1x * v2y * v3z) /
        6;
    }
  }

  const dimX = Math.max(0, maxX - minX);
  const dimY = Math.max(0, maxY - minY);
  const dimZ = Math.max(0, maxZ - minZ);

  // Volume in mm3 converted to cm3
  const volumeMm3 = Math.abs(signedVolumeSum);
  const volumeCm3 = Number((volumeMm3 / 1000).toFixed(2));

  // Fits within Bambu Lab P1S build volume: 256 x 256 x 256 mm
  const fitsBambuP1S =
    dimX <= BAMBU_P1S_MAX_X &&
    dimY <= BAMBU_P1S_MAX_Y &&
    dimZ <= BAMBU_P1S_MAX_Z;

  // Slicer material estimation heuristic:
  // Shell/walls (~30% of part solid) + inner infill ratio
  const effectiveInfillFactor = 0.3 + 0.7 * (infillPercent / 100);
  const estimatedWeightGrams = Number(
    (volumeCm3 * density * effectiveInfillFactor).toFixed(1)
  );

  // Bambu Lab P1S print duration estimation:
  // 1. Fixed machine prep overhead (bed leveling, nozzle wipe, resonance calibration): ~6 mins
  // 2. Extrusion time: ~18 cm³ of effective material extruded per hour on 0.20mm standard profile
  // 3. Layer change overhead: 1.2s per layer transition
  const prepMinutes = 6;
  const layerCount = Math.ceil(dimZ / 0.20);
  const effectiveVolumeCm3 = volumeCm3 * effectiveInfillFactor;
  const extrusionMinutes = (effectiveVolumeCm3 / 18.0) * 60;
  const layerMinutes = (layerCount * 1.2) / 60;

  const estimatedMinutes = Math.max(10, Math.round(prepMinutes + extrusionMinutes + layerMinutes));
  const estimatedHours = Number((estimatedMinutes / 60).toFixed(2));

  // Cost formula: hour x 4000 rupiah
  const estimatedPriceRp = Math.round(estimatedHours * ratePerHourRp);

  return {
    dimensions: {
      x: Number(dimX.toFixed(1)),
      y: Number(dimY.toFixed(1)),
      z: Number(dimZ.toFixed(1)),
    },
    volumeCm3,
    triangleCount,
    fitsBambuP1S,
    estimatedWeightGrams,
    estimatedMinutes,
    estimatedHours,
    estimatedPriceRp,
  };
}

function isBinarySTL(buffer: ArrayBuffer, dataView: DataView): boolean {
  if (buffer.byteLength < 84) return false;
  const triangleCount = dataView.getUint32(80, true);
  const expectedSize = 84 + triangleCount * 50;

  if (expectedSize === buffer.byteLength) {
    return true;
  }

  // Check if starts with "solid"
  const bytes = new Uint8Array(buffer, 0, Math.min(80, buffer.byteLength));
  const asciiHeader = String.fromCharCode(...bytes);
  if (asciiHeader.trim().toLowerCase().startsWith("solid")) {
    // Some binary STLs also start with 'solid' in the 80-byte header,
    // but if byte size matches binary formula, it's binary.
    return expectedSize === buffer.byteLength;
  }

  return true;
}

