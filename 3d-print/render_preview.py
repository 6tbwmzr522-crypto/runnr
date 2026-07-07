#!/usr/bin/env python3
"""Render preview images of the heart pen holder STL."""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import trimesh
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

STL = Path(__file__).resolve().parent / "heart_pen_holder.stl"
OUT = Path(__file__).resolve().parent / "heart_pen_holder_preview.png"


def plot_mesh(ax, mesh: trimesh.Trimesh, elev: float, azim: float, title: str) -> None:
    verts = mesh.vertices
    faces = mesh.faces
    polys = verts[faces]

    z_mean = polys[:, :, 2].mean(axis=1)
    z_norm = (z_mean - z_mean.min()) / max(z_mean.max() - z_mean.min(), 1e-6)
    colors = plt.cm.Greys(0.5 + 0.4 * z_norm)

    collection = Poly3DCollection(polys, facecolors=colors, edgecolors="#666666", linewidths=0.08)
    ax.add_collection3d(collection)

    ax.set_xlim(verts[:, 0].min() - 4, verts[:, 0].max() + 4)
    ax.set_ylim(verts[:, 1].min() - 4, verts[:, 1].max() + 4)
    ax.set_zlim(verts[:, 2].min() - 2, verts[:, 2].max() + 4)
    ax.set_box_aspect(
        (
            verts[:, 0].max() - verts[:, 0].min(),
            verts[:, 1].max() - verts[:, 1].min(),
            verts[:, 2].max() - verts[:, 2].min(),
        )
    )
    ax.set_title(title, fontsize=11, pad=4)
    ax.view_init(elev=elev, azim=azim)
    ax.set_axis_off()


def main() -> None:
    mesh = trimesh.load(STL)
    if isinstance(mesh, trimesh.Scene):
        mesh = trimesh.util.concatenate(tuple(mesh.geometry.values()))

    fig = plt.figure(figsize=(14, 5.5), facecolor="#eef1f5")
    fig.suptitle("Heart Pen Holder — 3D Preview", fontsize=15, fontweight="bold", y=0.98)

    views = [
        (24, -58, "Perspective"),
        (8, 90, "Side"),
        (90, -90, "Top"),
    ]
    for i, (elev, azim, title) in enumerate(views, 1):
        ax = fig.add_subplot(1, 3, i, projection="3d", facecolor="#eef1f5")
        plot_mesh(ax, mesh, elev, azim, title)

    fig.text(
        0.5,
        0.02,
        "~83 × 66 × 14 mm   •   Print flat face on bed (14 mm thick)   •   Anycubic Kobra 2 Pro",
        ha="center",
        color="#555555",
        fontsize=10,
    )
    fig.tight_layout(rect=[0, 0.05, 1, 0.94])
    fig.savefig(OUT, dpi=200, facecolor=fig.get_facecolor(), bbox_inches="tight")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
