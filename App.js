import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Alert, ActivityIndicator, Dimensions, Modal, FlatList, Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  initDB, addPhoto, getPhotos, deletePhoto,
  addSecretPhoto, getSecretPhotos, deleteSecretPhoto,
  addToTrash, getTrash, restoreFromTrash, deleteFromTrash,
  addToSecretTrash, getSecretTrash, restoreFromSecretTrash, deleteFromSecretTrash,
  hasPin, verifyPin, setPin,
} from './src/database/db';
import { ensureDirs, copyPhoto, moveToTrash, removeFile, forceDelete } from './src/utils/storage';
import PhotoGrid from './src/components/PhotoGrid';
import PhotoViewer from './src/components/PhotoViewer';
import PinPad from './src/components/PinPad';

const { width } = Dimensions.get('window');

// ===== ГЛОБАЛЬНЫЙ ПЕРЕХВАТ ОШИБОК =====
// Ловит и синхронные JS-ошибки, и необработанные промисы, чтобы вместо
// чёрного экрана показать текст ошибки — временная диагностика.
let errorListeners = [];
function reportGlobalError(err) {
  const message = err?.message || String(err);
  const stack = err?.stack || '';
  errorListeners.forEach((fn) => fn(message + '\n\n' + stack));
}

if (typeof ErrorUtils !== 'undefined') {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((err, isFatal) => {
    reportGlobalError(err);
    // не вызываем originalHandler — иначе приложение всё равно упадёт молча
  });
}

