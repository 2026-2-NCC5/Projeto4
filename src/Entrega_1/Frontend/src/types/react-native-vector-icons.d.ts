declare module 'react-native-vector-icons/Ionicons' {
  import { ComponentType } from 'react';
  import { TextProps } from 'react-native';

  export type IconProps = TextProps & {
    name: string;
    size?: number;
    color?: string;
  };

  const Ionicons: ComponentType<IconProps>;

  export default Ionicons;
}
