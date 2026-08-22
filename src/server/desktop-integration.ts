export type DesktopCredential = {
  fileName: string;
  content: string;
};

export type DesktopIntegration = {
  openGeneratedImagesDirectory?: () => Promise<void>;
  loginWithChatGpt?: () => Promise<DesktopCredential>;
  cancelChatGptLogin?: () => void;
};
