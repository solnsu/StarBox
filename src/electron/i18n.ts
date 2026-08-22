const messages = {
  en: {
    open: 'Open StarBox',
    quit: 'Quit',
    startupFailed: 'Unable to start StarBox',
    portInUse: 'Local API port 4312 is already in use. Close the application using that port and try again.',
    unknownError: 'The local service could not be started.',
  },
  'zh-CN': {
    open: '打开 StarBox',
    quit: '退出',
    startupFailed: '无法启动 StarBox',
    portInUse: '本地 API 端口 4312 已被占用，请关闭占用该端口的应用后重试。',
    unknownError: '本地服务启动失败。',
  },
} as const;

export type DesktopMessageKey = keyof typeof messages.en;

export const createDesktopTranslator = (locale: string) => {
  const dictionary = locale.toLowerCase().startsWith('zh') ? messages['zh-CN'] : messages.en;
  return (key: DesktopMessageKey) => dictionary[key] ?? messages.en[key];
};
