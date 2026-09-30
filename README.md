# MiniCAD — subwoffer_designer

A lightweight, browser-based 3D CAD sketcher inspired by the basic Fusion 360 workflow:
**Sketch → Dimension → Extrude → Edit → View → Save → Export**.

Runs entirely in the browser (no backend). Built with React, TypeScript, Three.js,
React Three Fiber, drei, Zustand and Tailwind CSS.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Features

### Subwoofer box designer

Click **Sub Box** in the bottom toolbar (or **Design a subwoofer box** on the start screen).
A box is designed immediately and the **Subwoofer** tab opens.

1. Type your subwoofer's data sheet values (Fs, Qts, Vas, Xmax, Sd, cutout/outer diameter,
   mounting depth, displacement) or pick a generic preset, and how many subwoofers you use.
   The box is **redesigned automatically as you type** (until you reshape it yourself).
2. Choose **Sealed** or **Ported**. The needed net volume and port tuning are calculated
   (sealed: target Qtc; ported: classic Keele alignment), or type your own values, e.g. the
   manufacturer's recommendation.
3. **Click a side** of the box: it turns blue and shows the panel's **cut size** (also in the tab).
   **Drag the blue side** (or its orange arrow) to make the box bigger or smaller. With
   **Keep volume** on, another size changes automatically so the net volume stays perfect.
4. **Angles:** tilt the front or back by a number of degrees, type the depth at the top, drag
   the orange ball on the top edge, or use **Fit behind an angled seat…** (enter the height,
   floor depth and top depth of the space; the width adjusts to keep the volume).
5. **Drag the subwoofer** anywhere on the box: drag it over an edge to put it on the top, back,
   bottom or a side (or pick the side in the tab). Round ports can be dragged on the front.
6. **Redesign box for me** throws away your shape changes and starts fresh.

The tab shows the current outside size, net volume (gross − subwoofers − port) versus the
needed volume, the port area (minimum and recommended) and length (needed versus current),
the actual tuning, estimated port air speed, warnings (things that don't fit, port noise),
and a **cut list**. Slot ports run along the bottom and fold up the back wall when they are long.
The box geometry has real cutouts, so the STL export matches.

The acoustic formulas are standard approximations; check important builds with a dedicated
simulator (e.g. WinISD) and the manufacturer's recommendations.

### CAD
- **Viewport**: grid, colored X/Y/Z axes, view cube, Home/Fit/Front/Top/Right views,
  perspective/orthographic toggle, shadows, selection and hover highlighting.
- **Mouse**: left = select, right drag = orbit, middle drag = pan, wheel = zoom.
- **Primitives**: box, cylinder, sphere, cone, tube with editable dimensions.
- **Transform**: move / rotate / scale gizmos plus numeric position, rotation and scale.
- **Sketch mode** on the XY, XZ or YZ plane: line, rectangle, circle, arc (center/start/end),
  regular polygon. Point snapping, grid snapping and click-to-edit dimension labels
  (type `50`, `50 mm`, `5 cm` or `2 in`).
- **Extrude**: closed profiles (rectangles, circles, polygons, closed line/arc chains) with live
  preview. Profiles inside other profiles become holes. Negative distances extrude the other way.
  The extrusion keeps a copy of the sketch profile, so later sketch edits don't change existing extrusions.
- **Browser (model tree)**: select, rename (double-click), hide/show, delete, edit sketches.
- **Units**: mm (default), cm, inches. Models are always stored in millimetres.
- **Projects**: save/open/rename/delete in browser storage, JSON import/export.
- **STL export** of all visible solids (binary, millimetres, Z-up for slicers).
- **Undo/redo** for all model changes.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) | Undo / Redo |
| Ctrl+S | Save project |
| Ctrl+D | Duplicate selected object |
| Delete | Delete selected object (or sketch curve in sketch mode) |
| Esc | Cancel current operation / deselect |
| V, M, R, S | Select, Move, Rotate, Scale |
| F | Zoom to fit |
| Sketch mode: V, L, R, C, A, P | Select, Line, Rectangle, Circle, Arc, Polygon |
| Extrude: Enter | Confirm extrusion |

## Project structure

```
src/
  types/        Shared TypeScript types (objects, sketch entities, project file)
  store/        Zustand model/session state and snapshot-based undo/redo
  geometry/     Primitive + extrude geometry builders, sketch plane frames
  sketch/       Sketch entity math, hit-testing and closed-profile detection
  subwoofer/    Acoustics formulas, enclosure volume/port/auto-design math, box CSG geometry
  scene/        3D viewport: camera rig, grid/axes, objects, gizmo, sketch editor
  ui/           Top bar, model tree, properties, toolbars, dialogs
  storage/      localStorage persistence, JSON validation, project actions
  export/       STL / JSON export and file download helpers
  hooks/        Keyboard shortcuts
  utils/        Units and id helpers
```
