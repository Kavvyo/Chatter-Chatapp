export interface ThemeColors {
  name: string;
  isDark: boolean;
  base100: string; // main background
  base200: string; // secondary background / cards
  base300: string; // tertiary background / borders / incoming chat bubble
  baseContent: string; // text primary
  baseContentMuted: string; // text muted / secondary
  primary: string; // brand accent / outgoing chat bubble
  primaryContent: string; // text on primary
  secondary: string;
  accent: string;
  neutral: string;
  neutralContent: string;
  error: string;
  success: string;
  warning: string;
}

export const THEMES: Record<string, ThemeColors> = {
  dark: {
    name: 'dark',
    isDark: true,
    base100: '#1d232a',
    base200: '#191e24',
    base300: '#15191e',
    baseContent: '#a6adbb',
    baseContentMuted: '#717886',
    primary: '#7480ff',
    primaryContent: '#ffffff',
    secondary: '#ff52d9',
    accent: '#00cdb7',
    neutral: '#2a323c',
    neutralContent: '#a6adbb',
    error: '#ff5861',
    success: '#00a96e',
    warning: '#ffbe00',
  },
  light: {
    name: 'light',
    isDark: false,
    base100: '#ffffff',
    base200: '#f2f2f2',
    base300: '#e5e6e6',
    baseContent: '#1f2937',
    baseContentMuted: '#6b7280',
    primary: '#570df8',
    primaryContent: '#ffffff',
    secondary: '#f000b8',
    accent: '#37cdbe',
    neutral: '#3d4451',
    neutralContent: '#ffffff',
    error: '#f87272',
    success: '#36d399',
    warning: '#fbbd23',
  },
  retro: {
    name: 'retro',
    isDark: false,
    base100: '#ece3ca',
    base200: '#e4d8b4',
    base300: '#d7c797',
    baseContent: '#282420',
    baseContentMuted: '#605850',
    primary: '#ef9995',
    primaryContent: '#282420',
    secondary: '#a4cbb4',
    accent: '#ebdc99',
    neutral: '#7d7259',
    neutralContent: '#ece3ca',
    error: '#e77980',
    success: '#82c290',
    warning: '#e5a84b',
  },
  cyberpunk: {
    name: 'cyberpunk',
    isDark: false,
    base100: '#ffee00',
    base200: '#ebd900',
    base300: '#d6c600',
    baseContent: '#000000',
    baseContentMuted: '#383838',
    primary: '#ff7598',
    primaryContent: '#000000',
    secondary: '#75d1f0',
    accent: '#c07eec',
    neutral: '#423f00',
    neutralContent: '#ffee00',
    error: '#ff5757',
    success: '#2ed573',
    warning: '#ffa502',
  },
  cupcake: {
    name: 'cupcake',
    isDark: false,
    base100: '#faf7f5',
    base200: '#efeae6',
    base300: '#e7e1dc',
    baseContent: '#291334',
    baseContentMuted: '#6d5a77',
    primary: '#65c3c8',
    primaryContent: '#291334',
    secondary: '#ef9fbc',
    accent: '#eeaf3a',
    neutral: '#291334',
    neutralContent: '#faf7f5',
    error: '#f87272',
    success: '#36d399',
    warning: '#fbbd23',
  },
  coffee: {
    name: 'coffee',
    isDark: true,
    base100: '#20161f',
    base200: '#1a1219',
    base300: '#120d12',
    baseContent: '#c59f60',
    baseContentMuted: '#8b6f3f',
    primary: '#db924b',
    primaryContent: '#20161f',
    secondary: '#263e3f',
    accent: '#10576d',
    neutral: '#120c12',
    neutralContent: '#c59f60',
    error: '#d84e4e',
    success: '#4caf50',
    warning: '#f9a825',
  },
  dracula: {
    name: 'dracula',
    isDark: true,
    base100: '#282a36',
    base200: '#21222c',
    base300: '#191a21',
    baseContent: '#f8f8f2',
    baseContentMuted: '#6272a4',
    primary: '#ff79c6',
    primaryContent: '#282a36',
    secondary: '#bd93f9',
    accent: '#ffb86c',
    neutral: '#414558',
    neutralContent: '#f8f8f2',
    error: '#ff5555',
    success: '#50fa7b',
    warning: '#f1fa8c',
  },
};

export const DEFAULT_THEME = 'dark';
