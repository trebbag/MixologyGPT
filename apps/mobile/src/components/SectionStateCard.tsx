import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'

type SectionStateCardProps = {
  mode: 'loading' | 'error' | 'empty'
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
  disabled?: boolean
}

export function SectionStateCard({
  mode,
  title,
  message,
  actionLabel,
  onAction,
  disabled = false,
}: SectionStateCardProps) {
  return (
    <View style={[styles.card, mode === 'error' ? styles.error : mode === 'empty' ? styles.empty : styles.loading]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Text
          accessibilityRole="button"
          onPress={disabled ? undefined : onAction}
          style={[styles.action, disabled ? styles.actionDisabled : null]}
        >
          {actionLabel}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 6,
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  loading: {
    backgroundColor: 'rgba(14, 116, 144, 0.2)',
    borderColor: 'rgba(125, 211, 252, 0.55)',
  },
  error: {
    backgroundColor: 'rgba(127, 29, 29, 0.3)',
    borderColor: 'rgba(248, 113, 113, 0.5)',
  },
  empty: {
    backgroundColor: 'rgba(30, 41, 59, 0.45)',
    borderColor: 'rgba(196, 200, 222, 0.45)',
  },
  title: {
    fontWeight: '700',
    fontSize: 15,
    color: colors.text,
  },
  message: {
    color: colors.textSecondary,
  },
  action: {
    marginTop: 4,
    alignSelf: 'flex-start',
    color: '#c4b5fd',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  actionDisabled: {
    opacity: 0.45,
  },
})
