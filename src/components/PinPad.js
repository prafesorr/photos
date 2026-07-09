import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PinPad = forwardRef(({ onSubmit, onCancel, title = 'Введите PIN' }, ref) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  // Метод для показа ошибки извне
  useImperativeHandle(ref, () => ({
    showError: () => {
      setError(true);
      Vibration.vibrate(200);
      setPin('');
    }
  }));

  const handlePress = (digit) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(false);
      
      if (newPin.length === 4) {
        setTimeout(() => onSubmit(newPin), 200);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(false);
  };

  const renderDot = (index) => (
    <View
      key={index}
      style={[
        styles.dot,
        index < pin.length && styles.dotFilled,
        error && styles.dotError,
      ]}
    />
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      
      <View style={styles.dotsContainer}>
        {[0, 1, 2, 3].map(renderDot)}
      </View>

      {error && <Text style={styles.errorText}>Неверный PIN</Text>}

      <View style={styles.keypad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <TouchableOpacity
            key={num}
            style={styles.key}
            onPress={() => handlePress(num.toString())}
          >
            <Text style={styles.keyText}>{num}</Text>
          </TouchableOpacity>
        ))}
        
        <View style={styles.key} />
        
        <TouchableOpacity style={styles.key} onPress={() => handlePress('0')}>
          <Text style={styles.keyText}>0</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.key} onPress={handleDelete}>
          <Ionicons name="backspace-outline" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
        <Text style={styles.cancelText}>Отмена</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 40,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 40,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#666',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#0a84ff',
    borderColor: '#0a84ff',
  },
  dotError: {
    borderColor: '#ff453a',
    backgroundColor: '#ff453a',
  },
  errorText: {
    color: '#ff453a',
    fontSize: 14,
    marginBottom: 20,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: 280,
    gap: 12,
  },
  key: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '400',
  },
  cancelBtn: {
    marginTop: 30,
    padding: 12,
  },
  cancelText: {
    color: '#0a84ff',
    fontSize: 16,
  },
});

export default PinPad;