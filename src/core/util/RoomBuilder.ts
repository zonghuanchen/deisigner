import * as THREE from 'three';
import { SceneModel } from '../model/SceneModel';
import { FloorModel } from '../model/FloorModel';
import { WallModel } from '../model/WallModel';
import { RoomModel } from '../model/RoomModel';

/**
 * Internal half-edge representation used by the planar-face traversal.
 */
interface HalfEdge {
    fromNode: number;
    toNode: number;
    wall: WallModel;
    /** Direction angle (atan2) from fromNode to toNode, in radians. */
    angle: number;
}

/**
 * Utility class that detects closed contours formed by the walls in a scene
 * and builds a RoomModel for each enclosed region.
 *
 * Algorithm (planar-face traversal):
 *   1. Cluster wall endpoints into unique graph nodes by a distance tolerance.
 *   2. Build two directed half-edges per wall and sort the outgoing half-edges
 *      at every node by polar angle (counter-clockwise).
 *   3. For each half-edge, trace the face on its left by repeatedly picking
 *      the next outgoing edge that sits just clockwise of the current edge's
 *      reverse. This partitions all half-edges into faces of the planar graph.
 *   4. Keep faces with positive signed area (bounded rooms) and drop the
 *      unbounded outer face plus any degenerate traversals along dangling
 *      chains (signed area ≈ 0).
 *   5. Emit a RoomModel per bounded face. Walls shared between two adjacent
 *      faces are treated as internal walls whose rectangular footprint is
 *      cut as a hole (inner contour) from each room's floor.
 */
export class RoomBuilder {
    /** Tolerance for treating two endpoints as the same graph node. */
    private static readonly POINT_TOLERANCE = 1e-4;
    /** Minimum signed area (m²) for a face to be considered a room. */
    private static readonly MIN_AREA = 1e-6;
    /** Fallback room height when no wall height is available. */
    private static readonly DEFAULT_HEIGHT = 2.8;

    /**
     * Detects closed regions formed by walls across every floor of the scene
     * and returns a RoomModel for each one. Rooms are grouped per floor so
     * that walls from different floors are never mixed into the same graph.
     */
    static build(scene: SceneModel): RoomModel[] {
        const rooms: RoomModel[] = [];
        for (const floor of scene.floors) {
            rooms.push(...this.buildFromFloor(floor));
        }
        return rooms;
    }

    /**
     * Rebuilds rooms for the entire scene after walls are added, removed, or
     * modified. For each floor the algorithm:
     *   1. Detects new closed contours from the current wall set.
     *   2. Compares each new room against existing rooms by their wall-id set.
     *   3. If an existing room has the exact same wall set, updates it in-place
     *      (contour, height) so downstream references stay valid.
     *   4. Otherwise removes the old room and adds the new one.
     */
    static rebuild(scene: SceneModel): RoomModel[] {
        const allNewRooms: RoomModel[] = [];

        for (const floor of scene.floors) {
            // Collect existing rooms that belong to this floor's walls.
            // A room is considered part of a floor if any of its linkWalls
            // appears in the floor's wall list.
            const floorWallIds = new Set(floor.walls.map(w => w.id));
            const existingRooms = scene.rooms.filter(room =>
                room.linkWalls.some(w => floorWallIds.has(w.id))
            );

            // Build candidate rooms from current walls.
            const newRooms = this.buildFromFloor(floor);

            // Index new rooms by sorted wall-id signature for fast matching.
            const wallSignature = (walls: WallModel[]): string =>
                walls.map(w => w.id).sort().join('|');

            const existingMap = new Map<string, RoomModel>();
            for (const room of existingRooms) {
                existingMap.set(wallSignature(room.linkWalls), room);
            }

            const matchedExisting = new Set<string>();

            for (const newRoom of newRooms) {
                const sig = wallSignature(newRoom.linkWalls);
                const existing = existingMap.get(sig);

                if (existing && !matchedExisting.has(sig)) {
                    // Same wall set → update existing room in-place.
                    matchedExisting.add(sig);
                    existing.outerContour = newRoom.outerContour;
                    existing.innerContours = newRoom.innerContours;
                    existing.height = newRoom.height;
                    allNewRooms.push(existing);
                } else {
                    // New enclosure → add to scene.
                    scene.addRoom(newRoom);
                    allNewRooms.push(newRoom);
                }
            }

            // Remove existing rooms that were not matched to any new room.
            for (const [sig, room] of existingMap) {
                if (!matchedExisting.has(sig)) {
                    scene.removeRoom(room);
                }
            }
        }
        return allNewRooms;
    }

