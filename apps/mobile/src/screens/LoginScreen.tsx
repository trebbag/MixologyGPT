import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { colors, ui } from '../theme'

type LoginScreenProps = {
  loading: boolean
  error: string
  onSubmit: (payload: { email: string; password: string; mfaToken?: string }) => Promise<void>
}

export function LoginScreen({ loading, error, onSubmit }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaToken, setMfaToken] = useState('')

  const isDisabled = loading || !email.trim() || !password

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.screen}
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>BartenderAI</Text>
        <Text style={styles.title}>Sign in to your bar workspace.</Text>
        <Text style={styles.subtitle}>
          Use your account credentials. Add MFA only if your account requires it.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          testID="login-email-input"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          testID="login-password-input"
        />

        <Text style={styles.label}>MFA Token (optional)</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          placeholder="123456"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={mfaToken}
          onChangeText={setMfaToken}
          testID="login-mfa-input"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, isDisabled ? styles.buttonDisabled : null]}
          disabled={isDisabled}
          onPress={() => void onSubmit({ email: email.trim(), password, mfaToken: mfaToken.trim() || undefined })}
          testID="login-submit"
        >
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 20,
    gap: 18,
  },
  hero: {
    gap: 8,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  card: {
    ...ui.card,
    padding: 16,
    gap: 12,
  },
  label: {
    ...ui.label,
    fontSize: 14,
  },
  input: ui.input,
  error: {
    color: '#fecaca',
    fontSize: 14,
  },
  button: {
    ...ui.primaryButton,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: ui.buttonDisabled,
  buttonText: ui.primaryButtonText,
})
