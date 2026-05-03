export { Button } from '@heroui/react';

export const UIContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {children}
    </div>
  );
};
