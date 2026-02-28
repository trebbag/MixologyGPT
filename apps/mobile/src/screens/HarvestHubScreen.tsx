import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import type { AppController } from '../app/useAppController'
import type { HarvestJob } from '../types'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { colors, ui } from '../theme'
import { SectionStateCard } from '../components/SectionStateCard'

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

const PARSE_FAILURE_HINTS: Record<string, string> = {
  timeout: 'Fetch timed out. Reduce crawl volume for this domain or increase timeout.',
  'connect-error': 'Connection failed. Verify domain availability and DNS.',
  'network-error': 'Network error while fetching. Verify connectivity or domain blocks.',
  'http-403': 'Blocked (403). Confirm robots/paywall/compliance settings before retrying.',
  'http-429': 'Rate limited (429). Reduce crawl rate and honor Retry-After before retrying.',
  'domain-selector-mismatch': 'Source selectors drifted. Review parser selectors for this domain.',
  'domain-ingredients-sparse': 'Ingredient extraction is sparse. Validate ingredient selectors and headings.',
  'domain-instructions-sparse': 'Instruction extraction is sparse. Validate instruction selectors and headings.',
  'instruction-structure-mismatch': 'Instruction blocks are missing expected structure on this page.',
  'jsonld-parse-failed': 'JSON-LD parser failed. Prefer DOM selectors for this domain.',
  'microdata-parse-failed': 'Microdata parser failed. Prefer JSON-LD or DOM selectors for this domain.',
  'low-confidence-parse': 'Low extraction confidence. Review source quality and parser settings.',
}

function parseFailureClass(job: HarvestJob): string {
  const strategy = (job.parse_strategy || '').trim()
  if (strategy.startsWith('parse_failed:')) {
    return strategy.replace('parse_failed:', '').split('@', 1)[0]
  }
  if (strategy.startsWith('fetch_failed:')) {
    return strategy.replace('fetch_failed:', '').split('@', 1)[0]
  }
  if (strategy.startsWith('dom_fallback:')) {
    return strategy.replace('dom_fallback:', '').split('@', 1)[0]
  }
  if (strategy.startsWith('recovery:')) {
    return strategy.replace('recovery:', '').split(':', 1)[0]
  }
  if ((job.error || '').includes('low-confidence-parse')) {
    return 'low-confidence-parse'
  }
  return ''
}

function isRetryDeferred(nextRetryAt?: string | null): boolean {
  if (!nextRetryAt) return false
  const retryAt = Date.parse(nextRetryAt)
  return Number.isFinite(retryAt) && retryAt > Date.now()
}

