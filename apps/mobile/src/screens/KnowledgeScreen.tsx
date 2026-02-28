import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { SectionStateCard } from '../components/SectionStateCard'
import { colors, ui } from '../theme'
import type { SectionState } from '../types'
const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

type KnowledgeScreenProps = {
  status: SectionState
  results: Array<{ id: string; title?: string; source_url?: string; score?: number }>
  onSearch: (query: string) => Promise<void>
}

export function KnowledgeScreen({ status, results, onSearch }: KnowledgeScreenProps) {
  const [query, setQuery] = useState('')
  const isOffline = status.error.toLowerCase().includes('offline')

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Knowledge</Text>
      {isOffline ? (
        <SectionStateCard
          mode="error"
          title="Offline Mode"
          message={OFFLINE_MESSAGE}
          actionLabel="Retry Search"
          onAction={() => {
            if (query.trim()) {
              void onSearch(query.trim())
            }
          }}
          disabled={!query.trim()}
        />
      ) : null}
      {status.loading && <SectionStateCard mode="loading" title="Searching" message="Looking up knowledge references." />}
      {status.error && !isOffline ? (
        <SectionStateCard
          mode="error"
          title="Search error"
          message={status.error}
          actionLabel="Retry"
          onAction={() => {
            if (query.trim()) {
              void onSearch(query.trim())
            }
          }}
          disabled={!query.trim()}
        />
      ) : null}
      {!status.loading && !status.error && results.length === 0 ? (
        <SectionStateCard mode="empty" title="No results" message="Search recipe knowledge to see supporting references." />
      ) : null}

      <View style={styles.card}>
        <TextInput style={styles.input} placeholder="Search query" value={query} onChangeText={setQuery} />
        <Pressable
          style={[styles.button, (!query || status.loading || isOffline) && styles.buttonDisabled]}
          disabled={!query || status.loading || isOffline}
          onPress={() => onSearch(query.trim())}
          testID="knowledge-search-submit"
        >
          <Text style={styles.buttonText}>Search</Text>
        </Pressable>
        {isOffline ? <Text style={styles.resultMeta}>Knowledge search is disabled while offline.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Results ({results.length})</Text>
        {results.map((result) => (
          <View key={result.id} style={styles.resultRow}>
            <Text style={styles.resultTitle}>{result.title || 'Untitled document'}</Text>
            <Text style={styles.resultMeta}>{result.source_url || 'No source URL'}</Text>
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
  resultRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  resultTitle: {
    fontWeight: '700',
    color: colors.text,
  },
  resultMeta: {
    color: colors.textMuted,
  },
})
