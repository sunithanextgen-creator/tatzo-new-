import { Platform, ViewStyle } from 'react-native';

type ResponsiveShadowConfig = {
  web: string;
  native: Pick<ViewStyle, 'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'>;
};

export const createResponsiveShadow = (config: ResponsiveShadowConfig): ViewStyle => {
  if (Platform.OS === 'web') {
    return { boxShadow: config.web } as unknown as ViewStyle;
  }

  return config.native as ViewStyle;
};
