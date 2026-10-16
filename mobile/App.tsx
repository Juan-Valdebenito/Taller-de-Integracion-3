import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { API_URL } from './src/config';

// Pantalla temporal: las pantallas de Login y Registro se agregan sobre la capa
// de autenticación de src/api y src/storage.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>TransitHub</Text>
      <Text style={styles.subtitle}>API: {API_URL}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#6b7280',
    textAlign: 'center',
  },
});
