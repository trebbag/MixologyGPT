import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { NavigationContainer } from '@react-navigation/native'

import { MainTabsNavigator } from './MainTabsNavigator'
import type { AppController } from '../app/useAppController'
import { HarvestJobDetailScreen } from '../screens/HarvestJobDetailScreen'
import { RecipeReviewScreen } from '../screens/RecipeReviewScreen'
import { HarvestHubScreen } from '../screens/HarvestHubScreen'
import { ReviewQueueScreen } from '../screens/ReviewQueueScreen'
import { RecipeDetailScreen } from '../screens/RecipeDetailScreen'
import { RecipeIngestScreen } from '../screens/RecipeIngestScreen'
import { linking } from './linking'

export type RootStackParamList = {
  Tabs: undefined
  RecipeIngest: undefined
  HarvestHub: undefined
  ReviewQueue: { recipeId?: string } | undefined
  RecipeDetail: { recipeId: string }
  HarvestJobDetail: { jobId: string }
  RecipeReview: { recipeId: string }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator({ controller }: { controller: AppController }) {
  return (
    <NavigationContainer linking={linking as any}>
      <Stack.Navigator
        initialRouteName="Tabs"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0f172a' },
        }}
      >
        <Stack.Screen name="Tabs">{() => <MainTabsNavigator controller={controller} />}</Stack.Screen>
        <Stack.Screen name="RecipeIngest">{() => <RecipeIngestScreen controller={controller} />}</Stack.Screen>
        <Stack.Screen name="HarvestHub">{() => <HarvestHubScreen controller={controller} />}</Stack.Screen>
        <Stack.Screen name="ReviewQueue">
          {({ route }) => <ReviewQueueScreen controller={controller} recipeId={route.params?.recipeId} />}
        </Stack.Screen>
        <Stack.Screen name="RecipeDetail">
          {({ route }) => <RecipeDetailScreen controller={controller} recipeId={route.params.recipeId} />}
        </Stack.Screen>
        <Stack.Screen name="HarvestJobDetail">
          {({ route }) => <HarvestJobDetailScreen controller={controller} jobId={route.params.jobId} />}
        </Stack.Screen>
        <Stack.Screen name="RecipeReview">
          {({ route }) => <RecipeReviewScreen controller={controller} recipeId={route.params.recipeId} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  )
}
