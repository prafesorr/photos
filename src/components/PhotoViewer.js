import React, { useRef, useEffect, useState } from 'react';
import {
  View, StyleSheet, Dimensions,
  TouchableOpacity, Image, ScrollView, Text, Animated, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.8;

const ZoomablePage = ({ photo, isActive, onZoomChange }) => {
  const innerScrollRef = useRef(null);
  // ВАЖНО: по умолчанию скролл ВЫКЛЮЧЕН (false), а не через setNativeProps реактивно —
  // иначе на первом касании (пока handleScroll ни разу не вызвался) scrollEnabled
  // остаётся дефолтным (true), и ScrollView успевает перехватить свайп раньше,
  // чем мы его отключим.
  const [innerScrollEnabled, setInnerScrollEnabled] = useState(false);

  // Фолбэк — на весь экран, пока не узнали реальные пропорции фото
  const [imgSize, setImgSize] = useState({ w: width, h: height });

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      photo.uri,
      (naturalW, naturalH) => {
        if (cancelled) return;
        // вручную вписываем фото в экран с сохранением пропорций (как resizeMode="contain"),
        // чтобы у Image не было "скрытых" чёрных полей внутри собственных границ —
        // именно они "утекали" при зуме к краям фото
        const screenRatio = width / height;
        const photoRatio = naturalW / naturalH;
        let displayW, displayH;
        if (photoRatio > screenRatio) {
          displayW = width;
          displayH = width / photoRatio;
        } else {
          displayH = height;
          displayW = height * photoRatio;
        }
        setImgSize({ w: displayW, h: displayH });
      },
      (err) => {
        console.error('Image.getSize error:', err);
      }
    );
    return () => { cancelled = true; };
  }, [photo.uri]);

  const handleScroll = (e) => {
    if (!isActive) return;
    const scale = e.nativeEvent.zoomScale ?? 1;
    onZoomChange(scale);

    // если фото НЕ приближено — скролл выключен, чтобы не перехватывать
    // вертикальный свайп у внешнего PanResponder
    const shouldScroll = scale > 1.05;
    setInnerScrollEnabled(shouldScroll);
    innerScrollRef.current?.setNativeProps({ scrollEnabled: shouldScroll });
  };

  return (
    <View style={styles.page}>
      <ScrollView
        ref={innerScrollRef}
        scrollEnabled={innerScrollEnabled}
        contentContainerStyle={styles.zoomContainer}
        maximumZoomScale={4}
        minimumZoomScale={1}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        pinchGestureEnabled={true}
        centerContent={true}
        bounces={false}
        bouncesZoom={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
      >
        <Image
          source={{ uri: photo.uri }}
          style={{ width: imgSize.w, height: imgSize.h }}
          resizeMode="contain"
        />
      </ScrollView>
    </View>
  );
};

