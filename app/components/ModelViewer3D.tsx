"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

interface ModelViewer3DProps {
  file: File | null;
  filamentColor?: string;
  dimensions?: { x: number; y: number; z: number } | null;
  fitsBambuP1S?: boolean;
}

const COLOR_MAP: Record<string, string> = {
  White: "#f1f5f9",
  Black: "#1e293b",
  Gray: "#64748b",
  Red: "#ef4444",
  Blue: "#2563eb",
  Orange: "#f97316",
  Cyan: "#06b6d4",
  Green: "#10b981",
  Yellow: "#f59e0b",
  Purple: "#8b5cf6",
};

export default function ModelViewer3D({
  file,
  filamentColor = "White",
  dimensions,
  fitsBambuP1S = true,
}: ModelViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // 1. Initialize Scene, Camera, Lights, Grid
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = 340;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c1319");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(220, 220, 320);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // don't go below build plate
    controls.minDistance = 30;
    controls.maxDistance = 900;
    controlsRef.current = controls;

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(150, 250, 200);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8bc34a, 0.8);
    fillLight.position.set(-180, 180, -150);
    scene.add(fillLight);

    const bottomBounce = new THREE.DirectionalLight(0x004f86, 0.4);
    bottomBounce.position.set(0, -100, 0);
    scene.add(bottomBounce);

    // Bambu Lab P1S Build Plate: 256 x 256 mm
    const plateSize = 256;
    const grid = new THREE.GridHelper(plateSize, 25, 0x0088cc, 0x1f3b53);
    grid.position.y = 0;
    scene.add(grid);

    // Build volume bounds (256 x 256 x 256 mm) subtle wireframe box
    const boxGeo = new THREE.BoxGeometry(plateSize, plateSize, plateSize);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    const boxMat = new THREE.LineBasicMaterial({ color: 0x004f86, transparent: true, opacity: 0.25 });
    const volumeBox = new THREE.LineSegments(boxEdges, boxMat);
    volumeBox.position.y = plateSize / 2;
    scene.add(volumeBox);

    // Animation Loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      if (controlsRef.current) {
        controlsRef.current.autoRotate = autoRotate;
        controlsRef.current.autoRotateSpeed = 1.6;
        controlsRef.current.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    // Handle Resize
    const handleResize = () => {
      if (!container || !rendererRef.current) return;
      const w = container.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 2. Load and parse model file
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "stl") {
      setErrorNotice(`Interactive 3D preview is currently optimized for .STL files. Your ${ext?.toUpperCase()} file is ready for submission and will be inspected in Bambu Studio.`);
      if (meshRef.current) {
        scene.remove(meshRef.current);
        meshRef.current = null;
      }
      return;
    }

    setErrorNotice(null);
    setLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) return;

        const loader = new STLLoader();
        const geometry = loader.parse(buffer);
        geometry.computeVertexNormals();

        // Center on build plate:
        geometry.center();
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        let yOffset = 0;
        if (bbox) {
          yOffset = (bbox.max.y - bbox.min.y) / 2;
        }

        // Remove old mesh if any
        if (meshRef.current) {
          scene.remove(meshRef.current);
          meshRef.current.geometry.dispose();
          if (Array.isArray(meshRef.current.material)) {
            meshRef.current.material.forEach((m) => m.dispose());
          } else {
            meshRef.current.material.dispose();
          }
          meshRef.current = null;
        }

        const hexColor = COLOR_MAP[filamentColor] || filamentColor || "#f1f5f9";
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(hexColor),
          roughness: 0.35,
          metalness: 0.1,
          wireframe,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(0, yOffset, 0); // resting perfectly on plate
        scene.add(mesh);
        meshRef.current = mesh;

        // Reposition camera nicely based on size
        if (bbox && controlsRef.current) {
          const maxDim = Math.max(
            bbox.max.x - bbox.min.x,
            bbox.max.y - bbox.min.y,
            bbox.max.z - bbox.min.z
          );
          const camDist = Math.max(140, maxDim * 2.2);
          controlsRef.current.target.set(0, yOffset, 0);
          controlsRef.current.object.position.set(camDist * 0.7, camDist * 0.6, camDist * 0.8);
          controlsRef.current.update();
        }
      } catch (err) {
        setErrorNotice("Unable to parse 3D mesh geometry for preview.");
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setErrorNotice("Error reading file.");
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, [file]);

  // 3. Update material color when filament color changes
  useEffect(() => {
    if (!meshRef.current) return;
    const hexColor = COLOR_MAP[filamentColor] || filamentColor || "#f1f5f9";
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    if (mat) {
      mat.color.set(new THREE.Color(hexColor));
      mat.needsUpdate = true;
    }
  }, [filamentColor]);

  // 4. Update wireframe toggle
  useEffect(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    if (mat) {
      mat.wireframe = wireframe;
      mat.needsUpdate = true;
    }
  }, [wireframe]);

  // 5. Update auto-rotate
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  const handleResetView = () => {
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 20, 0);
      controlsRef.current.object.position.set(200, 180, 240);
      controlsRef.current.update();
    }
  };

  if (!file) return null;

  return (
    <div
      style={{
        marginTop: "16px",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #1f3b53",
        background: "#0c1319",
        position: "relative",
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* 3D Viewport Header Overlay */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          right: 12,
          zIndex: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", pointerEvents: "auto" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              background: "rgba(0, 79, 134, 0.85)",
              color: "white",
              padding: "4px 10px",
              borderRadius: "20px",
              letterSpacing: "0.05em",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <i
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#4edb9b",
                display: "inline-block",
              }}
            />
            3D MODEL PREVIEW · BAMBU P1S BED
          </span>
          {dimensions && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                background: "rgba(255,255,255,0.1)",
                color: "#e2e8f0",
                padding: "4px 8px",
                borderRadius: "6px",
                backdropFilter: "blur(6px)",
              }}
            >
              {dimensions.x} × {dimensions.y} × {dimensions.z} mm
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "6px", pointerEvents: "auto" }}>
          <button
            type="button"
            onClick={() => setAutoRotate((r) => !r)}
            title={autoRotate ? "Pause 360° Rotation" : "Auto-Rotate 360°"}
            style={{
              background: autoRotate ? "#004f86" : "rgba(255,255,255,0.12)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              padding: "4px 9px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(4px)",
            }}
          >
            {autoRotate ? "⏸ Spin" : "▶ Spin"}
          </button>
          <button
            type="button"
            onClick={() => setWireframe((w) => !w)}
            title="Toggle Wireframe Mesh"
            style={{
              background: wireframe ? "#ed8b00" : "rgba(255,255,255,0.12)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              padding: "4px 9px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(4px)",
            }}
          >
            🕸 Mesh
          </button>
          <button
            type="button"
            onClick={handleResetView}
            title="Reset camera position"
            style={{
              background: "rgba(255,255,255,0.12)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              padding: "4px 9px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(4px)",
            }}
          >
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 15,
            background: "rgba(12, 19, 25, 0.75)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            gap: "10px",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid rgba(255,255,255,0.2)",
              borderTopColor: "var(--bright)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={{ fontSize: "12px", fontWeight: 700 }}>Rendering 3D Geometry…</span>
        </div>
      )}

      {/* Non-STL format or Error notice */}
      {errorNotice && (
        <div
          style={{
            position: "absolute",
            bottom: 38,
            left: 14,
            right: 14,
            zIndex: 12,
            background: "rgba(30, 41, 59, 0.9)",
            border: "1px solid #334155",
            borderRadius: "8px",
            padding: "8px 12px",
            color: "#cbd5e1",
            fontSize: "12px",
            backdropFilter: "blur(6px)",
          }}
        >
          ℹ️ {errorNotice}
        </div>
      )}

      {/* Three.js Canvas Container */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "340px",
          display: "block",
          cursor: "grab",
        }}
      />

      {/* Bottom status & interaction hint bar */}
      <div
        style={{
          padding: "7px 14px",
          background: "#080c10",
          borderTop: "1px solid #1a2a38",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "11px",
          color: "#94a3b8",
        }}
      >
        <span>
          🖱 <b>Drag</b> to rotate · <b>Scroll</b> to zoom · <b>Right-click drag</b> to pan
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: COLOR_MAP[filamentColor] || "#f1f5f9",
              border: "1px solid rgba(255,255,255,0.4)",
              display: "inline-block",
            }}
          />
          {filamentColor} Filament Preview
        </span>
      </div>
    </div>
  );
}
