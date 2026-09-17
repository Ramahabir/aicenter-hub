import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSTL } from "../app/lib/stl-analyzer.ts";

/**
 * Creates a binary STL ArrayBuffer for a 10x10x10 mm box (12 triangles).
 */
function createBoxSTL(w = 10, d = 10, h = 10) {
  const numTriangles = 12;
  const buffer = new ArrayBuffer(84 + numTriangles * 50);
  const view = new DataView(buffer);

  // 80 bytes header (leave 0s)
  // Triangle count at byte 80
  view.setUint32(80, numTriangles, true);

  // 8 vertices of box
  const v = [
    [0, 0, 0],
    [w, 0, 0],
    [w, d, 0],
    [0, d, 0],
    [0, 0, h],
    [w, 0, h],
    [w, d, h],
    [0, d, h],
  ];

  // 12 triangles (2 per face)
  const triangles = [
    // Bottom
    [v[0], v[2], v[1]], [v[0], v[3], v[2]],
    // Top
    [v[4], v[5], v[6]], [v[4], v[6], v[7]],
    // Front
    [v[0], v[1], v[5]], [v[0], v[5], v[4]],
    // Back
    [v[2], v[3], v[7]], [v[2], v[7], v[6]],
    // Left
    [v[0], v[4], v[7]], [v[0], v[7], v[3]],
    // Right
    [v[1], v[2], v[6]], [v[1], v[6], v[5]],
  ];

  let offset = 84;
  for (const tri of triangles) {
    // Normal (3 floats)
    view.setFloat32(offset, 0, true);
    view.setFloat32(offset + 4, 0, true);
    view.setFloat32(offset + 8, 1, true);
    offset += 12;

    // V1
    view.setFloat32(offset, tri[0][0], true);
    view.setFloat32(offset + 4, tri[0][1], true);
    view.setFloat32(offset + 8, tri[0][2], true);
    offset += 12;

    // V2
    view.setFloat32(offset, tri[1][0], true);
    view.setFloat32(offset + 4, tri[1][1], true);
    view.setFloat32(offset + 8, tri[1][2], true);
    offset += 12;

    // V3
    view.setFloat32(offset, tri[2][0], true);
    view.setFloat32(offset + 4, tri[2][1], true);
    view.setFloat32(offset + 8, tri[2][2], true);
    offset += 12;

    // Attribute byte count
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}

test("calculates bounding box and volume correctly for binary STL", () => {
  const boxBuffer = createBoxSTL(20, 30, 40); // 20 x 30 x 40 mm = 24000 mm3 = 24 cm3
  const result = analyzeSTL(boxBuffer, { filamentType: "PLA", infillPercent: 20 });

  assert.equal(result.dimensions.x, 20);
  assert.equal(result.dimensions.y, 30);
  assert.equal(result.dimensions.z, 40);
  assert.equal(result.volumeCm3, 24);
  assert.equal(result.triangleCount, 12);
  assert.equal(result.fitsBambuP1S, true);
  assert.ok(result.estimatedWeightGrams > 0);
  assert.ok(result.estimatedHours > 0);
  assert.equal(result.estimatedPriceRp, Math.round(result.estimatedHours * 4000));
});

test("detects oversized model for Bambu Lab P1S build volume", () => {
  const hugeBoxBuffer = createBoxSTL(300, 100, 100); // 300 mm exceeds 256 mm limit
  const result = analyzeSTL(hugeBoxBuffer);

  assert.equal(result.dimensions.x, 300);
  assert.equal(result.fitsBambuP1S, false);
});

