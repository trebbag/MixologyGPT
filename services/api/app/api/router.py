from fastapi import APIRouter

from app.api.routes import auth, inventory, recipes, reviews, studio, recommendations, notifications, media, knowledge, agents, mfa, admin


api_router = APIRouter()
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
api_router.include_router(recipes.router, prefix="/recipes", tags=["recipes"])
api_router.include_router(studio.router, prefix="/studio", tags=["studio"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
api_router.include_router(recommendations.router, prefix="/recommendations", tags=["recommendations"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(media.router, prefix="/media", tags=["media"])
api_router.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(mfa.router, prefix="/auth/mfa", tags=["auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
