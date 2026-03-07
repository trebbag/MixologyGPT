import { useMemo, useState } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { SectionStateCard } from '../components/SectionStateCard'
import { colors, ui } from '../theme'
import type { Ingredient, InventoryBatchUploadResponse, InventoryItem, SectionState } from '../types'

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

type InventoryScreenProps = {
  ingredients: Ingredient[]
  items: InventoryItem[]
  status: SectionState
  onRefresh: () => Promise<void>
  onCreateIngredient: (name: string) => Promise<void>
  onCreateItem: (ingredientId: string, unit: string, preferredUnit?: string) => Promise<void>
  onPreviewBatchUpload: (payload: { filename: string; content: string }) => Promise<InventoryBatchUploadResponse>
  onImportBatchUpload: (payload: { filename: string; content: string }) => Promise<InventoryBatchUploadResponse>
}

export function InventoryScreen({
  ingredients,
  items,
  status,
  onRefresh,
  onCreateIngredient,
  onCreateItem,
  onPreviewBatchUpload,
  onImportBatchUpload,
}: InventoryScreenProps) {
  const [ingredientName, setIngredientName] = useState('')
  const [itemIngredientId, setItemIngredientId] = useState('')
  const [itemUnit, setItemUnit] = useState('oz')
  const [itemPreferredUnit, setItemPreferredUnit] = useState('')
  const [batchFilename, setBatchFilename] = useState('pasted-ingredients.txt')
  const [batchContent, setBatchContent] = useState('')
  const [batchPreview, setBatchPreview] = useState<InventoryBatchUploadResponse | null>(null)
  const [batchError, setBatchError] = useState('')
  const [batchSuccess, setBatchSuccess] = useState('')
  const [selectedBatchFileName, setSelectedBatchFileName] = useState('')
  const [previewingBatch, setPreviewingBatch] = useState(false)
  const [importingBatch, setImportingBatch] = useState(false)
  const [pickingBatchFile, setPickingBatchFile] = useState(false)
  const isOffline = status.error.toLowerCase().includes('offline')

  const ingredientMap = useMemo(() => {
    const map: Record<string, string> = {}
    ingredients.forEach((ingredient) => {
      map[ingredient.id] = ingredient.canonical_name
    })
    return map
  }, [ingredients])

  const batchDisabled = status.loading || isOffline || previewingBatch || importingBatch || pickingBatchFile
  const importableCount = batchPreview?.summary.importable_rows ?? 0

  const pickBatchFile = async () => {
    setPickingBatchFile(true)
    setBatchError('')
    setBatchSuccess('')
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: ['text/plain', 'text/csv', 'text/tab-separated-values'],
      })
      if (result.canceled || !result.assets?.length) {
        return
      }
      const asset = result.assets[0]
      const fileText = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      })
      setBatchFilename(asset.name || batchFilename)
      setSelectedBatchFileName(asset.name || asset.uri)
      setBatchContent(fileText)
      setBatchPreview(null)
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : 'Failed to load the selected file.')
    } finally {
      setPickingBatchFile(false)
    }
  }

  const runBatchPreview = async () => {
    setPreviewingBatch(true)
    setBatchError('')
    setBatchSuccess('')
    try {
      const payload = {
        filename: batchFilename.trim() || 'pasted-ingredients.txt',
        content: batchContent.trim(),
      }
      const response = await onPreviewBatchUpload(payload)
      setBatchPreview(response)
    } catch (error) {
      setBatchPreview(null)
      setBatchError(error instanceof Error ? error.message : 'Failed to preview inventory batch upload.')
    } finally {
      setPreviewingBatch(false)
    }
  }

  const runBatchImport = async () => {
    setImportingBatch(true)
    setBatchError('')
    setBatchSuccess('')
    try {
      const payload = {
        filename: batchFilename.trim() || 'pasted-ingredients.txt',
        content: batchContent.trim(),
      }
      const response = await onImportBatchUpload(payload)
      setBatchPreview(response)
      const pendingReviewCopy = response.summary.pending_review_rows
        ? ` ${response.summary.pending_review_rows} row(s) were queued for admin review.`
        : ''
      setBatchSuccess(
        `Imported ${response.summary.created_items} item(s) and ${response.summary.created_lots} lot(s).${pendingReviewCopy}`,
      )
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : 'Failed to import inventory batch upload.')
    } finally {
      setImportingBatch(false)
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Inventory</Text>
      {isOffline ? (
        <SectionStateCard
          mode="error"
          title="Offline Mode"
          message={OFFLINE_MESSAGE}
          actionLabel="Retry"
          onAction={() => {
            void onRefresh()
          }}
          disabled={status.loading}
        />
      ) : null}
      {status.loading && (
        <SectionStateCard mode="loading" title="Loading inventory" message="Syncing ingredients and items." />
      )}
      {status.error && !isOffline ? (
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
        <Text style={styles.label}>AI Batch Upload</Text>
        <Text style={styles.meta}>
          Paste a CSV header row or one ingredient per line. BartenderAI will fill missing details from approved online sources before import.
        </Text>
        <View style={styles.inlineActions}>
          <Pressable
            style={[styles.secondaryButton, batchDisabled ? styles.buttonDisabled : null]}
            disabled={batchDisabled}
            onPress={() => {
              void pickBatchFile()
            }}
            testID="inventory-batch-pick-file"
          >
            <Text style={styles.secondaryButtonText}>{pickingBatchFile ? 'Opening...' : 'Pick File'}</Text>
          </Pressable>
          {selectedBatchFileName ? <Text style={styles.meta}>Loaded {selectedBatchFileName}</Text> : null}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Filename (optional)"
          value={batchFilename}
          onChangeText={setBatchFilename}
          autoCapitalize="none"
          testID="inventory-batch-filename"
        />
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder={'Example:\nLondon Dry Gin\nCampari\nFresh Lime Juice'}
          value={batchContent}
          onChangeText={setBatchContent}
          multiline
          textAlignVertical="top"
          testID="inventory-batch-content"
        />
        <View style={styles.inlineActions}>
          <Pressable
            style={[styles.button, (!batchContent.trim() || batchDisabled) && styles.buttonDisabled]}
            disabled={!batchContent.trim() || batchDisabled}
            onPress={() => {
              void runBatchPreview()
            }}
            testID="inventory-batch-preview"
          >
            <Text style={styles.buttonText}>{previewingBatch ? 'Previewing...' : 'Preview Upload'}</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, (!batchPreview || importableCount === 0 || batchDisabled) && styles.buttonDisabled]}
            disabled={!batchPreview || importableCount === 0 || batchDisabled}
            onPress={() => {
              void runBatchImport()
            }}
            testID="inventory-batch-import"
          >
            <Text style={styles.secondaryButtonText}>{importingBatch ? 'Importing...' : `Import ${importableCount}`}</Text>
          </Pressable>
        </View>
        {isOffline ? <Text style={styles.meta}>Batch import is disabled while offline.</Text> : null}
        {batchError ? <Text style={styles.errorText}>{batchError}</Text> : null}
        {batchSuccess ? <Text style={styles.successText}>{batchSuccess}</Text> : null}

        {batchPreview ? (
          <View style={styles.previewSection}>
            <View style={styles.summaryRow}>
              <SummaryChip label="rows" value={batchPreview.summary.total_rows} />
              <SummaryChip label="ready" value={batchPreview.summary.ready_rows} />
              <SummaryChip label="partial" value={batchPreview.summary.partial_rows} />
              <SummaryChip label="review" value={batchPreview.summary.pending_review_rows} muted={batchPreview.summary.pending_review_rows === 0} />
            </View>
            <Text style={styles.meta}>
              cache {batchPreview.lookup_telemetry.cache_hits} hit / {batchPreview.lookup_telemetry.cache_misses} miss · CocktailDB {batchPreview.lookup_telemetry.cocktaildb_requests} · OpenAI {batchPreview.lookup_telemetry.openai_requests} · tokens {batchPreview.lookup_telemetry.openai_total_tokens}
            </Text>
            {batchPreview.rows.map((row) => (
              <View key={`${row.row_number}-${row.source_name}`} style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <Text style={styles.previewTitle}>#{row.row_number} {row.resolved.canonical_name}</Text>
                  <View style={[styles.statusPill, statusStyle(row.status)]}>
                    <Text style={styles.statusPillText}>{row.status}</Text>
                  </View>
                </View>
                <Text style={styles.rowText}>{row.resolved.category || 'Uncategorized'}{row.resolved.subcategory ? ` · ${row.resolved.subcategory}` : ''}</Text>
                <Text style={styles.rowText}>
                  {row.resolved.is_alcoholic ? 'alcoholic' : 'non-alcoholic'}
                  {row.resolved.abv != null ? ` · ${row.resolved.abv}% ABV` : ''}
                  {row.resolved.is_perishable ? ' · perishable' : ''}
                  {` · unit ${row.resolved.unit}`}
                </Text>
                {row.resolved.description ? <Text style={styles.meta}>{row.resolved.description}</Text> : null}
                {row.notes.length ? <Text style={styles.noteText}>{row.notes.join(' ')}</Text> : null}
                {row.missing_fields.length ? <Text style={styles.meta}>Missing: {row.missing_fields.join(', ')}</Text> : null}
                {row.import_result ? <Text style={styles.successText}>{row.import_result}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Add Ingredient</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. London Dry Gin"
          value={ingredientName}
          onChangeText={setIngredientName}
        />
        <Pressable
          style={[styles.button, !ingredientName || status.loading || isOffline ? styles.buttonDisabled : null]}
          disabled={!ingredientName || status.loading || isOffline}
          onPress={async () => {
            await onCreateIngredient(ingredientName.trim())
            setIngredientName('')
          }}
          testID="inventory-create-ingredient"
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
          style={[styles.button, (!itemIngredientId || !itemUnit || status.loading || isOffline) && styles.buttonDisabled]}
          disabled={!itemIngredientId || !itemUnit || status.loading || isOffline}
          onPress={async () => {
            await onCreateItem(itemIngredientId.trim(), itemUnit.trim(), itemPreferredUnit.trim() || undefined)
            setItemIngredientId('')
            setItemUnit('oz')
            setItemPreferredUnit('')
          }}
          testID="inventory-create-item"
        >
          <Text style={styles.buttonText}>Create Item</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.refreshButton, status.loading || isOffline ? styles.buttonDisabled : null]}
        disabled={status.loading || isOffline}
        onPress={onRefresh}
        testID="inventory-refresh"
      >
        <Text style={styles.refreshText}>Refresh Inventory</Text>
      </Pressable>
      {isOffline ? <Text style={styles.meta}>Inventory write actions are disabled while offline.</Text> : null}

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

function SummaryChip({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <View style={[styles.summaryChip, muted ? styles.summaryChipMuted : null]}>
      <Text style={styles.summaryChipLabel}>{label}</Text>
      <Text style={[styles.summaryChipValue, muted ? styles.summaryChipValueMuted : null]}>{value}</Text>
    </View>
  )
}

function statusStyle(status: string) {
  if (status === 'ready') return styles.statusReady
  if (status === 'duplicate') return styles.statusDuplicate
  if (status === 'skipped') return styles.statusSkipped
  return styles.statusPartial
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
  multilineInput: {
    minHeight: 132,
  },
  button: ui.primaryButton,
  secondaryButton: ui.secondaryButton,
  buttonDisabled: ui.buttonDisabled,
  buttonText: ui.primaryButtonText,
  secondaryButtonText: ui.secondaryButtonText,
  inlineActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
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
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  successText: {
    color: colors.success,
    fontSize: 13,
  },
  noteText: {
    color: '#facc15',
    fontSize: 12,
  },
  previewSection: {
    marginTop: 14,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 78,
  },
  summaryChipMuted: {
    opacity: 0.65,
  },
  summaryChipLabel: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryChipValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  summaryChipValueMuted: {
    color: colors.textMuted,
  },
  previewCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.bgElevated,
    gap: 4,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  previewTitle: {
    color: colors.text,
    fontWeight: '700',
    flex: 1,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusReady: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  statusPartial: {
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  statusDuplicate: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  statusSkipped: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  statusPillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
})