export function HarvestHubScreen({ controller }: { controller: AppController }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const status = controller.sectionStatus.harvest
  const offline = status.error.toLowerCase().includes('offline')

  const [sourceUrl, setSourceUrl] = useState('')
  const [maxLinks, setMaxLinks] = useState('12')
  const didInitialLoad = useRef(false)

  useEffect(() => {
    if (didInitialLoad.current) return
    didInitialLoad.current = true
    if (controller.harvestJobs.length) return
    void controller.loadHarvestJobs()
  }, [controller.harvestJobs.length, controller.loadHarvestJobs])

  const runnableJobs = useMemo(() => {
    return controller.harvestJobs.filter((job) => {
      if (!(job.status === 'pending' || job.status === 'failed')) return false
      return !isRetryDeferred(job.next_retry_at)
    })
  }, [controller.harvestJobs])

  const submitDisabledReason = (() => {
    if (offline) return 'Harvest is disabled while offline.'
    if (status.loading) return 'Harvest is locked while crawler state is refreshing.'
    if (!sourceUrl.trim()) return 'Paste a recipe or listing URL to continue.'
    return ''
  })()
  const startImportDisabled = offline || status.loading || Boolean(submitDisabledReason)
  const retryReadyDisabled = offline || status.loading || runnableJobs.length === 0

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable
          style={styles.ghostButton}
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack()
            else navigation.navigate('Tabs')
          }}
          testID="harvest-back"
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.ghostButton, status.loading ? styles.buttonDisabled : null]}
          disabled={status.loading}
          onPress={() => void controller.loadHarvestJobs()}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Refresh</Text>
        </Pressable>
      </View>

      <Text style={styles.header}>Import From Web</Text>
      <Text style={styles.subtitle}>
        Paste a URL from an approved source. If the page fails compliance checks, the job will surface the exact reasons.
      </Text>

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

      {status.loading ? (
        <SectionStateCard mode="loading" title="Harvest running" message="Refreshing crawler and job status." />
      ) : null}

      {status.error && !offline ? (
        <SectionStateCard
          mode="error"
          title="Harvest error"
          message={status.error}
          actionLabel="Retry"
          onAction={() => void controller.loadHarvestJobs()}
          disabled={status.loading}
        />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Source URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://example.com/recipe"
          value={sourceUrl}
          onChangeText={setSourceUrl}
          autoCapitalize="none"
        />
        <Text style={styles.label}>Max links</Text>
        <TextInput
          style={styles.input}
          placeholder="12"
          keyboardType="number-pad"
          value={maxLinks}
          onChangeText={setMaxLinks}
        />
        <View style={styles.row}>
        <Pressable
          style={[
            styles.button,
            startImportDisabled ? styles.buttonDisabled : null,
          ]}
          disabled={startImportDisabled}
          accessibilityState={{ disabled: startImportDisabled }}
          onPress={() => void controller.autoHarvest(sourceUrl.trim(), Number(maxLinks) || 12)}
          testID="harvest-start-import"
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Start Import</Text>
        </Pressable>
        <Pressable
          style={[
            styles.ghostButton,
            retryReadyDisabled ? styles.buttonDisabled : null,
          ]}
          disabled={retryReadyDisabled}
          accessibilityState={{ disabled: retryReadyDisabled }}
          onPress={async () => {
            for (const job of runnableJobs) {
              await controller.runHarvestJob(job.id)
            }
          }}
          testID="harvest-retry-ready"
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Retry Ready Jobs</Text>
        </Pressable>
      </View>
        {controller.autoHarvestResult ? (
          <Text style={styles.meta}>
            Parsed: {controller.autoHarvestResult.parsed_count ?? 0} · queued:{' '}
            {(controller.autoHarvestResult.queued_job_ids ?? []).length}
          </Text>
        ) : null}
        {submitDisabledReason ? <Text style={styles.meta}>{submitDisabledReason}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Jobs ({controller.harvestJobs.length})</Text>
        {!status.loading && !status.error && controller.harvestJobs.length === 0 ? (
          <SectionStateCard
            mode="empty"
            title="No jobs yet"
            message="Start an import to queue crawl jobs. Approved domains will be accepted; others will be blocked."
          />
        ) : null}
        {controller.harvestJobs.map((job) => {
          const retryDeferred = isRetryDeferred(job.next_retry_at)
          const canRun = job.status === 'pending' || job.status === 'failed'
          const failureClass = parseFailureClass(job)
          const hint = PARSE_FAILURE_HINTS[failureClass]
          const disabledReason = (() => {
            if (offline) return 'Run action disabled while offline.'
            if (status.loading) return 'Run action locked while harvest state is refreshing.'
            if (!canRun) return `Job is not runnable (status: ${job.status}).`
            if (retryDeferred) return `Retry is deferred until ${job.next_retry_at}.`
            return ''
          })()
          return (
            <View key={job.id} style={styles.jobRow}>
              <Text style={styles.jobTitle}>{job.source_url}</Text>
              <Text style={styles.jobMeta}>
                {job.status} · attempts {job.attempt_count ?? 0}
                {job.parse_strategy ? ` · ${job.parse_strategy}` : ''}
              </Text>
              {job.compliance_reasons?.length ? (
                <Text style={styles.errorText}>Compliance: {job.compliance_reasons.join(', ')}</Text>
              ) : null}
              {job.error ? <Text style={styles.errorText}>{job.error}</Text> : null}
              {hint ? <Text style={styles.meta}>Hint: {hint}</Text> : null}
              <View style={styles.row}>
                <Pressable
                  style={[
                    styles.inlineButton,
                    (offline || status.loading || !canRun || retryDeferred) ? styles.buttonDisabled : null,
                  ]}
                  disabled={offline || status.loading || !canRun || retryDeferred}
                  onPress={() => void controller.runHarvestJob(job.id)}
                  testID={`harvest-run-${job.id}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.inlineButtonText}>{retryDeferred ? 'Queued Retry' : 'Run'}</Text>
                </Pressable>
                <Pressable
                  style={styles.inlineButton}
                  onPress={() => navigation.navigate('HarvestJobDetail', { jobId: job.id })}
                  testID={`harvest-details-${job.id}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.inlineButtonText}>Details</Text>
                </Pressable>
              </View>
              {disabledReason ? <Text style={styles.meta}>{disabledReason}</Text> : null}
            </View>
          )
        })}
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
  row: ui.row,
  button: ui.primaryButton,
  buttonText: ui.primaryButtonText,
  ghostButton: ui.secondaryButton,
  ghostText: ui.secondaryButtonText,
  buttonDisabled: ui.buttonDisabled,
  meta: ui.muted,
  jobRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    backgroundColor: colors.cardSoft,
  },
  jobTitle: {
    fontWeight: '800',
    color: colors.text,
  },
  jobMeta: {
    color: colors.textSecondary,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.cardSoft,
  },
  inlineButtonText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  errorText: {
    color: '#fecaca',
  },
})
