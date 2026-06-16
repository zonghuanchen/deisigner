import * as THREE from 'three';
import { Material } from '../material/Material';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A closed 3D polygon path used to represent a tile or region boundary.
 */
export type Path3D = THREE.Vector3[];

/**
 * Supported paving pattern type identifiers.
 */
export type PatternType = 'zhipu' | 'gongzi';

/**
 * Result produced by Pattern.rebuild(): the generated tile polygons and gap polylines.
 */
export interface PaveBuildResult {
    /** Closed polygon paths for each tile (3D) */
    tilePaths: Path3D[];
    /** Polyline paths for each gap segment (3D) */
    gapPaths: Path3D[];
}

// ─── Utility: 2D geometry helpers (internal use) ─────────────────────────────

type Vec2 = THREE.Vector2;
type Path2 = Vec2[];

/**
 * Ray-casting point-in-polygon test (2D).
 */
function pointInPolygon(p: Vec2, polygon: Path2): boolean {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Axis-aligned bounding box of a 2D polygon.
 */
function bbox2D(path: Path2): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of path) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
}

/**
 * Create a rectangle Path2 from position and size (CCW winding).
 */
function rectPath(x: number, y: number, w: number, h: number): Path2 {
    return [
        new THREE.Vector2(x, y),
        new THREE.Vector2(x + w, y),
        new THREE.Vector2(x + w, y + h),
        new THREE.Vector2(x, y + h),
    ];
}

/**
 * Rotate a set of 2D points around a pivot by the given angle (radians).
 */
function rotatePoints(points: Path2, angle: number, pivot: Vec2): Path2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return points.map(p => {
        const dx = p.x - pivot.x;
        const dy = p.y - pivot.y;
        return new THREE.Vector2(
            pivot.x + dx * cos - dy * sin,
            pivot.y + dx * sin + dy * cos,
        );
    });
}

/**
 * Rotate a single 2D point around a pivot by the given angle (radians).
 */
function rotatePoint(p: Vec2, angle: number, pivot: Vec2): Vec2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = p.x - pivot.x;
    const dy = p.y - pivot.y;
    return new THREE.Vector2(
        pivot.x + dx * cos - dy * sin,
        pivot.y + dx * sin + dy * cos,
    );
}

// ─── Polygon clipping utilities ─────────────────────────────────────────

/**
 * Compute the signed area of a 2D polygon.
 * Positive → counter-clockwise (CCW), Negative → clockwise (CW).
 */
function polygonSignedArea(poly: Path2): number {
    let area = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    }
    return area / 2;
}

/**
 * Ensure a polygon has counter-clockwise winding order.
 */
function ensureCCW(poly: Path2): Path2 {
    return polygonSignedArea(poly) >= 0 ? poly : [...poly].reverse();
}

/**
 * Test whether point p is on the left side (inside) of the directed edge from→to.
 * For a CCW polygon, "left" = "inside".
 */
function isLeftOfEdge(p: Vec2, edgeFrom: Vec2, edgeTo: Vec2): boolean {
    return (edgeTo.x - edgeFrom.x) * (p.y - edgeFrom.y)
         - (edgeTo.y - edgeFrom.y) * (p.x - edgeFrom.x) >= 0;
}

/**
 * Find the intersection point of two line segments (a1→a2) and (b1→b2).
 * Returns the intersection point and parameters, or null if no intersection.
 */
function segmentIntersect(
    a1: Vec2, a2: Vec2,
    b1: Vec2, b2: Vec2,
): { point: Vec2; t: number; u: number } | null {
    const dx1 = a2.x - a1.x;
    const dy1 = a2.y - a1.y;
    const dx2 = b2.x - b1.x;
    const dy2 = b2.y - b1.y;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
    const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;
    const eps = 1e-8;
    if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
    const tc = Math.max(0, Math.min(1, t));
    return {
        point: new THREE.Vector2(a1.x + tc * dx1, a1.y + tc * dy1),
        t: tc,
        u: Math.max(0, Math.min(1, u)),
    };
}

/**
 * Find the intersection point of segment (a1→a2) with the infinite line through (l1→l2).
 * Only t (parameter along the segment) is constrained to [0,1];
 * the line extends infinitely so u is unrestricted.
 * Used by Sutherland-Hodgman which clips against half-planes, not finite segments.
 */
