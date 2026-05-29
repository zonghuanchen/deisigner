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
     * Detects closed regions formed by the walls of a single floor.
     */
    static buildFromFloor(floor: FloorModel): RoomModel[] {
        return this.buildFromWalls(floor.walls);
    }

    /**
     * Detects closed regions formed by the given walls.
     */
    static buildFromWalls(walls: WallModel[]): RoomModel[] {
        if (walls.length === 0) return [];

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

        // 2. Build two half-edges per wall.
        const halfEdges: HalfEdge[] = [];
        for (const wall of walls) {
            const a = nodeOf(wall.from);
            const b = nodeOf(wall.to);
            if (a === b) continue; // skip degenerate wall

            const ab = new THREE.Vector2().subVectors(nodes[b], nodes[a]);
            const angleAB = Math.atan2(ab.y, ab.x);
            const angleBA = Math.atan2(-ab.y, -ab.x);

            halfEdges.push({ fromNode: a, toNode: b, wall, angle: angleAB });
            halfEdges.push({ fromNode: b, toNode: a, wall, angle: angleBA });
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
