import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import type { AppController } from '../app/useAppController'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { SectionStateCard } from '../components/SectionStateCard'
import { colors, ui } from '../theme'

type IngredientRow = {
  name: string
  quantity: number
  unit: string
}

function parseIngredientLine(line: string): IngredientRow | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // "2 oz gin" or "0.75oz lemon juice"
  const match = trimmed.match(/^(?<qty>[0-9]+(?:\\.[0-9]+)?)\\s*(?<unit>[a-zA-Z]+)?\\s+(?<name>.+)$/)
  if (!match?.groups) {
    return { name: trimmed, quantity: 1.0, unit: 'unit' }
  }
  const qty = Number(match.groups.qty)
  const unit = (match.groups.unit || 'unit').toLowerCase()
  const name = (match.groups.name || '').trim()
  if (!Number.isFinite(qty) || qty <= 0) {
    return { name: name || trimmed, quantity: 1.0, unit }
  }
  if (!name) {
    return { name: trimmed, quantity: qty, unit }
  }
  return { name, quantity: qty, unit }
}

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

export function RecipeIngestScreen({ controller }: { controller: AppController }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const status = controller.sectionStatus.recipes
  const offline = status.error.toLowerCase().includes('offline')

  const [name, setName] = useState('')
  const [sourceUrl, setSourceUrl] = useState('http://local.dev')
  const [ingredientLines, setIngredientLines] = useState('2 oz gin\n0.75 oz lemon juice\n0.75 oz simple syrup')
  const [instructionLines, setInstructionLines] = useState('Shake with ice.\nDouble strain.\nGarnish with a lemon twist.')
  const [ratingValue, setRatingValue] = useState('')
  const [ratingCount, setRatingCount] = useState('')

  const ingredients = useMemo(() => {
    return ingredientLines
      .split('\n')
      .map((line) => parseIngredientLine(line))
      .filter((row): row is IngredientRow => Boolean(row && row.name))
  }, [ingredientLines])

  const instructions = useMemo(() => {
    return instructionLines
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }, [instructionLines])

  const submitDisabledReason = (() => {
    if (offline) return 'Ingest is disabled while offline.'
    if (status.loading) return 'Ingest is locked while recipes are syncing.'
    if (!name.trim()) return 'Add a recipe name to continue.'
    if (ingredients.length === 0) return 'Add at least one ingredient line.'
    if (instructions.length === 0) return 'Add at least one instruction line.'
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
      </View>

      <Text style={styles.header}>Add Recipe</Text>
      <Text style={styles.subtitle}>Manual entry for quick pilot seeding. Use the Harvest tool for web imports.</Text>

      {offline ? (
        <SectionStateCard
          mode="error"
          title="Offline Mode"
          message={OFFLINE_MESSAGE}
          actionLabel="Retry Sync"
          onAction={() => void controller.loadRecipes()}
          disabled={status.loading}
        />
      ) : null}

      {status.error && !offline ? (
        <SectionStateCard
          mode="error"
          title="Ingest error"
          message={status.error}
          actionLabel="Retry Sync"
          onAction={() => void controller.loadRecipes()}
          disabled={status.loading}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Gin Sour"
          value={name}
          onChangeText={setName}
        />
        <Text style={styles.label}>Source URL</Text>
        <TextInput
          style={styles.input}
          placeholder="http://local.dev"
          value={sourceUrl}
          onChangeText={setSourceUrl}
          autoCapitalize="none"
        />
        <Text style={styles.hint}>For manual recipes, this can stay as `http://local.dev`.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Ingredients</Text>
        <Text style={styles.hint}>One per line. Examples: `2 oz gin`, `0.75 oz lemon juice`.</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="2 oz gin\n0.75 oz lemon juice\n0.75 oz simple syrup"
          value={ingredientLines}
          onChangeText={setIngredientLines}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.meta}>Parsed ingredients: {ingredients.length}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Instructions</Text>
        <Text style={styles.hint}>One step per line.</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Shake with ice.\nDouble strain."
          value={instructionLines}
          onChangeText={setInstructionLines}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.meta}>Parsed steps: {instructions.length}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Signals (optional)</Text>
        <Text style={styles.hint}>If you have ratings, add them. Some sources require popularity signals.</Text>
        <TextInput
          style={styles.input}
          placeholder="Rating value (e.g. 4.7)"
          keyboardType="decimal-pad"
          value={ratingValue}
          onChangeText={setRatingValue}
        />
        <TextInput
          style={styles.input}
          placeholder="Rating count (e.g. 1200)"
          keyboardType="number-pad"
          value={ratingCount}
          onChangeText={setRatingCount}
        />
      </View>

      <View style={styles.row}>
        <Pressable
          style={[
            styles.button,
            (offline || status.loading || Boolean(submitDisabledReason)) ? styles.buttonDisabled : null,
          ]}
          disabled={offline || status.loading || Boolean(submitDisabledReason)}
          onPress={async () => {
            await controller.ingestRecipe({
              canonicalName: name.trim(),
              sourceUrl: sourceUrl.trim() || 'http://local.dev',
              ingredients,
              instructions,
              ratingValue: ratingValue ? Number(ratingValue) : undefined,
              ratingCount: ratingCount ? Number(ratingCount) : undefined,
            })
            if (navigation.canGoBack()) navigation.goBack()
          }}
          testID="recipe-ingest-save"
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Save Recipe</Text>
        </Pressable>
        <Pressable
          style={[styles.ghostButton, status.loading ? styles.buttonDisabled : null]}
          disabled={status.loading}
          onPress={() => {
            setName('')
            setIngredientLines('')
            setInstructionLines('')
            setRatingValue('')
            setRatingCount('')
          }}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Clear</Text>
        </Pressable>
      </View>
      {submitDisabledReason ? <Text style={styles.meta}>{submitDisabledReason}</Text> : null}
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
  hint: {
    color: colors.textMuted,
  },
  input: ui.input,
  multiline: {
    minHeight: 120,
  },
  row: ui.row,
  button: ui.primaryButton,
  buttonText: ui.primaryButtonText,
  ghostButton: ui.secondaryButton,
  ghostText: ui.secondaryButtonText,
  meta: ui.muted,
  buttonDisabled: ui.buttonDisabled,
})
