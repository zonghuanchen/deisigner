import * as THREE from 'three';
import { BaseModel } from '../model/BaseModel';

/**
 * Manages the selection state of models in the core system.
 * Dispatches events when selection changes.
 */
export class SelectionManager extends THREE.EventDispatcher<any> {
    private static instance: SelectionManager;
    private _selected: Map<string, BaseModel> = new Map();

    private constructor() {
        super();
    }

    /**
     * Gets the singleton instance of SelectionManager
     */
    static getInstance(): SelectionManager {
        if (!SelectionManager.instance) {
            SelectionManager.instance = new SelectionManager();
        }
        return SelectionManager.instance;
    }

    /**
     * Selects a model. If already selected, does nothing.
     * Dispatches a 'select' event and a 'change' event.
     */
    select(model: BaseModel, exclusive = true): void {
        if (this._selected.has(model.id)) return;
        if (exclusive) {
            this.clear();
        }
        this._selected.set(model.id, model);
        this.dispatchEvent({ type: 'select', model });
        this.dispatchEvent({ type: 'change', selected: this.getSelected() });
    }

    /**
     * Deselects a model by instance or id.
     * Dispatches a 'deselect' event and a 'change' event.
     */
    deselect(model: BaseModel | string): void {
        const id = typeof model === 'string' ? model : model.id;
        const target = this._selected.get(id);
        if (!target) return;
        this._selected.delete(id);
        this.dispatchEvent({ type: 'deselect', model: target });
        this.dispatchEvent({ type: 'change', selected: this.getSelected() });
    }

    /**
     * Toggles the selection state of a model.
     */
    toggle(model: BaseModel): void {
        if (this._selected.has(model.id)) {
            this.deselect(model);
        } else {
            this.select(model);
        }
    }

    /**
     * Clears all selections.
     * Dispatches a 'clear' event and a 'change' event.
     */
    clear(): void {
        if (this._selected.size === 0) return;
        const previous = this.getSelected();
        this._selected.clear();
        this.dispatchEvent({ type: 'clear', previous });
        this.dispatchEvent({ type: 'change', selected: [] });
    }

    /**
     * Checks if a model is currently selected.
     */
    isSelected(model: BaseModel | string): boolean {
        const id = typeof model === 'string' ? model : model.id;
        return this._selected.has(id);
    }

    /**
     * Gets all currently selected models.
     */
    getSelected(): BaseModel[] {
        return Array.from(this._selected.values());
    }

    /**
     * Gets the first selected model, or undefined if none selected.
     */
    getFirst(): BaseModel | undefined {
        return this._selected.values().next().value;
    }

    /**
     * Gets the number of selected models.
     */
    get count(): number {
        return this._selected.size;
    }

    getUI(): Record<string, any> {
        const first = this.getFirst();
        return {
            count: this._selected.size,
            selectedIds: Array.from(this._selected.keys()),
            first: first ? first.getUI() : null,
        };
    }
}
