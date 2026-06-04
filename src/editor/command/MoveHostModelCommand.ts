import { Command } from './Command';
import { AppViewer } from '../../app';
import { FurnitureModel } from '../../core/model/FurnitureModel';
import { ParametricModel } from '../../core/model/ParametricModel';

/** Host model types that can attach to walls (parametric, door, window) */
type HostModel = ParametricModel | FurnitureModel;

/**
 * Move host model command.
 * Activated when a host model (parametric, door, or window) is selected and dragged.
 * Host models require special drag logic because they attach to walls rather than
 * moving freely on the ground plane.
 *
 * TODO: Implement host-specific drag logic (wall snapping, host position updates).
 */
export class MoveHostModelCommand implements Command {
    readonly name = 'moveHostModel';

    private viewer: AppViewer;

    constructor(viewer: AppViewer) {
        this.viewer = viewer;
    }

    /**
     * Sets the host model to be moved. Must be called before execute.
     *
     * @param model    The host model (parametric, door, or window)
     * @param clientX  Pointer X at selection time (viewport-relative)
     * @param clientY  Pointer Y at selection time (viewport-relative)
     */
    setModel(_model: HostModel, _clientX: number, _clientY: number): void {
        // TODO: implement
    }

    onExecute(): void {
        // TODO: implement
    }

    onComplete(): void {
        // TODO: implement
    }
}
