import { themes } from './theme/theme';

// Back-compat alias for older imports. Prefer using `useAppTheme()` for runtime switching.
export const mobileTheme = themes.dark;

export type MobileTheme = typeof mobileTheme;
