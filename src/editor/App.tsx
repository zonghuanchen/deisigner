import { useEffect, useRef } from 'react';
import { Scene3D } from '../app/3d';
import { Scene2D } from '../app/2d';
import { UIContainer, Button } from '../app/ui';

export function App() {
  const container3dRef = useRef<HTMLDivElement>(null);
  const container2dRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container3dRef.current) return;
    const scene = new Scene3D(container3dRef.current);
    scene.render();

    const handleResize = () => scene.render();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!container2dRef.current) return;
    const scene = new Scene2D();
    scene.init(container2dRef.current);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gray-900">
      <div className="absolute inset-0 flex">
        <div ref={container2dRef} className="flex-1 relative border-r border-gray-700" />
        <div ref={container3dRef} className="flex-1 relative" />
      </div>
      <UIContainer>
        <div className="p-4 pointer-events-auto">
          <h1 className="text-xl font-bold mb-4 text-white">3D家装设计软件</h1>
          <Button color="primary">开始设计</Button>
        </div>
      </UIContainer>
    </div>
  );
}
