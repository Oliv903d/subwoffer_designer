import {
  ArrowUpFromLine,
  Box,
  Circle,
  CircleDot,
  Cone,
  Cylinder,
  Globe,
  Hexagon,
  MousePointer2,
  PencilRuler,
  Slash,
  Spline,
  Square,
  Speaker,
  type LucideIcon,
} from 'lucide-react';
import type { CadObject, PrimitiveShape } from '../types/cad';
import type { SketchTool } from '../store/cadStore';

export const SHAPE_ICONS: Record<PrimitiveShape, LucideIcon> = {
  box: Box,
  cylinder: Cylinder,
  sphere: Globe,
  cone: Cone,
  tube: CircleDot,
};

export const SKETCH_TOOL_ICONS: Record<SketchTool, LucideIcon> = {
  select: MousePointer2,
  line: Slash,
  rect: Square,
  circle: Circle,
  arc: Spline,
  polygon: Hexagon,
};

export function objectIcon(o: CadObject): LucideIcon {
  if (o.kind === 'primitive') return SHAPE_ICONS[o.shape];
  if (o.kind === 'sketch') return PencilRuler;
  if (o.kind === 'enclosure') return Speaker;
  return ArrowUpFromLine;
}
