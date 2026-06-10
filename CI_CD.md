# Настройка CI/CD

Проект использует GitHub Actions и GitHub Container Registry:

1. Pull request запускает проверки Python, Docker Compose и production-сборку
   frontend.
2. Push в ветку `main` повторяет проверки.
3. После успешных проверок пересобираются только образы, каталоги которых
   изменились. Для неизменившегося образа новый SHA-тег создаётся из `latest`
   без повторной сборки.
4. Образы публикуются в GHCR с тегами SHA коммита и `latest`.
5. GitHub Actions подключается к Selectel по SSH и обновляет контейнеры.
6. Деплой считается успешным только после прохождения healthchecks.

Workflow находится в `.github/workflows/ci-cd.yml`.

## 1. Предварительная подготовка сервера

Сначала выполните основную инструкцию `DEPLOY_SELECTEL.md` до первого успешного
ручного запуска. На сервере должны существовать:

```text
/opt/ml-explainer/
├── .env.production
└── compose.prod.yml
```

Пользователь для деплоя должен:

- подключаться к серверу по SSH без пароля;
- иметь право записывать файлы в `/opt/ml-explainer`;
- иметь доступ к Docker без `sudo`.

Проверьте на сервере:

```bash
docker version
docker compose version
test -w /opt/ml-explainer
```

## 2. Создание отдельного SSH-ключа

Создайте ключ на своём компьютере:

```bash
ssh-keygen -t ed25519 -C "github-actions-ml-explainer" \
  -f ./ml-explainer-deploy
```

Для автоматического деплоя ключ должен быть без passphrase.

Добавьте публичную часть на сервер:

```bash
ssh-copy-id -i ./ml-explainer-deploy.pub \
  <пользователь>@<IP-адрес-сервера>
```

Либо вручную добавьте содержимое `ml-explainer-deploy.pub` в:

```text
~/.ssh/authorized_keys
```

Права на сервере:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Проверьте подключение:

```bash
ssh -i ./ml-explainer-deploy <пользователь>@<IP-адрес-сервера>
```

## 3. Получение known_hosts

Получите публичный SSH-ключ сервера:

```bash
ssh-keyscan -H -p 22 <IP-адрес-сервера>
```

Перед добавлением результата в GitHub рекомендуется сверить fingerprint. На
самом сервере:

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

На локальном компьютере сохраните результат `ssh-keyscan` в файл и проверьте:

```bash
ssh-keyscan -p 22 <IP-адрес-сервера> > server_known_hosts
ssh-keygen -lf server_known_hosts
```

Fingerprint должен совпасть.

## 4. Создание GitHub Environment

Откройте репозиторий на GitHub:

```text
Settings → Environments → New environment
```

Создайте environment с именем:

```text
production
```

Рекомендуется включить:

- разрешение деплоя только из ветки `main`;
- required reviewers, если тариф и видимость репозитория это поддерживают.

В этом случае GitHub остановит workflow перед production-деплоем и будет ждать
ручного подтверждения.

## 5. Добавление GitHub Secrets

Откройте:

```text
Settings → Environments → production → Environment secrets
```

Добавьте:

### `DEPLOY_HOST`

Публичный IP или домен SSH-сервера:

```text
203.0.113.10
```

### `DEPLOY_USER`

Имя Linux-пользователя:

```text
ubuntu
```

### `DEPLOY_SSH_KEY`

Полное содержимое приватного файла `ml-explainer-deploy`, включая строки:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

### `DEPLOY_KNOWN_HOSTS`

Полный результат проверенной команды:

```bash
ssh-keyscan -H -p 22 <IP-адрес-сервера>
```

Не добавляйте `.env.production`, пароль PostgreSQL, JWT-секреты или S3-ключи в
GitHub. Они остаются только на production-сервере.

## 6. Добавление GitHub Variables

В том же environment откройте:

```text
Environment variables
```

Добавьте:

### `PRODUCTION_URL`

```text
https://example.ru
```

### `DEPLOY_PORT`

```text
22
```

### `DEPLOY_PATH`

```text
/opt/ml-explainer
```

### `DEPLOY_ENABLED`

Пока SSH и сервер не подготовлены, оставьте переменную отсутствующей или
установите:

```text
false
```

Когда все secrets настроены и первый ручной запуск проверен, установите:

```text
true
```

Без `DEPLOY_ENABLED=true` workflow выполняет CI и публикует образы, но безопасно
пропускает SSH-деплой.

`DEPLOY_PORT` и `DEPLOY_PATH` необязательны: workflow использует указанные выше
значения по умолчанию.

## 7. Первый запуск

Закоммитьте подготовленные production- и CI/CD-файлы:

```bash
git add .
git commit -m "Configure production deployment and CI/CD"
git push origin main
```

Откройте:

```text
GitHub → Actions → CI/CD
```

До включения `DEPLOY_ENABLED` workflow выполнит:

1. `ci`;
2. `publish`;

После настройки secrets установите `DEPLOY_ENABLED=true` и запустите workflow
вручную. Тогда дополнительно выполнится этап `deploy`.

Если для environment настроены required reviewers, подтвердите этап `deploy`.

## 8. GitHub Container Registry

Workflow автоматически публикует:

```text
ghcr.io/deandoff/ml-explainer-platform-backend:<commit-sha>
ghcr.io/deandoff/ml-explainer-platform-frontend:<commit-sha>
```

Также обновляются теги `latest`, но production использует точный SHA коммита.
Это делает развёртывание воспроизводимым и упрощает откат.

Для публикации используется встроенный `GITHUB_TOKEN`. Создавать постоянный
Personal Access Token не требуется.

## 9. Ручной запуск

Откройте:

```text
GitHub → Actions → CI/CD → Run workflow
```

Выберите ветку `main` и нажмите `Run workflow`.

Ручной запуск также соберёт образы и выполнит production-деплой.

## 10. Откат

Перед каждым деплоем сервер сохраняет предыдущие теги образов в:

```text
/opt/ml-explainer/.env.images.previous
```

Для отката:

```bash
cd /opt/ml-explainer
cp .env.images.previous .env.images
docker compose --env-file .env.images -f compose.prod.yml pull
docker compose --env-file .env.images -f compose.prod.yml up -d
```

Затем проверьте:

```bash
docker compose --env-file .env.images -f compose.prod.yml ps
curl -I http://127.0.0.1:8080
```

Откат Docker-образа не откатывает миграции PostgreSQL. Перед несовместимыми
изменениями схемы базы данных обязательно создавайте резервную копию.

## 11. Диагностика

Текущие используемые образы:

```bash
cat /opt/ml-explainer/.env.images
```

Состояние контейнеров:

```bash
cd /opt/ml-explainer
docker compose --env-file .env.images -f compose.prod.yml ps
```

Логи:

```bash
docker compose --env-file .env.images -f compose.prod.yml \
  logs --tail=200 backend celery-worker frontend
```

Повторный запуск текущей версии:

```bash
docker compose --env-file .env.images -f compose.prod.yml up -d
```

## 12. Защита ветки main

После первого успешного workflow рекомендуется включить branch protection:

```text
Settings → Branches → Add branch protection rule
```

Для `main` включите:

- Require a pull request before merging;
- Require status checks to pass;
- обязательную проверку `Проверки`;
- запрет force push.

После этого код не попадёт в production без успешного CI.
