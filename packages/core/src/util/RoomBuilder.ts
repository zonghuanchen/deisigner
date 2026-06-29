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

            // Ordered outer contour with wall-thickness offset, plus inner
            // contours (holes) for full-footprint internal walls.
            const { outer: polygon, inner: innerContours } =
                this.applyWallThicknessOffset(face, nodes, sharedWallIds);
            if (polygon.length < 3) continue;

            // 3b. Collect unique walls that bound this face.
            const linkWalls = this.collectUniqueWalls(face);

            // 3d. Room height from the face's walls.
            const height = this.resolveRoomHeight(face);

            rooms.push(new RoomModel(polygon, height, innerContours, linkWalls));
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
        const crossSplitMap = new Map<number, number[]>();

        for (let i = 0; i < walls.length; i++) {
            const wall = walls[i];
            const splitTs: number[] = [];

            for (let j = 0; j < walls.length; j++) {
                if (i === j) continue;

                // T-junction: other wall's endpoints land on this wall's body.
                const t1 = this.pointOnSegmentParam(walls[j].from, wall.from, wall.to);
                if (t1 !== null) splitTs.push(t1);
                const t2 = this.pointOnSegmentParam(walls[j].to, wall.from, wall.to);
                if (t2 !== null) splitTs.push(t2);

                // X-junction: two walls cross each other in their interiors.
                // Only check j > i to avoid computing the same pair twice.
                if (j > i) {
                    const xHit = this.segmentIntersectionParam(
                        wall.from, wall.to, walls[j].from, walls[j].to
                    );
                    if (xHit) {
                        // t is the parameter on wall i, u is on wall j.
                        splitTs.push(xHit.t);
                        // Store j's split parameter in a side map.
                        const jTs = crossSplitMap.get(j) ?? [];
                        jTs.push(xHit.u);
                        crossSplitMap.set(j, jTs);
                    }
                }
            }

            // Merge cross-junction splits collected from earlier pairs.
            const extraTs = crossSplitMap.get(i);
            if (extraTs) {
                for (const et of extraTs) splitTs.push(et);
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
     * the room), the wall's rectangular footprint is returned as an inner
     * contour (hole) so the floor excludes the wall area entirely, rather
     * than wrapping around it.
     */
    private static applyWallThicknessOffset(
        face: HalfEdge[],
        nodes: THREE.Vector2[],
        sharedWallIds: Set<string> = new Set()
    ): { outer: THREE.Vector2[]; inner: THREE.Vector2[][] } {
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

        // Step 2: Build offset lines for the outer contour, skipping
        // full-footprint wall half-edges so the outer contour bridges
        // across the gap without wrapping around the wall.
        const offsetLines: { origin: THREE.Vector2; dir: THREE.Vector2 }[] = [];
        // Collect wall footprints (inner contours) for full-footprint walls.
        const innerContours: THREE.Vector2[][] = [];
        const processedFullWalls = new Set<string>();

        for (let i = 0; i < face.length; i++) {
            const he = face[i];
            const wall = he.wall;

            if (fullFootprintWallIds.has(wall.id)) {
                // Full-footprint wall: skip both half-edges from the outer
                // contour and record the wall's rectangular footprint as an
                // inner contour (hole) so the floor excludes the wall area.
                if (!processedFullWalls.has(wall.id)) {
                    processedFullWalls.add(wall.id);
                    innerContours.push(this.computeWallFootprint(wall));
                }
                continue;
            }

            // Normal edge offset (boundary or shared wall).
            const offset = this.computeEdgeOffset(he, wall, nodes);
            if (offset) offsetLines.push(offset);
        }

        if (offsetLines.length < 3) return { outer: [], inner: [] };

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
        return { outer: result, inner: innerContours };
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
     * Computes the intersection of two line segments (A1→A2) and (B1→B2).
     * Returns { t, u, point } where t ∈ (0,1) is the parameter on segment A
     * and u ∈ (0,1) is the parameter on segment B, or null if the segments
     * do not cross in their interiors (excluding endpoints).
     */
    private static segmentIntersectionParam(
        a1: THREE.Vector2, a2: THREE.Vector2,
        b1: THREE.Vector2, b2: THREE.Vector2
    ): { t: number; u: number; point: THREE.Vector2 } | null {
        const da = new THREE.Vector2().subVectors(a2, a1);
        const db = new THREE.Vector2().subVectors(b2, b1);
        const cross = da.x * db.y - da.y * db.x;
        if (Math.abs(cross) < 1e-10) return null; // parallel or collinear

        const d = new THREE.Vector2().subVectors(b1, a1);
        const t = (d.x * db.y - d.y * db.x) / cross;
        const u = (d.x * da.y - d.y * da.x) / cross;

        // Exclude endpoints on both segments.
        const eps = 1e-4;
        if (t <= eps || t >= 1 - eps) return null;
        if (u <= eps || u >= 1 - eps) return null;

        const point = new THREE.Vector2(a1.x + t * da.x, a1.y + t * da.y);
        return { t, u, point };
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
     * Recomputes wall links on the floor after a new wall is added.
     * No longer splits walls at intersections — wall joint (link) logic only.
     *
     * @param wall  - The wall that was just added.
     * @param floor - The floor that contains the wall and its sibling walls.
     * @returns The wall in a single-element array (no splitting).
     */
    static splitWalls(wall: WallModel, floor: FloorModel): WallModel[] {
        this.recomputeWallLinks(floor);
        return [wall];
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

        // 4. Detect T-junctions: wall endpoints that lie on the interior
        //    of another wall's centerline (not at its endpoints).
        for (const wallA of walls) {
            for (const wallB of walls) {
                if (wallA.id === wallB.id) continue;

                const bFrom = wallB.from;
                const bTo = wallB.to;
                const bDir = new THREE.Vector2().subVectors(bTo, bFrom);
                const bLength = bDir.length();
                if (bLength < this.POINT_TOLERANCE) continue;
                const bDirN = bDir.clone().normalize();

                for (const [pt, endName] of [[wallA.from, 'from'], [wallA.to, 'to']] as const) {
                    const toPt = new THREE.Vector2().subVectors(pt, bFrom);
                    const proj = toPt.dot(bDirN);
                    const perpDist = Math.abs(toPt.x * (-bDirN.y) + toPt.y * bDirN.x);

                    // Endpoint must be close to wall B's line and in its interior
                    if (perpDist > this.POINT_TOLERANCE) continue;
                    if (proj < this.POINT_TOLERANCE || proj > bLength - this.POINT_TOLERANCE) continue;

                    // Skip if this endpoint already clusters with wall B's endpoint
                    let alreadyLinked = false;
                    for (let ci = 0; ci < clusterNodes.length; ci++) {
                        if (clusterNodes[ci].distanceTo(pt) < this.POINT_TOLERANCE && clusterWalls[ci].has(wallB.id)) {
                            alreadyLinked = true;
                            break;
                        }
                    }
                    if (alreadyLinked) continue;

                    // wall A links at its endpoint, wall B links at middle
                    wallA.addLink({ wall: wallB, end: endName });
                    wallB.addLink({ wall: wallA, end: 'middle' });
                }
            }
        }

        // 5. Detect X-junctions: walls that cross each other in their
        //    interiors (neither endpoint touches the other wall).
        for (let i = 0; i < walls.length; i++) {
            for (let j = i + 1; j < walls.length; j++) {
                const xHit = this.segmentIntersectionParam(
                    walls[i].from, walls[i].to,
                    walls[j].from, walls[j].to
                );
                if (!xHit) continue;

                // Both walls cross in their interiors — create middle links.
                walls[i].addLink({ wall: walls[j], end: 'middle' });
                walls[j].addLink({ wall: walls[i], end: 'middle' });
            }
        }
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