const PhotoViewer = ({ visible, photos, currentIndex, onClose, onIndexChange }) => {
  const scrollRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(currentIndex);
  const [controlsVisible, setControlsVisible] = useState(true);

  const zoomScaleRef = useRef(1);
  const currentPageRef = useRef(currentIndex);
  // Фиксируем начальную страницу ОДИН раз при монтировании (открытии просмотрщика).
  // НЕ привязываем contentOffset напрямую к currentIndex — этот проп меняется
  // при каждом пролистывании, и повторное применение contentOffset "на лету"
  // рвёт скролл между страницами (баг: экран делится пополам между двумя фото).
  const initialIndexRef = useRef(currentIndex);

  const panY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setCurrentPage(currentIndex);
      currentPageRef.current = currentIndex;
      panY.setValue(0);
      setControlsVisible(true);
      zoomScaleRef.current = 1;
    }
  }, [visible, currentIndex]);

  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / width);
    if (page !== currentPage) {
      setCurrentPage(page);
      currentPageRef.current = page;
      zoomScaleRef.current = 1;
      setControlsVisible(true);
      onIndexChange?.(page);
    }
  };

  const handleZoomChange = (scale) => {
    zoomScaleRef.current = scale;
    const shouldShow = scale <= 1.05;
    setControlsVisible((prev) => (prev !== shouldShow ? shouldShow : prev));
    // пока фото приближено — пейджер листать нельзя,
    // иначе можно случайно перелистнуть на соседнее фото прямо во время зума
    scrollRef.current?.setNativeProps({ scrollEnabled: shouldShow });
  };

  const closeViewer = () => {
    onClose();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        console.log('[SWIPE] onStartShouldSetPanResponder called');
        return false;
      },
      // ВАЖНО: только обычный колбэк, "Capture"-версия не срабатывает в этом проекте на iPhone (см. историю багов)
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (evt.nativeEvent.touches.length > 1) {
          console.log('[SWIPE] REJECTED: multi-touch');
          return false;
        }
        if (zoomScaleRef.current > 1.05) {
          console.log('[SWIPE] REJECTED: zoomed, scale =', zoomScaleRef.current);
          return false;
        }
        const result =
          gestureState.dy > 10 &&
          gestureState.dy > Math.abs(gestureState.dx) * 1.5;
        console.log('[SWIPE] shouldSet:', result, 'dy:', gestureState.dy, 'dx:', gestureState.dx, 'zoom:', zoomScaleRef.current);
        return result;
      },
      onPanResponderGrant: () => {
        console.log('[SWIPE] GRANTED — responder захвачен');
      },
      onPanResponderMove: (evt, gestureState) => {
        panY.setValue(Math.max(0, gestureState.dy));
      },
      onPanResponderRelease: (evt, gestureState) => {
        console.log('[SWIPE] RELEASE dy:', gestureState.dy, 'vy:', gestureState.vy);

        const shouldClose =
          gestureState.dy > CLOSE_DISTANCE ||
          gestureState.vy > CLOSE_VELOCITY;

        if (shouldClose) {
          Animated.timing(panY, {
            toValue: height,
            duration: 200,
            useNativeDriver: true,
          }).start(() => closeViewer());
        } else {
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  if (!visible || !photos || photos.length === 0) return null;

  const bgOpacity = panY.interpolate({
    inputRange: [-height, 0, height],
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });

  const contentScale = panY.interpolate({
    inputRange: [-height, 0, height],
    outputRange: [0.85, 1, 0.85],
    extrapolate: 'clamp',
  });

  // Раньше был <Modal>, но Modal на iOS ломает передачу свайпа в PanResponder
  // (проверено изолированным тестом — см. историю багов, п. 3).
  // Заменили на обычный полноэкранный оверлей поверх остального контента.
  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Animated.View style={[styles.bgFill, { opacity: bgOpacity }]} />

      <Animated.View
        style={[
          styles.container,
          { transform: [{ translateY: panY }, { scale: contentScale }] },
        ]}
        {...panResponder.panHandlers}
      >
        <Animated.View
          style={[styles.header, { opacity: controlsVisible ? 1 : 0 }]}
          pointerEvents={controlsVisible ? 'auto' : 'none'}
        >
          <TouchableOpacity onPress={closeViewer} style={styles.closeBtn}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.counter}>
            {currentPage + 1} / {photos.length}
          </Text>

          <View style={{ width: 40 }} />
        </Animated.View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          decelerationRate="normal"
          bounces={false}
          contentInsetAdjustmentBehavior="never"
          contentOffset={{ x: initialIndexRef.current * width, y: 0 }}
        >
          {photos.map((photo, idx) => (
            <ZoomablePage
              key={photo.id}
              photo={photo}
              isActive={idx === currentPage}
              onZoomChange={handleZoomChange}
            />
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    zIndex: 999,
    elevation: 999, // для Android, хотя проект сейчас в основном под iOS
  },
  bgFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  page: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height,
  },
});

export default PhotoViewer;