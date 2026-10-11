#!/bin/sh
# Remet le contenu d'origine (content.json par défaut), supprime les photos téléversées et les sauvegardes.
cd "$(dirname "$0")/.." || exit 1
python3 tools/make_content.py && rm -f site/assets/img/up-* && rm -rf data/backups && python3 render.py