function segmentLineIntersect(
    a1: Vec2, a2: Vec2,
    l1: Vec2, l2: Vec2,
): { point: Vec2; t: number } | null {
    const dx1 = a2.x - a1.x;
    const dy1 = a2.y - a1.y;
    const dx2 = l2.x - l1.x;
    const dy2 = l2.y - l1.y;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-10) return null; // parallel
    const t = ((l1.x - a1.x) * dy2 - (l1.y - a1.y) * dx2) / denom;
    const eps = 1e-8;
    if (t < -eps || t > 1 + eps) return null;
    const tc = Math.max(0, Math.min(1, t));
    return {
        point: new THREE.Vector2(a1.x + tc * dx1, a1.y + tc * dy1),
        t: tc,
    };
}

/**
 * Sutherland-Hodgman polygon clipping: clip subject polygon to be inside the clip polygon.
 * Both polygons should have CCW winding (or will be corrected).
 * Returns null if the result is empty.
 */
function clipPolygonInside(subject: Path2, clip: Path2): Path2 | null {
    const ccwClip = ensureCCW(clip);
    let output: Path2 = [...subject];
    const clipLen = ccwClip.length;
    for (let i = 0; i < clipLen; i++) {
        if (output.length === 0) return null;
        const edgeFrom = ccwClip[i];
        const edgeTo = ccwClip[(i + 1) % clipLen];
        const input = output;
        output = [];
        const inputLen = input.length;
        for (let j = 0; j < inputLen; j++) {
            const current = input[j];
            const next = input[(j + 1) % inputLen];
            const currentInside = isLeftOfEdge(current, edgeFrom, edgeTo);
            const nextInside = isLeftOfEdge(next, edgeFrom, edgeTo);
            if (currentInside) {
                if (nextInside) {
                    output.push(next);
                } else {
                    const inter = segmentLineIntersect(current, next, edgeFrom, edgeTo);
                    if (inter) output.push(inter.point);
                }
            } else if (nextInside) {
                const inter = segmentLineIntersect(current, next, edgeFrom, edgeTo);
                if (inter) output.push(inter.point);
                output.push(next);
            }
        }
    }
    return output.length >= 3 ? output : null;
}

// ─── Polygon difference (subject − hole) ──────────────────────────────────

interface InterInfo {
    point: Vec2;
    sEdge: number;
    sT: number;
    hEdge: number;
    hU: number;
    entering: boolean;
    /** Unique ID (index in the original `inters` array) for cross-referencing. */
    id: number;
}

/**
 * Subtract a hole polygon from a subject polygon.
 * Returns an array of result polygons (parts of subject outside the hole).
 */
