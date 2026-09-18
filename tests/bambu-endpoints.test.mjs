import assert from "node:assert/strict";
import test from "node:test";
import { getBambuTelemetry, list3DJobs, create3DJob } from "../bambu-service.mjs";

test("Bambu service reports telemetry and configuration correctly", () => {
  const telemetry = getBambuTelemetry();
  assert.equal(telemetry.model, "Bambu Lab P1S");
  assert.ok("gcodeState" in telemetry);
  assert.ok("nozzleTemp" in telemetry);
  assert.ok("bedTemp" in telemetry);
});

test("Bambu job manager creates and lists jobs with unique tracking codes", async () => {
  const initialJobs = await list3DJobs();

  const newJob = await create3DJob({
    fileName: "test_bracket.stl",
    fileSize: 1024,
    filePath: "uploads/3d-prints/test_bracket.stl",
    customerName: "Test User",
    customerPhone: "08123456789",
    customerDept: "AI Center",
    customerNotes: "Test print",
    filamentType: "PLA",
    color: "White",
    infill: 20,
    quality: "0.20mm Standard",
    supports: "auto",
    dimensions: { x: 50, y: 50, z: 20 },
    volumeCm3: 15.5,
    estimatedWeightGrams: 18.2,
    estimatedPriceRp: 15000,
  });

  assert.ok(newJob.id);
  assert.match(newJob.trackingCode, /^B3D-[A-Z0-9]{4}$/);
  assert.equal(newJob.status, "pending_review");
  assert.match(newJob.invoiceNumber, /^INV\/AIC\/\d{4}\/\d{2}\/B3D-[A-Z0-9]{4}$/);
  assert.equal(newJob.paymentStatus, "unpaid");

  const queryResult = await list3DJobs({ trackingCode: newJob.trackingCode });
  assert.equal(queryResult.length, 1);
  assert.equal(queryResult[0].id, newJob.id);

  // Test lookup by invoice number
  const invoiceResult = await list3DJobs({ trackingCode: newJob.invoiceNumber });
  assert.equal(invoiceResult.length, 1);
  assert.equal(invoiceResult[0].id, newJob.id);

  // Test updating payment
  const { update3DJobPayment, get3DJob } = await import("../bambu-service.mjs");
  const paidJob = await update3DJobPayment(newJob.id, {
    paymentStatus: "paid",
    paymentMethod: "QRIS",
  });
  assert.equal(paidJob.paymentStatus, "paid");
  assert.equal(paidJob.paymentMethod, "QRIS");
  assert.ok(paidJob.paidAt);

  const foundJob = await get3DJob(newJob.invoiceNumber);
  assert.ok(foundJob);
  assert.equal(foundJob.paymentStatus, "paid");

  const fs = await import("node:fs/promises");
  await fs.writeFile("data/bambu-3d-jobs.json", JSON.stringify(initialJobs, null, 2), "utf-8");
});

