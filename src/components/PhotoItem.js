import React from 'react';
import { TouchableOpacity, Image, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PhotoItem = ({ photo, size, onPress, onLongPress, isSelected, isSelecting }) => (
  <TouchableOpacity
    style={[styles.container, { width: size, height: size }]}
    onPress={onPress}
    onLongPress={onLongPress}
    activeOpacity={0.8}
  >
    <Image source={{ uri: photo.uri }} style={styles.image} resizeMode="cover" />
    {isSelecting && (
      <View style={[styles.overlay, isSelected && styles.selected]}>
        <View style={[styles.circle, isSelected && styles.circleSelected]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </View>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    margin: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1c1c1e',
  },
  image: { width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 8,
  },
  selected: { backgroundColor: 'rgba(0,0,0,0.5)' },
  circle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  circleSelected: { backgroundColor: '#0a84ff', borderColor: '#0a84ff' },
});

export default PhotoItem;