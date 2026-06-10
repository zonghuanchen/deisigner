// Model class name constants for registration
export const CAMERA_MODEL = 'CameraModel';
export const CAMERA_MANAGER = 'CameraManager';
export const FACE_MODEL = 'FaceModel';
export const GROUND_MODEL = 'GroundModel';
export const CEILING_MODEL = 'CeilingModel';
export const FLOOR_MODEL = 'FloorModel';
export const WALL_MODEL = 'WallModel';
export const ROOM_MODEL = 'RoomModel';
export const SCENE_MODEL = 'SceneModel';
export const FURNITURE_MODEL = 'FurnitureModel';
export const PARAMETRIC_MODEL = 'ParametricModel';
export const PARAMETRIC_MODEL_V2 = 'ParametricModelV2';

/** Furniture model type */
export enum FurnitureType {
    /** Normal model */
    Normal = 'normal',
    /** Door model */
    Door = 'door',
    /** Window model */
    Window = 'window',
}