if (typeof global !== 'undefined') {
  const originalRejectionHandler = global.onunhandledrejection;
  global.onunhandledrejection = (event) => {
    reportGlobalError(event?.reason || event);
    if (originalRejectionHandler) originalRejectionHandler(event);
  };
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { caughtError: null };
  }
  static getDerivedStateFromError(error) {
    return { caughtError: error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.caughtError) {
      return (
        <View style={styles.crashScreen}>
          <Text style={styles.crashTitle}>Ошибка рендера (ErrorBoundary)</Text>
          <Text style={styles.crashText}>
            {this.state.caughtError?.message || String(this.state.caughtError)}
          </Text>
          <Text style={styles.crashText}>
            {this.state.caughtError?.stack || ''}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}
// ===== КОНЕЦ ГЛОБАЛЬНОГО ПЕРЕХВАТА =====

function AppInner() {
  const [photos, setPhotos] = useState([]);
  const [secretPhotos, setSecretPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerPhotos, setViewerPhotos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerKey, setViewerKey] = useState(0);

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [isSecretMode, setIsSecretMode] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinAction, setPinAction] = useState(null);

  const [showTrash, setShowTrash] = useState(false);
  const [trashPhotos, setTrashPhotos] = useState([]);

  const pinPadRef = useRef(null);
  const tapCount = useRef(0);
  const tapTimer = useRef(null);
  const isBusyRef = useRef(false);

  // подписка на глобальные ошибки (асинхронные/необработанные промисы)
  useEffect(() => {
    const listener = (msg) => setError(msg);
    errorListeners.push(listener);
    return () => {
      errorListeners = errorListeners.filter((fn) => fn !== listener);
    };
  }, []);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      await initDB();
      await ensureDirs();
      await loadAllPhotos();

      const pinExists = await hasPin();
      if (!pinExists) {
        setPinAction('setup');
        setShowPinModal(true);
      }
    } catch (e) {
      console.error('Init error:', e);
      setError((e?.message || String(e)) + '\n\n' + (e?.stack || ''));
      setLoading(false);
    }
  };

  const loadAllPhotos = async () => {
    try {
      const [regular, secret, trash, secretTrash] = await Promise.all([
        getPhotos(),
        getSecretPhotos(),
        getTrash(),
        getSecretTrash(),
      ]);
      setPhotos(regular);
      setSecretPhotos(secret);
      setTrashPhotos(isSecretMode ? secretTrash : trash);
    } catch (e) {
      console.error('Load error:', e);
      setError((e?.message || String(e)) + '\n\n' + (e?.stack || ''));
    } finally {
      setLoading(false);
    }
  };

  const loadTrash = async () => {
    const data = isSecretMode ? await getSecretTrash() : await getTrash();
    setTrashPhotos(data);
  };

  const importPhotos = async (isSecret = false) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled) return;

    setLoading(true);
    for (const asset of result.assets) {
      try {
        const { filename, uri } = await copyPhoto(asset.uri, isSecret);
        if (isSecret) {
          await addSecretPhoto(filename, uri);
        } else {
          await addPhoto(filename, uri);
        }
      } catch (e) {
        console.error('Import error:', e);
      }
    }
    await loadAllPhotos();
    setLoading(false);
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0 || isBusyRef.current) return;

    const currentPhotos = isSecretMode ? secretPhotos : photos;
    const idsToDelete = Array.from(selectedIds);
    const secretModeAtStart = isSecretMode;

    Alert.alert(
      'Удалить', `Переместить ${idsToDelete.length} фото в корзину?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить', style: 'destructive',
          onPress: async () => {
            if (isBusyRef.current) return;
            isBusyRef.current = true;
            setLoading(true);

            const failedNames = [];

            for (const id of idsToDelete) {
              const photo = currentPhotos.find(p => p.id === id);
              if (!photo) continue;

              try {
                const { uri: trashUri } = await moveToTrash(photo.uri, secretModeAtStart);
                if (secretModeAtStart) {
                  await addToSecretTrash(id, photo.filename, trashUri);
                  await deleteSecretPhoto(id);
                } else {
                  await addToTrash(id, photo.filename, trashUri);
                  await deletePhoto(id);
                }
              } catch (e) {
                console.error('Delete error for photo', id, e);
                failedNames.push(photo.filename);
              }
            }

            setSelectedIds(new Set());
            setIsSelecting(false);
            await loadAllPhotos();
            setLoading(false);
            isBusyRef.current = false;

            if (failedNames.length > 0) {
              Alert.alert(
                'Не всё удалено',
                `Не удалось переместить в корзину ${failedNames.length} фото. Попробуйте ещё раз.`
              );
            }
          },
        },
      ]
    );
  };

  const moveToSecret = async () => {
    if (selectedIds.size === 0 || isBusyRef.current) return;

    const idsToMove = Array.from(selectedIds);

    Alert.alert(
      'Секретный альбом',
      `Переместить ${idsToMove.length} фото в секретный альбом?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Переместить', style: 'default',
          onPress: async () => {
            if (isBusyRef.current) return;
            isBusyRef.current = true;
            setLoading(true);

            const failedNames = [];

            for (const id of idsToMove) {
              const photo = photos.find(p => p.id === id);
              if (!photo) continue;

              try {
                const { filename, uri } = await copyPhoto(photo.uri, true);
                await addSecretPhoto(filename, uri);
                await removeFile(photo.uri);
                await deletePhoto(id);
              } catch (e) {
                console.error('Move to secret error:', e);
                failedNames.push(photo.filename);
              }
            }

            setSelectedIds(new Set());
            setIsSelecting(false);
            await loadAllPhotos();
            setLoading(false);
            isBusyRef.current = false;

            if (failedNames.length > 0) {
              Alert.alert('Не всё перемещено', `Ошибка для ${failedNames.length} фото. Попробуйте ещё раз.`);
            }
          },
        },
      ]
    );
  };

  const restorePhoto = async (trashItem) => {
    try {
      if (isSecretMode) {
        await restoreFromSecretTrash(trashItem.id);
      } else {
        await restoreFromTrash(trashItem.id);
      }
      await loadAllPhotos();
    } catch (e) {
      console.error('Restore error:', e);
      Alert.alert('Ошибка', 'Не удалось восстановить фото');
    }
  };

  const permanentDelete = async (trashItem) => {
    Alert.alert(
      'Удалить навсегда',
      'Фото будет удалено безвозвратно',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить', style: 'destructive',
          onPress: async () => {
            try {
              await removeFile(trashItem.uri);
              if (isSecretMode) {
                await deleteFromSecretTrash(trashItem.id);
              } else {
                await deleteFromTrash(trashItem.id);
              }
              await loadTrash();
            } catch (e) {
              console.error('Permanent delete error:', e);
            }
          },
        },
      ]
    );
  };

  const toggleSelection = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const openPhoto = (photo, index) => {
    if (isSelecting) {
      toggleSelection(photo.id);
      return;
    }
    const currentList = isSecretMode ? secretPhotos : photos;
    setViewerPhotos(currentList);
    setCurrentIndex(index);
    setViewerKey((k) => k + 1);
    setViewerVisible(true);
  };

  const longPressPhoto = (photo) => {
    if (!isSelecting) {
      setIsSelecting(true);
      toggleSelection(photo.id);
    }
  };

  const tryFaceId = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (!compatible || !enrolled) return false;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Вход в секретный альбом',
        cancelLabel: 'Использовать PIN',
        disableDeviceFallback: true,
      });

      return result.success;
    } catch (e) {
      console.error('Face ID error:', e);
      return false;
    }
  };

  const handleTitleTap = () => {
    tapCount.current += 1;

    if (tapCount.current === 1) {
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0;
      }, 500);
    }

    if (tapCount.current === 3) {
      clearTimeout(tapTimer.current);
      tapCount.current = 0;
      enterSecretMode();
    }
  };

  const handleTitleLongPress = () => {
    enterSecretMode();
  };

  const enterSecretMode = async () => {
    const pinExists = await hasPin();
    if (!pinExists) {
      setPinAction('setup');
      setShowPinModal(true);
      return;
    }

    const faceIdSuccess = await tryFaceId();
    if (faceIdSuccess) {
      setIsSecretMode(true);
      return;
    }

    setPinAction('enter');
    setShowPinModal(true);
  };

  const handlePinSubmit = async (pin) => {
    if (pinAction === 'setup') {
      await setPin(pin);
      setShowPinModal(false);
      setPinAction(null);
      setIsSecretMode(false);
    } else if (pinAction === 'enter') {
      const valid = await verifyPin(pin);
      if (valid) {
        setShowPinModal(false);
        setPinAction(null);
        setIsSecretMode(true);
      } else {
        pinPadRef.current?.showError();
      }
    }
  };

  const handlePinCancel = () => {
    setShowPinModal(false);
    setPinAction(null);
    setIsSecretMode(false);
  };

  const exitSecretMode = () => {
    setIsSecretMode(false);
    setIsSelecting(false);
    setSelectedIds(new Set());
  };

  if (error) {
    return (
      <View style={styles.crashScreen}>
        <Ionicons name="warning-outline" size={50} color="#ff453a" />
        <Text style={styles.crashTitle}>Ошибка</Text>
        <Text style={styles.crashText}>{error}</Text>
      </View>
    );
  }

  if (loading && photos.length === 0 && !isSecretMode) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#0a84ff" />
        <Text style={styles.loadingText}>Загрузка...</Text>
      </View>
    );
  }

  if (showTrash) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowTrash(false)}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>
            {isSecretMode ? 'Секретная корзина' : 'Корзина'} ({trashPhotos.length})
          </Text>
          <View style={{ width: 28 }} />
        </View>

        {trashPhotos.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptySub}>Корзина пуста</Text>
          </View>
        ) : (
          <FlatList
            data={trashPhotos}
            keyExtractor={(item) => item.id.toString()}
            numColumns={3}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <View style={[styles.trashItem, { width: (width-8)/3, height: (width-8)/3 }]}>
                <Image source={{ uri: item.uri }} style={styles.image} resizeMode="cover" />
                <View style={styles.trashOverlay}>
                  <TouchableOpacity onPress={() => restorePhoto(item)} style={styles.trashBtn}>
                    <Ionicons name="arrow-undo" size={20} color="#0a84ff" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => permanentDelete(item)} style={styles.trashBtn}>
                    <Ionicons name="trash" size={20} color="#ff453a" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  const currentPhotos = isSecretMode ? secretPhotos : photos;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <Modal
        visible={showPinModal}
        transparent={false}
        animationType="slide"
        onRequestClose={handlePinCancel}
      >
        <PinPad
          ref={pinPadRef}
          onSubmit={handlePinSubmit}
          onCancel={handlePinCancel}
          title={pinAction === 'setup' ? 'Установите PIN' : 'Введите PIN'}
        />
      </Modal>

      <View style={styles.header}>
        <TouchableOpacity
          onPress={isSecretMode ? exitSecretMode : null}
          activeOpacity={isSecretMode ? 0.7 : 1}
          style={{ width: 40 }}
        >
          {isSecretMode ? (
            <Ionicons name="chevron-back" size={28} color="#fff" />
          ) : (
            <View />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleTitleTap}
          onLongPress={handleTitleLongPress}
          activeOpacity={1}
          delayLongPress={600}
        >
          <Text style={[
            styles.title,
            isSecretMode && styles.secretTitle
          ]}>
            Photos
          </Text>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          {isSelecting ? (
            <>
              <TouchableOpacity onPress={() => { setIsSelecting(false); setSelectedIds(new Set()); }}>
                <Text style={styles.btnText}>Готово</Text>
              </TouchableOpacity>
              {selectedIds.size > 0 && (
                <>
                  {!isSecretMode && (
                    <TouchableOpacity onPress={moveToSecret} style={{ marginLeft: 12 }}>
                      <Ionicons name="lock-closed-outline" size={22} color="#ff9500" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={deleteSelected} style={{ marginLeft: 12 }}>
                    <Ionicons name="trash-outline" size={22} color="#ff453a" />
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => { loadTrash(); setShowTrash(true); }} style={{ marginRight: 12 }}>
                <Ionicons name="trash-outline" size={22} color="#666" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsSelecting(true)}>
                <Text style={styles.btnText}>Выбрать</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => importPhotos(isSecretMode)}
                style={styles.addBtn}
              >
                <View style={[
                  styles.glassBtn,
                  isSecretMode && styles.secretBtn
                ]}>
                  <Ionicons name="add" size={22} color="#fff" />
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {currentPhotos.length === 0 ? (
        <TouchableOpacity
          style={styles.empty}
          onPress={handleTitleTap}
          activeOpacity={1}
        >
          <View style={styles.glassCard}>
            <Ionicons name="images-outline" size={60} color="rgba(255,255,255,0.4)" />
            <Text style={styles.emptyTitle}>
              {isSecretMode ? 'Секретный альбом пуст' : 'Нет фото'}
            </Text>
            <Text style={styles.emptySub}>
              {isSecretMode
                ? 'Нажмите + чтобы добавить'
                : 'Нажмите + чтобы добавить\n(тройной тап или долгий тап на Photos)'}
            </Text>
          </View>
        </TouchableOpacity>
      ) : (
        <PhotoGrid
          photos={currentPhotos}
          onPress={openPhoto}
          onLongPress={longPressPhoto}
          selectedIds={selectedIds}
          isSelecting={isSelecting}
          onEmptyPress={handleTitleTap}
        />
      )}

      <PhotoViewer
        key={viewerKey}
        visible={viewerVisible}
        photos={viewerPhotos}
        currentIndex={currentIndex}
        onClose={() => setViewerVisible(false)}
        onIndexChange={setCurrentIndex}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#fff', marginTop: 16, fontSize: 16 },
  crashScreen: {
    flex: 1, backgroundColor: '#1a0000', justifyContent: 'center',
    alignItems: 'center', padding: 20, paddingTop: 60,
  },
  crashTitle: { color: '#ff453a', fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 12 },
  crashText: { color: '#fff', fontSize: 12, textAlign: 'left' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  secretTitle: { color: '#ff9500' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  btnText: { color: '#0a84ff', fontSize: 16, fontWeight: '500' },
  addBtn: { marginLeft: 12 },
  glassBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#0a84ff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0a84ff', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
  secretBtn: { backgroundColor: '#ff9500', shadowColor: '#ff9500' },
  grid: { padding: 2, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  glassCard: {
    alignItems: 'center', padding: 40, borderRadius: 24,
    backgroundColor: 'rgba(28,28,30,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptySub: { color: 'rgba(255,255,255,0.5)', fontSize: 15, marginTop: 8, textAlign: 'center' },
  trashItem: {
    margin: 1, borderRadius: 12, overflow: 'hidden', position: 'relative',
  },
  trashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
  },
  trashBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  image: { width: '100%', height: '100%' },
});
