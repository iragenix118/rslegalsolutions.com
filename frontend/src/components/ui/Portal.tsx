import React, { FC, ReactNode, useEffect, useState } from 'react';

interface PortalProps {
  containerId: string;
  children: ReactNode;
}

export const Portal: FC<PortalProps> = ({ containerId, children }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let portalContainer = document.getElementById(containerId);
    if (!portalContainer) {
      portalContainer = document.createElement('div');
      portalContainer.id = containerId;
      document.body.appendChild(portalContainer);
    }
    setContainer(portalContainer);

    return () => {
      if (portalContainer && portalContainer.childElementCount === 0) {
        document.body.removeChild(portalContainer);
      }
    };
  }, [containerId]);

  if (!container) return null;

  return <>{children}</>;
};

export default Portal;
