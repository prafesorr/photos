import { registerRootComponent } from 'expo';
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

let App;
let loadError = null;

try {
  App = require('./App').default;
} catch (e) {
  loadError = e;
}

function CrashFallback() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
        <Text style={styles.title}>Ошибка при загрузке App.js</Text>
        <Text style={styles.text}>{loadError?.message || String(loadError)}</Text>
        <Text style={styles.text}>{loadError?.stack || ''}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0000' },
  title: { color: '#ff453a', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  text: { color: '#fff', fontSize: 12, marginTop: 8 },
});

registerRootComponent(App || CrashFallback);
