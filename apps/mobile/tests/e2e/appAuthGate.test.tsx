import { fireEvent, render } from '@testing-library/react-native'

const loginWithPassword = jest.fn(async () => undefined)

const baseController = {
  isBootstrapping: false,
  bootstrapError: '',
  isAuthenticated: false,
  authLoading: false,
  authError: '',
  currentUser: null,
  sectionStatus: {
    inventory: { loading: false, error: '' },
    recipes: { loading: false, error: '' },
    harvest: { loading: false, error: '' },
    reviews: { loading: false, error: '' },
    studio_sessions: { loading: false, error: '' },
    studio_versions: { loading: false, error: '' },
    studio_assistant: { loading: false, error: '' },
    knowledge: { loading: false, error: '' },
    recommendations: { loading: false, error: '' },
    settings: { loading: false, error: '' },
  },
  ingredients: [],
  items: [],
  recipes: [],
  harvestJobs: [],
  autoHarvestResult: null,
  moderationHistory: [],
  moderationHistoryRecipeId: '',
  studioSessions: [],
  studioVersions: [],
  studioDiff: null,
  guidedSteps: [],
  copilotQuestions: [],
  copilotFollowup: '',
  activeSessionId: '',
  recentSessions: [],
  knowledgeResults: [],
  makeNow: [],
  missingOne: [],
  tonightFlight: [],
  mfaSecret: '',
  mfaStatus: '',
  loginWithPassword,
  logout: jest.fn(async () => undefined),
  loadInventory: jest.fn(async () => undefined),
  loadRecipes: jest.fn(async () => undefined),
  loadHarvestJobs: jest.fn(async () => undefined),
  autoHarvest: jest.fn(async () => undefined),
  runHarvestJob: jest.fn(async () => undefined),
  loadModerations: jest.fn(async () => undefined),
  createRecipeModeration: jest.fn(async () => undefined),
  loadStudioSessions: jest.fn(async () => undefined),
  loadStudioVersions: jest.fn(async () => undefined),
  loadKnowledge: jest.fn(async () => undefined),
  loadRecommendations: jest.fn(async () => undefined),
  createIngredient: jest.fn(async () => undefined),
  createItem: jest.fn(async () => undefined),
  ingestRecipe: jest.fn(async () => undefined),
  fetchRecipeDetail: jest.fn(async () => ({})),
  createStudioSession: jest.fn(async () => null),
  openStudioSession: jest.fn(async () => undefined),
  createStudioConstraint: jest.fn(async () => undefined),
  generateStudio: jest.fn(async () => undefined),
  loadStudioDiff: jest.fn(async () => undefined),
  revertStudioVersion: jest.fn(async () => undefined),
  loadGuidedSteps: jest.fn(async () => undefined),
  loadCopilotQuestions: jest.fn(async () => undefined),
  followupCopilot: jest.fn(async () => undefined),
  setupMfa: jest.fn(async () => undefined),
  enableMfa: jest.fn(async () => undefined),
  disableMfa: jest.fn(async () => undefined),
}

const mockUseAppController = jest.fn(() => baseController)

jest.mock('../../src/app/useAppController', () => ({
  useAppController: () => mockUseAppController(),
}))

jest.mock('../../src/navigation/RootNavigator', () => ({
  RootNavigator: () => {
    const React = require('react')
    const { Text } = require('react-native')
    return React.createElement(Text, null, 'Root Ready')
  },
}))

import App from '../../App'

beforeEach(() => {
  loginWithPassword.mockClear()
  mockUseAppController.mockReset()
  mockUseAppController.mockReturnValue(baseController)
})

it('renders the login screen when the mobile app is unauthenticated', () => {
  const screen = render(<App />)

  expect(screen.getByText('Sign in to your bar workspace.')).toBeTruthy()
  expect(screen.queryByText('Root Ready')).toBeNull()
})

it('submits credentials from the login screen through the app auth gate', () => {
  const screen = render(<App />)

  fireEvent.changeText(screen.getByTestId('login-email-input'), 'pilot@bartender.ai')
  fireEvent.changeText(screen.getByTestId('login-password-input'), 'Secret123!')
  fireEvent.changeText(screen.getByTestId('login-mfa-input'), '123456')
  fireEvent.press(screen.getByTestId('login-submit'))

  expect(loginWithPassword).toHaveBeenCalledWith({
    email: 'pilot@bartender.ai',
    password: 'Secret123!',
    mfaToken: '123456',
  })
})

it('renders the authenticated root navigator once the session exists', () => {
  mockUseAppController.mockReturnValue({
    ...baseController,
    isAuthenticated: true,
  })

  const screen = render(<App />)
  expect(screen.getByText('Root Ready')).toBeTruthy()
})
