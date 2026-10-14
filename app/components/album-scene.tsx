"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { displayDate, type Memory } from "./memories";
import { makePage, type PageTexture } from "./page-texture";
import { albumSpreadCount } from "./album-pages";
import { DetailedCover, SpineDetails } from "./book-cover";
import { attachBookInteractions, type ActiveTurn, type CoverState, type Turn } from "./album-interaction";
import {
  PAGE_WIDTH as W, PAGE_HEIGHT as H, createSheetGeometry, deformSheet,
  advanceTurn,
} from "./page-geometry";


function Paper({ geometry, front, back, visible = true, height = .057 }: {
  geometry: THREE.BufferGeometry; front?: THREE.Texture; back?: THREE.Texture; visible?: boolean; height?: number;
}) {
  return <mesh geometry={geometry} position={[0, 0, height]} visible={visible} castShadow receiveShadow frustumCulled={false}>
    <meshStandardMaterial attach="material-0" map={front} color={front ? "#ffffff" : "#f2eddf"} roughness={.95} metalness={0}/>
    <meshStandardMaterial attach="material-1" map={back} color={back ? "#ffffff" : "#f2eddf"} roughness={.95} metalness={0}/>
    <meshStandardMaterial attach="material-2" color="#ddd3bc" roughness={1}/>
  </mesh>;
}

type AlbumProps = { memories: Memory[]; status: string; onSelect: (index: number) => void; initialSpread: number };

