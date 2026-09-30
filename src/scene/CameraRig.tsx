import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { findSketch, useCad, type ViewName } from '../store/cadStore';
import { planeBasis } from '../geometry/planes';

const FOV = 45;
const HOME_POSITION = new THREE.Vector3(260, 220, 320);
const SKETCH_DISTANCE = 2000;
const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

type AnyCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

const VIEW_DIRECTIONS: Record<Exclude<ViewName, 'fit' | 'home'>, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  top: new THREE.Vector3(0, 1, 0.0001).normalize(),
  right: new THREE.Vector3(1, 0, 0),
};

/**
 * Owns the perspective/orthographic cameras and the orbit controls.
 * Mouse mapping: middle = pan, right = orbit, wheel = zoom, left is left free for selection.
 */
export function CameraRig() {
  const gl = useThree((s) => s.gl);
  const set = useThree((s) => s.set);
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);

  const projection = useCad((s) => s.projection);
  const mode = useCad((s) => s.mode);
  const sketchPlane = useCad((s) => findSketch(s.objects, s.activeSketchId)?.plane ?? null);
  const sketchOffset = useCad((s) => findSketch(s.objects, s.activeSketchId)?.offset ?? 0);
  const viewRequest = useCad((s) => s.viewRequest);

  const cams = useMemo(() => {
    const persp = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200000);
    persp.position.copy(HOME_POSITION);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -200000, 200000);
    ortho.position.copy(HOME_POSITION);
    return { persp, ortho };
  }, []);

  const controls = useMemo(() => {
    const c = new OrbitControls(cams.persp as THREE.Camera);
    c.enableDamping = true;
    c.dampingFactor = 0.15;
    c.zoomToCursor = true;
    c.screenSpacePanning = true;
    c.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    c.target.set(0, 0, 0);
    c.update();
    return c;
  }, [cams]);

  useEffect(() => {
    controls.connect(gl.domElement);
    set({ camera: cams.persp, controls });
    if (import.meta.env.DEV) (window as unknown as { __controls: OrbitControls }).__controls = controls;
    return () => controls.disconnect();
  }, [controls, gl, set, cams]);

  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    cams.persp.aspect = aspect;
    cams.persp.updateProjectionMatrix();
    Object.assign(cams.ortho, {
      left: -size.width / 2,
      right: size.width / 2,
      top: size.height / 2,
      bottom: -size.height / 2,
    });
    cams.ortho.updateProjectionMatrix();
  }, [size, cams]);

  useFrame(() => controls.update());

  /** Visible world height at the target for the current camera. */
  const visibleHeight = (cam: AnyCamera): number =>
    cam instanceof THREE.OrthographicCamera
      ? size.height / cam.zoom
      : 2 * cam.position.distanceTo(controls.target) * TAN_HALF_FOV;

  const placeCamera = (target: THREE.Vector3, dir: THREE.Vector3, height: number) => {
    const cam = controls.object as AnyCamera;
    controls.target.copy(target);
    const distance = height / (2 * TAN_HALF_FOV);
    cam.position.copy(target).addScaledVector(dir.clone().normalize(), distance);
    if (cam instanceof THREE.OrthographicCamera) {
      cam.zoom = size.height / height;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(target);
    controls.update();
  };

  // Projection switching (sketch mode always uses an orthographic view).
  const effective = mode === 'sketch' ? 'orthographic' : projection;
  useLayoutEffect(() => {
    const prev = controls.object as AnyCamera;
    const next = effective === 'perspective' ? cams.persp : cams.ortho;
    if (prev === next) return;
    const height = visibleHeight(prev);
    const dir = prev.position.clone().sub(controls.target);
    next.up.copy(prev.up);
    controls.object = next;
    placeCamera(controls.target.clone(), dir, height);
    set({ camera: next });
  }, [effective]);

  // Sketch camera: look straight at the sketch plane; restore the previous view afterwards.
  const saved = useRef<{ position: THREE.Vector3; target: THREE.Vector3; height: number } | null>(null);
  useLayoutEffect(() => {
    const cam = controls.object as AnyCamera;
    if (mode === 'sketch' && sketchPlane) {
      if (!saved.current) {
        saved.current = {
          position: cam.position.clone(),
          target: controls.target.clone(),
          height: visibleHeight(cam),
        };
      }
      const { n, v } = planeBasis(sketchPlane);
      const center = n.clone().multiplyScalar(sketchOffset);
      cam.up.copy(v);
      controls.enableRotate = false;
      controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
      placeCamera(center, n.clone().multiplyScalar(SKETCH_DISTANCE), Math.max(200, saved.current.height));
    } else if (mode !== 'sketch' && saved.current) {
      const s = saved.current;
      saved.current = null;
      cam.up.set(0, 1, 0);
      controls.enableRotate = true;
      controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
      placeCamera(s.target, s.position.clone().sub(s.target), s.height);
    }
  }, [mode, sketchPlane, sketchOffset]);

  // Named views and "fit to model".
  useEffect(() => {
    if (!viewRequest || mode === 'sketch') return;
    const cam = controls.object as AnyCamera;
    cam.up.set(0, 1, 0);
    const name = viewRequest.name;
    if (name === 'home' || name === 'fit') {
      const box = new THREE.Box3();
      scene.traverse((o) => {
        if (o.userData.cadId && o.visible) box.expandByObject(o);
      });
      if (box.isEmpty()) {
        placeCamera(new THREE.Vector3(), HOME_POSITION.clone(), 2 * HOME_POSITION.length() * TAN_HALF_FOV);
        return;
      }
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const dir = name === 'home' ? HOME_POSITION.clone() : cam.position.clone().sub(controls.target);
      placeCamera(sphere.center, dir.lengthSq() > 0 ? dir : HOME_POSITION.clone(), Math.max(20, sphere.radius * 2.6));
      return;
    }
    placeCamera(controls.target.clone(), VIEW_DIRECTIONS[name].clone(), visibleHeight(cam));
  }, [viewRequest]);

  return null;
}
