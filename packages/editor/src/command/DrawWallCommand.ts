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
     * 为新墙体的 from 和 to 端点建立双向接头（addLink）。
     * 如果端点吸附到了现有墙体端点，则在两者之间创建 link。
     */
    private createLinksForWall(wall: WallModel): void {
        const positions: THREE.Vector2[] = [wall.from, wall.to];

        for (const pos of positions) {
            // 临时清除 previewWall 排除标记，使用 findSnapTarget 查找匹配端点
            const saved = this.previewWall;
            this.previewWall = wall;
            const target = this.findSnapTarget(pos);
            this.previewWall = saved;

            if (!target) continue;

            // 双向 addLink：新墙 → 目标墙，目标墙 → 新墙
            wall.addLink({ wall: target.wall });
            target.wall.addLink({ wall });
        }
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            CommandManager.getInstance().completeCurrent();
        }
    }
}