function InteractiveBook({ memories, status, onSelect, initialSpread, onPageChange, onClosedChange }: AlbumProps & { onPageChange: (page: number) => void; onClosedChange: (closed: boolean) => void }) {
  const { gl, camera, viewport } = useThree();
  const rig = useRef<THREE.Group>(null);
  const book = useRef<THREE.Group>(null);
  const leftWing = useRef<THREE.Group>(null);
  const rightWing = useRef<THREE.Group>(null);
  const spine = useRef<THREE.Group>(null);
  const cover = useRef<CoverState>({ progress: 0, closed: false, side: 1 });
  const [textures, setTextures] = useState<PageTexture[]>([]);
  const [spread, setSpread] = useState(initialSpread);
  const spreadRef = useRef(initialSpread);
  const hoveredPhoto = useRef<number | null>(null);
  const photoAmounts = useRef<number[]>([]);
  const [active, setActive] = useState<ActiveTurn | null>(null);
  const turn = useRef<Turn | null>(null);
  const rotation = useRef<[number, number]>([-.29, -.10]);
  const zoom = useRef(1);
  const reducedMotion = useRef(false);
  const hover = useRef({ side: 0, corner: 0, amount: 0 });
  const geometry = useMemo(() => {
    const left = createSheetGeometry(), right = createSheetGeometry(), turning = createSheetGeometry();
    deformSheet(left, 1, 0, 0);
    return { left, right, turning };
  }, []);

  useEffect(() => {
    const pages = Array.from({ length: albumSpreadCount(memories.length) * 2 }, (_, i) => makePage(memories[i], i, status, !status && i === memories.length));
    // Canvas textures are external GPU resources: create after commit and dispose on cleanup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTextures(pages);
    return () => pages.forEach(page => page.dispose());
  }, [memories, status]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { reducedMotion.current = media.matches; };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => () => Object.values(geometry).forEach(value => value.dispose()), [geometry]);

  useEffect(() => attachBookInteractions({
    canvas: gl.domElement, camera, book, spreadCount: albumSpreadCount(memories.length),
    spreadRef, turn, cover, rotation, zoom, hover, geometry, setActive,
    onPhotoClick: index => { if (!status && index <= memories.length) onSelect(index); },
    onPhotoHover: index => { hoveredPhoto.current = index; },
  }), [gl, camera, geometry, memories.length, onSelect, status]);

  useFrame((_, delta) => {
    const group = rig.current;
    if (!group) return;
    const dt = Math.min(delta, .05);
    textures.forEach((texture, index) => {
      const target = !turn.current && !cover.current.closed && hoveredPhoto.current === index ? 1 : 0;
      const amount = reducedMotion.current ? target : THREE.MathUtils.damp(photoAmounts.current[index] || 0, target, 12, dt);
      photoAmounts.current[index] = amount;
      texture.setHover(amount);
    });
    const fit = Math.min(viewport.width / 8.4, viewport.height / 6.1) * zoom.current;
    const scale = THREE.MathUtils.damp(group.scale.x, fit, 11, dt);
    group.scale.setScalar(scale);
    // Freeze the book's orientation while holding a page, so the projection stays stable.
    if (!turn.current) {
      group.rotation.x = THREE.MathUtils.damp(group.rotation.x, rotation.current[0], 12, dt);
      group.rotation.y = THREE.MathUtils.damp(group.rotation.y, rotation.current[1], 12, dt);
    }
    const t = turn.current;
    if (t) {
      let settled = false;
      if (t.released) {
        const next = advanceTurn(t.progress, t.velocity, t.target, t.kind === "page" ? dt : dt * .72);
        t.progress = reducedMotion.current ? t.target : next.progress;
        t.velocity = next.velocity;
        settled = reducedMotion.current || next.settled;
      } else {
        t.progress = THREE.MathUtils.damp(t.progress, t.desired, 28, dt);
      }
      if (t.kind === "page") deformSheet(geometry.turning, t.direction === 1 ? t.progress : 1 - t.progress, t.corner, t.twist);
      else cover.current.progress = t.kind === "close" ? t.progress : 1 - t.progress;
      if (settled) {
        const next = t.from + (t.kind === "page" && t.target === 1 ? t.direction : 0);
        if (t.kind !== "page") {
          cover.current.closed = t.kind === "close" ? t.target === 1 : t.target === 0;
          cover.current.progress = cover.current.closed ? 1 : 0;
          onClosedChange(cover.current.closed);
        }
        spreadRef.current = next; setSpread(next); onPageChange(next);
        turn.current = null; setActive(null);
      }
    } else {
      const h = hover.current;
      const desired = h.side && !cover.current.closed && !reducedMotion.current ? .025 : 0;
      const amount = THREE.MathUtils.damp(h.amount, desired, 12, dt);
      if (Math.abs(amount - h.amount) > .00001 || h.amount > .0001) {
        h.amount = amount;
        deformSheet(geometry.left, h.side === -1 ? 1 - amount : 1, h.corner, 0);
        deformSheet(geometry.right, h.side === 1 ? amount : 0, h.corner, 0);
      }
    }
    if (leftWing.current) leftWing.current.rotation.y = cover.current.side === -1 ? Math.PI * cover.current.progress : 0;
    if (rightWing.current) rightWing.current.rotation.y = cover.current.side === 1 ? -Math.PI * cover.current.progress : 0;
    if (spine.current) {
      spine.current.scale.z = 1 + 2.2 * cover.current.progress;
      spine.current.position.z = .55 * cover.current.progress;
    }
    // Keep the hinge stationary under the pointer; recenter only after release.
    if (book.current && (!t || t.released)) {
      book.current.position.x = THREE.MathUtils.damp(book.current.position.x, cover.current.side * W / 2 * cover.current.progress, 9, dt);
    }
  });

  const pageTurn = active?.kind === "page" ? active : null;
  const left = pageTurn?.direction === -1 ? (pageTurn.from - 1) * 2 : spread * 2;
  const right = pageTurn?.direction === 1 ? (pageTurn.from + 1) * 2 + 1 : spread * 2 + 1;
  const front = pageTurn ? (pageTurn.direction === 1 ? pageTurn.from * 2 + 1 : (pageTurn.from - 1) * 2 + 1) : 1;
  const back = pageTurn ? (pageTurn.direction === 1 ? (pageTurn.from + 1) * 2 : pageTurn.from * 2) : 2;

  const wing = (side: -1 | 1) => <>
    <DetailedCover side={side}/>
    {Array.from({ length: 11 }, (_, i) => <mesh key={i} position={[side * (W / 2 + .006), -.003 * i, -.12 + i * .015]} castShadow receiveShadow>
      <boxGeometry args={[W - .008 * (i % 3), H - .005 * (i % 2), .012]}/>
      <meshStandardMaterial color={i % 3 === 0 ? "#c9bea5" : "#e2d9c4"} roughness={1}/>
    </mesh>)}
    <Paper geometry={side === -1 ? geometry.left : geometry.right} front={textures[side === -1 ? left : right]} back={textures[side === -1 ? left : right]}/>
  </>;
  return <group ref={rig} rotation={[-.29, -.10, -.025]}>
    <group ref={book}>
      <group ref={leftWing} position={[0, 0, .14]}>
        <group position={[0, 0, -.14]}>{wing(-1)}</group>
      </group>
      <group ref={rightWing} position={[0, 0, .14]}>
        <group position={[0, 0, -.14]}>{wing(1)}</group>
      </group>
      <group ref={spine}><SpineDetails/></group>
      <Paper geometry={geometry.turning} front={textures[front]} back={textures[back]} height={.073} visible={!!pageTurn}/>
    </group>
  </group>;
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function FlatAlbum({ memories, status, onSelect, initialSpread }: AlbumProps) {
  const [spread, setSpread] = useState(initialSpread);
  const [closed, setClosed] = useState(false);
  const [closedSide, setClosedSide] = useState(-1);
  const [scale, setScale] = useState(1);
  const drag = useRef({ x: 0, y: 0 });
  const album = useRef<HTMLDivElement>(null);
  const turn = (direction: number) => {
    if (closed) { if (direction === -closedSide) setClosed(false); return; }
    if ((direction < 0 && spread === 0) || (direction > 0 && spread === albumSpreadCount(memories.length) - 1)) {
      setClosedSide(direction); setClosed(true); return;
    }
    setSpread(value => Math.max(0, Math.min(albumSpreadCount(memories.length) - 1, value + direction)));
  };
  useEffect(() => {
    const element = album.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); setScale(value => Math.max(.6, Math.min(2, value * Math.exp(-event.deltaY * .0013)))); };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  return <div ref={album} className={`flat-album ${closed ? "is-closed" : ""}`} tabIndex={0} aria-label={closed ? "Album đã đóng. Kéo mép ngoài của bìa theo chiều ngược lúc đóng để mở lại." : "Album ở chế độ ảnh do thiết bị không hỗ trợ 3D"} style={{ transform: `translate(-50%, -50%) rotate(-2deg) scale(${scale})` }}
    onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerUp={event => {
      const dx = event.clientX - drag.current.x;
      if (Math.abs(dx) > 35) turn(dx < 0 ? 1 : -1);
      else if (!closed && Math.hypot(dx, event.clientY - drag.current.y) < 6 && !status) {
        const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-photo-page]");
        if (element) { onSelect(Number(element.dataset.photoPage)); event.currentTarget.releasePointerCapture(event.pointerId); return; }
        const rect = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width;
        if (x > .8) turn(1); if (x < .2) turn(-1);
      }
      else { const rect = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width; if (x > .8) turn(1); if (x < .2) turn(-1); }
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onKeyDown={event => { if (event.key === "ArrowRight") turn(1); if (event.key === "ArrowLeft") turn(-1); }}>
    {Array.from({ length: 2 }, (_, i) => {
      const memory = memories[spread * 2 + i];
      const index = spread * 2 + i;
      const photoProps = { "data-photo-page": index, role: "button", tabIndex: closed ? -1 : 0, onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect(index); } } };
      return <article key={i}>{memory ? <><div {...photoProps} className="photo" aria-label={`Chỉnh sửa ${memory.title}`} style={{ backgroundImage: `url("${memory.image}")` }}/><h2>{memory.title}</h2><p>{memory.note}</p><time>{displayDate(memory.date)}</time></> : !status && index === memories.length ? <div {...photoProps} className="photo add-photo"><span>+</span>Thêm một kỷ niệm</div> : <p>{i === 0 && status ? status : "Chờ một kỷ niệm mới…"}</p>}</article>;
    })}
    <div className="flat-cover" aria-hidden="true"><strong>LƯU</strong><span>NHỮNG NGÀY ĐÁNG NHỚ</span><em>S ♥ L</em></div>
  </div>;
}

