import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import type { HarvestJob, Recipe, SectionState } from '../types'
import { SectionStateCard } from '../components/SectionStateCard'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { colors, ui } from '../theme'

type RecipesScreenProps = {
  recipes: Recipe[]
  harvestJobs: HarvestJob[]
  recipeStatus: SectionState
  harvestStatus: SectionState
  reviewStatus: SectionState
  onRefresh: (query?: string) => Promise<void>
  onRefreshHarvestJobs: () => Promise<void>
}

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

function statusBadge(status?: string) {
  const normalized = (status || '').toLowerCase()
  if (normalized === 'approved') return { label: 'Approved', color: colors.success }
  if (normalized === 'rejected') return { label: 'Rejected', color: colors.danger }
  if (normalized === 'pending') return { label: 'Pending', color: colors.warning }
  return { label: status || 'Unreviewed', color: colors.textMuted }
}

export function RecipesScreen({
  recipes,
  harvestJobs,
  recipeStatus,
  harvestStatus,
  reviewStatus,
  onRefresh,
  onRefreshHarvestJobs,
}: RecipesScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [query, setQuery] = useState('')

  const offlineError = [recipeStatus.error, harvestStatus.error, reviewStatus.error].find((message) =>
    message.toLowerCase().includes('offline'),
  )
  const isOffline = Boolean(offlineError)

  const recipesFiltered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter((r) => r.canonical_name.toLowerCase().includes(q))
  }, [query, recipes])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Recipes</Text>
      <Text style={styles.subtitle}>Browse what you can make, import from the web, and review harvested recipes.</Text>

      {offlineError ? (
        <SectionStateCard
          mode="error"
          title="Offline Mode"
          message={OFFLINE_MESSAGE}
          actionLabel="Retry Sync"
          onAction={() => {
            void onRefresh(query)
            void onRefreshHarvestJobs()
          }}
        />
      ) : null}

      {recipeStatus.loading ? (
        <SectionStateCard mode="loading" title="Loading recipes" message="Refreshing recipe library." />
      ) : null}
      {recipeStatus.error && !isOffline ? (
        <SectionStateCard
          mode="error"
          title="Recipe error"
          message={recipeStatus.error}
          actionLabel="Retry"
          onAction={() => void onRefresh(query)}
          disabled={recipeStatus.loading}
        />
      ) : null}
      {harvestStatus.error && !isOffline ? (
        <SectionStateCard
          mode="error"
          title="Harvest error"
          message={harvestStatus.error}
          actionLabel="Reload Jobs"
          onAction={() => void onRefreshHarvestJobs()}
          disabled={harvestStatus.loading}
        />
      ) : null}
      {reviewStatus.error && !isOffline ? (
        <SectionStateCard
          mode="error"
          title="Review error"
          message={reviewStatus.error}
          actionLabel="Open Reviews"
          onAction={() => navigation.navigate('ReviewQueue')}
          disabled={reviewStatus.loading}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Quick actions</Text>
        <Text style={styles.meta}>Harvest jobs: {harvestJobs.length}</Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.button, isOffline ? styles.buttonDisabled : null]}
            disabled={isOffline}
            onPress={() => navigation.navigate('RecipeIngest')}
            testID="recipes-quick-add"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Add Recipe</Text>
          </Pressable>
          <Pressable
            style={[styles.ghostButton, isOffline ? styles.buttonDisabled : null]}
            disabled={isOffline}
            onPress={() => navigation.navigate('HarvestHub')}
            testID="recipes-quick-import"
            accessibilityRole="button"
          >
            <Text style={styles.ghostText}>Import From Web</Text>
          </Pressable>
          <Pressable
            style={styles.ghostButton}
            onPress={() => navigation.navigate('ReviewQueue')}
            testID="recipes-quick-reviews"
            accessibilityRole="button"
          >
            <Text style={styles.ghostText}>Reviews</Text>
          </Pressable>
        </View>
        {isOffline ? <Text style={styles.meta}>Import is disabled while offline. Reviews remain available.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Search</Text>
        <TextInput
          style={styles.input}
          placeholder="Search recipes"
          value={query}
          onChangeText={setQuery}
        />
        <View style={styles.row}>
          <Pressable
            style={[styles.ghostButton, (recipeStatus.loading || isOffline) ? styles.buttonDisabled : null]}
            disabled={recipeStatus.loading || isOffline}
            onPress={() => void onRefresh(query)}
            testID="recipes-search-submit"
            accessibilityRole="button"
          >
            <Text style={styles.ghostText}>Search</Text>
          </Pressable>
          <Pressable
            style={[styles.ghostButton, isOffline ? styles.buttonDisabled : null]}
            disabled={isOffline}
            onPress={() => {
              setQuery('')
              void onRefresh()
            }}
            testID="recipes-search-clear"
            accessibilityRole="button"
          >
            <Text style={styles.ghostText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Library ({recipesFiltered.length})</Text>
        {!recipeStatus.loading && !recipeStatus.error && recipesFiltered.length === 0 ? (
          <SectionStateCard
            mode="empty"
            title="No recipes yet"
            message="Add a recipe manually or import from an approved source to populate your library."
            actionLabel="Import From Web"
            onAction={() => navigation.navigate('HarvestHub')}
            disabled={isOffline}
          />
        ) : null}
        {recipesFiltered.slice(0, 20).map((recipe) => {
          const badge = statusBadge(recipe.review_status)
          return (
            <Pressable
              key={recipe.id}
              style={styles.recipeRow}
              onPress={() => navigation.navigate('RecipeDetail', { recipeId: recipe.id })}
              testID={`recipes-library-${recipe.id}`}
              accessibilityRole="button"
            >
              <Text style={styles.recipeName}>{recipe.canonical_name}</Text>
              <View style={styles.row}>
                <Text style={[styles.badge, { borderColor: badge.color, color: badge.color }]}>{badge.label}</Text>
                {recipe.quality_label ? <Text style={styles.meta}>{recipe.quality_label}</Text> : null}
              </View>
            </Pressable>
          )
        })}
        {recipesFiltered.length > 20 ? <Text style={styles.meta}>Refine search to see more.</Text> : null}
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
  header: ui.title,
  subtitle: ui.subtitle,
  card: ui.card,
  label: ui.label,
  input: ui.input,
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
    gap: 6,
    backgroundColor: colors.cardSoft,
    marginBottom: 8,
  },
  recipeName: {
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
})
