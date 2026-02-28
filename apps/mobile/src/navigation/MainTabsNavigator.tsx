import { useEffect } from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'

import { DashboardScreen } from '../screens/DashboardScreen'
import { InventoryScreen } from '../screens/InventoryScreen'
import { RecipesScreen } from '../screens/RecipesScreen'
import { StudioScreen } from '../screens/StudioScreen'
import { KnowledgeScreen } from '../screens/KnowledgeScreen'
import { RecommendationsScreen } from '../screens/RecommendationsScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import type { AppController } from '../app/useAppController'
import { colors } from '../theme'

const Tab = createBottomTabNavigator()

type MainTabsNavigatorProps = {
  controller: AppController
}

export function MainTabsNavigator({ controller }: MainTabsNavigatorProps) {
  const StudioTabWrapper = ({ route }: any) => {
    const routeSessionId = route?.params?.sessionId as string | undefined

    useEffect(() => {
      if (routeSessionId && routeSessionId !== controller.activeSessionId) {
        controller.openStudioSession(routeSessionId)
      }
    }, [routeSessionId])

    return (
      <StudioScreen
        sessionsStatus={controller.sectionStatus.studio_sessions}
        versionsStatus={controller.sectionStatus.studio_versions}
        assistantStatus={controller.sectionStatus.studio_assistant}
        sessions={controller.studioSessions}
        activeSessionId={controller.activeSessionId}
        versions={controller.studioVersions}
        diffResult={controller.studioDiff}
        guidedSteps={controller.guidedSteps}
        copilotQuestions={controller.copilotQuestions}
        copilotFollowup={controller.copilotFollowup}
        onRefreshSessions={controller.loadStudioSessions}
        onCreateSession={controller.createStudioSession}
        onOpenSession={controller.openStudioSession}
        onCreateConstraint={controller.createStudioConstraint}
        onGenerate={controller.generateStudio}
        onLoadDiff={controller.loadStudioDiff}
        onRevert={controller.revertStudioVersion}
        onLoadGuided={controller.loadGuidedSteps}
        onLoadCopilotQuestions={controller.loadCopilotQuestions}
        onSubmitCopilotAnswer={controller.followupCopilot}
      />
    )
  }

  return (
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: colors.bgElevated },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text, fontWeight: '700' },
          tabBarStyle: {
            backgroundColor: colors.bgElevated,
            borderTopColor: colors.border,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ color, size }) => {
            if (route.name === 'Dashboard') return <Feather name="home" size={size} color={color} />
            if (route.name === 'Inventory') return <Feather name="package" size={size} color={color} />
            if (route.name === 'Recipes') return <Feather name="book-open" size={size} color={color} />
            if (route.name === 'Studio')
              return <MaterialCommunityIcons name="flask-outline" size={size} color={color} />
            if (route.name === 'Knowledge') return <Feather name="book" size={size} color={color} />
            if (route.name === 'Recommendations') return <Feather name="star" size={size} color={color} />
            if (route.name === 'Settings') return <Feather name="settings" size={size} color={color} />
            return <Feather name="circle" size={size} color={color} />
          },
        })}
      >
        <Tab.Screen name="Dashboard">
          {({ navigation }) => (
            <DashboardScreen
              onGoInventory={() => navigation.navigate('Inventory')}
              onGoRecipes={() => navigation.navigate('Recipes')}
              onGoStudio={() => navigation.navigate('Studio')}
              onGoKnowledge={() => navigation.navigate('Knowledge')}
              onGoRecommendations={() => navigation.navigate('Recommendations')}
              recentSessions={controller.recentSessions}
              onOpenSession={async (sessionId) => {
                await controller.openStudioSession(sessionId)
                navigation.navigate('Studio', { sessionId })
              }}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Inventory">
          {() => (
            <InventoryScreen
              ingredients={controller.ingredients}
              items={controller.items}
              status={controller.sectionStatus.inventory}
              onRefresh={controller.loadInventory}
              onCreateIngredient={controller.createIngredient}
              onCreateItem={controller.createItem}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Recipes">
          {() => (
            <RecipesScreen
              recipes={controller.recipes}
              harvestJobs={controller.harvestJobs}
              recipeStatus={controller.sectionStatus.recipes}
              harvestStatus={controller.sectionStatus.harvest}
              reviewStatus={controller.sectionStatus.reviews}
              onRefresh={controller.loadRecipes}
              onRefreshHarvestJobs={controller.loadHarvestJobs}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Studio" component={StudioTabWrapper} />
        <Tab.Screen name="Knowledge">
          {() => (
            <KnowledgeScreen
              status={controller.sectionStatus.knowledge}
              results={controller.knowledgeResults}
              onSearch={controller.loadKnowledge}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Recommendations">
          {() => (
            <RecommendationsScreen
              status={controller.sectionStatus.recommendations}
              makeNow={controller.makeNow}
              missingOne={controller.missingOne}
              tonightFlight={controller.tonightFlight}
              onRefresh={controller.loadRecommendations}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Settings">
          {() => (
            <SettingsScreen
              status={controller.sectionStatus.settings}
              mfaSecret={controller.mfaSecret}
              mfaStatus={controller.mfaStatus}
              onSetupMfa={controller.setupMfa}
              onEnableMfa={controller.enableMfa}
              onDisableMfa={controller.disableMfa}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
  )
}