function subtractPolygon(subject: Path2, hole: Path2): Path2[] {
    const ccwSubject = ensureCCW(subject);
    const cwHole = polygonSignedArea(hole) <= 0 ? hole : [...hole].reverse();

    // Quick AABB overlap check
    const sBB = bbox2D(ccwSubject);
    const hBB = bbox2D(cwHole);
    if (sBB.maxX < hBB.minX || sBB.minX > hBB.maxX ||
        sBB.maxY < hBB.minY || sBB.minY > hBB.maxY) {
        return [ccwSubject];
    }

    // Find all intersection points, classified as entering / exiting
    const inters: InterInfo[] = [];
    for (let si = 0; si < ccwSubject.length; si++) {
        const s1 = ccwSubject[si];
        const s2 = ccwSubject[(si + 1) % ccwSubject.length];
        const edgeInters: InterInfo[] = [];
        for (let hi = 0; hi < cwHole.length; hi++) {
            const h1 = cwHole[hi];
            const h2 = cwHole[(hi + 1) % cwHole.length];
            const result = segmentIntersect(s1, s2, h1, h2);
            if (result && result.t > 1e-6 && result.t < 1 - 1e-6
                       && result.u > 1e-6 && result.u < 1 - 1e-6) {
                edgeInters.push({
                    point: result.point, sEdge: si, sT: result.t,
                    hEdge: hi, hU: result.u, entering: false,
                    id: -1, // assigned below
                });
            }
        }
        edgeInters.sort((a, b) => a.sT - b.sT);
        const s1Outside = !pointInPolygon(s1, cwHole);
        let isEntering = s1Outside;
        for (const inter of edgeInters) {
            inter.entering = isEntering;
            isEntering = !isEntering;
            inters.push(inter);
        }
    }

    // Assign stable unique IDs (index in the original order)
    for (let i = 0; i < inters.length; i++) inters[i].id = i;

    // No intersections → check containment
    if (inters.length === 0) {
        if (pointInPolygon(ccwSubject[0], cwHole)) return [];
        if (pointInPolygon(cwHole[0], ccwSubject)) return createBridgePolygon(ccwSubject, cwHole);
        return [ccwSubject];
    }

    // Sort intersections along hole boundary
    const intersByH = [...inters].sort((a, b) =>
        a.hEdge !== b.hEdge ? a.hEdge - b.hEdge : a.hU - b.hU);

    // Build augmented vertex lists (use stable .id for interIdx)
    type AugNode = { point: Vec2; type: 'vertex' | 'inter'; interIdx: number; entering: boolean };
    const subjectAug: AugNode[] = [];
    let sIdx = 0;
    const intersByS = [...inters].sort((a, b) =>
        a.sEdge !== b.sEdge ? a.sEdge - b.sEdge : a.sT - b.sT);
    for (let si = 0; si < ccwSubject.length; si++) {
        subjectAug.push({ point: ccwSubject[si], type: 'vertex', interIdx: -1, entering: false });
        while (sIdx < intersByS.length && intersByS[sIdx].sEdge === si) {
            subjectAug.push({ point: intersByS[sIdx].point, type: 'inter',
                interIdx: intersByS[sIdx].id, entering: intersByS[sIdx].entering });
            sIdx++;
        }
    }

    const holeAug: AugNode[] = [];
    let hIdx = 0;
    for (let hi = 0; hi < cwHole.length; hi++) {
        holeAug.push({ point: cwHole[hi], type: 'vertex', interIdx: -1, entering: false });
        while (hIdx < intersByH.length && intersByH[hIdx].hEdge === hi) {
            holeAug.push({ point: intersByH[hIdx].point, type: 'inter',
                interIdx: intersByH[hIdx].id, entering: intersByH[hIdx].entering });
            hIdx++;
        }
    }

    // Build cross-references: interIdx → augmented-list index
    const holeIdxMap = new Map<number, number>();
    for (let i = 0; i < holeAug.length; i++) {
        if (holeAug[i].type === 'inter') holeIdxMap.set(holeAug[i].interIdx, i);
    }
    const subjectIdxMap = new Map<number, number>();
    for (let i = 0; i < subjectAug.length; i++) {
        if (subjectAug[i].type === 'inter') subjectIdxMap.set(subjectAug[i].interIdx, i);
    }

    // Weiler-Atherton traversal for difference (S − H)
    const results: Path2[] = [];
    const visitedIntersections = new Set<number>();

    for (let startIdx = 0; startIdx < subjectAug.length; startIdx++) {
        const startNode = subjectAug[startIdx];
        if (startNode.type === 'inter' && startNode.entering) continue;
        if (startNode.type === 'vertex' && pointInPolygon(startNode.point, cwHole)) continue;
        if (startNode.type === 'inter' && visitedIntersections.has(startNode.interIdx)) continue;

        const result: Path2 = [];
        let curList: 'subject' | 'hole' = 'subject';
        let curIdx = startIdx;
        let steps = 0;
        const maxSteps = subjectAug.length + holeAug.length + inters.length * 2;

        while (steps++ < maxSteps) {
            const cur = curList === 'subject' ? subjectAug[curIdx] : holeAug[curIdx];
            if (result.length === 0 || result[result.length - 1].distanceTo(cur.point) > 1e-6) {
                result.push(cur.point.clone());
            }

            if (cur.type === 'inter') {
                if (visitedIntersections.has(cur.interIdx)) break;
                visitedIntersections.add(cur.interIdx);

                if (curList === 'subject' && cur.entering) {
                    curList = 'hole';
                    curIdx = holeIdxMap.get(cur.interIdx)!;
                    curIdx = (curIdx + 1) % holeAug.length;
                    continue;
                }
                if (curList === 'hole' && !cur.entering) {
                    curList = 'subject';
                    curIdx = subjectIdxMap.get(cur.interIdx)!;
                    curIdx = (curIdx + 1) % subjectAug.length;
                    continue;
                }
            }

            if (curList === 'subject') {
                curIdx = (curIdx + 1) % subjectAug.length;
            } else {
                curIdx = (curIdx + 1) % holeAug.length;
            }
            if (curList === 'subject' && curIdx === startIdx) break;
        }

        if (result.length >= 3) results.push(result);
    }

    return results.length > 0 ? results : [];
}

