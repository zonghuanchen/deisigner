import { booleans, primitives, transforms, maths } from '@jscad/modeling';

/**
 * Parametric Modeler using @jscad/modeling
 * Pure JavaScript - no WASM compilation lag
 */
export class ParametricModeler {

    /**
     * Initialize (no-op for JSCAD, kept for API compatibility)
     */
    static async initialize(): Promise<void> {
        // JSCAD doesn't need initialization
        return Promise.resolve();
    }

    /**
     * Create a cylinder with holes using @jscad/modeling
     * Uses CSG subtraction to create holes through the cylinder
     * 
     * @param radius - Cylinder radius
     * @param height - Cylinder height
     * @param holes - Array of hole definitions {radius, position: [x, y, z], direction: [x, y, z]}
     * @param segments - Number of segments for smoothness (default: 32)
     */
    static async makeCylinderWithHoles(
        radius: number,
        height: number,
        holes: Array<{
            radius: number;
            position: [number, number, number];
            direction?: [number, number, number];
        }>,
        segments: number = 32
    ) {
        // Create main cylinder
        const cylinder = primitives.cylinder({
            radius,
            height,
            segments
        });

        // Create holes as cylinders and subtract them
        let result = cylinder;
        
        for (const hole of holes) {
            // Create hole cylinder (make it longer to ensure full penetration)
            const holeLength = height * 3; // Extra length to ensure it goes through
            const holeCylinder = primitives.cylinder({
                radius: hole.radius,
                height: holeLength,
                segments: Math.max(16, segments / 2)
            });

            // Position the hole
            const holeDirection = hole.direction || [0, 0, 1]; // Default: vertical hole
            let positionedHole = transforms.translate(
                hole.position,
                holeCylinder
            );

            // Rotate if direction is not vertical
            if (holeDirection[0] !== 0 || holeDirection[1] !== 0 || holeDirection[2] !== 1) {
                // Calculate rotation from Z-axis to desired direction
                const zAxis: [number, number, number] = [0, 0, 1];
                const rotationAxis: [number, number, number] = [
                    zAxis[1] * holeDirection[2] - zAxis[2] * holeDirection[1],
                    zAxis[2] * holeDirection[0] - zAxis[0] * holeDirection[2],
                    zAxis[0] * holeDirection[1] - zAxis[1] * holeDirection[0]
                ];
                const dotProduct = zAxis[0] * holeDirection[0] + zAxis[1] * holeDirection[1] + zAxis[2] * holeDirection[2];
                const zLength = Math.sqrt(zAxis[0] ** 2 + zAxis[1] ** 2 + zAxis[2] ** 2);
                const dirLength = Math.sqrt(holeDirection[0] ** 2 + holeDirection[1] ** 2 + holeDirection[2] ** 2);
                const rotationAngle = Math.acos(dotProduct / (zLength * dirLength));
                
                const axisLength = Math.sqrt(rotationAxis[0] ** 2 + rotationAxis[1] ** 2 + rotationAxis[2] ** 2);
                if (axisLength > 0.001) {
                    const normalizedAxis: [number, number, number] = [
                        rotationAxis[0] / axisLength,
                        rotationAxis[1] / axisLength,
                        rotationAxis[2] / axisLength
                    ];
                    positionedHole = transforms.rotateX(
                        rotationAngle * normalizedAxis[0],
                        transforms.rotateY(
                            rotationAngle * normalizedAxis[1],
                            transforms.rotateZ(rotationAngle * normalizedAxis[2], positionedHole)
                        )
                    ) as any;
                }
            }

            // Subtract hole from cylinder
            result = booleans.subtract(result, positionedHole);
        }

        return result;
    }

    /**
     * Create a parametric bottle shape using @jscad/modeling
     * Simplified version - JSCAD has simpler API than OpenCascade
     */
    static async makeBottle(myWidth: number, myHeight: number, myThickness: number) {
        // Body: Create main bottle body
        const bodyRadius = myWidth / 2;
        const bodyHeight = myHeight * 0.85;
        const body = primitives.cylinder({
            radius: bodyRadius,
            height: bodyHeight,
            segments: 32
        });

        // Neck: Create bottle neck
        const neckRadius = myThickness / 4;
        const neckHeight = myHeight * 0.15;
        const neck = primitives.cylinder({
            radius: neckRadius,
            height: neckHeight,
            segments: 32
        });

        // Position neck on top of body
        const neckPositioned = transforms.translate(
            [0, 0, bodyHeight + neckHeight / 2],
            neck
        );

        // Fuse body and neck
        const bottle = booleans.union(body, neckPositioned);

        // Apply fillet (rounded edges) - simplified approach
        // JSCAD doesn't have direct fillet, but we can use sphere at edges
        // For now, return the basic shape
        
        return bottle;
    }
}
