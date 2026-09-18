"""Generate CardioTwin-X's simplified NCERT teaching heart in Blender 4.2+.

Run with VS Code's Blender Development: Run Script, or:
    blender --background --python generate_ncert_heart.py

No pip dependencies; bpy, bmesh and mathutils ship with Blender. Output defaults
to public/models/ncert_heart.glb beside this script. Set CARDIOTWIN_OUTPUT_DIR
to an absolute directory to override it. Native Bezier curves stay in Blender;
same-named empty nodes carry their Y-up, meter-space control points in GLB extras.

Educational schematic, NOT a diagnostic model or CFD mesh. The relatively thin
LV wall is thicker than the RV wall, but proportions, valve leaflets and systolic
deformation are illustrative. Red/blue denote oxygenation, not actual tissue
colour. Inspect the model in Blender before using it in lessons.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import struct
import traceback
from dataclasses import dataclass

import bpy
import bmesh
from mathutils import Vector


OWNER = "cardiotwin_ncert_generator_v1"
COLLECTION_NAME = "CardioTwin_NCERT"
ROOT_NAME = "NCERT_Heart"
PATH_NAMES = ("Path_Deoxygenated_Flow", "Path_Oxygenated_Flow")
CHAMBER_NAMES = ("Left_Ventricle", "Right_Ventricle", "Left_Atrium", "Right_Atrium")
VESSEL_NAMES = ("Aorta", "Superior_Vena_Cava", "Inferior_Vena_Cava",
                "Pulmonary_Artery", "Pulmonary_Veins")
VALVE_NAMES = ("Tricuspid_Valve", "Bicuspid_Mitral_Valve",
               "Aortic_Semilunar_Valve", "Pulmonary_Semilunar_Valve")
MESH_NAMES = CHAMBER_NAMES + VESSEL_NAMES + VALVE_NAMES + ("Interventricular_Septum",)


@dataclass(frozen=True)
class Config:
    # Construction coordinates use the project's (x, up, anterior) convention:
    # patient LEFT is -x. This is a teaching-view convention, not a DICOM frame.
    meters_per_unit: float = 0.06
    chamber_segments: int = 32
    chamber_rings: int = 20
    vessel_sides: int = 12
    samples_per_span: int = 8
    wall: float = 0.022
    triangle_budget: int = 45000
    save_blend: bool = False  # Opt-in: saving changes Blender's current filepath.


def log(message):
    print(f"[CardioTwin-X] {message}", flush=True)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def xyz(point):
    """Teaching Y-up coordinates -> Blender Z-up, anterior facing -Y."""
    x, up, anterior = point
    return Vector((x, -anterior, up))


def gltf_point(point, scale):
    """Blender local coordinates -> glTF Y-up meters (not a node transform)."""
    return [round(point.x * scale, 8), round(point.z * scale, 8),
            round(-point.y * scale, 8)]


def activate(obj):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def recalculate_normals(mesh):
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
    finally:
        bm.free()
    mesh.update()


def cubic_spans(points):
    """Interpolating cubic Beziers; explicit handles shared by tubes and paths."""
    points = [Vector(p) for p in points]
    require(len(points) >= 2, "A centerline needs at least two points.")
    spans = []
    for i, (a, b) in enumerate(zip(points, points[1:])):
        before = points[i - 1] if i else a - (b - a)
        after = points[i + 2] if i + 2 < len(points) else b + (b - a)
        spans.append((a, a + (b - before) / 6, b - (after - a) / 6, b))
    return spans


def reverse_spans(spans):
    return [tuple(reversed(span)) for span in reversed(spans)]


def sample_spans(spans, steps):
    points = []
    for a, b, c, d in spans:
        for j in range(steps):
            t = j / steps
            points.append((1 - t)**3 * a + 3 * (1 - t)**2 * t * b
                          + 3 * (1 - t) * t*t * c + t**3 * d)
    points.append(spans[-1][-1].copy())
    return points


def capped_tube_geometry(points, radius, sides):
    """Solid sweep used for Boolean outer bodies and lumen cutters.

    Parallel-transport frames avoid the flips associated with a fixed up axis.
    The final hollow vessel is outer union MINUS inner union, not overlapping
    closed tubes with blocked junctions. End cutters extend past the end caps.
    """
    points = [Vector(p) for p in points]
    tangents = []
    for i, point in enumerate(points):
        delta = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
        require(delta.length > 1e-7, "Repeated tube samples; centerline is degenerate.")
        tangents.append(delta.normalized())
    normal = tangents[0].orthogonal().normalized()
    vertices, faces = [], []
    for i, (point, tangent) in enumerate(zip(points, tangents)):
        if i:
            normal = tangents[i - 1].rotation_difference(tangent) @ normal
        normal = (normal - tangent * normal.dot(tangent)).normalized()
        binormal = tangent.cross(normal).normalized()
        for j in range(sides):
            angle = math.tau * j / sides
            vertices.append(point + radius * (math.cos(angle) * normal
                                              + math.sin(angle) * binormal))
    for i in range(len(points) - 1):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(points) - 1) * sides + j for j in range(sides)))
    return vertices, faces


@dataclass
class Chamber:
    name: str
    center: Vector
    radii: Vector
    thickness: float
    oxygenation: str


@dataclass
class Port:
    chamber: str
    point: Vector
    direction: Vector
    radius: float

    @property
    def inside(self):
        return self.point - self.direction * 0.055

    @property
    def outside(self):
        return self.point + self.direction * 0.20


class HeartGenerator:
    def __init__(self, config):
        self.cfg = config
        self.collection = None
        self.root = None
        self.meshes = []
        self.curves = []
        self.materials = {}
        self.chambers = {}
        self.ports = {}
        self.lines = {}
        self.radii = {}

    def prepare(self):
        require(bpy.app.version >= (4, 2, 0), "Use Blender 4.2 LTS or newer.")
        # Validate exporter before touching generated objects.
        try:
            bpy.ops.export_scene.gltf.get_rna_type()
        except (AttributeError, RuntimeError):
            bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
        reserved = set(MESH_NAMES + PATH_NAMES + (ROOT_NAME,))
        for name in reserved:
            obj = bpy.data.objects.get(name)
            require(obj is None or obj.get('generator') == OWNER,
                    f"Object '{name}' belongs to your scene. Rename it before running.")
        old = bpy.data.collections.get(COLLECTION_NAME)
        require(old is None or old.get('generator') == OWNER,
                f"Collection '{COLLECTION_NAME}' already exists and is not ours.")
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        # Re-runnable without clearing cameras, lights, or the user's other models.
        for obj in list(bpy.data.objects):
            if obj.get('generator') == OWNER:
                self.remove(obj)
        if old:
            bpy.data.collections.remove(old)
        for material in list(bpy.data.materials):
            if material.get('generator') == OWNER and material.users == 0:
                bpy.data.materials.remove(material)
        self.collection = bpy.data.collections.new(COLLECTION_NAME)
        self.collection['generator'] = OWNER
        bpy.context.scene.collection.children.link(self.collection)
        self.root = self.new_object(ROOT_NAME, None)
        self.root['educational_only'] = True
        self.root['coordinate_convention'] = 'Y up; -X patient left; +Z anterior; meters'
        self.root['curriculum'] = 'NCERT: Life Processes; Body Fluids and Circulation'
        self.root['colour_legend'] = 'red=oxygenated; blue=deoxygenated; not tissue colour'
        self.root['morph_driver'] = 'Systole: 0 diastole, 1 systole; onEngineFrame contractLV/RV'
        for name, colour in {
            'oxygenated': (0.65, 0.025, 0.055, 1),
            'deoxygenated': (0.025, 0.12, 0.65, 1),
            'septum': (0.55, 0.23, 0.19, 1),
        }.items():
            material = bpy.data.materials.new(f"NCERT_{name}")
            material['generator'] = OWNER
            material.use_nodes = True
            shader = material.node_tree.nodes.get('Principled BSDF')
            shader.inputs['Base Color'].default_value = colour
            shader.inputs['Roughness'].default_value = 0.65
            shader.inputs['Metallic'].default_value = 0
            material.diffuse_color = colour
            # Two-sided: cavity and simple unthickened valve flaps remain visible.
            material.use_backface_culling = False
            self.materials[name] = material
        log("Scene prepared; existing non-generated objects preserved.")

    def new_object(self, name, data):
        obj = bpy.data.objects.new(name, data)
        self.collection.objects.link(obj)
        obj['generator'] = OWNER
        if self.root is not None:
            obj.parent = self.root
        return obj

    @staticmethod
    def remove(obj):
        data = obj.data
        kind = obj.type
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0:
            if kind == 'MESH':
                bpy.data.meshes.remove(data)
            elif kind == 'CURVE':
                bpy.data.curves.remove(data)

    def mesh(self, name, vertices, faces):
        data = bpy.data.meshes.new(f"{name}_Geometry")
        data.from_pydata(vertices, [], faces)
        data.update()
        recalculate_normals(data)
        return self.new_object(name, data)

    def ellipsoid(self, name, center, radii, segments=None, rings=None):
        bm = bmesh.new()
        try:
            bmesh.ops.create_uvsphere(bm, u_segments=segments or self.cfg.chamber_segments,
                                     v_segments=rings or self.cfg.chamber_rings, radius=1)
            for vertex in bm.verts:
                vertex.co = center + Vector(tuple(vertex.co[i] * radii[i] for i in range(3)))
            data = bpy.data.meshes.new(f"{name}_Geometry")
            bm.to_mesh(data)
        finally:
            bm.free()
        return self.new_object(name, data)

    def boolean(self, target, cutter, operation='DIFFERENCE'):
        activate(target)
        modifier = target.modifiers.new('NCERT_Construct', 'BOOLEAN')
        modifier.operation = operation
        modifier.solver = 'EXACT'
        modifier.object = cutter
        modifier_name = modifier.name
        try:
            result = bpy.ops.object.modifier_apply(modifier=modifier_name)
            require('FINISHED' in result and len(target.data.polygons) > 0,
                    f"Boolean {operation} failed for {target.name}.")
        finally:
            remaining = target.modifiers.get(modifier_name)
            if remaining is not None:
                target.modifiers.remove(remaining)
            self.remove(cutter)

    def solid_tube(self, name, spans, radius, extend=False):
        points = sample_spans(spans, self.cfg.samples_per_span)
        if extend:
            points = [points[0] - (points[1] - points[0]).normalized() * 0.10,
                      *points,
                      points[-1] + (points[-1] - points[-2]).normalized() * 0.10]
        return self.mesh(name, *capped_tube_geometry(points, radius, self.cfg.vessel_sides))

    def finish(self, obj, oxygenation, structure):
        obj.data.materials.clear()
        obj.data.materials.append(self.materials[oxygenation])
        obj['oxygenation'] = oxygenation if oxygenation != 'septum' else 'not_applicable'
        obj['structure'] = structure
        obj['educational_only'] = True
        obj.data['oxygenation'] = obj['oxygenation']
        for polygon in obj.data.polygons:
            polygon.use_smooth = structure != 'valve'
        self.meshes.append(obj)
        return obj

    def define_anatomy(self):
        for name, center, radii, wall, oxygen in [
            ('Left_Ventricle', (-.36, -.48, 0), (.34, .63, .32), .055, 'oxygenated'),
            ('Right_Ventricle', (.32, -.39, .08), (.29, .52, .29), .035, 'deoxygenated'),
            ('Left_Atrium', (-.36, .48, 0), (.32, .33, .27), .026, 'oxygenated'),
            ('Right_Atrium', (.32, .46, .08), (.30, .33, .30), .026, 'deoxygenated'),
        ]:
            self.chambers[name] = Chamber(name, xyz(center), Vector((radii[0], radii[2], radii[1])),
                                          wall, oxygen)

        def port(key, chamber, direction, radius):
            spec = self.chambers[chamber]
            d = xyz(direction).normalized()
            distance = 1 / math.sqrt(sum((d[i] / spec.radii[i])**2 for i in range(3)))
            self.ports[key] = Port(chamber, spec.center + d * distance, d, radius)

        port('MITRAL_LA', 'Left_Atrium', (0, -1, 0), .135)
        port('MITRAL_LV', 'Left_Ventricle', (0, 1, 0), .135)
        port('TRICUSPID_RA', 'Right_Atrium', (0, -1, 0), .14)
        port('TRICUSPID_RV', 'Right_Ventricle', (0, 1, 0), .14)
        port('AO', 'Left_Ventricle', (.40, .82, .45), .09)
        port('PA', 'Right_Ventricle', (-.30, .85, .42), .09)
        port('SVC', 'Right_Atrium', (.12, 1, -.15), .095)
        port('IVC', 'Right_Atrium', (.25, -.60, -.85), .10)
        for i, direction in enumerate([(-1, .35, -.9), (-1, -.35, -.9),
                                       (1, .35, -.9), (1, -.35, -.9)]):
            port(f'PV{i}', 'Left_Atrium', direction, .047)

        def line(key, points, radius):
            self.lines[key] = cubic_spans(points)
            self.radii[key] = radius

        p = self.ports['AO']
        arch = [xyz(v) for v in [(-.13, .88, .27), (-.04, 1.25, .14),
                                (-.28, 1.46, .02), (-.53, 1.46, -.08),
                                (-.78, 1.20, -.22), (-.80, .75, -.28), (-.76, -.85, -.28)]]
        line('AO', [p.inside, p.outside, *arch], p.radius)
        for key, start, tip, radius in [
            ('Brachiocephalic', arch[1], (.38, 1.84, .10), .045),
            ('Left_Common_Carotid', arch[2], (-.22, 1.95, .00), .038),
            ('Left_Subclavian', arch[3], (-.94, 1.76, -.12), .042),
        ]:
            end = xyz(tip)
            line(key, [start, start.lerp(end, .5), end], radius)
        p = self.ports['PA']
        fork = xyz((.15, 1.00, .51))
        line('PA', [p.inside, p.outside, xyz((.12, .68, .52)), fork], p.radius)
        line('PA_L', [fork, xyz((-.48, 1.12, .40)), xyz((-1.12, 1.02, .18))], .07)
        line('PA_R', [fork, xyz((.63, 1.13, .37)), xyz((1.12, 1.05, .18))], .07)
        for key, external in [
            ('SVC', [( .40, 1.64, .0), (.40, 1.16, .0)]),
            ('IVC', [( .65, -1.18, -.45), (.61, -.30, -.42)]),
        ]:
            p = self.ports[key]
            line(key, [*[xyz(v) for v in external], p.outside, p.inside], p.radius)
        for i in range(4):
            p = self.ports[f'PV{i}']
            side = -1 if i < 2 else 1
            up = .65 if i % 2 == 0 else .30
            line(f'PV{i}', [xyz((side * 1.12, up, -.63)),
                            xyz((side * .78, up, -.53)), p.outside, p.inside], p.radius)

    def build_chambers(self):
        for spec in self.chambers.values():
            obj = self.ellipsoid(spec.name, spec.center, spec.radii)
            inner = self.ellipsoid('_NCERT_Cavity', spec.center,
                                   spec.radii - Vector((spec.thickness,) * 3))
            self.boolean(obj, inner)
            for port in self.ports.values():
                if port.chamber != spec.name:
                    continue
                cutter = self.solid_tube('_NCERT_Port', cubic_spans([
                    port.point - port.direction * .30, port.point + port.direction * .18,
                ]), port.radius)
                self.boolean(obj, cutter)
            obj['wall_thickness_m'] = spec.thickness * self.cfg.meters_per_unit
            self.finish(obj, spec.oxygenation, 'chamber')
            log(f"Hollow chamber and open ports: {spec.name}")
        septum = self.ellipsoid('Interventricular_Septum', xyz((0, -.40, .04)),
                                Vector((.068, .255, .51)), segments=24, rings=16)
        self.finish(septum, 'septum', 'septum')

    def build_vessel(self, name, keys, oxygenation, junctions=()):
        outer = None
        # Boolean unions only combine construction solids belonging to ONE
        # vessel, never chambers, valves, or independently named structures.
        for key in keys:
            segment = self.solid_tube(name if outer is None else '_NCERT_Branch',
                                      self.lines[key], self.radii[key] + self.cfg.wall)
            if outer is None:
                outer = segment
            else:
                self.boolean(outer, segment, 'UNION')
        for point, radius in junctions:
            r = radius + self.cfg.wall
            self.boolean(outer, self.ellipsoid('_NCERT_Junction', point, Vector((r,) * 3),
                                               segments=16, rings=12), 'UNION')
        # Difference of every inner solid equals subtraction of their union.
        # Subtract only AFTER outer unions, so a branch never plugs the trunk.
        for key in keys:
            self.boolean(outer, self.solid_tube('_NCERT_Lumen', self.lines[key],
                                                self.radii[key], extend=True))
        for point, radius in junctions:
            self.boolean(outer, self.ellipsoid('_NCERT_LumenJunction', point,
                                               Vector((radius,) * 3), segments=16, rings=12))
        outer['branches'] = json.dumps(list(keys))
        outer['lumen_radius_m'] = min(self.radii[key] for key in keys) * self.cfg.meters_per_unit
        self.finish(outer, oxygenation, 'vessel')
        log(f"Open tubular vessel: {name} ({len(keys)} centerlines)")

    def build_vessels(self):
        branches = ('Brachiocephalic', 'Left_Common_Carotid', 'Left_Subclavian')
        self.build_vessel('Aorta', ('AO', *branches), 'oxygenated',
                          [(self.lines[key][0][0], self.radii['AO']) for key in branches])
        self.build_vessel('Superior_Vena_Cava', ('SVC',), 'deoxygenated')
        self.build_vessel('Inferior_Vena_Cava', ('IVC',), 'deoxygenated')
        self.build_vessel('Pulmonary_Artery', ('PA', 'PA_L', 'PA_R'), 'deoxygenated',
                          [(self.lines['PA'][-1][-1], self.radii['PA'])])
        self.build_vessel('Pulmonary_Veins', tuple(f'PV{i}' for i in range(4)), 'oxygenated')

    def valve(self, name, center, axis, radius, count, oxygenation, semilunar=False):
        """Two/three distinct curved flap islands in one independently named mesh.

        Fixed partially open pose: leaflet tips leave a visible central aperture.
        No chordae, papillary muscles, or valve animation are implied.
        """
        axis = axis.normalized()
        u = axis.orthogonal().normalized()
        v = axis.cross(u).normalized()
        vertices, faces = [], []
        radial_steps, angular_steps = 4, 8
        for leaflet in range(count):
            offset = len(vertices)
            for i in range(radial_steps + 1):
                t = i / radial_steps
                r = radius * (1 - .68 * t)
                for j in range(angular_steps + 1):
                    fraction = .035 + .93 * j / angular_steps
                    angle = math.tau * (leaflet + fraction) / count
                    sag = radius * (.34 if semilunar else .48) * math.sin(t * math.pi / 2)
                    sag *= math.sin(fraction * math.pi)
                    vertices.append(center + r * (math.cos(angle) * u + math.sin(angle) * v)
                                    + axis * sag)
            for i in range(radial_steps):
                for j in range(angular_steps):
                    a = offset + i * (angular_steps + 1) + j
                    faces.append((a, a + 1, a + angular_steps + 2, a + angular_steps + 1))
        obj = self.mesh(name, vertices, faces)
        obj['leaflet_count'] = count
        obj['pose'] = 'partially_open_schematic'
        self.finish(obj, oxygenation, 'valve')

    def build_valves(self):
        for name, key, count, oxygen in [
            ('Tricuspid_Valve', 'TRICUSPID_RA', 3, 'deoxygenated'),
            ('Bicuspid_Mitral_Valve', 'MITRAL_LA', 2, 'oxygenated'),
            ('Aortic_Semilunar_Valve', 'AO', 3, 'oxygenated'),
            ('Pulmonary_Semilunar_Valve', 'PA', 3, 'deoxygenated'),
        ]:
            p = self.ports[key]
            self.valve(name, p.point, p.direction, p.radius * .97, count, oxygen,
                       semilunar=key in ('AO', 'PA'))
        log("Four separately selectable valves created (2 mitral / 3 other leaflets).")

    def bridge(self, start, atrium, atrial_port, ventricular_port, ventricle, end):
        """Internal route through cavity centers and the AV opening, not septum."""
        return cubic_spans([start, self.chambers[atrium].center,
                            self.ports[atrial_port].inside,
                            self.ports[atrial_port].point,
                            self.ports[ventricular_port].point,
                            self.ports[ventricular_port].inside,
                            self.chambers[ventricle].center, end])

    def path_curve(self, name, routes, oxygenation):
        data = bpy.data.curves.new(f'{name}_Bezier', type='CURVE')
        data.dimensions = '3D'
        data.resolution_u = self.cfg.samples_per_span
        data.bevel_depth = 0  # Guides, never render geometry or exported tubes.
        obj = self.new_object(name, data)
        serialized = []
        for label, spans in routes:
            for previous, following in zip(spans, spans[1:]):
                require((previous[-1] - following[0]).length < 1e-6,
                        f'Discontinuous route {name}/{label}.')
            spline = data.splines.new('BEZIER')
            spline.bezier_points.add(len(spans))
            # Preserve each vessel's handles exactly even when concatenating
            # routes; resmoothing a full route would move it outside the tube.
            for i, point in enumerate(spline.bezier_points):
                co = spans[i][0] if i < len(spans) else spans[-1][3]
                point.co = co * self.cfg.meters_per_unit
                point.handle_left_type = 'FREE'
                point.handle_right_type = 'FREE'
                point.handle_left = (spans[i - 1][2] if i else co) * self.cfg.meters_per_unit
                point.handle_right = (spans[i][1] if i < len(spans) else co) * self.cfg.meters_per_unit
            serialized.append({
                'id': label,
                'segments': [[gltf_point(p, self.cfg.meters_per_unit) for p in span]
                             for span in spans],
            })
        obj['oxygenation'] = oxygenation
        obj['schema'] = 'cardiotwin.bezier.v1'
        obj['coordinate_space'] = 'NCERT_Heart local; meters; glTF Y-up'
        obj['routes_json'] = json.dumps(serialized, separators=(',', ':'))
        obj['flow_direction'] = 'increasing segment index and cubic t'
        obj['rest_pose_only'] = True
        obj['hidden_guide'] = True
        obj.hide_render = True
        obj.hide_set(True)
        self.curves.append(obj)

    def build_paths(self):
        deoxygenated = []
        for entry in ('SVC', 'IVC'):
            middle = self.bridge(self.lines[entry][-1][-1], 'Right_Atrium',
                                 'TRICUSPID_RA', 'TRICUSPID_RV', 'Right_Ventricle',
                                 self.lines['PA'][0][0])
            for branch in ('PA_L', 'PA_R'):
                deoxygenated.append((f'{entry}_RA_RV_{branch}',
                                     self.lines[entry] + middle + self.lines['PA'] + self.lines[branch]))
        self.path_curve(PATH_NAMES[0], deoxygenated, 'deoxygenated')
        oxygenated = []
        # Aorta's three outlets also receive routes. Split the existing trunk
        # spans at the exact arch node; do not approximate with another curve.
        for i in range(4):
            entry = f'PV{i}'
            middle = self.bridge(self.lines[entry][-1][-1], 'Left_Atrium',
                                 'MITRAL_LA', 'MITRAL_LV', 'Left_Ventricle',
                                 self.lines['AO'][0][0])
            prefix = self.lines[entry] + middle
            oxygenated.append((f'{entry}_LA_LV_AO', prefix + self.lines['AO']))
            for branch in ('Brachiocephalic', 'Left_Common_Carotid', 'Left_Subclavian'):
                junction = self.lines[branch][0][0]
                stop = next(j + 1 for j, span in enumerate(self.lines['AO'])
                            if (span[-1] - junction).length < 1e-6)
                oxygenated.append((f'{entry}_LA_LV_{branch}',
                                   prefix + self.lines['AO'][:stop] + self.lines[branch]))
        self.path_curve(PATH_NAMES[1], oxygenated, 'oxygenated')
        log('Hidden Bezier guides created: 4 venous/pulmonary and 16 oxygenated routes.')

    def unwrap_and_scale(self, obj):
        # Finish all topology-changing operations BEFORE adding shape keys.
        bm = bmesh.new()
        try:
            bm.from_mesh(obj.data)
            bmesh.ops.triangulate(bm, faces=list(bm.faces))
            bm.to_mesh(obj.data)
        finally:
            bm.free()
        for vertex in obj.data.vertices:
            vertex.co *= self.cfg.meters_per_unit
        obj.data.update()
        activate(obj)
        try:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            result = bpy.ops.uv.smart_project(angle_limit=math.radians(66),
                                              island_margin=.025, correct_aspect=True,
                                              scale_to_bounds=True)
            require('FINISHED' in result, f'UV unwrap failed: {obj.name}')
        finally:
            if obj.mode != 'OBJECT':
                bpy.ops.object.mode_set(mode='OBJECT')
        require(obj.data.uv_layers.active is not None, f'Missing UV map: {obj.name}')
        obj.data.uv_layers.active.name = 'UVMap'

    def add_systole(self, obj):
        spec = self.chambers[obj.name]
        scale = self.cfg.meters_per_unit
        center = spec.center * scale
        basis = obj.shape_key_add(name='Basis', from_mix=False)
        systole = obj.shape_key_add(name='Systole', from_mix=False)
        systole.slider_min, systole.slider_max, systole.value = 0, 1, 0
        weights = obj.vertex_groups.new(name='Systole_Weight')
        attribute = obj.data.attributes.new(name='_STRAIN_WEIGHT', type='FLOAT', domain='POINT')
        ports = [port for port in self.ports.values() if port.chamber == obj.name]
        # Weight is baked into the key and also exposed for shaders. Do NOT set
        # systole.vertex_group: that would multiply the weights a second time.
        for index, vertex in enumerate(basis.data):
            rest = vertex.co / scale
            weight = 1.0
            for port in ports:
                distance = (rest - port.point).length
                t = min(1.0, max(0.0, (distance - port.radius - .045) / .26))
                weight = min(weight, t*t * (3 - 2*t))
            # Keep the septal contact region nearly fixed to avoid a large gap.
            weight *= min(1.0, abs(rest.x) / .16)
            delta = vertex.co - center
            contraction = .19 if obj.name == 'Left_Ventricle' else .16
            systole.data[index].co = center + Vector((
                delta.x * (1 - contraction * weight),
                delta.y * (1 - contraction * weight),
                delta.z * (1 - .09 * weight),
            ))
            weights.add([index], weight, 'REPLACE')
            attribute.data[index].value = weight
        obj['strain_attribute'] = '_STRAIN_WEIGHT'
        obj['strain_note'] = '0..1 illustrative contraction mask, not measured strain'
        obj['morph_target'] = 'Systole'
        obj['engine_channel'] = 'contractLV' if obj.name == 'Left_Ventricle' else 'contractRV'
        log(f'UVs, vertex weights and Basis/Systole: {obj.name}')

    def validate_scene(self):
        require({obj.name for obj in self.meshes} == set(MESH_NAMES), 'Anatomical mesh names changed.')
        triangles = 0
        for obj in self.meshes:
            data = obj.data
            require(not obj.modifiers, f'Unapplied modifier on {obj.name}.')
            require(all(math.isfinite(c) for vertex in data.vertices for c in vertex.co),
                    f'Non-finite vertex in {obj.name}.')
            require(len(data.polygons) > 0, f'Empty mesh: {obj.name}.')
            require(data.uv_layers.active is not None, f'No UVs: {obj.name}.')
            bm = bmesh.new()
            try:
                bm.from_mesh(data)
                # A hollow wall with rim bridges is still a closed solid. Its
                # lumen is open to blood, but its wall has no boundary edges.
                if obj['structure'] != 'valve':
                    require(all(edge.is_manifold for edge in bm.edges),
                            f'Non-manifold wall after Boolean construction: {obj.name}.')
                require(all(face.calc_area() > 1e-14 for face in bm.faces),
                        f'Degenerate face in {obj.name}.')
            finally:
                bm.free()
            data.calc_loop_triangles()
            triangles += len(data.loop_triangles)
            if obj.name in CHAMBER_NAMES[:2]:
                keys = data.shape_keys.key_blocks
                require(list(keys.keys()) == ['Basis', 'Systole'], f'Incorrect keys: {obj.name}')
                require(any((a.co - b.co).length > 1e-6
                            for a, b in zip(keys['Basis'].data, keys['Systole'].data)),
                        f'Systole did not deform {obj.name}.')
        require(triangles <= self.cfg.triangle_budget,
                f'{triangles:,} triangles exceeds budget {self.cfg.triangle_budget:,}. Reduce Config resolution.')
        self.root['triangle_count'] = triangles
        log(f'Scene checks passed: {len(self.meshes)} meshes; {triangles:,} triangles; 3 shared materials.')

    def export(self, destination):
        proxies, renamed = [], []
        temporary = destination.with_name(destination.stem + '.pending.glb')
        try:
            # glTF has no native Bezier curve primitive. Keep native guides in
            # the .blend, export selectable empty nodes with the EXACT names.
            for curve in self.curves:
                name = curve.name
                curve.name = f'{name}_BlenderGuide'
                renamed.append((curve, name))
                proxy = self.new_object(name, None)
                for key in curve.keys():
                    proxy[key] = curve[key]
                proxies.append(proxy)
            activate(self.root)
            for obj in self.meshes + proxies:
                obj.select_set(True)
            options = dict(
                filepath=str(temporary), check_existing=False, export_format='GLB',
                use_selection=True, export_yup=True, export_extras=True,
                export_texcoords=True, export_normals=True, export_materials='EXPORT',
                export_apply=False,  # Applying exporter modifiers can drop morphs.
                export_morph=True, export_morph_normal=True, export_morph_tangent=False,
                export_animations=False, export_skins=False,
                export_cameras=False, export_lights=False,
                export_tangents=False, export_draco_mesh_compression_enable=False,
            )
            available = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
            if 'export_attributes' in available:
                options['export_attributes'] = True
            else:
                log('WARNING: exporter cannot emit custom strain attributes; UVs and morphs remain available.')
            result = bpy.ops.export_scene.gltf(**options)
            require('FINISHED' in result, 'glTF exporter did not finish.')
            validate_glb(temporary)
            temporary.replace(destination)  # Never replace a good asset with a failed export.
            log(f'GLB exported and structurally checked: {destination} ({destination.stat().st_size / 1024:.0f} KiB)')
        finally:
            for proxy in proxies:
                self.remove(proxy)
            for curve, name in renamed:
                curve.name = name
            temporary.unlink(missing_ok=True)


def validate_glb(path):
    """Inspect real exported JSON: names, UVs, morphs and path metadata.

    Structural smoke check, not a substitute for Khronos glTF Validator or
    visual inspection of anatomy, UV quality, topology and VR performance.
    """
    payload = path.read_bytes()
    require(len(payload) >= 20, 'GLB is truncated.')
    magic, version, length = struct.unpack_from('<4sII', payload)
    require(magic == b'glTF' and version == 2 and length == len(payload), 'Invalid GLB header.')
    chunk_length, chunk_type = struct.unpack_from('<II', payload, 12)
    require(chunk_type == 0x4E4F534A and 20 + chunk_length <= length, 'Missing GLB JSON chunk.')
    document = json.loads(payload[20:20 + chunk_length])
    nodes = document.get('nodes', [])
    for name in (ROOT_NAME,) + MESH_NAMES + PATH_NAMES:
        require(sum(node.get('name') == name for node in nodes) == 1,
                f'Expected exactly one exported node named {name}.')
    by_name = {node.get('name'): node for node in nodes}
    for name in MESH_NAMES:
        node = by_name[name]
        require('mesh' in node, f'No exported mesh for {name}.')
        mesh = document['meshes'][node['mesh']]
        primitives = mesh['primitives']
        require(primitives and all('TEXCOORD_0' in p['attributes'] for p in primitives),
                f'UVs missing in exported {name}.')
        require('oxygenation' in node.get('extras', {}), f'Oxygenation tag lost: {name}.')
        if name in CHAMBER_NAMES[:2]:
            require(mesh.get('extras', {}).get('targetNames') == ['Systole'],
                    f'Systole target name missing from {name}. Basis is the base mesh, not another target.')
            require(all(len(p.get('targets', [])) == 1 and 'POSITION' in p['targets'][0]
                        for p in primitives), f'Morph positions missing from {name}.')
    for name in PATH_NAMES:
        node = by_name[name]
        require('mesh' not in node, f'Flow guide must not render as a mesh: {name}.')
        extras = node.get('extras', {})
        require(extras.get('schema') == 'cardiotwin.bezier.v1', f'Path schema missing: {name}.')
        routes = json.loads(extras['routes_json'])
        require(len(routes) == (4 if name == PATH_NAMES[0] else 16), f'Incomplete flow branches: {name}.')
        for route in routes:
            require(route['segments'], f'Empty flow route: {name}.')
            for segment in route['segments']:
                require(len(segment) == 4 and all(len(p) == 3 for p in segment),
                        f'Malformed Bezier segment: {name}.')
                require(all(math.isfinite(c) for p in segment for c in p),
                        f'Invalid flow coordinate: {name}.')
    return document


def output_directory():
    override = os.environ.get('CARDIOTWIN_OUTPUT_DIR')
    if override:
        directory = Path(override).expanduser()
        require(directory.is_absolute(), 'CARDIOTWIN_OUTPUT_DIR must be absolute.')
    else:
        script_file = globals().get('__file__')
        require(script_file and not str(script_file).startswith('<'),
                'Run the saved script via VS Code, or set CARDIOTWIN_OUTPUT_DIR.')
        directory = Path(script_file).resolve().parent / 'public' / 'models'
    directory.mkdir(parents=True, exist_ok=True)
    return directory.resolve()


def main():
    config = Config()
    directory = output_directory()
    previous_selection = [obj.name for obj in bpy.context.selected_objects]
    previous_active = bpy.context.view_layer.objects.active
    previous_active_name = previous_active.name if previous_active else None
    original_mode = previous_active.mode if previous_active else 'OBJECT'
    generator = HeartGenerator(config)
    try:
        generator.prepare()
        generator.define_anatomy()
        generator.build_chambers()
        generator.build_vessels()
        generator.build_valves()
        generator.build_paths()
        for obj in generator.meshes:
            generator.unwrap_and_scale(obj)
            if obj.name in CHAMBER_NAMES[:2]:
                generator.add_systole(obj)
        generator.validate_scene()
        generator.export(directory / 'ncert_heart.glb')
        if config.save_blend:
            native = directory / 'ncert_heart.blend'
            require('FINISHED' in bpy.ops.wm.save_as_mainfile(filepath=str(native), check_existing=False),
                    'Could not save native Blender scene.')
            log(f'Native scene saved (including hidden Bezier guides): {native}')
        log('DONE. Inspect cutaways, vessel junctions and Systole=1 before classroom use.')
    except Exception:
        log('ERROR: generation/export failed; see traceback. Existing final GLB is preserved on export failure.')
        traceback.print_exc()
        raise
    finally:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.select_all(action='DESELECT')
        for name in previous_selection:
            obj = bpy.context.view_layer.objects.get(name)
            if obj is not None and not obj.hide_get():
                obj.select_set(True)
        active = bpy.context.view_layer.objects.get(previous_active_name) if previous_active_name else None
        if active is not None:
            bpy.context.view_layer.objects.active = active
            if original_mode != 'OBJECT' and active.select_get():
                bpy.ops.object.mode_set(mode=original_mode)


if __name__ == '__main__':
    main()