import * as THREE from 'three';
import { Command } from './Command';
import { CommandManager } from './CommandManager';
import { AppViewer } from '@designer/app';
import { WallModel, App as CoreApp, RoomBuilder } from '@designer/core';

/**
 * 画墙命令。
 * 第一次点击地面确定墙的 from 点，之后鼠标移动实时预览墙的 to 点，
 * 第二次点击确认 to 点并创建墙体。按 Escape 取消。
 */
export class DrawWallCommand implements Command {
    readonly name = 'drawWall';

    private viewer: AppViewer;

    /** 第一个点击点（墙起点） */
    private fromPoint: THREE.Vector2 | null = null;

    /** 预览墙体（第一次点击后创建，mousemove 实时更新 to） */
    private previewWall: WallModel | null = null;

    private boundClick: (e: MouseEvent) => void;
    private boundMouseMove: (e: MouseEvent) => void;
    private boundKeyDown: (e: KeyboardEvent) => void;

    constructor(viewer: AppViewer) {
        this.viewer = viewer;
        this.boundClick = this.onClick.bind(this);
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundKeyDown = this.onKeyDown.bind(this);
    }

    onExecute(): void {
        this.fromPoint = null;
        this.previewWall = null;
        document.addEventListener('click', this.boundClick, true);
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('keydown', this.boundKeyDown);
        document.body.style.cursor = 'crosshair';
    }

    onComplete(): void {
        document.removeEventListener('click', this.boundClick, true);
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('keydown', this.boundKeyDown);
        document.body.style.cursor = '';
        this.fromPoint = null;
        this.previewWall = null;

        // Split walls at intersections (T-type / X-type), then rebuild rooms.
        const scene = CoreApp.getInstance().getScene();
        scene.rebuildRooms();
    }

    /** 吸附到现有墙体端点的距离阈值（米） */
    private static readonly ENDPOINT_SNAP_DISTANCE = 0.5;

    private onClick(e: MouseEvent): void {
        const pos = this.viewer.getModelPosition(e.clientX, e.clientY, 0);
        if (!pos) return;

        const rawPoint = new THREE.Vector2(pos.x, pos.y);
        const point = this.fromPoint
            ? this.snapPoint(this.fromPoint, rawPoint)
            : this.snapToExistingEndpoint(rawPoint);

        if (!this.fromPoint) {
            // 第一次点击：确定墙起点，创建预览墙
            this.fromPoint = point;
            this.previewWall = new WallModel(this.fromPoint, point);
            CoreApp.getInstance().getScene().addWall(this.previewWall);
        } else {
            // 第二次点击：确认终点，更新墙体并建立接头
            if (this.previewWall) {
                this.previewWall.to = point;
                const scene = CoreApp.getInstance().getScene();
                const floor = scene.defaultFloor;
                if (floor) {
                    // Split the wall at intersections, then create miter links for each segment
                    const segments = RoomBuilder.splitWalls(this.previewWall, floor);
                    for (const seg of segments) {
                        this.createLinksForWall(seg);
                    }
                } else {
                    this.createLinksForWall(this.previewWall);
                }
            }
            CommandManager.getInstance().completeCurrent();
        }
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.fromPoint || !this.previewWall) return;

        const pos = this.viewer.getModelPosition(e.clientX, e.clientY, 0);
        if (!pos) return;

