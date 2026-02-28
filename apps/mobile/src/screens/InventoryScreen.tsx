import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { SectionStateCard } from '../components/SectionStateCard'
import { colors, ui } from '../theme'
import type { Ingredient, InventoryItem, SectionState } from '../types'

type InventoryScreenProps = {
  ingredients: Ingredient[]
  items: InventoryItem[]
  status: SectionState
  onRefresh: () => Promise<void>
  onCreateIngredient: (name: string) => Promise<void>
  onCreateItem: (ingredientId: string, unit: string, preferredUnit?: string) => Promise<void>
}

export function InventoryScreen({
  ingredients,
  items,
  status,
  onRefresh,
  onCreateIngredient,
  onCreateItem,
}: InventoryScreenProps) {
  const [ingredientName, setIngredientName] = useState('')
  const [itemIngredientId, setItemIngredientId] = useState('')
  const [itemUnit, setItemUnit] = useState('oz')
  const [itemPreferredUnit, setItemPreferredUnit] = useState('')

  const ingredientMap = useMemo(() => {
    const map: Record<string, string> = {}
    ingredients.forEach((ingredient) => {
      map[ingredient.id] = ingredient.canonical_name
    })
    return map
  }, [ingredients])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Inventory</Text>
      {status.loading && (
        <SectionStateCard mode="loading" title="Loading inventory" message="Syncing ingredients and items." />
      )}
      {status.error ? (
        <SectionStateCard
          mode="error"
          title="Inventory error"
          message={status.error}
          actionLabel="Retry"
          onAction={() => {
            void onRefresh()
          }}
        />
      ) : null}
      {!status.loading && !status.error && ingredients.length === 0 ? (
        <SectionStateCard
          mode="empty"
          title="No ingredients yet"
          message="Add your first ingredient to begin inventory tracking."
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Add Ingredient</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. London Dry Gin"
          value={ingredientName}
          onChangeText={setIngredientName}
        />
        <Pressable
          style={[styles.button, !ingredientName || status.loading ? styles.buttonDisabled : null]}
          disabled={!ingredientName || status.loading}
          onPress={async () => {
            await onCreateIngredient(ingredientName.trim())
            setIngredientName('')
          }}
        >
          <Text style={styles.buttonText}>Create Ingredient</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Add Inventory Item</Text>
        <TextInput
          style={styles.input}
          placeholder="Ingredient ID"
          value={itemIngredientId}
          onChangeText={setItemIngredientId}
        />
        <TextInput style={styles.input} placeholder="Unit (oz)" value={itemUnit} onChangeText={setItemUnit} />
        <TextInput
          style={styles.input}
          placeholder="Preferred Unit (optional)"
          value={itemPreferredUnit}
          onChangeText={setItemPreferredUnit}
        />
        <Pressable
          style={[styles.button, (!itemIngredientId || !itemUnit || status.loading) && styles.buttonDisabled]}
          disabled={!itemIngredientId || !itemUnit || status.loading}
          onPress={async () => {
            await onCreateItem(itemIngredientId.trim(), itemUnit.trim(), itemPreferredUnit.trim() || undefined)
            setItemIngredientId('')
            setItemUnit('oz')
            setItemPreferredUnit('')
          }}
        >
          <Text style={styles.buttonText}>Create Item</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.refreshButton, status.loading ? styles.buttonDisabled : null]}
        disabled={status.loading}
        onPress={onRefresh}
      >
        <Text style={styles.refreshText}>Refresh Inventory</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.label}>Ingredient List ({ingredients.length})</Text>
        {ingredients.map((ingredient) => (
          <Text key={ingredient.id} style={styles.rowText}>
            {ingredient.canonical_name}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Inventory Items ({items.length})</Text>
        {items.length === 0 ? (
          <Text style={styles.meta}>No inventory items yet. Add one after creating an ingredient.</Text>
        ) : (
          items.map((item) => (
            <Text key={item.id} style={styles.rowText}>
              {ingredientMap[item.ingredient_id] ?? item.ingredient_id} · {item.unit}
              {item.preferred_unit ? ` -> ${item.preferred_unit}` : ''}
            </Text>
          ))
        )}
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
  card: ui.card,
  label: ui.label,
  input: ui.input,
  button: ui.primaryButton,
  buttonDisabled: ui.buttonDisabled,
  buttonText: ui.primaryButtonText,
  refreshButton: {
    ...ui.secondaryButton,
    marginBottom: 8,
  },
  refreshText: ui.secondaryButtonText,
  rowText: {
    color: colors.textSecondary,
    paddingVertical: 2,
  },
  meta: ui.muted,
})
