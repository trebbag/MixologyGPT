import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { SectionStateCard } from '../components/SectionStateCard'
import { colors, ui } from '../theme'
import type {
  SectionState,
  StudioDiffResult,
  StudioGuidedStep,
  StudioSession,
  StudioVersion,
} from '../types'
const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

type StudioScreenProps = {
  sessionsStatus: SectionState
  versionsStatus: SectionState
  assistantStatus: SectionState
  sessions: StudioSession[]
  activeSessionId: string
  versions: StudioVersion[]
  diffResult: StudioDiffResult | null
  guidedSteps: StudioGuidedStep[]
  copilotQuestions: string[]
  copilotFollowup: string
  onRefreshSessions: () => Promise<void>
  onCreateSession: () => Promise<string | null>
  onOpenSession: (sessionId: string) => Promise<void>
  onCreateConstraint: (payload: {
    sessionId: string
    includeIngredients: string[]
    excludeIngredients: string[]
    style?: string
    abvTarget?: number
  }) => Promise<void>
  onGenerate: (sessionId: string) => Promise<void>
  onLoadDiff: (payload: { sessionId: string; fromVersionId: string; toVersionId: string }) => Promise<void>
  onRevert: (payload: { sessionId: string; versionId: string }) => Promise<void>
  onLoadGuided: (sessionId: string) => Promise<void>
  onLoadCopilotQuestions: (sessionId: string) => Promise<void>
  onSubmitCopilotAnswer: (payload: { sessionId: string; answer: string }) => Promise<void>
}