        const rawPoint = new THREE.Vector2(pos.x, pos.y);
        this.previewWall.to = this.snapPoint(this.fromPoint, rawPoint);
    }

    /**
     * 将目标点相对起点的方向吸附到 0°、90°、180°、270°，
     * 仅当偏差在 ±5° 以内时吸附，否则使用原始方向。
     * 优先吸附到 0.5 米内现有墙体的 from/to 端点。
     */
    private snapPoint(from: THREE.Vector2, to: THREE.Vector2): THREE.Vector2 {
        // 优先吸附到现有墙体端点
        const endpointSnap = this.snapToExistingEndpoint(to);
        if (endpointSnap !== to) {
            return endpointSnap;
        }

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance === 0) return to.clone();

        const angle = Math.atan2(dy, dx);
        const snapStep = Math.PI / 2; // 90°
        const nearestSnap = Math.round(angle / snapStep) * snapStep;
        const diff = Math.abs(angle - nearestSnap);

        // 吸附范围 ±5°
        const threshold = 5 * (Math.PI / 180);
        const snappedAngle = diff <= threshold ? nearestSnap : angle;

        return new THREE.Vector2(
            from.x + distance * Math.cos(snappedAngle),
            from.y + distance * Math.sin(snappedAngle),
        );
    }

    /**
     * 查找 0.5 米内现有墙体的 from/to 端点。
     * 返回吸附信息（点、墙体、端点名），若范围内无端点则返回 null。
     */
    private findSnapTarget(point: THREE.Vector2): { point: THREE.Vector2; wall: WallModel; end: 'from' | 'to' } | null {
        const scene = CoreApp.getInstance().getScene();
        const threshold = DrawWallCommand.ENDPOINT_SNAP_DISTANCE;
        let closest: THREE.Vector2 | null = null;
        let closestDist = Infinity;
        let closestWall: WallModel | null = null;
        let closestEnd: 'from' | 'to' = 'from';

        for (const wall of scene.walls) {
            // 跳过预览墙自身
            if (this.previewWall && wall.id === this.previewWall.id) continue;

            const endpoints: Array<{ pos: THREE.Vector2; end: 'from' | 'to' }> = [
                { pos: wall.from, end: 'from' },
                { pos: wall.to, end: 'to' },
            ];
            for (const ep of endpoints) {
                const dist = point.distanceTo(ep.pos);
                if (dist < threshold && dist < closestDist) {
                    closestDist = dist;
                    closest = ep.pos;
                    closestWall = wall;
                    closestEnd = ep.end;
                }
            }
        }

        if (closest && closestWall) {
            return { point: closest.clone(), wall: closestWall, end: closestEnd };
        }
        return null;
    }

    /**
     * 如果给定点在 0.5 米内存在现有墙体的 from 或 to 端点，则吸附到该端点。
     * 返回吸附后的点；若范围内无端点则返回原始点。
     */
    private snapToExistingEndpoint(point: THREE.Vector2): THREE.Vector2 {
        const target = this.findSnapTarget(point);
        return target ? target.point : point;
    }

    /**
     * 为新墙体的 from 和 to 端点建立接头（addLink）。
     * 处理三种情况：
     * - 端点接头：新墙端点吸附到现有墙端点（endpoint-to-endpoint）
     * - T 型接头：新墙端点落在现有墙内部（T-junction）
     * - X 型接头：新墙穿过现有墙内部（cross-junction / middle-to-middle）
     */
    private createLinksForWall(wall: WallModel): void {
        const scene = CoreApp.getInstance().getScene();
        const floor = scene.defaultFloor;
        const walls = floor ? floor.walls : scene.walls;
        const tolerance = 0.01;

        const wallDir = new THREE.Vector2().subVectors(wall.to, wall.from);
        const wallLen = wallDir.length();
        const wallDirN = wallLen > 0 ? wallDir.clone().normalize() : new THREE.Vector2(1, 0);

        // Track walls already linked via endpoint snap (to avoid duplicate links)
        const endpointLinkedWalls = new Set<string>();

        // 1. Endpoint-to-endpoint links (existing behavior)
        const positions: THREE.Vector2[] = [wall.from, wall.to];
        for (const pos of positions) {
            const saved = this.previewWall;
            this.previewWall = wall;
            const target = this.findSnapTarget(pos);
            this.previewWall = saved;

            if (!target) continue;

            endpointLinkedWalls.add(target.wall.id);
            wall.addLink({ wall: target.wall });
            target.wall.addLink({ wall });
        }
        
        // 2. T-junction and X-junction detection
        for (const other of walls) {
            if (other.id === wall.id) continue;
            if (endpointLinkedWalls.has(other.id)) continue;

            const otherDir = new THREE.Vector2().subVectors(other.to, other.from);
            const otherLen = otherDir.length();
            if (otherLen < tolerance) continue;
            const otherDirN = otherDir.clone().normalize();
            const otherPerp = new THREE.Vector2(-otherDirN.y, otherDirN.x);

            // Project wall endpoints onto other wall's line
            const fromToOther = new THREE.Vector2().subVectors(wall.from, other.from);
            const toToOther = new THREE.Vector2().subVectors(wall.to, other.from);
            const fromProj = fromToOther.dot(otherDirN);
            const toProj = toToOther.dot(otherDirN);
            const fromPerpDist = Math.abs(fromToOther.dot(otherPerp));
            const toPerpDist = Math.abs(toToOther.dot(otherPerp));

            // Check if wall.from is on other wall's interior (T-junction)
            if (fromPerpDist < DrawWallCommand.ENDPOINT_SNAP_DISTANCE
                && fromProj > tolerance && fromProj < otherLen - tolerance) {
                wall.addLink({ wall: other }); // auto-detects 'from' end
                other.addLink({ wall, end: 'middle' });
                continue;
            }

            // Check if wall.to is on other wall's interior (T-junction)
            if (toPerpDist < DrawWallCommand.ENDPOINT_SNAP_DISTANCE
                && toProj > tolerance && toProj < otherLen - tolerance) {
                wall.addLink({ wall: other }); // auto-detects 'to' end
                other.addLink({ wall, end: 'middle' });
                continue;
            }

            // Check for X-junction: wall crosses through other wall's interior
            // Both segments must actually cross each other's infinite lines
            const projMin = Math.min(fromProj, toProj);
            const projMax = Math.max(fromProj, toProj);
            if (projMin < otherLen - tolerance && projMax > tolerance) {
                // Signed perpendicular distances of wall endpoints from other wall's line
                const fromSignedPerp = fromToOther.dot(otherPerp);
                const toSignedPerp = toToOther.dot(otherPerp);

                // Wall endpoints must be on opposite sides of other wall's line
                if (fromSignedPerp * toSignedPerp < 0) {
                    // Other wall's endpoints must also be on opposite sides of new wall's line
                    const myPerp = new THREE.Vector2(-wallDirN.y, wallDirN.x);
                    const otherFromToMy = new THREE.Vector2().subVectors(other.from, wall.from);
                    const otherToToMy = new THREE.Vector2().subVectors(other.to, wall.from);
                    const otherFromSignedPerp = otherFromToMy.dot(myPerp);
                    const otherToSignedPerp = otherToToMy.dot(myPerp);

                    if (otherFromSignedPerp * otherToSignedPerp < 0) {
                        // Both segments truly cross each other — verify not near endpoints
                        const otherFromMyProj = otherFromToMy.dot(wallDirN);
                        const otherToMyProj = otherToToMy.dot(wallDirN);

                        const nearMyEndpoint =
                            (Math.abs(otherFromSignedPerp) < tolerance && (otherFromMyProj < tolerance || otherFromMyProj > wallLen - tolerance)) ||
                            (Math.abs(otherToSignedPerp) < tolerance && (otherToMyProj < tolerance || otherToMyProj > wallLen - tolerance));

                        if (!nearMyEndpoint) {
                            wall.addLink({ wall: other, end: 'middle' });
                            other.addLink({ wall, end: 'middle' });
                        }
                    }
                }
            }
        }
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            CommandManager.getInstance().completeCurrent();
        }
    }
}
