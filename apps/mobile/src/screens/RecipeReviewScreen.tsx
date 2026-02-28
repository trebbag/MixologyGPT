import { useEffect, useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'

import type { AppController } from '../app/useAppController'
import { SectionStateCard } from '../components/SectionStateCard'
import { colors, ui } from '../theme'
import type { RootStackParamList } from '../navigation/RootNavigator'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

export function RecipeReviewScreen({
  controller,
  recipeId,
}: {
  controller: AppController
  recipeId: string
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const status = controller.sectionStatus.reviews
  const offline = status.error.toLowerCase().includes('offline')
  const history = useMemo(() => {
    return controller.moderationHistory.filter((entry) => entry.recipe_id === recipeId)
  }, [controller.moderationHistory, recipeId])

  useEffect(() => {
    if (!recipeId) return
    if (controller.moderationHistoryRecipeId === recipeId) return
    void controller.loadModerations(recipeId)
  }, [controller.loadModerations, controller.moderationHistoryRecipeId, recipeId])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable
          style={styles.ghostButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack()
            } else {
              navigation.navigate('Tabs' as any, { screen: 'Recipes' } as any)
            }
          }}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Back</Text>
        </Pressable>
        <Pressable
          style={styles.ghostButton}
          onPress={() => navigation.navigate('ReviewQueue', { recipeId })}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Open Reviews</Text>
        </Pressable>
      </View>

      <Text style={styles.header}>Review</Text>
      <Text style={styles.subtitle}>Recipe ID: {recipeId}</Text>

      {offline ? (
        <SectionStateCard
          mode="error"
          title="Offline Mode"
          message={OFFLINE_MESSAGE}
          actionLabel="Retry"
          onAction={() => void controller.loadModerations(recipeId)}
          disabled={status.loading}
        />
      ) : null}

      {status.loading ? (
        <SectionStateCard mode="loading" title="Loading history" message="Fetching moderation history." />
      ) : null}
      {status.error ? (
        <SectionStateCard
          mode="error"
          title="Review error"
          message={status.error}
          actionLabel="Retry"
          onAction={() => void controller.loadModerations(recipeId)}
          disabled={status.loading || offline}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>History</Text>
        {!status.loading && !status.error && controller.moderationHistoryRecipeId !== recipeId ? (
          <SectionStateCard
            mode="empty"
            title="History not loaded"
            message="Pulling moderation history for this recipe. If it does not load, try refresh."
            actionLabel="Refresh"
            onAction={() => void controller.loadModerations(recipeId)}
            disabled={offline}
          />
        ) : null}
        {!status.loading && !status.error && controller.moderationHistoryRecipeId === recipeId && history.length === 0 ? (
          <SectionStateCard
            mode="empty"
            title="No history yet"
            message="This recipe has no moderation history. Submit a review on the Recipes screen."
            actionLabel="Refresh"
            onAction={() => void controller.loadModerations(recipeId)}
            disabled={offline}
          />
        ) : null}
        {history.map((entry) => (
          <View key={entry.id} style={styles.row}>
            <Text style={styles.value}>{entry.status}</Text>
            <Text style={styles.meta}>
              {entry.quality_label ? `${entry.quality_label} · ` : ''}
              {entry.notes ? entry.notes : ''}
            </Text>
          </View>
        ))}
        <Pressable
          style={[styles.ghostButton, (offline || status.loading) ? styles.buttonDisabled : null]}
          disabled={offline || status.loading}
          onPress={() => void controller.loadModerations(recipeId)}
        >
          <Text style={styles.ghostText}>Refresh History</Text>
        </Pressable>
      </View>

      <Text style={styles.meta}>
        Use the Reviews screen to submit changes; this screen is optimized for deep-linked history, offline and retry states.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: ui.screen,
  content: {
    ...ui.content,
    gap: 10,
  },
  topRow: {
    ...ui.row,
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  header: ui.title,
  subtitle: ui.subtitle,
  card: ui.card,
  label: ui.label,
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    backgroundColor: colors.cardSoft,
  },
  value: {
    color: colors.text,
    fontWeight: '800',
  },
  meta: {
    color: colors.textSecondary,
  },
  ghostButton: ui.secondaryButton,
  ghostText: ui.secondaryButtonText,
  buttonDisabled: ui.buttonDisabled,
})