export default function AlbumScene({ memories, status = "", onSelect, initialSpread = 0 }: AlbumProps) {
  const [spread, setSpread] = useState(initialSpread);
  const [closed, setClosed] = useState(false);
  return <>
    <SceneBoundary fallback={<FlatAlbum memories={memories} status={status} onSelect={onSelect} initialSpread={initialSpread}/>}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 12], fov: 35, near: .1, far: 70 }} gl={{ antialias: true, alpha: true }} fallback={<FlatAlbum memories={memories} status={status} onSelect={onSelect} initialSpread={initialSpread}/>}>
        <ambientLight intensity={.85}/>
        <directionalLight position={[-3, 5, 9]} intensity={2.25} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-11} shadow-camera-right={11} shadow-camera-top={11} shadow-camera-bottom={-11} shadow-camera-near={.5} shadow-camera-far={35} shadow-bias={-.00015} shadow-normalBias={.012} shadow-radius={3}/>
        <directionalLight position={[5, -2, 5]} intensity={.45}/>
        <InteractiveBook memories={memories} status={status} onSelect={onSelect} initialSpread={initialSpread} onPageChange={setSpread} onClosedChange={setClosed}/>
        <mesh position={[0, 0, -2.6]} receiveShadow>
          <planeGeometry args={[200, 200]}/><shadowMaterial transparent opacity={.28}/>
        </mesh>
      </Canvas>
    </SceneBoundary>
    <div className="sr-only" aria-live="polite">{closed ? "Album đã đóng. Kéo mép ngoài của bìa theo chiều ngược lúc đóng để mở lại." : status || memories.slice(spread * 2, spread * 2 + 2).map(memory => <p key={memory.id}>{memory.title}. {memory.note} {displayDate(memory.date)}</p>)}</div>
  </>;
}
