import React, { FC, ReactNode, useEffect } from 'react';
import { Portal } from './Portal';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
}

export const Modal: FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
  overlayClassName = '',
  closeOnOverlayClick = true,
  closeOnEsc = true,
}) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEsc) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  return (
    <Portal containerId="modal-root">
      <div
        className={`fixed inset-0 z-50 ${overlayClassName}`}
        onClick={closeOnOverlayClick ? onClose : undefined}
      >
        <div className="fixed inset-0 bg-black bg-opacity-50" />
        <div
          className={`
            fixed inset-0 flex items-center justify-center p-4
            ${className}
          `}
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-full max-h-full overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default Modal;
