import React, { useMemo } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
};

const SettingsModal = ({ visible, onClose }: SettingsModalProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons
              name="close"
              size={18}
              color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse}
            />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Pressable
            onPress={() => Alert.alert('Tatzo', 'Terms & Privacy (placeholder).')}
            style={styles.row}
          >
            <Ionicons name="document-text-outline" size={18} color={theme.colors.accentStrong} />
            <Text style={styles.rowText}>Terms & Privacy</Text>
          </Pressable>

          <Pressable
            onPress={() => Alert.alert('Tatzo', 'Report a problem (placeholder).')}
            style={styles.row}
          >
            <Ionicons name="help-circle-outline" size={18} color={theme.colors.accentStrong} />
            <Text style={styles.rowText}>Report a Problem</Text>
          </Pressable>

          <Pressable
            onPress={() => Alert.alert('Tatzo', 'Delete account (placeholder).')}
            style={[styles.row, styles.dangerRow]}
          >
            <Ionicons name="trash-outline" size={18} color={theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf'} />
            <Text style={[styles.rowText, styles.dangerText]}>Delete Account</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: 100,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
    },
    header: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    section: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    rowText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    dangerRow: {
      backgroundColor: 'rgba(142, 75, 69, 0.12)',
      borderColor: 'rgba(142, 75, 69, 0.34)',
    },
    dangerText: {
      color: theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf',
    },
  });

export default SettingsModal;
