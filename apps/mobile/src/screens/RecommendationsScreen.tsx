import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { SectionStateCard } from '../components/SectionStateCard'
import { colors, ui } from '../theme'
import type { SectionState } from '../types'
const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

type RecommendationsScreenProps = {
  status: SectionState
  makeNow: any[]
  missingOne: any[]
  tonightFlight: any[]
  onRefresh: () => Promise<void>
}

export function RecommendationsScreen({
  status,
  makeNow,
  missingOne,
  tonightFlight,
  onRefresh,
}: RecommendationsScreenProps) {
  const isOffline = status.error.toLowerCase().includes('offline')
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Recommendations</Text>
      {isOffline ? (
        <SectionStateCard
          mode="error"
          title="Offline Mode"
          message={OFFLINE_MESSAGE}
          actionLabel="Retry"
          onAction={() => {
            void onRefresh()
          }}
        />
      ) : null}
      {status.loading && (
        <SectionStateCard mode="loading" title="Loading suggestions" message="Computing make-now and flight options." />
      )}
      {status.error ? (
        <SectionStateCard
          mode="error"
          title="Recommendation error"
          message={status.error}
          actionLabel="Retry"
          onAction={() => {
            void onRefresh()
          }}
        />
      ) : null}
      {!status.loading && !status.error && makeNow.length === 0 && missingOne.length === 0 && tonightFlight.length === 0 ? (
        <SectionStateCard mode="empty" title="No recommendations" message="Refresh after inventory and recipes are populated." />
      ) : null}

      <Pressable style={[styles.button, status.loading ? styles.buttonDisabled : null]} disabled={status.loading} onPress={onRefresh}>
        <Text style={styles.buttonText}>Refresh Recommendations</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.label}>Make Now ({makeNow.length})</Text>
        {makeNow.map((item, index) => (
          <Text key={`make-now-${index}`} style={styles.rowText}>
            {item.recipe_name ?? item.canonical_name ?? 'Recipe'}
          </Text>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Missing One ({missingOne.length})</Text>
        {missingOne.map((item, index) => (
          <Text key={`missing-${index}`} style={styles.rowText}>
            {item.recipe_name ?? item.canonical_name ?? 'Recipe'}
          </Text>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Tonight&apos;s Flight ({tonightFlight.length})</Text>
        {tonightFlight.map((item, index) => (
          <Text key={`flight-${index}`} style={styles.rowText}>
            {item.recipe_name ?? item.canonical_name ?? 'Recipe'}
          </Text>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: ui.screen,
  content: {
    ...ui.content,
    gap: 10,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  button: {
    ...ui.primaryButton,
    marginBottom: 8,
  },
  buttonText: ui.primaryButtonText,
  buttonDisabled: ui.buttonDisabled,
  card: ui.card,
  label: ui.label,
  rowText: {
    color: colors.textSecondary,
    paddingVertical: 2,
  },
})
