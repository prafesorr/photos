import React from 'react';
import { FlatList, StyleSheet, Dimensions, TouchableOpacity, View } from 'react-native';
import PhotoItem from './PhotoItem';

const { width } = Dimensions.get('window');
const COLS = 3;
const SIZE = (width - 8) / COLS;

const PhotoGrid = ({ photos, onPress, onLongPress, selectedIds, isSelecting, onEmptyPress }) => {
  const renderItem = ({ item, index }) => (
    <PhotoItem
      photo={item}
      size={SIZE}
      onPress={() => onPress(item, index)}
      onLongPress={() => onLongPress(item)}
      isSelected={selectedIds.has(item.id)}
      isSelecting={isSelecting}
    />
  );

  const renderEmpty = () => (
    <TouchableOpacity 
      style={styles.emptyGrid} 
      onPress={onEmptyPress}
      activeOpacity={1}
    >
      <View style={{ height: 400 }} />
    </TouchableOpacity>
  );

  return (
    <FlatList
      data={photos}
      renderItem={renderItem}
      keyExtractor={(item) => item.id.toString()}
      numColumns={COLS}
      contentContainerStyle={styles.grid}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={renderEmpty}
    />
  );
};

const styles = StyleSheet.create({
  grid: { padding: 2, flexGrow: 1 },
  emptyGrid: {
    flex: 1,
    minHeight: 400,
  },
});

export default PhotoGrid;