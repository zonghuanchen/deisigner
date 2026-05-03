export interface DesignObject {
  id: string;
  type: string;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
}

export interface ProjectData {
  id: string;
  name: string;
  objects: DesignObject[];
}
