"""
Sukari Industries fuel theft dashboard — Flask app.
Run: python app.py  →  http://127.0.0.1:5000/
"""
from __future__ import annotations

from flask import Flask, render_template

from sukari_data import load_dataset

# Use `public/` so assets work on Vercel (CDN) and locally via Flask (see Vercel Flask docs).
app = Flask(
    __name__,
    static_folder="public",
    static_url_path="",
    template_folder="templates",
)


_payload_cache: dict | None = None


def get_bootstrap() -> dict:
    global _payload_cache
    if app.debug:
        return load_dataset()
    if _payload_cache is None:
        _payload_cache = load_dataset()
    return _payload_cache


@app.route("/")
def dashboard():
    return render_template("dashboard.html", bootstrap=get_bootstrap())


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
