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
 *   5. Emit a RoomModel per bounded face.
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
     * Detects closed regions formed by the given walls.
     * Walls that are touched by other walls' endpoints along their body are
     * automatically split into sub-segments so the planar graph contains
     * proper junction nodes at those intersection points.
     */
    static buildFromWalls(walls: WallModel[]): RoomModel[] {
        if (walls.length === 0) return [];

        // 0. Pre-split walls at points where other walls' endpoints land on
        //    their body.  Each sub-segment references the original WallModel
        //    so that linkWalls still maps back to the real scene wall.
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
                // No valid segments yet — keep the original wall.
                segments.push({ from: wall.from.clone(), to: wall.to.clone(), wall });
            }
        }

        // 1. Cluster endpoints into unique nodes.
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

        // 2. Build two half-edges per (sub-)segment.
        const halfEdges: HalfEdge[] = [];
        for (const seg of segments) {
            const a = nodeOf(seg.from);
            const b = nodeOf(seg.to);
            if (a === b) continue; // skip degenerate segment

            const ab = new THREE.Vector2().subVectors(nodes[b], nodes[a]);
            const angleAB = Math.atan2(ab.y, ab.x);
            const angleBA = Math.atan2(-ab.y, -ab.x);

            halfEdges.push({ fromNode: a, toNode: b, wall: seg.wall, angle: angleAB });
            halfEdges.push({ fromNode: b, toNode: a, wall: seg.wall, angle: angleBA });
        }

        if (halfEdges.length === 0) return [];

        // 3. Group outgoing half-edges per node, sorted CCW by angle.
        const outgoing: HalfEdge[][] = nodes.map(() => []);
        for (const he of halfEdges) {
            outgoing[he.fromNode].push(he);
        }
        for (const list of outgoing) {
            list.sort((a, b) => a.angle - b.angle);
        }

        // 4. Index half-edges by (from, to) for fast reverse lookup.
        const keyOf = (from: number, to: number) => `${from}->${to}`;
        const byKey = new Map<string, HalfEdge>();
        for (const he of halfEdges) {
            byKey.set(keyOf(he.fromNode, he.toNode), he);
        }

        // 5. Trace faces of the planar graph.
        const visited = new Set<HalfEdge>();
        const faces: HalfEdge[][] = [];
        for (const start of halfEdges) {
            if (visited.has(start)) continue;
            const face: HalfEdge[] = [];
            let current: HalfEdge | undefined = start;
            let safety = halfEdges.length + 1;
            while (current && !visited.has(current) && safety-- > 0) {
                visited.add(current);
                face.push(current);

                // At current.toNode, find the reverse of current, then take
                // the outgoing edge immediately clockwise of it (index - 1 in
                // the CCW-sorted outgoing list). This traces the face on the
                // left of current in CCW winding.
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
            faces.push(face);
        }

        // 6. Keep bounded (CCW, positive signed area) faces and create rooms.
        const rooms: RoomModel[] = [];
        for (const face of faces) {
            if (face.length < 3) continue;
            let polygon = face.map(he => nodes[he.fromNode].clone());
            const area = this.signedArea(polygon);
            if (area <= this.MIN_AREA) continue;

            const height = this.resolveRoomHeight(face);
            const linkWalls = this.collectLinkWalls(face);
            polygon = this.applyWallThicknessOffset(face, nodes);
            rooms.push(new RoomModel(polygon, height, [], linkWalls));
        }

        return rooms;
    }

    /**
     * Offsets the room polygon inward by half the wall thickness for each edge,
     * so the floor/ceiling contour aligns with the inner surface of the walls
     * instead of the wall centerlines.
     */
    private static applyWallThicknessOffset(
        face: HalfEdge[],
        nodes: THREE.Vector2[]
    ): THREE.Vector2[] {
        const n = face.length;
        const offsetLines: { origin: THREE.Vector2; dir: THREE.Vector2 }[] = [];

        for (const he of face) {
            const wall = he.wall;
            const halfWidth = wall.width / 2;

            const wallDir = new THREE.Vector2().subVectors(wall.to, wall.from);
            wallDir.normalize();
            const perp = new THREE.Vector2(-wallDir.y, wallDir.x);

            // Room interior is on the left of the half-edge (CCW traversal).
            // Determine which side of the wall this half-edge traverses.
            const edgeDir = new THREE.Vector2().subVectors(
                nodes[he.toNode], nodes[he.fromNode]
            );
            const sameAsWall = edgeDir.dot(wallDir) > 0;
            // If same direction as wall, room is on +perp side;
            // if opposite, room is on -perp side.
            const sign = sameAsWall ? 1 : -1;

            const offset = perp.clone().multiplyScalar(halfWidth * sign);
            const p1 = nodes[he.fromNode].clone().add(offset);
            const p2 = nodes[he.toNode].clone().add(offset);

            offsetLines.push({
                origin: p1,
                dir: new THREE.Vector2().subVectors(p2, p1).normalize()
            });
        }

        // Compute new vertices at intersections of consecutive offset lines
        const result: THREE.Vector2[] = [];
        for (let i = 0; i < n; i++) {
            const prev = offsetLines[(i - 1 + n) % n];
            const curr = offsetLines[i];
            const intersection = this.lineIntersection(
                prev.origin, prev.dir, curr.origin, curr.dir
            );
            result.push(intersection || nodes[face[i].fromNode].clone());
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
     * Collects the unique walls that form the boundary of the face,
     * preserving traversal order.
     */
    private static collectLinkWalls(face: HalfEdge[]): WallModel[] {
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
