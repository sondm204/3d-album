import * as THREE from "three";
import { photoPageAt } from "./album-pages.ts";
import { PAGE_WIDTH as W, PAGE_HEIGHT as H, deformSheet, progressAtPointer, shouldCompleteTurn } from "./page-geometry.ts";

export type Direction = 1 | -1;
// side identifies the wing that folds: left at the beginning, right at the end.
export type CoverState = { progress: number; closed: boolean; side: Direction };
export type ActiveTurn = { from: number; direction: Direction; kind: "page" | "close" | "open" };
export type Turn = {
  kind: ActiveTurn["kind"];
  from: number; direction: Direction; progress: number; desired: number;
  velocity: number; target: number; released: boolean; corner: number; twist: number;
};
type Gesture = {
  kind: "rotate" | "page"; pointerId: number; x: number; y: number;
  startLocalX: number; startLocalY: number; rotation: [number, number];
  moved: number; lastTime: number; lastProgress: number; velocity: number;
};

type Ref<T> = { current: T };
export type InteractionOptions = {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  book: Ref<THREE.Group | null>;
  spreadCount: number;
  spreadRef: Ref<number>;
  turn: Ref<Turn | null>;
  cover: Ref<CoverState>;
  rotation: Ref<[number, number]>;
  zoom: Ref<number>;
  hover: Ref<{ side: number; corner: number; amount: number }>;
  geometry: { left: THREE.BufferGeometry; right: THREE.BufferGeometry; turning: THREE.BufferGeometry };
  setActive: (value: ActiveTurn) => void;
  onPhotoClick?: (index: number) => void;
  onPhotoHover?: (index: number | null) => void;
};

