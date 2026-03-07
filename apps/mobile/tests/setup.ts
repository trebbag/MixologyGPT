import '@testing-library/jest-native/extend-expect'

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

jest.mock('@expo/vector-icons', () => {
  const React = require('react')
  const { Text } = require('react-native')

  const MockIcon = ({ name, children, ...rest }: any) =>
    React.createElement(Text, { ...rest }, children ?? name ?? 'icon')

  return {
    Feather: MockIcon,
    MaterialCommunityIcons: MockIcon,
  }
})

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}))

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(async () => ''),
  getInfoAsync: jest.fn(async () => ({ exists: false, isDirectory: false })),
  downloadAsync: jest.fn(async (uri: string) => ({ uri })),
  EncodingType: { UTF8: 'utf8' },
  cacheDirectory: 'file:///tmp/',
  documentDirectory: 'file:///tmp/',
}))