export function StudioScreen({
  sessionsStatus,
  versionsStatus,
  assistantStatus,
  sessions,
  activeSessionId,
  versions,
  diffResult,
  guidedSteps,
  copilotQuestions,
  copilotFollowup,
  onRefreshSessions,
  onCreateSession,
  onOpenSession,
  onCreateConstraint,
  onGenerate,
  onLoadDiff,
  onRevert,
  onLoadGuided,
  onLoadCopilotQuestions,
  onSubmitCopilotAnswer,
}: StudioScreenProps) {
  const placeholderColor = colors.textMuted
  const [sessionInput, setSessionInput] = useState(activeSessionId)
  const [includeIngredients, setIncludeIngredients] = useState('')
  const [excludeIngredients, setExcludeIngredients] = useState('')
  const [style, setStyle] = useState('')
  const [abvTarget, setAbvTarget] = useState('')
  const [fromVersionId, setFromVersionId] = useState('')
  const [toVersionId, setToVersionId] = useState('')
  const [revertVersionId, setRevertVersionId] = useState('')
  const [copilotAnswer, setCopilotAnswer] = useState('')
  const offlineError = [sessionsStatus.error, versionsStatus.error, assistantStatus.error].find((message) =>
    message.toLowerCase().includes('offline'),
  )
  const isOffline = Boolean(offlineError)

  useEffect(() => {
    setSessionInput(activeSessionId)
  }, [activeSessionId])

  const latestVersion = useMemo(() => versions[versions.length - 1], [versions])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Studio</Text>
      {offlineError ? (
        <SectionStateCard
          mode="error"
          title="Offline Mode"
          message={OFFLINE_MESSAGE}
          actionLabel="Retry Sessions"
          onAction={() => {
            void onRefreshSessions()
          }}
        />
      ) : null}
      {sessionsStatus.loading ? (
        <SectionStateCard mode="loading" title="Loading sessions" message="Syncing studio sessions." />
      ) : null}
      {sessionsStatus.error && !isOffline ? (
        <SectionStateCard
          mode="error"
          title="Session error"
          message={sessionsStatus.error}
          actionLabel="Retry"
          onAction={() => {
            void onRefreshSessions()
          }}
        />
      ) : null}
      {!sessionsStatus.loading && !sessionsStatus.error && sessions.length === 0 ? (
        <SectionStateCard mode="empty" title="No sessions yet" message="Create a session to begin recipe generation." />
      ) : null}
      {versionsStatus.loading ? (
        <SectionStateCard mode="loading" title="Loading versions" message="Updating generated versions and diffs." />
      ) : null}
      {versionsStatus.error && !isOffline ? (
        <SectionStateCard
          mode="error"
          title="Version error"
          message={versionsStatus.error}
          actionLabel="Reload Session Versions"
          onAction={() => {
            if (sessionInput) {
              void onOpenSession(sessionInput)
            }
          }}
          disabled={!sessionInput}
        />
      ) : null}
      {assistantStatus.loading ? (
        <SectionStateCard mode="loading" title="Loading assistant" message="Fetching copilot questions and guided steps." />
      ) : null}
      {assistantStatus.error && !isOffline ? (
        <SectionStateCard
          mode="error"
          title="Assistant error"
          message={assistantStatus.error}
          actionLabel="Reload Assistant"
          onAction={() => {
            if (sessionInput) {
              void onLoadCopilotQuestions(sessionInput)
            }
          }}
          disabled={!sessionInput}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Sessions</Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.button, (sessionsStatus.loading || isOffline) && styles.buttonDisabled]}
            disabled={sessionsStatus.loading || isOffline}
            onPress={async () => {
              const created = await onCreateSession()
              if (created) {
                setSessionInput(created)
              }
            }}
            testID="studio-create-session"
          >
            <Text style={styles.buttonText}>Create Session</Text>
          </Pressable>
          <Pressable
            style={[styles.ghostButton, (sessionsStatus.loading || isOffline) && styles.buttonDisabled]}
            disabled={sessionsStatus.loading || isOffline}
            onPress={onRefreshSessions}
            testID="studio-refresh-sessions"
          >
            <Text style={styles.ghostText}>Refresh</Text>
          </Pressable>
        </View>
        {isOffline ? <Text style={styles.meta}>Studio session actions are disabled while offline.</Text> : null}
        {sessions.map((session) => (
          <Pressable
            key={session.id}
            style={[
              styles.sessionChip,
              activeSessionId === session.id ? styles.sessionChipActive : null,
              (sessionsStatus.loading || isOffline) ? styles.buttonDisabled : null,
            ]}
            disabled={sessionsStatus.loading || isOffline}
            onPress={async () => {
              setSessionInput(session.id)
              await onOpenSession(session.id)
            }}
          >
            <Text style={styles.sessionId}>{session.id}</Text>
            <Text style={styles.sessionStatus}>{session.status}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Constraints</Text>
        {!sessionInput ? (
          <Text style={styles.meta}>Select or create a session to enable constraints and generation.</Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Session ID"
          placeholderTextColor={placeholderColor}
          value={sessionInput}
          onChangeText={setSessionInput}
        />
        <TextInput
          style={styles.input}
          placeholder="Include ingredients (comma-separated)"
          placeholderTextColor={placeholderColor}
          value={includeIngredients}
          onChangeText={setIncludeIngredients}
        />
        <TextInput
          style={styles.input}
          placeholder="Exclude ingredients (comma-separated)"
          placeholderTextColor={placeholderColor}
          value={excludeIngredients}
          onChangeText={setExcludeIngredients}
        />
        <TextInput
          style={styles.input}
          placeholder="Style (optional)"
          placeholderTextColor={placeholderColor}
          value={style}
          onChangeText={setStyle}
        />
        <TextInput
          style={styles.input}
          placeholder="ABV target (optional)"
          placeholderTextColor={placeholderColor}
          keyboardType="decimal-pad"
          value={abvTarget}
          onChangeText={setAbvTarget}
        />
        <View style={styles.row}>
          <Pressable
            style={[styles.button, (!sessionInput || versionsStatus.loading || isOffline) && styles.buttonDisabled]}
            disabled={!sessionInput || versionsStatus.loading || isOffline}
            onPress={async () => {
              await onCreateConstraint({
                sessionId: sessionInput,
                includeIngredients: includeIngredients
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
                excludeIngredients: excludeIngredients
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
                style: style || undefined,
                abvTarget: abvTarget ? Number(abvTarget) : undefined,
              })
            }}
          >
            <Text style={styles.buttonText}>Save Constraint</Text>
          </Pressable>
          <Pressable
            style={[styles.button, (!sessionInput || versionsStatus.loading || isOffline) && styles.buttonDisabled]}
            disabled={!sessionInput || versionsStatus.loading || isOffline}
            onPress={async () => {
              await onGenerate(sessionInput)
            }}
          >
            <Text style={styles.buttonText}>Generate</Text>
          </Pressable>
        </View>
        {isOffline ? <Text style={styles.meta}>Constraint and generation actions are disabled while offline.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Version Diff + Revert</Text>
        {!sessionInput ? (
          <Text style={styles.meta}>Select a session to compare and revert versions.</Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="From version id"
          placeholderTextColor={placeholderColor}
          value={fromVersionId}
          onChangeText={setFromVersionId}
        />
        <TextInput
          style={styles.input}
          placeholder="To version id"
          placeholderTextColor={placeholderColor}
          value={toVersionId}
          onChangeText={setToVersionId}
        />
        <Pressable
          style={[
            styles.button,
            (!sessionInput || !fromVersionId || !toVersionId || versionsStatus.loading || isOffline) && styles.buttonDisabled,
          ]}
          disabled={!sessionInput || !fromVersionId || !toVersionId || versionsStatus.loading || isOffline}
          onPress={() =>
            onLoadDiff({
              sessionId: sessionInput,
              fromVersionId: fromVersionId.trim(),
              toVersionId: toVersionId.trim(),
            })
          }
        >
          <Text style={styles.buttonText}>Load Diff</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Version id to revert"
          placeholderTextColor={placeholderColor}
          value={revertVersionId}
          onChangeText={setRevertVersionId}
        />
        <Pressable
          style={[styles.ghostButton, (!sessionInput || !revertVersionId || versionsStatus.loading || isOffline) && styles.buttonDisabled]}
          disabled={!sessionInput || !revertVersionId || versionsStatus.loading || isOffline}
          onPress={() => onRevert({ sessionId: sessionInput, versionId: revertVersionId.trim() })}
        >
          <Text style={styles.ghostText}>Revert Version</Text>
        </Pressable>
        {isOffline ? <Text style={styles.meta}>Diff and revert actions are disabled while offline.</Text> : null}
        {diffResult ? (
          <Text style={styles.meta}>
            Diff loaded: {diffResult.from_version_id} {'->'} {diffResult.to_version_id}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Copilot + Guided</Text>
        {!sessionInput ? <Text style={styles.meta}>Select a session to load copilot prompts and guided steps.</Text> : null}
        <View style={styles.row}>
          <Pressable
            style={[styles.button, (!sessionInput || assistantStatus.loading || isOffline) && styles.buttonDisabled]}
            disabled={!sessionInput || assistantStatus.loading || isOffline}
            onPress={() => onLoadCopilotQuestions(sessionInput)}
          >
            <Text style={styles.buttonText}>Load Questions</Text>
          </Pressable>
          <Pressable
            style={[styles.ghostButton, (!sessionInput || assistantStatus.loading || isOffline) && styles.buttonDisabled]}
            disabled={!sessionInput || assistantStatus.loading || isOffline}
            onPress={() => onLoadGuided(sessionInput)}
          >
            <Text style={styles.ghostText}>Load Guided Steps</Text>
          </Pressable>
        </View>
        {copilotQuestions.length > 0
          ? copilotQuestions.map((question, index) => (
              <Text key={`question-${index}`} style={styles.meta}>
                Q{index + 1}: {question}
              </Text>
            ))
          : !assistantStatus.loading && sessionInput
            ? <Text style={styles.meta}>No copilot questions loaded yet.</Text>
            : null}
        <TextInput
          style={styles.input}
          placeholder="Copilot answer"
          placeholderTextColor={placeholderColor}
          value={copilotAnswer}
          onChangeText={setCopilotAnswer}
        />
        <Pressable
          style={[
            styles.button,
            (!sessionInput || !copilotAnswer || assistantStatus.loading || isOffline) && styles.buttonDisabled,
          ]}
          disabled={!sessionInput || !copilotAnswer || assistantStatus.loading || isOffline}
          onPress={async () => {
            await onSubmitCopilotAnswer({ sessionId: sessionInput, answer: copilotAnswer.trim() })
            setCopilotAnswer('')
          }}
        >
          <Text style={styles.buttonText}>Submit Answer</Text>
        </Pressable>
        {isOffline ? <Text style={styles.meta}>Assistant actions are disabled while offline.</Text> : null}
        {copilotFollowup ? <Text style={styles.meta}>Follow-up: {copilotFollowup}</Text> : null}
        {guidedSteps.length > 0 ? (
          <View style={styles.guidedList}>
            {guidedSteps.map((step, index) => (
              <Text key={`step-${index}`} style={styles.meta}>
                {index + 1}. {step.label} ({step.seconds}s)
              </Text>
            ))}
          </View>
        ) : !assistantStatus.loading && sessionInput ? (
          <Text style={styles.meta}>No guided steps loaded yet.</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Versions ({versions.length})</Text>
        {!versionsStatus.loading && sessionInput && versions.length === 0 ? (
          <SectionStateCard mode="empty" title="No versions yet" message="Generate a version to populate this list." />
        ) : null}
        {versions.map((version) => (
          <View key={version.id} style={styles.versionRow}>
            <Text style={styles.versionTitle}>v{version.version_number}</Text>
            <Text style={styles.versionText}>{version.recipe_snapshot?.canonical_name ?? 'Draft snapshot'}</Text>
          </View>
        ))}
        {latestVersion ? (
          <Text style={styles.meta}>
            Latest version: v{latestVersion.version_number} ({latestVersion.id})
          </Text>
        ) : null}
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
  row: {
    ...ui.row,
    alignItems: 'stretch',
  },
  button: ui.primaryButton,
  buttonDisabled: ui.buttonDisabled,
  buttonText: ui.primaryButtonText,
  ghostButton: {
    ...ui.secondaryButton,
    alignSelf: 'stretch',
  },
  ghostText: ui.secondaryButtonText,
  sessionChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 8,
    backgroundColor: colors.cardSoft,
  },
  sessionChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
  },
  sessionId: {
    fontWeight: '700',
    color: colors.text,
  },
  sessionStatus: {
    color: colors.textSecondary,
  },
  versionRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  versionTitle: {
    fontWeight: '700',
    color: colors.text,
  },
  versionText: {
    color: colors.textSecondary,
  },
  guidedList: {
    gap: 3,
  },
  meta: ui.muted,
})
