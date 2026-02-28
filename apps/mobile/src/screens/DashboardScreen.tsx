import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, ui } from '../theme'

type DashboardScreenProps = {
  onGoInventory: () => void
  onGoRecipes: () => void
  onGoStudio: () => void
  onGoKnowledge: () => void
  onGoRecommendations: () => void
  recentSessions: Array<{ id: string; status: string }>
  onOpenSession: (sessionId: string) => void
}

export function DashboardScreen({
  onGoInventory,
  onGoRecipes,
  onGoStudio,
  onGoKnowledge,
  onGoRecommendations,
  recentSessions,
  onOpenSession,
}: DashboardScreenProps) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>BartenderAI</Text>
      <Text style={styles.subtitle}>Command center for inventory, recipes, and studio flows.</Text>
      <View style={styles.buttonGrid}>
        <Pressable style={styles.tile} onPress={onGoInventory}>
          <Text style={styles.tileTitle}>Inventory</Text>
        </Pressable>
        <Pressable style={styles.tile} onPress={onGoRecipes}>
          <Text style={styles.tileTitle}>Recipes</Text>
        </Pressable>
        <Pressable style={styles.tile} onPress={onGoStudio}>
          <Text style={styles.tileTitle}>Studio</Text>
        </Pressable>
        <Pressable style={styles.tile} onPress={onGoKnowledge}>
          <Text style={styles.tileTitle}>Knowledge</Text>
        </Pressable>
        <Pressable style={styles.tile} onPress={onGoRecommendations}>
          <Text style={styles.tileTitle}>Recommendations</Text>
        </Pressable>
      </View>
      <Text style={styles.sectionTitle}>Recent Studio Sessions</Text>
      {recentSessions.length === 0 ? (
        <Text style={styles.muted}>No sessions opened yet.</Text>
      ) : (
        recentSessions.map((session) => (
          <Pressable key={session.id} style={styles.sessionCard} onPress={() => onOpenSession(session.id)}>
            <Text style={styles.sessionId}>{session.id}</Text>
            <Text style={styles.sessionStatus}>{session.status}</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: ui.screen,
  content: {
    ...ui.content,
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: 8,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '47%',
    minHeight: 72,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  tileTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  sectionTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  muted: {
    color: colors.textMuted,
  },
  sessionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: colors.card,
    marginBottom: 8,
  },
  sessionId: {
    fontWeight: '700',
    color: colors.text,
  },
  sessionStatus: {
    color: colors.textSecondary,
    marginTop: 4,
  },
})
