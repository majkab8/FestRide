import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app


@pytest.fixture
def site(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><div id=root></div>", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app-123.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    (tmp_path.parent / "secret.txt").write_text("do not serve", encoding="utf-8")
    config = Settings(_env_file=None, secret_key="test-secret", api_prefix="/api", static_dir=str(tmp_path))
    return TestClient(create_app(config))


def test_api_lives_under_the_prefix(site):
    assert site.get("/api/health").json()["status"] == "ok"


def test_page_routes_get_the_frontend_even_when_an_api_path_has_the_same_name(site):
    for path in ("/", "/events", "/rides/12", "/search?event_id=5"):
        response = site.get(path)
        assert response.status_code == 200
        assert 'id=root' in response.text


def test_static_files_are_served_and_hashed_assets_cached(site):
    asset = site.get("/assets/app-123.js")
    assert asset.text == "console.log(1)"
    assert "immutable" in asset.headers["cache-control"]
    assert site.get("/favicon.svg").text == "<svg/>"


def test_unknown_api_paths_stay_404_instead_of_returning_the_page(site):
    assert site.get("/api/nope").status_code == 404


def test_files_outside_the_frontend_folder_are_never_served(site):
    response = site.get("/../secret.txt")
    assert "do not serve" not in response.text
    response = site.get("/%2e%2e/secret.txt")
    assert "do not serve" not in response.text


def test_refuses_to_serve_publicly_with_the_default_secret(tmp_path):
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app(Settings(_env_file=None, static_dir=str(tmp_path)))
