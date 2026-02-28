import { StyleSheet } from 'react-native'

export const colors = {
  bg: '#0f172a',
  bgElevated: 'rgba(15, 23, 42, 0.86)',
  card: 'rgba(9, 13, 28, 0.7)',
  cardSoft: 'rgba(255, 255, 255, 0.05)',
  border: 'rgba(255, 255, 255, 0.15)',
  text: '#f8f9ff',
  textSecondary: '#c4c8de',
  textMuted: '#9aa0c2',
  primary: '#a855f7',
  primaryDark: '#9333ea',
  accent: '#ec4899',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
}

export const ui = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.card,
    padding: 12,
    gap: 8,
    marginBottom: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.cardSoft,
    color: colors.text,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.primary,
    alignSelf: 'flex-start',
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.cardSoft,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontWeight: '700',
    color: '#ffffff',
  },
  secondaryButtonText: {
    fontWeight: '700',
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  muted: {
    color: colors.textMuted,
  },
})
