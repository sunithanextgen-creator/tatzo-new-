import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type State = {
  error: Error | null;
  componentStack: string;
};

type Props = {
  children: React.ReactNode;
};

// Dev-only helper to surface the component stack on-device.
// This makes it much easier to fix "Text strings must be rendered within a <Text> component".
export default class DevErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: '' };

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('TATZO: DevErrorBoundary caught', error, info?.componentStack);
    this.setState({ error, componentStack: info?.componentStack ?? '' });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>Tatzo Dev Crash</Text>
        <Text style={styles.subtitle}>{String(this.state.error?.message ?? 'Unknown error')}</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.stack}>{this.state.componentStack || '(no component stack)'}</Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 50,
    paddingHorizontal: 16,
    backgroundColor: '#0B0B0F',
  },
  title: {
    color: '#F5F7FA',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 10,
  },
  subtitle: {
    color: 'rgba(245, 247, 250, 0.82)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  scroll: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 247, 250, 0.12)',
  },
  scrollContent: {
    padding: 12,
  },
  stack: {
    color: 'rgba(245, 247, 250, 0.78)',
    fontSize: 11,
    lineHeight: 16,
  },
});
