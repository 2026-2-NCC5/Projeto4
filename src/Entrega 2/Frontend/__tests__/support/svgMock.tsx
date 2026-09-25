import React from 'react';
import { View } from 'react-native';

/** Substitui qualquer `*.svg` importado como componente (react-native-svg-transformer) nos testes. */
export default function SvgMock(props: { testID?: string; width?: number | string; height?: number | string }) {
  return <View testID={props.testID ?? 'svg-mock'} style={{ width: Number(props.width) || 0, height: Number(props.height) || 0 }} />;
}
