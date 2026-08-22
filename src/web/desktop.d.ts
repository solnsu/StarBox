type DesktopWindowControls = {
  platform: NodeJS.Platform;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (listener: (maximized: boolean) => void) => () => void;
};

interface Window {
  desktopWindowControls?: DesktopWindowControls;
}