/**
 * Create a bridge polygon from outer and inner (hole) boundaries,
 * connecting them with a zero-width bridge so the donut shape can be
 * represented as a single simple polygon.
 */
function createBridgePolygon(outer: Path2, inner: Path2): Path2[] {
    let bestDist = Infinity;
    let outerIdx = 0;
    let innerIdx = 0;
    for (let oi = 0; oi < outer.length; oi++) {
        for (let ii = 0; ii < inner.length; ii++) {
            const d = outer[oi].distanceTo(inner[ii]);
            if (d < bestDist) { bestDist = d; outerIdx = oi; innerIdx = ii; }
        }
    }
    const result: Path2 = [];
    for (let j = 0; j < outer.length; j++) {
        result.push(outer[(outerIdx + j) % outer.length].clone());
    }
    result.push(inner[innerIdx].clone());
    for (let j = 1; j < inner.length; j++) {
        result.push(inner[(innerIdx - j + inner.length) % inner.length].clone());
    }
    return result.length >= 3 ? [result] : [];
}

/**
 * Clip a path polygon against boundaries:
 *  - Clip inside the outer boundary  (Sutherland-Hodgman)
 *  - Subtract each inner boundary / hole (Weiler-Atherton difference)
 *
 * Returns an array of resulting polygon paths.
 */
function clipPathByBoundaries(
    path: Path2,
    outer: Path2,
    inners: Path2[],
): Path2[] {
    if (path.length < 3) return [];
    // Quick AABB overlap check with outer
    const pathBB = bbox2D(path);
    const outerBB = bbox2D(outer);
    if (pathBB.maxX <= outerBB.minX || pathBB.minX >= outerBB.maxX ||
        pathBB.maxY <= outerBB.minY || pathBB.minY >= outerBB.maxY) return [];

    // Clip inside outer boundary
    const clipped = clipPolygonInside(path, outer);
    if (!clipped || clipped.length < 3) return [];

    // Subtract each inner boundary (hole)
    let currentPaths: Path2[] = [clipped];
    for (const inner of inners) {
        const innerBB = bbox2D(inner);
        const newPaths: Path2[] = [];
        for (const cp of currentPaths) {
            const cpBB = bbox2D(cp);
            if (cpBB.maxX <= innerBB.minX || cpBB.minX >= innerBB.maxX ||
                cpBB.maxY <= innerBB.minY || cpBB.minY >= innerBB.maxY) {
                newPaths.push(cp); // No overlap → keep unchanged
            } else {
                newPaths.push(...subtractPolygon(cp, inner));
            }
        }
        currentPaths = newPaths;
    }
    return currentPaths.filter(p => p.length >= 3);
}

// ─── BasePattern ─────────────────────────────────────────────────────────────

/**
 * Base class for paving patterns.
 *
 * Holds all common parameters (tile size, gap, rotation, offsets, material)
 * and defines the abstract rebuild() method that generates tile/gap paths.
 *
 * Constructor receives the outer boundary and optional inner boundaries
 * (holes) of the paving region, expressed as 3D paths on the face plane.
 * A plane basis (origin, uAxis, vAxis) must be set via setPlane() before
 * rebuild() so that 3D paths can be projected to 2D for pattern computation
 * and results projected back to 3D.
 */
export abstract class BasePattern {
    protected _tileWidth: number = 0.6;
    protected _tileHeight: number = 0.6;
    protected _gap: number = 0.002;
    protected _gapMaterial: Material | null = null;
    protected _rotation: number = 0;
    protected _offsetU: number = 0;
    protected _offsetV: number = 0;
    protected _outerPath: Path3D;
    protected _innerPaths: Path3D[];
    protected _material: Material;

    // Plane basis for 3D↔2D projection
    protected _planeOrigin: THREE.Vector3 = new THREE.Vector3();
    protected _planeU: THREE.Vector3 = new THREE.Vector3(1, 0, 0);
    protected _planeV: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

    constructor(outerPath: Path3D, innerPaths: Path3D[] = []) {
        this._outerPath = outerPath.map(p => p.clone());
        this._innerPaths = innerPaths.map(ip => ip.map(p => p.clone()));
        this._material = new Material();
    }

