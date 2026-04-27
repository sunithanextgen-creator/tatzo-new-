import { useContext } from 'react';
import { ThemeContext } from './ThemeProvider';

export const useAppTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }
  return value;
};
