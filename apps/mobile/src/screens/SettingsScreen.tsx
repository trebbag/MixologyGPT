import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { SectionStateCard } from '../components/SectionStateCard'
import { colors, ui } from '../theme'
import type { SectionState } from '../types'
const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

type SettingsScreenProps = {
  status: SectionState
  mfaSecret: string
  mfaStatus: string
  onSetupMfa: () => Promise<void>
  onEnableMfa: (otp: string) => Promise<void>
  onDisableMfa: (otp: string) => Promise<void>
}

export function SettingsScreen({
  status,
  mfaSecret,
  mfaStatus,
  onSetupMfa,
  onEnableMfa,
  onDisableMfa,
}: SettingsScreenProps) {
  const [otp, setOtp] = useState('')
  const isOffline = status.error.toLowerCase().includes('offline')

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Settings</Text>
      {isOffline ? (
        <SectionStateCard mode="error" title="Offline Mode" message={OFFLINE_MESSAGE} />
      ) : null}
      {status.loading && <SectionStateCard mode="loading" title="Loading settings" message="Syncing account settings." />}
      {status.error ? (
        <SectionStateCard mode="error" title="Settings error" message={status.error} />
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>MFA</Text>
        <Pressable style={[styles.button, status.loading ? styles.buttonDisabled : null]} disabled={status.loading} onPress={onSetupMfa}>
          <Text style={styles.buttonText}>Generate Secret</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="OTP token"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
        />
        <View style={styles.row}>
          <Pressable
            style={[styles.button, (!otp || status.loading) && styles.buttonDisabled]}
            disabled={!otp || status.loading}
            onPress={() => onEnableMfa(otp)}
          >
            <Text style={styles.buttonText}>Enable</Text>
          </Pressable>
          <Pressable
            style={[styles.button, (!otp || status.loading) && styles.buttonDisabled]}
            disabled={!otp || status.loading}
            onPress={() => onDisableMfa(otp)}
          >
            <Text style={styles.buttonText}>Disable</Text>
          </Pressable>
        </View>
        {mfaSecret ? <Text style={styles.meta}>Secret: {mfaSecret}</Text> : null}
        {mfaStatus ? <Text style={styles.meta}>Status: {mfaStatus}</Text> : null}
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
  row: ui.row,
  button: ui.primaryButton,
  buttonDisabled: ui.buttonDisabled,
  buttonText: ui.primaryButtonText,
  meta: {
    color: colors.textSecondary,
  },
})
