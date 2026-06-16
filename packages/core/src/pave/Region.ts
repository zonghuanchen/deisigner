import { BasePattern, createPattern, Path3D, PatternType, PaveBuildResult } from './Pattern';
import { Material } from '../material/Material';

// ─── BaseRegion ──────────────────────────────────────────────────────────────

/**
 * Base class for a paving region.
 *
 * A region owns an outer boundary (and optional inner holes) and a pattern
 * instance that knows how to lay out tiles within that boundary.
 *
 * Constructor receives the outer boundary and optional inner boundaries
 * expressed as 3D paths on the face plane.
 */
export abstract class BaseRegion {
    protected _outerPath: Path3D;
    protected _innerPaths: Path3D[];
    protected _pattern: BasePattern | null = null;

    constructor(outerPath: Path3D, innerPaths: Path3D[] = []) {
        this._outerPath = outerPath.map(p => p.clone());
        this._innerPaths = innerPaths.map(ip => ip.map(p => p.clone()));
    }

    get outerPath(): Path3D { return this._outerPath; }
    set outerPath(v: Path3D) {
        this._outerPath = v.map(p => p.clone());
        if (this._pattern) {
            this._pattern.outerPath = this._outerPath;
        }
    }

    get innerPaths(): Path3D[] { return this._innerPaths; }
    set innerPaths(v: Path3D[]) {
        this._innerPaths = v.map(ip => ip.map(p => p.clone()));
        if (this._pattern) {
            this._pattern.innerPaths = this._innerPaths;
        }
    }

    get pattern(): BasePattern | null { return this._pattern; }

    /**
     * Rebuild the paving layout for this region.
     * Delegates to the owned pattern's rebuild() and returns the result.
     */
    rebuild(): PaveBuildResult {
        if (!this._pattern) {
            return { tilePaths: [], tileUVs: [], gapPaths: [], material: new Material(), gapMaterial: null };
        }
        // Sync boundary paths to the pattern before rebuilding
        this._pattern.outerPath = this._outerPath;
        this._pattern.innerPaths = this._innerPaths;
        return this._pattern.rebuild();
    }

    /** Serialize region data for UI consumption. */
    getUI(): Record<string, any> {
        return {
            pattern: this._pattern?.getUI() ?? null,
        };
    }
}

// ─── PresetRegion ────────────────────────────────────────────────────────────

/**
 * Preset paving region that creates a concrete pattern from a type identifier.
 *
 * Supported pattern constants:
 * - `'zhipu'`  → StraightPattern (直铺)
 * - `'gongzi'` → BrickPattern    (工字铺)
 *
 * Usage:
 * ```ts
 * const region = new PresetRegion(outerPath, innerPaths, 'zhipu');
 * region.pattern!.tileWidth = 0.3;
 * const result = region.rebuild();
 * ```
 */
export class PresetRegion extends BaseRegion {
    private _patternType: PatternType;

    constructor(outerPath: Path3D, innerPaths: Path3D[] = [], patternType: PatternType = 'zhipu') {
        super(outerPath, innerPaths);
        this._patternType = patternType;
        this._pattern = patternType === 'none'
            ? null
            : createPattern(patternType, this._outerPath, this._innerPaths);
    }

    /** The pattern type identifier used to construct this region's pattern. */
    get patternType(): PatternType { return this._patternType; }

    /**
     * Replace the current pattern with a new one of the given type,
     * preserving tile/gap/rotation settings from the old pattern.
     */
    setPatternType(type: PatternType): void {
        if (type === this._patternType) return;

        const oldPattern = this._pattern;
        this._patternType = type;

        if (type === 'none') {
            this._pattern = null;
            return;
        }

        this._pattern = createPattern(type, this._outerPath, this._innerPaths);

        // Carry over settings from the previous pattern
        if (oldPattern) {
            this._pattern.tileWidth   = oldPattern.tileWidth;
            this._pattern.tileHeight  = oldPattern.tileHeight;
            this._pattern.gap         = oldPattern.gap;
            this._pattern.gapMaterial = oldPattern.gapMaterial;
            this._pattern.rotation    = oldPattern.rotation;
            this._pattern.offsetU     = oldPattern.offsetU;
            this._pattern.offsetV     = oldPattern.offsetV;
            this._pattern.material    = oldPattern.material;
        }
    }
}
