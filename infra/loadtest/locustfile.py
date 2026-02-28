from __future__ import annotations

from typing import Any

from locust import HttpUser, between, task


SEED_HARVEST_URL = "https://www.diffordsguide.com/cocktails/search"


class ApiUser(HttpUser):
    wait_time = between(0.5, 2.0)

    def on_start(self):
        self.token = None
        self.refresh_token = None
        self.active_session_id = None
        self.latest_version_ids: list[str] = []
        self._bootstrap_auth()

    def _bootstrap_auth(self) -> None:
        dev_token = self.client.post("/v1/auth/dev-token?unique=true")
        if dev_token.ok:
            payload = dev_token.json()
            self.token = payload.get("access_token")
            self.refresh_token = payload.get("refresh_token")
            return
        login = self.client.post(
            "/v1/auth/jwt/login",
            json={"email": "dev@bartender.ai", "password": "dev-password"},
        )
        if login.ok:
            payload = login.json()
            self.token = payload.get("access_token")
            self.refresh_token = payload.get("refresh_token")

    def _headers(self) -> dict[str, str]:
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    def _json(self, response) -> Any:
        try:
            return response.json()
        except Exception:  # noqa: BLE001
            return {}

    @task(3)
    def search_recipes(self):
        self.client.get("/v1/recipes?q=gin", headers=self._headers(), name="recipes_search")

    @task(1)
    def list_recommendations(self):
        self.client.get("/v1/recommendations/make-now", headers=self._headers(), name="recommendations_make_now")

    @task(1)
    def harvest_auto(self):
        self.client.post(
            "/v1/recipes/harvest/auto",
            headers=self._headers(),
            json={
                "source_url": SEED_HARVEST_URL,
                "source_type": "web",
                "max_links": 2,
                "max_pages": 6,
                "max_recipes": 3,
                "crawl_depth": 2,
                "enqueue": True,
            },
            name="harvest_auto",
        )

    @task(2)
    def studio_create_constraint_generate(self):
        create = self.client.post(
            "/v1/studio/sessions",
            headers=self._headers(),
            json={"status": "active"},
            name="studio_create_session",
        )
        if not create.ok:
            return
        payload = self._json(create)
        session_id = payload.get("id")
        if not session_id:
            return
        self.active_session_id = session_id
        self.client.post(
            f"/v1/studio/sessions/{session_id}/constraints",
            headers=self._headers(),
            json={
                "constraints": {
                    "include_ingredients": ["gin", "lemon juice"],
                    "style": "sour",
                    "abv_target": 22.0,
                    "sweetness_target": 5.0,
                    "acidity_target": 6.0,
                }
            },
            name="studio_create_constraint",
        )
        generated = self.client.post(
            f"/v1/studio/sessions/{session_id}/generate",
            headers=self._headers(),
            json={},
            name="studio_generate",
        )
        if generated.ok:
            self.client.get(
                f"/v1/studio/sessions/{session_id}/versions",
                headers=self._headers(),
                name="studio_versions",
            )

    @task(1)
    def studio_summary(self):
        self.client.get("/v1/studio/analytics/summary", headers=self._headers(), name="studio_summary")

    @task(1)
    def refresh_login(self):
        if not self.refresh_token:
            return
        res = self.client.post(
            "/v1/auth/jwt/refresh",
            json={"refresh_token": self.refresh_token},
            name="auth_refresh",
        )
        if res.ok:
            payload = self._json(res)
            self.token = payload.get("access_token", self.token)
            self.refresh_token = payload.get("refresh_token", self.refresh_token)
