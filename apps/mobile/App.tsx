import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from 'react-native'

import { useAppController } from './src/app/useAppController'
import { RootNavigator } from './src/navigation/RootNavigator'
import { colors } from './src/theme'

export default function App() {
  const controller = useAppController()

  if (controller.isBootstrapping) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>Bootstrapping workspace...</Text>
      </SafeAreaView>
    )
  }

  if (controller.bootstrapError) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorTitle}>Bootstrap failed</Text>
        <Text style={styles.errorBody}>{controller.bootstrapError}</Text>
      </SafeAreaView>
    )
  }

  return <RootNavigator controller={controller} />
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 20,
  },
  centerText: {
    marginTop: 10,
    color: colors.textSecondary,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fecaca',
    marginBottom: 8,
  },
  errorBody: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
})