export function attachBookInteractions({ canvas, camera, book, spreadCount, spreadRef, turn, cover, rotation, zoom, hover, geometry, setActive, onPhotoClick, onPhotoHover }: InteractionOptions) {
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Album ảnh tương tác: kéo giữa để xoay, kéo mép để lật, cuộn để thu phóng");
    canvas.setAttribute("aria-describedby", "album-gestures");
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -.057);
    const inverse = new THREE.Matrix4();
    const localRay = new THREE.Ray();
    const pointers = new Map<number, { x: number; y: number }>();
    let gesture: Gesture | null = null;
    let pinch: { distance: number; zoom: number } | null = null;

    const project = (x: number, y: number, requireHit = false) => {
      if (!book.current) return null;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
      book.current.updateWorldMatrix(true, false);
      inverse.copy(book.current.matrixWorld).invert();
      localRay.copy(raycaster.ray).applyMatrix4(inverse);
      plane.constant = cover.current.closed ? -.515 : -.057;
      const point = localRay.intersectPlane(plane, new THREE.Vector3());
      const minX = cover.current.closed && cover.current.side === -1 ? -.18 : -W - .23;
      const maxX = cover.current.closed && cover.current.side === 1 ? .18 : W + .23;
      if (!point || (requireHit && (point.x < minX || point.x > maxX || Math.abs(point.y) > H / 2 + .23))) return null;
      return { point, front: localRay.direction.z < 0 };
    };
    const pageDirection = (x: number, y: number, front: boolean): Direction | 0 => {
      // A wider target at the corners makes grabbing paper easy on touch screens.
      const edge = Math.abs(x) > W * .77 || (Math.abs(x) > W * .58 && Math.abs(y) > H * .35);
      if (!front || !edge) return 0;
      if (cover.current.closed) return x * cover.current.side < 0 ? -cover.current.side as Direction : 0;
      if (x > 0) return 1;
      if (x < 0) return -1;
      return 0;
    };
    const beginTurn = (direction: Direction, corner: number, automatic = false) => {
      if (turn.current) return;
      const from = spreadRef.current;
      if (cover.current.closed && direction !== -cover.current.side) return;
      const atCover = (from === 0 && direction === -1) || (from === spreadCount - 1 && direction === 1);
      const kind = cover.current.closed ? "open" : atCover ? "close" : "page";
      if (kind === "close") cover.current.side = direction;
      const p = kind === "page" && hover.current.side === direction ? hover.current.amount : 0;
      turn.current = { kind, from, direction, progress: p, desired: p, target: automatic ? 1 : 0, released: automatic, velocity: 0, corner, twist: 0 };
      deformSheet(geometry.turning, direction === 1 ? p : 1 - p, corner, 0);
      deformSheet(geometry.left, 1, 0, 0);
      deformSheet(geometry.right, 0, 0, 0);
      hover.current = { side: 0, corner: 0, amount: 0 };
      setActive({ from, direction, kind });
    };
    const pointerDistance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const hit = project(event.clientX, event.clientY, true);
      if (!hit && !pointers.size) return;
      event.preventDefault(); canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2) {
        if (turn.current && !turn.current.released) { turn.current.target = 0; turn.current.released = true; turn.current.velocity = 0; }
        gesture = null;
        pinch = { distance: Math.max(1, pointerDistance()), zoom: zoom.current };
        return;
      }
      if (!hit || turn.current) return;
      const direction = pageDirection(hit.point.x, hit.point.y, hit.front);
      gesture = {
        kind: direction ? "page" : "rotate", pointerId: event.pointerId,
        x: event.clientX, y: event.clientY, startLocalX: hit.point.x, startLocalY: hit.point.y,
        rotation: [...rotation.current], moved: 0, lastTime: event.timeStamp, lastProgress: 0, velocity: 0,
      };
      if (direction) beginTurn(direction, THREE.MathUtils.clamp(hit.point.y, -H / 2, H / 2));
      onPhotoHover?.(null);
      hover.current.side = 0;
      canvas.style.cursor = "grabbing";
    };
    const move = (event: PointerEvent) => {
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && pointers.size >= 2) {
        zoom.current = THREE.MathUtils.clamp(pinch.zoom * pointerDistance() / pinch.distance, .55, 2.3);
        return;
      }
      if (!gesture || gesture.pointerId !== event.pointerId) {
        if (turn.current) return;
        const hit = project(event.clientX, event.clientY, true);
        const direction = hit ? pageDirection(hit.point.x, hit.point.y, hit.front) : 0;
        if (hover.current.side !== direction) {
          deformSheet(geometry.left, 1, 0, 0); deformSheet(geometry.right, 0, 0, 0);
          hover.current.amount = 0;
        }
        const atCover = (spreadRef.current === 0 && direction === -1) || (spreadRef.current === spreadCount - 1 && direction === 1);
        hover.current.side = cover.current.closed || atCover ? 0 : direction;
        hover.current.corner = hit?.point.y ?? 0;
        const photo = hit?.front && !cover.current.closed && !direction ? photoPageAt(hit.point.x, hit.point.y, spreadRef.current) : null;
        onPhotoHover?.(photo);
        canvas.style.cursor = hit ? direction || photo !== null ? "pointer" : "grab" : "default";
        return;
      }
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
      if (gesture.kind === "rotate") {
        rotation.current = [THREE.MathUtils.clamp(gesture.rotation[0] + dy * .005, -1.1, 1.1), gesture.rotation[1] + dx * .006];
      } else if (turn.current && !turn.current.released) {
        const hit = project(event.clientX, event.clientY);
        if (!hit) return;
        const t = turn.current;
        t.twist = THREE.MathUtils.clamp((hit.point.y - gesture.startLocalY) / H, -.8, .8);
        const sourceX = W + t.direction * (hit.point.x - gesture.startLocalX);
        const p = t.kind === "page" ? progressAtPointer(sourceX, t.direction, t.corner, t.twist)
          : Math.acos(THREE.MathUtils.clamp(sourceX / W, -1, 1)) / Math.PI;
        const dt = Math.max(.008, (event.timeStamp - gesture.lastTime) / 1000);
        gesture.velocity = THREE.MathUtils.clamp((p - gesture.lastProgress) / dt, -3, 3);
        gesture.lastProgress = p; gesture.lastTime = event.timeStamp;
        t.desired = p;
      }
    };
    const release = (event: PointerEvent, cancelled = false) => {
      let clickedPhoto: number | null = null;
      if (!cancelled && gesture?.pointerId === event.pointerId && gesture.kind === "rotate" && gesture.moved < 6 && !cover.current.closed && !turn.current) {
        const hit = project(event.clientX, event.clientY, true);
        if (hit?.front && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) {
          clickedPhoto = photoPageAt(gesture.startLocalX, gesture.startLocalY, spreadRef.current);
        }
      }
      if (gesture?.pointerId === event.pointerId && gesture.kind === "page" && turn.current && !turn.current.released) {
        const t = turn.current;
        const velocity = event.timeStamp - gesture.lastTime > 120 ? 0 : gesture.velocity;
        t.target = shouldCompleteTurn(t.desired, velocity, gesture.moved, cancelled) ? 1 : 0;
        t.velocity = velocity; t.released = true;
      }
      if (gesture?.pointerId === event.pointerId) gesture = null;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = "default";
      if (clickedPhoto !== null) onPhotoClick?.(clickedPhoto);
    };
    const cancel = (event: PointerEvent) => release(event, true);
    const leave = () => { if (!gesture) hover.current.side = 0; onPhotoHover?.(null); };
    const blur = () => {
      if (turn.current && !turn.current.released) { turn.current.target = 0; turn.current.released = true; turn.current.velocity = 0; }
      gesture = null; pinch = null; pointers.clear(); hover.current.side = 0;
      onPhotoHover?.(null);
      canvas.style.cursor = "default";
    };
    const wheel = (event: WheelEvent) => {
      if (!project(event.clientX, event.clientY, true)) return;
      event.preventDefault();
      if (gesture?.kind === "page") return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      zoom.current = THREE.MathUtils.clamp(zoom.current * Math.exp(-event.deltaY * unit * .0013), .55, 2.3);
    };
    const reset = (event: MouseEvent) => {
      const hit = project(event.clientX, event.clientY, true);
      if (hit && Math.abs(hit.point.x) < W * .72 && !turn.current) { zoom.current = 1; rotation.current = [-.29, -.10]; }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") beginTurn(1, -H / 2, true);
      else if (event.key === "ArrowLeft") beginTurn(-1, -H / 2, true);
      else if (event.key === "+" || event.key === "=") zoom.current = Math.min(2.3, zoom.current + .1);
      else if (event.key === "-") zoom.current = Math.max(.55, zoom.current - .1);
      else if (event.key === "Home") { zoom.current = 1; rotation.current = [-.29, -.10]; }
      else if (event.key === "Enter" && !turn.current && !cover.current.closed) onPhotoClick?.(spreadRef.current * 2 + (event.shiftKey ? 1 : 0));
      else if (event.key === "Escape" && turn.current) { turn.current.target = 0; turn.current.released = true; }
      else return;
      event.preventDefault();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", cancel);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("dblclick", reset);
    canvas.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    return () => {
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", release); canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel); canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel); canvas.removeEventListener("dblclick", reset);
      canvas.removeEventListener("keydown", key); window.removeEventListener("blur", blur);
      blur();
    };

}
