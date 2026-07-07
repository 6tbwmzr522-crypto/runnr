#!/usr/bin/env python3
"""Generate heart-shaped pen holder STL for Anycubic Kobra 2 Pro."""

from __future__ import annotations

import math
from pathlib import Path

import cadquery as cq

# --- Dimensions (mm) — fits Kobra 2 Pro bed 220×220×250 ---
# Heart profile lies in XZ; extruded along Y so a broad flat face sits on the table.
SCALE = 2.6
DEPTH = 14.0          # slab thickness (flat sides)
WALL = 8.5
PEN_HOLE_D = 11.8
PEN_RECESS_D = 7.5
PEN_RECESS_DEPTH = 2.0
FLAT_TIP = 9.0        # flat base at heart point (keeps shape closed)
FILLET_R = 1.8

OUT_DIR = Path(__file__).resolve().parent
STL_PATH = OUT_DIR / "heart_pen_holder.stl"
SCAD_PATH = OUT_DIR / "heart_pen_holder.scad"


def heart_points(steps: int = 120) -> list[tuple[float, float]]:
    """Parametric heart in XZ plane: (x, z)."""
    pts: list[tuple[float, float]] = []
    for i in range(steps):
        t = 2.0 * math.pi * i / steps
        x = 16.0 * math.sin(t) ** 3
        z = (
            13.0 * math.cos(t)
            - 5.0 * math.cos(2.0 * t)
            - 2.0 * math.cos(3.0 * t)
            - math.cos(4.0 * t)
        )
        pts.append((SCALE * x, SCALE * z))
    return pts


def flat_bottom_profile(pts: list[tuple[float, float]], flat_tip: float) -> list[tuple[float, float]]:
    """Clip the heart tip to a flat base so the frame stays a closed loop."""
    min_z = min(z for _, z in pts)
    flat_z = min_z + flat_tip

    clipped: list[tuple[float, float]] = []
    for x, z in pts:
        clipped.append((x, max(z, flat_z)))

    # Collapse the flat edge to just the left/right endpoints.
    flat_pts = [(x, z) for x, z in clipped if abs(z - flat_z) < 0.05]
    if len(flat_pts) < 2:
        return clipped

    left = min(flat_pts, key=lambda p: p[0])
    right = max(flat_pts, key=lambda p: p[0])
    upper = [(x, z) for x, z in clipped if z > flat_z + 0.05]

    rebuilt = upper + [right, left]
    if rebuilt[0] != rebuilt[-1]:
        rebuilt.append(rebuilt[0])
    return rebuilt[:-1]


def inner_profile(outer: list[tuple[float, float]], wall: float) -> list[tuple[float, float]]:
    """Shrink profile inward; fall back to uniform scale if offset fails."""
    wp = cq.Workplane("XZ").polyline(outer).close()
    try:
        inner_wp = wp.offset2D(-wall)
        return [(float(v.x), float(v.z)) for v in inner_wp.val().Vertices()]
    except Exception:
        factor = 1.0 - (2.0 * wall) / max(x for x, _ in outer)
        cx = sum(x for x, _ in outer) / len(outer)
        cz = sum(z for _, z in outer) / len(outer)
        return [
            (cx + (x - cx) * factor, cz + (z - cz) * factor)
            for x, z in outer
        ]


def build_model() -> cq.Workplane:
    outer_pts = flat_bottom_profile(heart_points(), FLAT_TIP)
    inner_pts = inner_profile(outer_pts, WALL)

    zs = [z for _, z in outer_pts]
    top_z = max(zs)
    flat_z = min(zs)

    outer = cq.Workplane("XZ").polyline(outer_pts).close().extrude(DEPTH)
    inner = cq.Workplane("XZ").polyline(inner_pts).close().extrude(DEPTH)
    frame = outer.cut(inner)

    # Pen hole through the slab at the top cleft (like the reference photo).
    pen_y = DEPTH / 2.0
    pen_z = top_z - 5.0
    pen_hole = (
        cq.Workplane("XZ")
        .workplane(offset=pen_y)
        .center(0, pen_z)
        .circle(PEN_HOLE_D / 2.0)
        .extrude(DEPTH + 2.0, both=True)
    )
    frame = frame.cut(pen_hole)

    # Tip cup on the inner bottom surface to seat the pen.
    recess = (
        cq.Workplane("XZ")
        .workplane(offset=DEPTH - 0.5)
        .center(0, flat_z + 2.0)
        .sphere(PEN_RECESS_D / 2.0)
    )
    frame = frame.cut(recess)

    try:
        frame = frame.edges("|Y").fillet(FILLET_R)
    except Exception:
        pass
    try:
        frame = frame.edges("#Y").fillet(FILLET_R * 0.7)
    except Exception:
        pass

    # CadQuery XZ extrude can land below Y=0; lift so the flat face rests on the bed.
    frame = frame.translate((0, DEPTH, 0))

    # Lay the broad heart face on the build plate; 14 mm builds upward.
    frame = frame.rotate((1, 0, 0), (0, 0, 0), -90)

    # Move bottom of print to Z = 0.
    bbox = frame.val().BoundingBox()
    frame = frame.translate((0, 0, -bbox.zmin))

    return frame


def write_openscad() -> None:
    """Parametric OpenSCAD source for manual tweaks in OpenSCAD."""
    SCAD_PATH.write_text(
        """// Heart pen holder — open in OpenSCAD and export STL (F6)
// Profile in XZ, extruded along Y; print with Y=0 face on the bed.
scale = 2.6;
depth = 14;
wall = 8.5;
pen_d = 11.8;
flat_tip = 9;

module heart_2d(s=1) {
  scale(s) {
    union() {
      translate([0, 5, 0]) circle(d=30);
      translate([-13, 0, 0]) circle(d=30);
      translate([13, 0, 0]) circle(d=30);
    }
    translate([0, -8, 0]) square([40, 20], center=true);
  }
}

difference() {
  linear_extrude(depth)
    difference() {
      intersection() {
        heart_2d(scale);
        translate([0, flat_tip / 2, 0]) square([120, 80], center=false);
      }
      offset(delta=-wall) heart_2d(scale);
    }
  translate([0, 38 * scale / 2.6, depth / 2]) rotate([0, 90, 0])
    cylinder(h=depth + 4, d=pen_d, center=true, $fn=64);
}
""",
        encoding="utf-8",
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    model = build_model()
    cq.exporters.export(model, str(STL_PATH), tolerance=0.05, angularTolerance=0.1)
    write_openscad()
    print(f"Wrote {STL_PATH}")
    print(f"Wrote {SCAD_PATH}")


if __name__ == "__main__":
    main()
