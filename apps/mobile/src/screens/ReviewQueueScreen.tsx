import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import type { AppController } from '../app/useAppController'
import type { Recipe, RecipeModeration, SectionState } from '../types'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { SectionStateCard } from '../components/SectionStateCard'
import { colors, ui } from '../theme'

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'
const MODERATION_STATUSES = ['pending', 'approved', 'rejected', 'needs_changes']

function statusBadge(status?: string) {
  const normalized = (status || '').toLowerCase()
  if (normalized === 'approved') return { label: 'Approved', color: colors.success }
  if (normalized === 'rejected') return { label: 'Rejected', color: colors.danger }
  if (normalized === 'pending') return { label: 'Pending', color: colors.warning }
  return { label: status || 'Unreviewed', color: colors.textMuted }
}

export function ReviewQueueScreen({
  controller,
  recipeId,
}: {
  controller: AppController
  recipeId?: string
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const status = controller.sectionStatus.reviews
  const offline = status.error.toLowerCase().includes('offline')

  const [query, setQuery] = useState('')
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipeId || '')
  const [moderationStatus, setModerationStatus] = useState('pending')
  const [moderationLabel, setModerationLabel] = useState('')
  const [moderationNotes, setModerationNotes] = useState('')

  useEffect(() => {
    if (!recipeId) return
    setSelectedRecipeId(recipeId)
  }, [recipeId])

  const recipesFiltered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = controller.recipes
    if (!q) return all
    return all.filter((r) => r.canonical_name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
  }, [controller.recipes, query])

  const selectedRecipe = useMemo<Recipe | undefined>(() => {
    return controller.recipes.find((r) => r.id === selectedRecipeId)
  }, [controller.recipes, selectedRecipeId])

  const moderationHistoryForRecipe = useMemo<RecipeModeration[]>(() => {
    if (!selectedRecipeId) return []
    return controller.moderationHistory.filter((entry) => entry.recipe_id === selectedRecipeId)
  }, [controller.moderationHistory, selectedRecipeId])

  const moderationStatusNormalized = moderationStatus.trim().toLowerCase()
  const moderationStatusValid = MODERATION_STATUSES.includes(moderationStatusNormalized)

  const reviewSubmitDisabledReason = (() => {
    if (offline) return 'Review actions are disabled while offline.'
    if (!selectedRecipeId.trim()) return 'Select a recipe before submitting review updates.'
    if (!moderationStatusValid) return 'Choose a valid moderation status before submitting.'
    if (status.loading) return 'Review actions are locked while review history is loading.'
    return ''
  })()

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable
          style={styles.ghostButton}
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack()
            else navigation.navigate('Tabs')
          }}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.ghostButton, (offline || status.loading || !selectedRecipeId.trim()) ? styles.buttonDisabled : null]}
          disabled={offline || status.loading || !selectedRecipeId.trim()}
          onPress={() => navigation.navigate('RecipeReview', { recipeId: selectedRecipeId.trim() })}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>History</Text>
        </Pressable>
      </View>

      <Text style={styles.header}>Reviews</Text>
      <Text style={styles.subtitle}>Moderate harvested recipes. Offline mode disables submissions but you can still browse.</Text>

      {offline ? (
        <SectionStateCard
          mode="error"
          title="Offline Mode"
          message={OFFLINE_MESSAGE}
          actionLabel="Retry"
          onAction={() => void controller.loadModerations(selectedRecipeId)}
          disabled={status.loading}
        />
      ) : null}

      {status.loading ? (
        <SectionStateCard mode="loading" title="Loading reviews" message="Fetching moderation history." />
      ) : null}

      {status.error && !offline ? (
        <SectionStateCard
          mode="error"
          title="Review error"
          message={status.error}
          actionLabel="Retry"
          onAction={() => void controller.loadModerations(selectedRecipeId)}
          disabled={status.loading || offline}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Find recipe</Text>
        <TextInput
          style={styles.input}
          placeholder="Search by name or id"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        <Text style={styles.meta}>Showing {recipesFiltered.length} recipes</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Select</Text>
        {!controller.sectionStatus.recipes.loading && controller.recipes.length === 0 ? (
          <SectionStateCard
            mode="empty"
            title="No recipes yet"
            message="Import recipes first, then review them here."
            actionLabel="Import"
            onAction={() => navigation.navigate('HarvestHub')}
            disabled={offline}
          />
        ) : null}
        {recipesFiltered.slice(0, 12).map((recipe) => {
          const badge = statusBadge(recipe.review_status)
          const isSelected = recipe.id === selectedRecipeId
          return (
            <Pressable
              key={recipe.id}
              style={[styles.recipeRow, isSelected ? styles.recipeRowSelected : null]}
              onPress={() => setSelectedRecipeId(recipe.id)}
              testID={`reviews-select-${recipe.id}`}
              accessibilityRole="button"
            >
              <Text style={styles.recipeTitle}>{recipe.canonical_name}</Text>
              <View style={styles.row}>
                <Text style={[styles.badge, { borderColor: badge.color, color: badge.color }]}>{badge.label}</Text>
                {recipe.quality_label ? <Text style={styles.meta}>{recipe.quality_label}</Text> : null}
              </View>
              <Text style={styles.meta}>id: {recipe.id}</Text>
            </Pressable>
          )
        })}
        {recipesFiltered.length > 12 ? <Text style={styles.meta}>Refine search to see more recipes.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Update</Text>
        {selectedRecipe ? (
          <Text style={styles.meta}>
            Selected: <Text style={styles.metaStrong}>{selectedRecipe.canonical_name}</Text>
          </Text>
        ) : selectedRecipeId ? (
          <Text style={styles.meta}>Selected recipe id: {selectedRecipeId}</Text>
        ) : (
          <Text style={styles.meta}>No recipe selected yet.</Text>
        )}
        <TextInput
          style={styles.input}
          placeholder="Status (pending/approved/rejected/needs_changes)"
          value={moderationStatus}
          onChangeText={setModerationStatus}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Quality label (optional)"
          value={moderationLabel}
          onChangeText={setModerationLabel}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Notes (optional)"
          value={moderationNotes}
          onChangeText={setModerationNotes}
          multiline
          textAlignVertical="top"
        />
        <View style={styles.row}>
          <Pressable
            style={[
              styles.button,
              (!selectedRecipeId.trim() || !moderationStatusValid || status.loading || offline) ? styles.buttonDisabled : null,
            ]}
            disabled={!selectedRecipeId.trim() || !moderationStatusValid || status.loading || offline}
            onPress={() =>
              void controller.createRecipeModeration({
                recipeId: selectedRecipeId.trim(),
                status: moderationStatusNormalized,
                qualityLabel: moderationLabel.trim() || undefined,
                notes: moderationNotes.trim() || undefined,
              })
            }
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Submit Review</Text>
          </Pressable>
          <Pressable
            style={[
              styles.ghostButton,
              (!selectedRecipeId.trim() || status.loading || offline) ? styles.buttonDisabled : null,
            ]}
            disabled={!selectedRecipeId.trim() || status.loading || offline}
            onPress={() => void controller.loadModerations(selectedRecipeId.trim())}
            accessibilityRole="button"
          >
            <Text style={styles.ghostText}>Load History</Text>
          </Pressable>
        </View>
        {reviewSubmitDisabledReason ? <Text style={styles.meta}>{reviewSubmitDisabledReason}</Text> : null}
        {!moderationStatusValid && moderationStatusNormalized ? (
          <Text style={styles.errorText}>Status must be one of: pending, approved, rejected, needs_changes.</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Recent history</Text>
        {!status.loading && !status.error && selectedRecipeId && controller.moderationHistoryRecipeId !== selectedRecipeId ? (
          <Text style={styles.meta}>History not loaded for this recipe yet. Tap "Load History".</Text>
        ) : null}
        {!status.loading && !status.error && selectedRecipeId && controller.moderationHistoryRecipeId === selectedRecipeId && moderationHistoryForRecipe.length === 0 ? (
          <Text style={styles.meta}>No moderation history for this recipe yet.</Text>
        ) : null}
        {moderationHistoryForRecipe.slice(0, 6).map((entry) => (
          <View key={entry.id} style={styles.historyRow}>
            <Text style={styles.metaStrong}>{entry.status}</Text>
            <Text style={styles.meta}>
              {entry.quality_label ? `${entry.quality_label} · ` : ''}
              {entry.notes ? entry.notes : ''}
            </Text>
          </View>
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
  topRow: {
    ...ui.row,
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  header: ui.title,
  subtitle: ui.subtitle,
  card: ui.card,
  label: ui.label,
  input: ui.input,
  multiline: { minHeight: 90 },
  row: ui.row,
  button: ui.primaryButton,
  buttonText: ui.primaryButtonText,
  ghostButton: ui.secondaryButton,
  ghostText: ui.secondaryButtonText,
  buttonDisabled: ui.buttonDisabled,
  recipeRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    backgroundColor: colors.cardSoft,
    marginBottom: 8,
  },
  recipeRowSelected: {
    borderColor: colors.primary,
  },
  recipeTitle: {
    fontWeight: '800',
    color: colors.text,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: '800',
  },
  meta: ui.muted,
  metaStrong: {
    color: colors.text,
    fontWeight: '800',
  },
  historyRow: {
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 8,
    gap: 4,
  },
  errorText: {
    color: '#fecaca',
  },
})