    /**
     * Detects closed regions formed by the walls of a single floor.
     */
    static buildFromFloor(floor: FloorModel): RoomModel[] {
        return this.buildFromWalls(floor.walls);
    }

    /**
     * Detects closed regions formed by the given walls and creates one room
     * per bounded face.
     *
     * Algorithm (3 steps):
     *   1. Find closed regions — build a half-edge planar graph from wall
     *      segments and trace all minimal bounded faces (CCW, positive area).
     *   2. Build a wall → face-count map. A wall appearing in exactly one
     *      face is a *boundary* wall for that room; a wall shared by two
     *      faces is an *internal* (partition) wall.
     *   3. For each bounded face, create a RoomModel whose outer contour is
     *      the wall-thickness-offset polygon of the face edges, and whose
     *      inner contours are the rectangular footprints of any internal
     *      walls that border that face.
     */
    static buildFromWalls(walls: WallModel[]): RoomModel[] {
        if (walls.length === 0) return [];

        // Step 1: Build graph and find minimal bounded faces.
        const graph = this.buildHalfEdgeGraph(walls);
        if (!graph) return [];
        const { halfEdges, nodes, outgoing, byKey } = graph;
        const boundedFaces = this.traceBoundedFaces(halfEdges, outgoing, byKey, nodes);
        if (boundedFaces.length === 0) return [];

        // Step 2: Build wall → face-count map so we can identify shared walls.
        //   A wall appearing in exactly 1 face is a boundary wall for that room.
        //   A wall appearing in ≥2 faces is an internal (shared) wall.
        const wallFaceCount = new Map<string, number>();
        for (const face of boundedFaces) {
            const seenInFace = new Set<string>();
            for (const he of face) {
                if (!seenInFace.has(he.wall.id)) {
                    seenInFace.add(he.wall.id);
                    wallFaceCount.set(
                        he.wall.id,
                        (wallFaceCount.get(he.wall.id) ?? 0) + 1
                    );
                }
            }
        }

        // Step 3: Create one RoomModel per bounded face.
        const rooms: RoomModel[] = [];
        for (const face of boundedFaces) {
            // 3a. Build the set of shared wall IDs for this face.
            //     Shared (internal) walls are offset inward just like
            //     boundary walls so the floor stops at the wall's inner
            //     surface — no overlap between adjacent rooms.
            const sharedWallIds = new Set<string>();
            for (const he of face) {
                const count = wallFaceCount.get(he.wall.id) ?? 0;
                if (count >= 2) sharedWallIds.add(he.wall.id);
            }

            // Ordered outer contour with wall-thickness offset.
            const polygon = this.applyWallThicknessOffset(face, nodes, sharedWallIds);
            if (polygon.length < 3) continue;

            // 3b. Collect unique walls that bound this face.
            const linkWalls = this.collectUniqueWalls(face);

            // 3d. Room height from the face's walls.
            const height = this.resolveRoomHeight(face);

            rooms.push(new RoomModel(polygon, height, [], linkWalls));
        }

        return rooms;
    }

    // ── Half-edge graph construction & face tracing ──────────────────────

