export const linking = {
  prefixes: ['bartenderai://'],
  config: {
    screens: {
      Tabs: {
        screens: {
          Dashboard: 'dashboard',
          Inventory: 'inventory',
          Recipes: 'recipes',
          Studio: 'studio/:sessionId?',
          Knowledge: 'knowledge',
          Recommendations: 'recommendations',
          Settings: 'settings',
        },
      },
      RecipeIngest: 'recipes/ingest',
      HarvestHub: 'harvest',
      ReviewQueue: 'reviews/queue/:recipeId?',
      RecipeDetail: 'recipes/detail/:recipeId',
      HarvestJobDetail: 'harvest/jobs/:jobId',
      RecipeReview: 'reviews/recipes/:recipeId',
    },
  },
}
