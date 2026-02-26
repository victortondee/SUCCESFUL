# Push Instructions (Future)

Use these steps to push this project to your GitHub collection repo:

- Repo: `https://github.com/victortondee/SUCCESFUL`
- Rule: each completed project must be in its own subfolder.

## 1) Set your project folder name inside SUCCESFUL

Pick a stable folder name (example: `shortform-composer`).

## 2) Run this from your main local project folder

```bash
cd "/Users/yerevan/Downloads/untitled folder 84"

PROJECT_FOLDER="shortform-composer"
TMP_REPO="/tmp/succesful_repo_push"

rm -rf "$TMP_REPO"
git clone https://github.com/victortondee/SUCCESFUL.git "$TMP_REPO"

mkdir -p "$TMP_REPO/$PROJECT_FOLDER"
rsync -a --delete \
  --exclude '.git' \
  --exclude '.DS_Store' \
  ./ "$TMP_REPO/$PROJECT_FOLDER"/

cd "$TMP_REPO"
git add "$PROJECT_FOLDER"
git commit -m "Update $PROJECT_FOLDER"
git push origin main
```

## Notes

- For a new project, change `PROJECT_FOLDER` to a new name.
- For an existing project, keep the same `PROJECT_FOLDER` and re-run.
- This keeps your active project folder independent from the GitHub collection repo.
