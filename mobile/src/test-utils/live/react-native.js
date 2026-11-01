// Reemplazo mínimo de react-native para jest.live.config.js (entorno Node): la
// lógica de sesión solo usa Platform.OS (vía utils/platform) y Alert.
module.exports = {
  Platform: { OS: 'ios', select: (options) => options.ios ?? options.default },
  Alert: { alert: () => undefined },
};
