"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { PAGE_WIDTH as W, PAGE_HEIGHT as H } from "./page-geometry";

const CW = W + .34;
const CH = H + .36;

function leatherMaps() {
  const canvas = document.createElement("canvas");
  canvas.width = 768; canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#3a493d"; ctx.fillRect(0, 0, 768, 1024);
  let seed = 173;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 65000; i++) {
    const x = random() * 768, y = random() * 1024;
    ctx.fillStyle = i % 2 ? "#e0d8b817" : "#08180e33";
    ctx.beginPath(); ctx.ellipse(x, y, .5 + random() * 1.4, .4 + random(), random() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  // A separate height map gives the leather grain actual lighting response.
  const bumpCanvas = document.createElement("canvas"); bumpCanvas.width = 768; bumpCanvas.height = 1024;
  const bump = bumpCanvas.getContext("2d")!;
  bump.drawImage(canvas, 0, 0);
  ctx.strokeStyle = "#b79c60"; ctx.lineWidth = 2;
  for (const inset of [34, 43, 64]) {
    ctx.beginPath(); ctx.roundRect(inset, inset, 768 - inset * 2, 1024 - inset * 2, 15); ctx.stroke();
  }
  ctx.setLineDash([5, 5]); ctx.lineWidth = 1.6; ctx.strokeStyle = "#c5b490";
  ctx.strokeRect(19, 19, 730, 986); ctx.setLineDash([]);
  for (const x of [81, 687]) for (const y of [81, 943]) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = "#c4a469"; ctx.strokeRect(-8, -8, 16, 16); ctx.restore();
  }
  ctx.textAlign = "center"; ctx.fillStyle = "#c5ab72";
  ctx.font = "54px Georgia"; ctx.fillText("LƯU", 384, 478);
  ctx.font = "17px Georgia"; ctx.fillText("NHỮNG NGÀY ĐÁNG NHỚ", 384, 529);
  ctx.beginPath(); ctx.moveTo(292, 562); ctx.lineTo(476, 562); ctx.stroke();
  ctx.font = "italic 24px Georgia"; ctx.fillText("S ♥ L", 384, 604);
  ctx.beginPath(); ctx.ellipse(384, 532, 172, 155, 0, 0, Math.PI * 2); ctx.stroke();
  bump.strokeStyle = "#bababa"; bump.lineWidth = 2;
  bump.strokeRect(43, 43, 682, 938);
  bump.fillStyle = "#ababab"; bump.textAlign = "center"; bump.font = "54px Georgia"; bump.fillText("LƯU", 384, 478);
  const color = new THREE.CanvasTexture(canvas); color.colorSpace = THREE.SRGBColorSpace; color.anisotropy = 8;
  const height = new THREE.CanvasTexture(bumpCanvas); height.anisotropy = 8;
  return { color, height };
}

function roundedCover() {
  const shape = new THREE.Shape();
  const x = -CW / 2, y = -CH / 2, r = .075;
  shape.moveTo(x + r, y); shape.lineTo(x + CW - r, y);
  shape.quadraticCurveTo(x + CW, y, x + CW, y + r);
  shape.lineTo(x + CW, y + CH - r); shape.quadraticCurveTo(x + CW, y + CH, x + CW - r, y + CH);
  shape.lineTo(x + r, y + CH); shape.quadraticCurveTo(x, y + CH, x, y + CH - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ExtrudeGeometry(shape, { depth: .086, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .014, bevelThickness: .014, curveSegments: 8 });
}

function rimGeometry(inset: number) {
  const x = CW / 2 - inset, y = CH / 2 - inset;
  const points = [new THREE.Vector3(-x, -y, 0), new THREE.Vector3(x, -y, 0), new THREE.Vector3(x, y, 0), new THREE.Vector3(-x, y, 0)];
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < 4; i++) path.add(new THREE.LineCurve3(points[i], points[(i + 1) % 4]));
  return new THREE.TubeGeometry(path, 160, .006, 5, true);
}

function cornerGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -.29); shape.lineTo(0, -.055); shape.quadraticCurveTo(0, 0, -.055, 0);
  shape.lineTo(-.29, 0); shape.lineTo(-.29, -.045); shape.lineTo(-.105, -.105); shape.lineTo(-.045, -.29); shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: .108, bevelEnabled: true, bevelSize: .009, bevelThickness: .006, bevelSegments: 2, steps: 1 });
}

export function DetailedCover({ side }: { side: -1 | 1 }) {
  const maps = useMemo(() => leatherMaps(), []);
  const geometry = useMemo(() => ({ body: roundedCover(), rim: rimGeometry(.07), innerRim: rimGeometry(.12), corner: cornerGeometry() }), []);
  const stitches = useMemo(() => {
    const points: number[] = [];
    const x = CW / 2 - .037, y = CH / 2 - .037;
    for (let t = -x; t < x; t += .065) for (const sign of [-1, 1]) points.push(t, sign * y, -.112, Math.min(t + .028, x), sign * y, -.112);
    for (let t = -y; t < y; t += .065) for (const sign of [-1, 1]) points.push(sign * x, t, -.112, sign * x, Math.min(t + .028, y), -.112);
    return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  }, []);
  useEffect(() => () => { Object.values(geometry).forEach(g => g.dispose()); Object.values(maps).forEach(t => t.dispose()); stitches.dispose(); }, [geometry, maps, stitches]);

  return <group position={[side * (W / 2 + .025), 0, 0]}>
    <mesh geometry={geometry.body} position={[0, 0, -.23]} castShadow receiveShadow>
      <meshStandardMaterial color="#354436" bumpMap={maps.height} bumpScale={.018} roughness={.83}/>
    </mesh>
    <mesh position={[0, 0, -.109]} receiveShadow><planeGeometry args={[CW - .09, CH - .09]}/><meshStandardMaterial color="#899078" bumpMap={maps.height} bumpScale={.006} roughness={1}/></mesh>
    <mesh position={[0, 0, -.247]} rotation={[0, Math.PI, 0]} castShadow receiveShadow>
      <planeGeometry args={[CW - .04, CH - .04]}/><meshStandardMaterial map={maps.color} bumpMap={maps.height} bumpScale={.018} roughness={.73}/>
    </mesh>
    {[geometry.rim, geometry.innerRim].map((g, i) => <mesh key={i} geometry={g} position={[0, 0, -.104]} castShadow><meshStandardMaterial color="#ae9157" metalness={.65} roughness={.46}/></mesh>)}
    <lineSegments geometry={stitches}><lineBasicMaterial color="#cbb896"/></lineSegments>
    {[-1, 1].map(y => <group key={y} position={[side * (CW / 2 - .017), y * (CH / 2 - .017), -.242]} scale={[side, y, 1]}>
      <mesh geometry={geometry.corner} castShadow receiveShadow><meshStandardMaterial color="#b89a62" metalness={.78} roughness={.4}/></mesh>
      <mesh position={[-.085, -.085, .119]}><sphereGeometry args={[.015, 8, 6]}/><meshStandardMaterial color="#8e7446" metalness={.8} roughness={.35}/></mesh>
      <mesh position={[-.085, -.085, -.012]}><sphereGeometry args={[.015, 8, 6]}/><meshStandardMaterial color="#8e7446" metalness={.8} roughness={.35}/></mesh>
    </group>)}
  </group>;
}

export function SpineDetails() {
  return <group>
    <mesh position={[0, 0, -.13]} castShadow receiveShadow><cylinderGeometry args={[.115, .115, H + .28, 24]}/><meshStandardMaterial color="#344032" roughness={.86}/></mesh>
    {[-1.7, -.86, 0, .86, 1.7].map(y => <mesh key={y} position={[0, y, -.13]} castShadow><cylinderGeometry args={[.129, .129, .075, 24]}/><meshStandardMaterial color="#635c40" roughness={.8}/></mesh>)}
    {[-1, 1].map(side => <group key={side} position={[0, side * (H / 2 + .045), -.08]}>
      {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[(i - 4) * .023, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.014, .014, .16, 8]}/><meshStandardMaterial color={i % 2 ? "#b9a273" : "#ebe2ca"} roughness={1}/></mesh>)}
    </group>)}
  </group>;
}
