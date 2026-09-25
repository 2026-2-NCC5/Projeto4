// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/**
 * SVGs de marca (assets/branding) são importados como componentes React (react-native-svg)
 * via react-native-svg-transformer. A configuração do SVGO fica em `.svgrrc` (preserva viewBox,
 * inlina as classes CSS do logo FECAP e remove referências a <filter>, que o react-native-svg
 * não recebe do SVGR).
 */
const config = getDefaultConfig(__dirname);
const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
};

module.exports = config;