    /**
     * Builds the half-edge planar graph from walls, including pre-splitting
     * at T-intersections.
     */
    private static buildHalfEdgeGraph(
        walls: WallModel[]
    ): {
        halfEdges: HalfEdge[];
        nodes: THREE.Vector2[];
        outgoing: HalfEdge[][];
        byKey: Map<string, HalfEdge>;
    } | null {
        // Pre-split walls at points where other walls' endpoints land on
        // their body.
        interface WallSeg {
            from: THREE.Vector2;
            to: THREE.Vector2;
            wall: WallModel;
        }
        const segments: WallSeg[] = [];

        for (let i = 0; i < walls.length; i++) {
            const wall = walls[i];
            const splitTs: number[] = [];

            for (let j = 0; j < walls.length; j++) {
                if (i === j) continue;
                const t1 = this.pointOnSegmentParam(walls[j].from, wall.from, wall.to);
                if (t1 !== null) splitTs.push(t1);
                const t2 = this.pointOnSegmentParam(walls[j].to, wall.from, wall.to);
                if (t2 !== null) splitTs.push(t2);
            }

            splitTs.sort((a, b) => a - b);

            let prev = wall.from.clone();
            for (const t of splitTs) {
                const pt = new THREE.Vector2().lerpVectors(wall.from, wall.to, t);
                if (pt.distanceTo(prev) > this.POINT_TOLERANCE) {
                    segments.push({ from: prev, to: pt, wall });
                    prev = pt;
                }
            }
            if (wall.to.distanceTo(prev) > this.POINT_TOLERANCE) {
                segments.push({ from: prev, to: wall.to, wall });
            } else if (segments.length === 0 ||
                       segments[segments.length - 1].wall !== wall) {
                segments.push({ from: wall.from.clone(), to: wall.to.clone(), wall });
            }
        }

        // Cluster endpoints into unique nodes.
        const nodes: THREE.Vector2[] = [];
        const nodeOf = (p: THREE.Vector2): number => {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].distanceTo(p) < this.POINT_TOLERANCE) {
                    return i;
                }
            }
            nodes.push(p.clone());
            return nodes.length - 1;
        };

        // Build two half-edges per (sub-)segment.
        const halfEdges: HalfEdge[] = [];
        for (const seg of segments) {
            const a = nodeOf(seg.from);
            const b = nodeOf(seg.to);
            if (a === b) continue;

            const ab = new THREE.Vector2().subVectors(nodes[b], nodes[a]);
            const angleAB = Math.atan2(ab.y, ab.x);
            const angleBA = Math.atan2(-ab.y, -ab.x);

            halfEdges.push({ fromNode: a, toNode: b, wall: seg.wall, angle: angleAB });
            halfEdges.push({ fromNode: b, toNode: a, wall: seg.wall, angle: angleBA });
        }

        if (halfEdges.length === 0) return null;

        // Group outgoing half-edges per node, sorted CCW by angle.
        const outgoing: HalfEdge[][] = nodes.map(() => []);
        for (const he of halfEdges) {
            outgoing[he.fromNode].push(he);
        }
        for (const list of outgoing) {
            list.sort((a, b) => a.angle - b.angle);
        }

        // Index half-edges by (from, to) for fast reverse lookup.
        const keyOf = (from: number, to: number) => `${from}->${to}`;
        const byKey = new Map<string, HalfEdge>();
        for (const he of halfEdges) {
            byKey.set(keyOf(he.fromNode, he.toNode), he);
        }

        return { halfEdges, nodes, outgoing, byKey };
    }

    /**
     * Traces all bounded (CCW, positive signed area) faces of the planar
     * graph using the standard leftmost-turn face traversal.
     */
    private static traceBoundedFaces(
        halfEdges: HalfEdge[],
        outgoing: HalfEdge[][],
        byKey: Map<string, HalfEdge>,
        nodes: THREE.Vector2[]
    ): HalfEdge[][] {
        const keyOf = (from: number, to: number) => `${from}->${to}`;
        const visited = new Set<HalfEdge>();
        const boundedFaces: HalfEdge[][] = [];

        for (const start of halfEdges) {
            if (visited.has(start)) continue;
            const face: HalfEdge[] = [];
            let current: HalfEdge | undefined = start;
            let safety = halfEdges.length + 1;
            while (current && !visited.has(current) && safety-- > 0) {
                visited.add(current);
                face.push(current);

                const reverse = byKey.get(
                    keyOf(current.toNode, current.fromNode)
                );
                if (!reverse) break;
                const list: HalfEdge[] = outgoing[current.toNode];
                const idx = list.indexOf(reverse);
                if (idx < 0) break;
                const nextIdx = (idx - 1 + list.length) % list.length;
                current = list[nextIdx];
            }

            if (face.length < 3) continue;
            const polygon = face.map(he => nodes[he.fromNode].clone());
            if (this.signedArea(polygon) <= this.MIN_AREA) continue;
            boundedFaces.push(face);
        }

        return boundedFaces;
    }

    // ── Wall footprint helpers ──────────────────────────────────────────────

    /**
     * Offsets the room polygon inward by half the wall thickness for each
     * wall edge (both boundary and shared/internal walls) so the floor
     * contour aligns with the inner surface of the walls.
     *
     * For *full-footprint walls* (both half-edges of the same wall appear
     * in the face — typical of partition walls with a free endpoint inside
     * the room), the far side of the wall rectangle is added so the floor
     * wraps around the full rectangular footprint instead of collapsing
     * into a degenerate thin strip.
     */
    private static applyWallThicknessOffset(
        face: HalfEdge[],
        nodes: THREE.Vector2[],
        sharedWallIds: Set<string> = new Set()
    ): THREE.Vector2[] {
        const keyOf = (from: number, to: number) => `${from}->${to}`;

        // Step 1: Detect full-footprint walls — walls whose both half-edges
        // appear in this face. These are typically partition walls with at
        // least one free (dangling) endpoint inside the room.
        const fullFootprintWallIds = new Set<string>();
        for (const he of face) {
            const reverseKey = keyOf(he.toNode, he.fromNode);
            if (face.some(other =>
                keyOf(other.fromNode, other.toNode) === reverseKey &&
                other.wall.id === he.wall.id
            )) {
                fullFootprintWallIds.add(he.wall.id);
            }
        }

        // Step 2: Build offset lines.
        const offsetLines: { origin: THREE.Vector2; dir: THREE.Vector2 }[] = [];
        const addedFullFootprint = new Set<string>();

        for (let i = 0; i < face.length; i++) {
            const he = face[i];
            const wall = he.wall;

            if (fullFootprintWallIds.has(wall.id)) {
                // Full-footprint wall: emit this half-edge's room-side
                // offset, then the far-side edges (free end + far edge),
                // and skip the second half-edge.
                if (!addedFullFootprint.has(wall.id)) {
                    addedFullFootprint.add(wall.id);

                    // Room-side offset (same as normal half-edge offset).
                    const roomSide = this.computeEdgeOffset(he, wall, nodes);
                    if (roomSide) offsetLines.push(roomSide);

                    // Far-side edges: fromEnd → toEnd → toRoom.
                    const farEdges = this.computeFullFootprintWallFarEdges(
                        he, wall, nodes
                    );
                    for (const edge of farEdges) offsetLines.push(edge);
                }
                // Second half-edge of the same wall — skip.
                continue;
            }

            // Normal edge offset (boundary or shared wall).
            const offset = this.computeEdgeOffset(he, wall, nodes);
            if (offset) offsetLines.push(offset);
        }

        if (offsetLines.length < 3) return [];

        // Step 3: Compute vertices at intersections of consecutive offset
        // lines. When consecutive offset lines are parallel (e.g. sub-segments
        // of the same split wall), lineIntersection returns null. In that
        // case, use the current offset line's origin (already correctly
        // offset) instead of the original un-offset graph node.
        const n = offsetLines.length;
        const result: THREE.Vector2[] = [];
        for (let i = 0; i < n; i++) {
            const prev = offsetLines[(i - 1 + n) % n];
            const curr = offsetLines[i];
            const intersection = this.lineIntersection(
                prev.origin, prev.dir, curr.origin, curr.dir
            );
            result.push(intersection || curr.origin.clone());
        }
        return result;
    }

    /**
     * Finds the intersection point of two lines defined by origin + t * dir.
     * Returns null if lines are parallel.
     */
    private static lineIntersection(
        o1: THREE.Vector2, d1: THREE.Vector2,
        o2: THREE.Vector2, d2: THREE.Vector2
    ): THREE.Vector2 | null {
        const cross = d1.x * d2.y - d1.y * d2.x;
        if (Math.abs(cross) < 1e-10) return null;
        const dx = o2.x - o1.x;
        const dy = o2.y - o1.y;
        const t = (dx * d2.y - dy * d2.x) / cross;
        return new THREE.Vector2(o1.x + t * d1.x, o1.y + t * d1.y);
    }

    /**
     * Computes the room-side offset line for a single half-edge.
     * The offset moves the edge inward (toward the room interior) by half
     * the wall thickness.
     */
    private static computeEdgeOffset(
        he: HalfEdge,
        wall: WallModel,
        nodes: THREE.Vector2[]
    ): { origin: THREE.Vector2; dir: THREE.Vector2 } | null {
        const halfWidth = wall.width / 2;
        const wallDir = new THREE.Vector2().subVectors(wall.to, wall.from).normalize();
        const perp = new THREE.Vector2(-wallDir.y, wallDir.x);

        const edgeDir = new THREE.Vector2().subVectors(
            nodes[he.toNode], nodes[he.fromNode]
        );
        const sameAsWall = edgeDir.dot(wallDir) > 0;
        const sign = sameAsWall ? 1 : -1;
        const offset = perp.clone().multiplyScalar(halfWidth * sign);

        const p1 = nodes[he.fromNode].clone().add(offset);
        const p2 = nodes[he.toNode].clone().add(offset);

        const dir = new THREE.Vector2().subVectors(p2, p1);
        if (dir.lengthSq() < 1e-20) return null;
        dir.normalize();
        return { origin: p1, dir };
    }

    /**
     * Computes the far-side offset lines for a full-footprint wall.
     *
     * A full-footprint wall has both half-edges in the same face (e.g. a
     * partition with a dangling endpoint). The room wraps around the far
     * side of the wall, so we emit three additional offset lines:
     *   1. fromEnd → toEnd  (far side, parallel to wall)
     *   2. toEnd → toRoom   (free end cap, perpendicular to wall)
     *   3. toRoom → fromRoom (room-side return, anti-parallel to wall)
     *
     * The room-side return line is still needed for intersection with the
     * next normal edge's offset line, even though it overlaps the normal
     * half-edge offset.
     */
    private static computeFullFootprintWallFarEdges(
        he: HalfEdge,
        wall: WallModel,
        nodes: THREE.Vector2[]
    ): { origin: THREE.Vector2; dir: THREE.Vector2 }[] {
        const halfWidth = wall.width / 2;
        const wallDir = new THREE.Vector2().subVectors(wall.to, wall.from).normalize();
        const perp = new THREE.Vector2(-wallDir.y, wallDir.x);

        const edgeDir = new THREE.Vector2().subVectors(
            nodes[he.toNode], nodes[he.fromNode]
        );
        const sameAsWall = edgeDir.dot(wallDir) > 0;
        const sign = sameAsWall ? 1 : -1;
        const roomOffset = perp.clone().multiplyScalar(halfWidth * sign);
        const farOffset = roomOffset.clone().negate();

        // Room-side vertices (at halfWidth toward room).
        const fromRoom = nodes[he.fromNode].clone().add(roomOffset);
        const toRoom = nodes[he.toNode].clone().add(roomOffset);
        // Far-side vertices (at halfWidth away from room).
        const fromEnd = nodes[he.fromNode].clone().add(farOffset);
        const toEnd = nodes[he.toNode].clone().add(farOffset);

        return [
            // Far side: fromEnd → toEnd (parallel to wall, on the far side).
            {
                origin: fromEnd,
                dir: new THREE.Vector2().subVectors(toEnd, fromEnd).normalize()
            },
            // Free end cap: toEnd → toRoom (perpendicular to wall).
            {
                origin: toEnd,
                dir: new THREE.Vector2().subVectors(toRoom, toEnd).normalize()
            },
            // Room-side return: toRoom → fromRoom (anti-parallel to wall).
            {
                origin: toRoom,
                dir: new THREE.Vector2().subVectors(fromRoom, toRoom).normalize()
            }
        ];
    }

    /**
     * Computes the rectangular 2D footprint of a wall on the ground plane.
     * The rectangle is aligned to the wall direction and offset by half the
     * wall thickness on each side. Winding is CW (hole order) so it can be
     * used directly as an inner contour for CSG subtraction from the floor.
     */
    private static computeWallFootprint(wall: WallModel): THREE.Vector2[] {
        const halfWidth = wall.width / 2;
        const wallDir = new THREE.Vector2().subVectors(wall.to, wall.from).normalize();
        const perp = new THREE.Vector2(-wallDir.y, wallDir.x);
        const offset = perp.clone().multiplyScalar(halfWidth);

        return [
            wall.from.clone().add(offset),   // +perp side at from
            wall.to.clone().add(offset),     // +perp side at to
            wall.to.clone().sub(offset),     // -perp side at to
            wall.from.clone().sub(offset),   // -perp side at from
        ];
    }

    /**
     * Collects the unique walls that form the boundary of the face,
     * preserving traversal order.
     */
    private static collectUniqueWalls(face: HalfEdge[]): WallModel[] {
        const seen = new Set<string>();
        const walls: WallModel[] = [];
        for (const he of face) {
            if (seen.has(he.wall.id)) continue;
            seen.add(he.wall.id);
            walls.push(he.wall);
        }
        return walls;
    }

    /**
     * Returns the parametric t ∈ [0,1] if point P lies on the line segment
     * from A to B (excluding the endpoints themselves), or null otherwise.
     * A small perpendicular-distance tolerance is used so that floating-point
     * noise from coordinate snapping does not cause false negatives.
     */
    private static pointOnSegmentParam(
        p: THREE.Vector2,
        a: THREE.Vector2,
        b: THREE.Vector2
    ): number | null {
        const ab = new THREE.Vector2().subVectors(b, a);
        const lenSq = ab.lengthSq();
        if (lenSq < 1e-10) return null; // degenerate segment

        const ap = new THREE.Vector2().subVectors(p, a);
        const t = ap.dot(ab) / lenSq;

        // Exclude endpoints — the caller only cares about interior hits.
        if (t <= 1e-4 || t >= 1 - 1e-4) return null;

        // Perpendicular distance from P to the line AB.
        const perpDist = Math.abs(ap.x * ab.y - ap.y * ab.x) / Math.sqrt(lenSq);
        if (perpDist > this.POINT_TOLERANCE) return null;

        return t;
    }

    /**
     * Picks a representative room height from the walls enclosing the face.
     * Uses the minimum wall height so the ceiling never exceeds any wall.
     */
    private static resolveRoomHeight(face: HalfEdge[]): number {
        let min = Infinity;
        for (const he of face) {
            if (he.wall.height > 0 && he.wall.height < min) {
                min = he.wall.height;
            }
        }
        return Number.isFinite(min) ? min : this.DEFAULT_HEIGHT;
    }

    /**
     * Splits a single wall at every intersection with other walls on the same
     * floor, and also splits each intersecting wall at the crossing point.
     *
     * - T-type: the input wall's interior passes through another wall's
     *   endpoint → only the input wall is split.
     * - T-type (reverse): another wall's interior passes through the input
     *   wall's endpoint → only the other wall is split.
     * - X-type: two walls cross in their interiors → both walls are split.
     *
     * The original wall (and each intersecting wall) is removed from the
     * floor and replaced by its sub-segments. Returns the array of new wall
     * segments that replaced the input wall.
     *
     * @param wall  - The wall to check and split.
     * @param floor - The floor that contains the wall and its sibling walls.
     * @returns The wall segments that replaced the input wall.
     */
    static splitWalls(wall: WallModel, floor: FloorModel): WallModel[] {
        const SPLIT_EPS = 1e-6;
        const walls = floor.walls;

        // Parametric split values along the input wall
        const inputSplitTs: number[] = [];

        // Intersecting walls and their split params: otherWall → t-values
        const intersectingMap = new Map<string, { wall: WallModel; ts: number[] }>();

        for (const other of walls) {
            if (other.id === wall.id) continue;

            const result = this.segmentIntersection(
                wall.from, wall.to, other.from, other.to
            );
            if (!result) continue;

            const { tA, tB } = result;

            const interiorA = tA > SPLIT_EPS && tA < 1 - SPLIT_EPS;
            const interiorB = tB > SPLIT_EPS && tB < 1 - SPLIT_EPS;

            if (interiorA) {
                inputSplitTs.push(tA);
            }
            if (interiorB) {
                if (!intersectingMap.has(other.id)) {
                    intersectingMap.set(other.id, { wall: other, ts: [] });
                }
                intersectingMap.get(other.id)!.ts.push(tB);
            }
        }

        // Helper: split a wall at the given parametric values, remove the
        // original from the floor, and add the sub-segments.
        const applySplits = (
            target: WallModel,
            ts: number[]
        ): WallModel[] => {
            const sorted = [...new Set(ts)].sort((a, b) => a - b);
            const from = target.from.clone();
            const to = target.to.clone();

            const points: THREE.Vector2[] = [from];
            for (const t of sorted) {
                const pt = new THREE.Vector2().lerpVectors(from, to, t);
                if (pt.distanceTo(points[points.length - 1]) > this.POINT_TOLERANCE) {
                    points.push(pt);
                }
            }
            if (to.distanceTo(points[points.length - 1]) > this.POINT_TOLERANCE) {
                points.push(to);
            }

            if (points.length < 2) return [target];

            const newWalls: WallModel[] = [];
            for (let k = 0; k < points.length - 1; k++) {
                newWalls.push(
                    new WallModel(points[k], points[k + 1], target.width, target.height)
                );
            }

            floor.removeWall(target);
            for (const nw of newWalls) {
                floor.addWall(nw);
            }
            return newWalls;
        };

        // 1. Split each intersecting wall at the crossing point(s).
        let didSplit = false;
        for (const { wall: otherWall, ts } of intersectingMap.values()) {
            const segs = applySplits(otherWall, ts);
            if (segs.length > 1) didSplit = true;
        }

        // 2. Split the input wall. If no intersections hit its interior,
        //    return the wall unchanged.
        let result: WallModel[];
        if (inputSplitTs.length === 0) {
            result = [wall];
        } else {
            result = applySplits(wall, inputSplitTs);
            if (result.length > 1) didSplit = true;
        }

        // 3. If any wall was actually split, recompute all links on the floor.
        if (didSplit) {
            this.recomputeWallLinks(floor);
        }

        return result;
    }

    /**
     * Performs wall splitting on a single floor.
     */
    private static splitWallsOnFloor(floor: FloorModel): number {
        const SPLIT_EPS = 1e-6;
        let splitCount = 0;

        // Map from wall id → sorted parametric split values along the wall
        const splitMap = new Map<string, number[]>();

        const walls = floor.walls;
        for (let i = 0; i < walls.length; i++) {
            for (let j = i + 1; j < walls.length; j++) {
                const wallA = walls[i];
                const wallB = walls[j];

                const result = this.segmentIntersection(wallA.from, wallA.to, wallB.from, wallB.to);
                if (!result) continue;

                const { tA, tB } = result;

                const interiorA = tA > SPLIT_EPS && tA < 1 - SPLIT_EPS;
                const interiorB = tB > SPLIT_EPS && tB < 1 - SPLIT_EPS;

                if (interiorA) {
                    if (!splitMap.has(wallA.id)) splitMap.set(wallA.id, []);
                    splitMap.get(wallA.id)!.push(tA);
                }
                if (interiorB) {
                    if (!splitMap.has(wallB.id)) splitMap.set(wallB.id, []);
                    splitMap.get(wallB.id)!.push(tB);
                }

                if (interiorA || interiorB) {
                    splitCount++;
                }
            }
        }

        if (splitCount === 0) {
            // Even without splits, refresh all links to ensure consistency.
            this.recomputeWallLinks(floor);
            return 0;
        }

        // Apply splits: for each wall with split points, remove original
        // and create sub-walls between consecutive split parameters.
        for (const [wallId, params] of splitMap) {
            const wall = walls.find(w => w.id === wallId);
            if (!wall) continue;

            // De-duplicate and sort
            const sorted = [...new Set(params)].sort((a, b) => a - b);

            const from = wall.from.clone();
            const to = wall.to.clone();
            const width = wall.width;
            const height = wall.height;

            // Build ordered list of points: from → split points → to
            const points: THREE.Vector2[] = [from];
            for (const t of sorted) {
                const pt = new THREE.Vector2().lerpVectors(from, to, t);
                if (pt.distanceTo(points[points.length - 1]) > this.POINT_TOLERANCE) {
                    points.push(pt);
                }
            }
            if (to.distanceTo(points[points.length - 1]) > this.POINT_TOLERANCE) {
                points.push(to);
            }

            // Need at least 2 points to form a segment
            if (points.length < 2) continue;

            for (let k = 0; k < points.length - 1; k++) {
                const newWall = new WallModel(
                    points[k],
                    points[k + 1],
                    width,
                    height
                );
                floor.addWall(newWall);
            }

            // Remove original wall
            floor.removeWall(wall);
        }

        // After splitting, all old links reference removed walls.
        // Clear and rebuild links from scratch based on shared endpoints.
        this.recomputeWallLinks(floor);

        return splitCount;
    }

    /**
     * Clears all existing wall links on the floor and rebuilds them by
     * detecting walls that share endpoints (within POINT_TOLERANCE).
     * Each shared endpoint cluster generates bidirectional addLink calls.
     */
    private static recomputeWallLinks(floor: FloorModel): void {
        const walls = floor.walls;

        // 1. Clear all existing links
        for (const wall of walls) {
            wall.clearLinks();
        }

        // 2. Cluster all wall endpoints by spatial proximity.
        //    Each cluster node records which walls touch it.
        const clusterNodes: THREE.Vector2[] = [];
        const clusterWalls: Set<string>[] = [];

        for (const wall of walls) {
            for (const pt of [wall.from, wall.to]) {
                let found = -1;
                for (let i = 0; i < clusterNodes.length; i++) {
                    if (clusterNodes[i].distanceTo(pt) < this.POINT_TOLERANCE) {
                        found = i;
                        break;
                    }
                }
                if (found >= 0) {
                    clusterWalls[found].add(wall.id);
                } else {
                    clusterNodes.push(pt.clone());
                    clusterWalls.push(new Set([wall.id]));
                }
            }
        }

        // 3. At each junction where ≥2 walls meet, create bidirectional links.
        const wallMap = new Map<string, WallModel>();
        for (const wall of walls) {
            wallMap.set(wall.id, wall);
        }

        for (const wallIds of clusterWalls) {
            if (wallIds.size < 2) continue;
            const linkedWalls = [...wallIds].map(id => wallMap.get(id)).filter(Boolean) as WallModel[];
            for (let i = 0; i < linkedWalls.length; i++) {
                for (let j = i + 1; j < linkedWalls.length; j++) {
                    linkedWalls[i].addLink({ wall: linkedWalls[j] });
                    linkedWalls[j].addLink({ wall: linkedWalls[i] });
                }
            }
        }
    }

    /**
     * Computes the intersection of two line segments A→B and C→D.
     * Returns parametric values tAB ∈ [0,1] and tCD ∈ [0,1] if the
     * segments intersect, or null if they do not.
     *
     * The parametric form is:
     *   P = A + tAB * (B - A)   on segment AB
     *   P = C + tCD * (D - C)   on segment CD
     */
    private static segmentIntersection(
        a: THREE.Vector2, b: THREE.Vector2,
        c: THREE.Vector2, d: THREE.Vector2
    ): { tA: number; tB: number } | null {
        const abx = b.x - a.x, aby = b.y - a.y;
        const cdx = d.x - c.x, cdy = d.y - c.y;
        const acx = c.x - a.x, acy = c.y - a.y;

        const denom = abx * cdy - aby * cdx;
        if (Math.abs(denom) < 1e-10) return null; // parallel or coincident

        const tA = (acx * cdy - acy * cdx) / denom;
        const tB = (acx * aby - acy * abx) / denom;

        if (tA < -1e-8 || tA > 1 + 1e-8 || tB < -1e-8 || tB > 1 + 1e-8) return null;

        return { tA: Math.max(0, Math.min(1, tA)), tB: Math.max(0, Math.min(1, tB)) };
    }

    /**
     * Signed area of a 2D polygon via the shoelace formula.
     * Positive for CCW polygons, negative for CW.
     */
    private static signedArea(polygon: THREE.Vector2[]): number {
        let sum = 0;
        const n = polygon.length;
        for (let i = 0; i < n; i++) {
            const p1 = polygon[i];
            const p2 = polygon[(i + 1) % n];
            sum += p1.x * p2.y - p2.x * p1.y;
        }
        return sum / 2;
    }
}
