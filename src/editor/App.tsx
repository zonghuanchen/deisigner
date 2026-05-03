import { useEffect, useRef } from 'react';
import { AppViewer, VIEWER_3D } from '../app';
import { UIContainer } from '../app/ui';

export function App() {
  const primaryRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<AppViewer | null>(null);

  useEffect(() => {
    if (!primaryRef.current || !secondaryRef.current) return;

    const viewer = new AppViewer({ defaultPrimary: VIEWER_3D });
    viewerRef.current = viewer;

    viewer.init(primaryRef.current, secondaryRef.current).then(() => {
      viewer.render();
    });

    const handleResize = () => viewer.render();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gray-900">
      {/* 3D view takes full screen */}
      <div ref={primaryRef} className="absolute inset-0 w-full h-full" />
      
      {/* 2D view as floating window in top-right corner */}
      <div 
        ref={secondaryRef} 
        className="absolute top-4 right-4 w-80 h-64 border-2 border-gray-400 rounded-lg shadow-lg bg-white overflow-hidden z-10"
        style={{ minWidth: '320px', minHeight: '240px' }}
      />
      
      <UIContainer>
        <div className="p-4 pointer-events-auto">
          <h1 className="text-xl font-bold mb-4 text-white">3D家装设计软件</h1>
          <p className="text-sm text-gray-300">2D视图已固定为右上角浮动窗口</p>
        </div>
      </UIContainer>
    </div>
  );
}