    /**
     * Set the plane basis used to project 3D paths to/from 2D for pattern computation.
     */
    setPlane(origin: THREE.Vector3, uAxis: THREE.Vector3, vAxis: THREE.Vector3): void {
        this._planeOrigin = origin.clone();
        this._planeU = uAxis.clone();
        this._planeV = vAxis.clone();
    }

    // ─── Accessors ──────────────────────────────────────────────────────────

    get tileWidth(): number { return this._tileWidth; }
    set tileWidth(v: number) { this._tileWidth = v; }

    get tileHeight(): number { return this._tileHeight; }
    set tileHeight(v: number) { this._tileHeight = v; }

    get gap(): number { return this._gap; }
    set gap(v: number) { this._gap = v; }

    get gapMaterial(): Material | null { return this._gapMaterial; }
    set gapMaterial(v: Material | null) { this._gapMaterial = v; }

    get rotation(): number { return this._rotation; }
    set rotation(v: number) { this._rotation = v; }

    get offsetU(): number { return this._offsetU; }
    set offsetU(v: number) { this._offsetU = v; }

    get offsetV(): number { return this._offsetV; }
    set offsetV(v: number) { this._offsetV = v; }

    get outerPath(): Path3D { return this._outerPath; }
    set outerPath(v: Path3D) { this._outerPath = v.map(p => p.clone()); }

    get innerPaths(): Path3D[] { return this._innerPaths; }
    set innerPaths(v: Path3D[]) { this._innerPaths = v.map(ip => ip.map(p => p.clone())); }

    get material(): Material { return this._material; }
    set material(v: Material) { this._material = v; }

    // ─── Abstract ───────────────────────────────────────────────────────────

    /**
     * Generate tile and gap paths from the current parameters.
     * Subclasses implement the specific layout algorithm.
     */
    abstract rebuild(): PaveBuildResult;

    // ─── 3D↔2D projection helpers ──────────────────────────────────────────

    /** Project a 3D point onto the 2D plane (u, v coordinates). */
    protected _to2D(p: THREE.Vector3): THREE.Vector2 {
        const d = p.clone().sub(this._planeOrigin);
        return new THREE.Vector2(d.dot(this._planeU), d.dot(this._planeV));
    }

    /** Project a 2D point (u, v) back to 3D on the plane. */
    protected _to3D(p: THREE.Vector2): THREE.Vector3 {
        return this._planeOrigin.clone()
            .add(this._planeU.clone().multiplyScalar(p.x))
            .add(this._planeV.clone().multiplyScalar(p.y));
    }

    /** Project an array of 3D paths to 2D. */
    protected _pathsTo2D(paths: Path3D[]): Path2[] {
        return paths.map(path => path.map(p => this._to2D(p)));
    }

    /** Project an array of 2D paths to 3D. */
    protected _pathsTo3D(paths: Path2[]): Path3D[] {
        return paths.map(path => path.map(p => this._to3D(p)));
    }

    // ─── Shared grid helpers ────────────────────────────────────────────────

    /**
     * Compute the axis-aligned bounding box of the outer path in local (un-rotated) 2D space.
     * The bounding box is expanded slightly to account for offsets.
     */
    protected getOuterBBox(): { minX: number; minY: number; maxX: number; maxY: number } {
        const outer2D = this._pathsTo2D([this._outerPath])[0];
        const pivot = this._computePivot2D(outer2D);
        const invAngle = -this._rotation;
        const rotated = outer2D.map(p => rotatePoint(p, invAngle, pivot));
        return bbox2D(rotated);
    }

    /**
     * Pivot point for rotation: center of the 2D outer bounding box.
     */
    protected _computePivot2D(outer2D: Path2): THREE.Vector2 {
        const bb = bbox2D(outer2D);
        return new THREE.Vector2((bb.minX + bb.maxX) * 0.5, (bb.minY + bb.maxY) * 0.5);
    }

