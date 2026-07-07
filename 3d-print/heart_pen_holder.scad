// Heart pen holder — open in OpenSCAD and export STL (F6)
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
