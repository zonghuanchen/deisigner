import * as THREE from 'three';
import { Command } from './Command';
import { CommandManager } from './CommandManager';
import { AppViewer } from '../../app';
import { WallModel, App as CoreApp } from '../../core';

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
    }

    private onClick(e: MouseEvent): void {
        const pos = this.viewer.getModelPosition(e.clientX, e.clientY, 0);
        if (!pos) return;

        const point = new THREE.Vector2(pos.x, pos.y);

        if (!this.fromPoint) {
            // 第一次点击：确定墙起点，创建预览墙
            this.fromPoint = point;
            this.previewWall = new WallModel(this.fromPoint, point);
            CoreApp.getInstance().getScene().addWall(this.previewWall);
        } else {
            // 第二次点击：确认终点，更新墙体并完成命令
            if (this.previewWall) {
                this.previewWall.to = point;
            }
            CommandManager.getInstance().completeCurrent();
        }
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.fromPoint || !this.previewWall) return;

        const pos = this.viewer.getModelPosition(e.clientX, e.clientY, 0);
        if (pos) {
            this.previewWall.to = new THREE.Vector2(pos.x, pos.y);
        }
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            CommandManager.getInstance().completeCurrent();
        }
    }
}
