check: format formatcheck lint test clean

lint:
	poetry run flake8 .
	poetry run mypy .

formatcheck:
	poetry run black --check .
	poetry run isort --check .

format:
	poetry run black .
	poetry run isort .

test:
	poetry run pytest .

clean:
	find . -type f -name '*.py[co]' -delete -o -type d -name __pycache__ -delete
	find . -type d -name .mypy_cache -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
