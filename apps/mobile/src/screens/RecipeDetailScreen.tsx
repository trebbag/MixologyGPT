import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import type { AppController } from '../app/useAppController'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { SectionStateCard } from '../components/SectionStateCard'
import { colors, ui } from '../theme'

type RecipeDetail = {
  id: string
  canonical_name: string
  description?: string | null
  instructions?: string[] | null
  ingredient_rows?: Array<{ name: string; quantity?: number; unit?: string }> | null
  tags?: string[] | null
  review_status?: string | null
  quality_label?: string | null
}

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

export function RecipeDetailScreen({
  controller,
  recipeId,
}: {
  controller: AppController
  recipeId: string
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [detail, setDetail] = useState<RecipeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const offline = error.toLowerCase().includes('offline')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    controller
      .fetchRecipeDetail(recipeId)
      .then((payload: any) => {
        if (cancelled) return
        setDetail(payload as RecipeDetail)
      })
      .catch((exc: any) => {
        if (cancelled) return
        const msg = exc instanceof Error ? exc.message : String(exc || 'Unable to load recipe.')
        const normalized = msg.toLowerCase()
        if (
          normalized.includes('network request failed') ||
          normalized.includes('failed to fetch') ||
          normalized.includes('network error')
        ) {
          setError(OFFLINE_MESSAGE)
        } else {
          setError(msg || 'Unable to load recipe.')
        }
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [controller.fetchRecipeDetail, recipeId])

  const ingredients = useMemo(() => {
    const rows = detail?.ingredient_rows || []
    if (!Array.isArray(rows)) return []
    return rows
      .map((row) => {
        const qty = typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null
        const unit = (row.unit || '').trim()
        const name = (row.name || '').trim()
        if (!name) return null
        return `${qty !== null ? qty : ''}${qty !== null ? ' ' : ''}${unit ? `${unit} ` : ''}${name}`.trim()
      })
      .filter(Boolean) as string[]
  }, [detail])

  const instructions = useMemo(() => {
    const steps = detail?.instructions || []
    if (!Array.isArray(steps)) return []
    return steps.map((step) => String(step || '').trim()).filter(Boolean)
  }, [detail])

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
          style={styles.ghostButton}
          onPress={() => navigation.navigate('ReviewQueue', { recipeId })}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Moderate</Text>
        </Pressable>
      </View>

      <Text style={styles.header}>{detail?.canonical_name || 'Recipe'}</Text>
      {detail?.review_status || detail?.quality_label ? (
        <Text style={styles.subtitle}>
          {detail?.review_status ? `${detail.review_status}` : ''}
          {detail?.quality_label ? ` · ${detail.quality_label}` : ''}
        </Text>
      ) : (
        <Text style={styles.subtitle}>Recipe detail and instructions.</Text>
      )}

      {loading ? <SectionStateCard mode="loading" title="Loading recipe" message="Fetching recipe details." /> : null}

      {error ? (
        <SectionStateCard
          mode="error"
          title={offline ? 'Offline Mode' : 'Recipe error'}
          message={error}
          actionLabel="Retry"
          onAction={() => {
            setLoading(true)
            setError('')
            void controller.fetchRecipeDetail(recipeId).then((payload: any) => setDetail(payload as RecipeDetail)).catch((exc: any) => {
              const msg = exc instanceof Error ? exc.message : String(exc || 'Unable to load recipe.')
              setError(msg)
            }).finally(() => setLoading(false))
          }}
        />
      ) : null}

      {!loading && !error && !detail ? (
        <SectionStateCard mode="empty" title="Not found" message="This recipe is not available." />
      ) : null}

      {detail?.description ? (
        <View style={styles.card}>
          <Text style={styles.label}>Notes</Text>
          <Text style={styles.value}>{detail.description}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Ingredients</Text>
        {ingredients.length === 0 ? <Text style={styles.meta}>No ingredients recorded.</Text> : null}
        {ingredients.map((line) => (
          <Text key={line} style={styles.value}>
            {line}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Instructions</Text>
        {instructions.length === 0 ? <Text style={styles.meta}>No instructions recorded.</Text> : null}
        {instructions.map((step, idx) => (
          <Text key={`${idx}-${step}`} style={styles.value}>
            {idx + 1}. {step}
          </Text>
        ))}
      </View>

      <View style={styles.row}>
        <Pressable
          style={styles.ghostButton}
          onPress={() => navigation.navigate('RecipeReview', { recipeId })}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Review History</Text>
        </Pressable>
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
  value: {
    color: colors.textSecondary,
  },
  meta: ui.muted,
  row: ui.row,
  ghostButton: ui.secondaryButton,
  ghostText: ui.secondaryButtonText,
})
