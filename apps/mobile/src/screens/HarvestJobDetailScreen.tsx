import { useEffect, useMemo, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'

import type { AppController } from '../app/useAppController'
import type { HarvestJob } from '../types'
import { colors, ui } from '../theme'
import { SectionStateCard } from '../components/SectionStateCard'
import type { RootStackParamList } from '../navigation/RootNavigator'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

function findJob(jobs: HarvestJob[], id: string): HarvestJob | null {
  return jobs.find((job) => job.id === id) ?? null
}

function isRetryDeferred(nextRetryAt?: string | null): boolean {
  if (!nextRetryAt) return false
  const retryAt = Date.parse(nextRetryAt)
  return Number.isFinite(retryAt) && retryAt > Date.now()
}

export function HarvestJobDetailScreen({
  controller,
  jobId,
}: {
  controller: AppController
  jobId: string
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const job = findJob(controller.harvestJobs, jobId)
  const status = controller.sectionStatus.harvest
  const offline = status.error.toLowerCase().includes('offline')
  const retryDeferred = isRetryDeferred(job?.next_retry_at)
  const canRun = Boolean(job && (job.status === 'pending' || job.status === 'failed'))
  const didRequestJobs = useRef(false)

  useEffect(() => {
    if (job) return
    if (status.loading) return
    if (didRequestJobs.current) return
    didRequestJobs.current = true
    void controller.loadHarvestJobs()
  }, [controller.loadHarvestJobs, job, status.loading])

  const runDisabledReason = useMemo(() => {
    if (!job) return ''
    if (offline) return 'Actions are disabled while offline.'
    if (status.loading) return 'Actions are locked while harvest state is refreshing.'
    if (!canRun) return `Job is not runnable (status: ${job.status}).`
    if (retryDeferred) return `Retry is deferred until ${job.next_retry_at}.`
    return ''
  }, [canRun, job, offline, retryDeferred, status.loading])

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
          onPress={() => navigation.navigate('HarvestHub')}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Open Harvest</Text>
        </Pressable>
      </View>

      <Text style={styles.header}>Harvest Job</Text>

      {!job ? (
        <SectionStateCard
          mode="error"
          title="Job not found"
          message="This harvest job is not in the current list. Refresh harvest jobs and try again."
          actionLabel="Refresh Jobs"
          onAction={() => void controller.loadHarvestJobs()}
          disabled={status.loading}
        />
      ) : null}

      {offline ? (
        <SectionStateCard
          mode="error"
          title="Offline Mode"
          message={OFFLINE_MESSAGE}
          actionLabel="Retry Sync"
          onAction={() => void controller.loadHarvestJobs()}
          disabled={status.loading}
        />
      ) : null}

      {job ? (
        <View style={styles.card}>
          <Text style={styles.label}>Source</Text>
          <Text style={styles.value}>{job.source_url}</Text>
          <Text style={styles.meta}>
            status {job.status} · attempts {job.attempt_count ?? 0}
            {job.parse_strategy ? ` · ${job.parse_strategy}` : ''}
          </Text>

          {job.compliance_reasons?.length ? (
            <Text style={styles.errorText}>Compliance: {job.compliance_reasons.join(', ')}</Text>
          ) : null}
          {job.error ? <Text style={styles.errorText}>{job.error}</Text> : null}

          {retryDeferred ? (
            <Text style={styles.meta}>Retry deferred until {job.next_retry_at}</Text>
          ) : null}

          <View style={styles.row}>
            <Pressable
              style={[
                styles.button,
                (offline || retryDeferred || status.loading || !canRun) &&
                  styles.buttonDisabled,
              ]}
              disabled={
                offline || retryDeferred || status.loading || !canRun
              }
              onPress={() => void controller.runHarvestJob(job.id)}
            >
              <Text style={styles.buttonText}>{retryDeferred ? 'Queued Retry' : 'Run Job'}</Text>
            </Pressable>
            <Pressable
              style={[styles.ghostButton, status.loading ? styles.buttonDisabled : null]}
              disabled={status.loading}
              onPress={() => void controller.loadHarvestJobs()}
            >
              <Text style={styles.ghostText}>Refresh</Text>
            </Pressable>
          </View>

          {runDisabledReason ? <Text style={styles.meta}>{runDisabledReason}</Text> : null}
        </View>
      ) : null}
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
  header: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  card: ui.card,
  label: ui.label,
  value: {
    color: colors.text,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
  },
  errorText: {
    color: '#fecaca',
  },
  row: ui.row,
  button: ui.primaryButton,
  buttonText: ui.primaryButtonText,
  ghostButton: ui.secondaryButton,
  ghostText: ui.secondaryButtonText,
  buttonDisabled: ui.buttonDisabled,
})