    /**
     * Generate a regular grid of tile rectangles in pattern-local 2D space,
     * then rotate and project back to 3D world space, filtering against boundaries.
     *
     * @param rowOffsetX Fraction of tileWidth to offset alternate rows (0 = straight, 0.5 = brick)
     */
    protected buildGrid(rowOffsetX: number): PaveBuildResult {
        const tw = this._tileWidth;
        const th = this._tileHeight;
        const g = this._gap;
        const stepX = tw + g;
        const stepY = th + g;

        // Project 3D boundaries to 2D
        const outer2D = this._pathsTo2D([this._outerPath])[0];
        const inners2D = this._pathsTo2D(this._innerPaths);

        const pivot = this._computePivot2D(outer2D);
        const invAngle = -this._rotation;

        // Work in local (un-rotated) 2D space: inverse-rotate the boundaries
        const localOuter = outer2D.map(p => rotatePoint(p, invAngle, pivot));
        const localInners = inners2D.map(inner =>
            inner.map(p => rotatePoint(p, invAngle, pivot)),
        );

        // Bounding box of the outer path in local space
        const bb = bbox2D(localOuter);

        // Number of rows and columns (with some padding to cover the bbox)
        const cols = Math.ceil((bb.maxX - bb.minX) / stepX) + 2;
        const rows = Math.ceil((bb.maxY - bb.minY) / stepY) + 2;

        // Starting origin (top-left of bbox minus one tile for padding)
        const startX = bb.minX - stepX + this._offsetU;
        const startY = bb.minY - stepY + this._offsetV;

        const tilePaths2D: Path2[] = [];
        const gapPaths2D: Path2[] = [];

        for (let row = 0; row < rows; row++) {
            const rowShift = (row % 2) * rowOffsetX * stepX;
            const colStart = (rowOffsetX > 0 && row % 2 !== 0) ? -1 : 0;
            for (let col = colStart; col < cols; col++) {
                const x = startX + col * stepX + rowShift;
                const y = startY + row * stepY;

                // Create tile rectangle in local 2D space
                const localTile = rectPath(x, y, tw, th);

                // Rotate back to world-2D space
                const worldTile = rotatePoints(localTile, this._rotation, pivot);

                // Clip tile against outer boundary and inner boundaries (holes)
                const clippedTiles = clipPathByBoundaries(worldTile, outer2D, inners2D);
                for (const ct of clippedTiles) {
                    if (ct.length >= 3) tilePaths2D.push(ct);
                }

                // Generate gap segments on the right and top edges, also clipped
                if (g > 0 && clippedTiles.length > 0) {
                    // Right edge gap
                    const gapRight = rotatePoints(
                        [
                            new THREE.Vector2(x + tw, y),
                            new THREE.Vector2(x + tw + g, y),
                            new THREE.Vector2(x + tw + g, y + th),
                            new THREE.Vector2(x + tw, y + th),
                        ],
                        this._rotation,
                        pivot,
                    );
                    for (const cg of clipPathByBoundaries(gapRight, outer2D, inners2D)) {
                        if (cg.length >= 3) gapPaths2D.push(cg);
                    }

                    // Top edge gap
                    const gapTop = rotatePoints(
                        [
                            new THREE.Vector2(x, y + th),
                            new THREE.Vector2(x + tw, y + th),
                            new THREE.Vector2(x + tw, y + th + g),
                            new THREE.Vector2(x, y + th + g),
                        ],
                        this._rotation,
                        pivot,
                    );
                    for (const cg of clipPathByBoundaries(gapTop, outer2D, inners2D)) {
                        if (cg.length >= 3) gapPaths2D.push(cg);
                    }
                }
            }
        }

        // Project 2D results back to 3D
        return {
            tilePaths: this._pathsTo3D(tilePaths2D),
            gapPaths: this._pathsTo3D(gapPaths2D),
        };
    }
}

// ─── StraightPattern (直铺) ──────────────────────────────────────────────────

/**
 * Straight (grid-aligned) paving pattern.
 * Tiles are laid in a regular grid with no row offset.
 */
export class StraightPattern extends BasePattern {
    rebuild(): PaveBuildResult {
        return this.buildGrid(0);
    }
}

// ─── BrickPattern (工字铺) ──────────────────────────────────────────────────

/**
 * Brick (staggered) paving pattern.
 * Alternate rows are offset by half a tile width.
 */
export class BrickPattern extends BasePattern {
    rebuild(): PaveBuildResult {
        return this.buildGrid(0.5);
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a pattern instance from a type identifier.
 */
export function createPattern(
    type: PatternType,
    outerPath: Path3D,
    innerPaths: Path3D[] = [],
): BasePattern {
    switch (type) {
        case 'zhipu':
            return new StraightPattern(outerPath, innerPaths);
        case 'gongzi':
            return new BrickPattern(outerPath, innerPaths);
        default:
            throw new Error(`Unknown pattern type: ${type}`);
    }
}
