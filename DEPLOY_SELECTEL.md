# Развёртывание production-версии в Selectel

Эта инструкция описывает развёртывание приложения на одном сервере с
Ubuntu 24.04. PostgreSQL, Redis, FastAPI, Celery и React запускаются в Docker.
Системный Nginx принимает HTTPS-соединения и перенаправляет запросы на
`127.0.0.1:8080`.

## 1. Подготовка сервера в Selectel

1. Подключите к серверу статический публичный IP-адрес.
2. Назначьте серверу группу безопасности со следующими входящими правилами:
   - TCP 22 только с вашего публичного IP-адреса;
   - TCP 80 с `0.0.0.0/0`;
   - TCP 443 с `0.0.0.0/0`.
3. Не открывайте порты 3000, 8000, 5432 и 6379.
4. Создайте для домена A-запись, указывающую на публичный IP сервера.

Рекомендуемая начальная конфигурация сервера: 8 vCPU, 32 ГБ оперативной памяти
и SSD объёмом 150 ГБ. Backend содержит TensorFlow, PyTorch и несколько других
ML-библиотек, поэтому сборка образа и выполнение анализа требуют значительных
ресурсов.

## 2. Подключение и установка пакетов

Подключитесь к серверу:

```bash
ssh <пользователь>@<IP-адрес-сервера>
```

Установите системные пакеты:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx
```

Добавьте официальный репозиторий Docker:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Установите Docker Engine и Docker Compose:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Переподключитесь по SSH, чтобы применилось членство в группе `docker`:

```bash
exit
ssh <пользователь>@<IP-адрес-сервера>
```

Проверьте установку:

```bash
docker version
docker compose version
```

## 3. Клонирование и настройка приложения

Создайте каталог приложения:

```bash
sudo mkdir -p /opt/ml-explainer
sudo chown "$USER":"$USER" /opt/ml-explainer
```

Клонируйте репозиторий:

```bash
git clone https://github.com/deandoff/ml-explainer-platform.git /opt/ml-explainer
cd /opt/ml-explainer
```

Создайте production-файл переменных окружения:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Сгенерируйте три независимых секрета:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Откройте конфигурацию:

```bash
nano .env.production
```

Укажите:

- в `POSTGRES_PASSWORD` первый сгенерированный секрет;
- этот же пароль внутри `DATABASE_URL`;
- в `SECRET_KEY` второй секрет;
- в `JWT_SECRET_KEY` третий секрет;
- в `CORS_ORIGINS` замените `example.com` реальным доменом;
- оставьте `REGISTRATION_ENABLED=false`;
- для первого запуска оставьте `STORAGE_MODE=local`.

Пример:

```dotenv
POSTGRES_USER=mlexplainer
POSTGRES_PASSWORD=<первый-секрет>
POSTGRES_DB=mlexplainer
DATABASE_URL=postgresql://mlexplainer:<первый-секрет>@postgres:5432/mlexplainer

SECRET_KEY=<второй-секрет>
JWT_SECRET_KEY=<третий-секрет>

ENVIRONMENT=production
CORS_ORIGINS=["https://example.ru"]
REGISTRATION_ENABLED=false

STORAGE_MODE=local
LOCAL_STORAGE_PATH=/app/storage
```

Убедитесь, что в файле не осталось шаблонных значений:

```bash
grep -n "CHANGE_ME\|example.com" .env.production
```

Команда не должна ничего вывести.

## 4. Сборка и запуск

Первая сборка backend может занять много времени, поскольку Docker скачивает
крупные ML-библиотеки:

```bash
docker compose -f compose.prod.yml build
docker compose -f compose.prod.yml up -d
```

Проверьте состояние сервисов:

```bash
docker compose -f compose.prod.yml ps
```

У сервисов `postgres`, `redis`, `backend` и `frontend` должен появиться статус
`healthy`. Celery worker должен иметь статус `Up`.

Посмотрите логи backend:

```bash
docker compose -f compose.prod.yml logs -f backend
```

Для выхода из просмотра логов нажмите `Ctrl+C`. Контейнеры при этом продолжат
работать.

Проверьте логи Celery:

```bash
docker compose -f compose.prod.yml logs --tail=100 celery-worker
```

## 5. Создание первого пользователя

Публичная регистрация в production по умолчанию отключена. Создайте первого
пользователя через административную команду:

```bash
docker compose -f compose.prod.yml exec backend python -m scripts.create_user
```

Команда запросит email, пароль и подтверждение пароля. Пароль должен содержать
не менее 12 символов.

## 6. Настройка Nginx

Замените `<ваш-домен>` реальным доменным именем:

```bash
sed "s/example.com/<ваш-домен>/g" deploy/nginx/ml-explainer.conf \
  | sudo tee /etc/nginx/sites-available/ml-explainer > /dev/null
```

Включите конфигурацию:

```bash
sudo ln -s /etc/nginx/sites-available/ml-explainer \
  /etc/nginx/sites-enabled/ml-explainer
sudo unlink /etc/nginx/sites-enabled/default
```

Проверьте конфигурацию и перезапустите Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

До установки сертификата приложение должно открываться по адресу:

```text
http://<ваш-домен>
```

## 7. Установка HTTPS-сертификата

Выпустите бесплатный сертификат Let's Encrypt:

```bash
sudo certbot --nginx -d <ваш-домен>
```

Во время настройки выберите автоматическое перенаправление с HTTP на HTTPS.

Проверьте автоматическое продление:

```bash
sudo certbot renew --dry-run
```

После этого приложение должно открываться по адресу:

```text
https://<ваш-домен>
```

## 8. Проверка приложения

Проверьте доступность сайта:

```bash
curl -I https://<ваш-домен>
```

Проверьте контейнеры:

```bash
docker compose -f compose.prod.yml ps
```

Проверьте последние логи:

```bash
docker compose -f compose.prod.yml logs --tail=100 backend celery-worker
```

Затем выполните проверку через браузер:

1. Войдите под пользователем, созданным в разделе 5.
2. Загрузите небольшую доверенную sklearn-модель.
3. Загрузите небольшой CSV-файл.
4. Запустите SHAP- или LIME-анализ.
5. Дождитесь завершения и откройте результат.
6. Проверьте скачивание модели и набора данных.

Загружайте модели только от доверенных пользователей. Файлы Pickle, Joblib и
PyTorch могут выполнять Python-код во время загрузки.

## 9. Обновление приложения

Перейдите в каталог проекта:

```bash
cd /opt/ml-explainer
```

Получите изменения и пересоберите контейнеры:

```bash
git pull --ff-only
docker compose -f compose.prod.yml build
docker compose -f compose.prod.yml up -d
```

Удалите неиспользуемые старые образы:

```bash
docker image prune -f
```

Backend автоматически выполняет `alembic upgrade head` перед каждым запуском.

## 10. Резервное копирование PostgreSQL

Создайте каталог резервных копий:

```bash
sudo mkdir -p /opt/ml-explainer-backups
sudo chown "$USER":"$USER" /opt/ml-explainer-backups
```

Создайте дамп базы данных:

```bash
docker compose -f compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "/opt/ml-explainer-backups/postgres-$(date +%F-%H%M).sql.gz"
```

Проверьте созданный файл:

```bash
ls -lh /opt/ml-explainer-backups
```

## 11. Резервное копирование локального хранилища

Если используется `STORAGE_MODE=local`, файлы находятся в Docker volume
`ml-explainer-prod_app_storage`.

Создайте архив:

```bash
docker run --rm \
  -v ml-explainer-prod_app_storage:/source:ro \
  -v /opt/ml-explainer-backups:/backup \
  alpine sh -c 'tar -czf /backup/app-storage-$(date +%F-%H%M).tar.gz -C /source .'
```

Храните копии на другом сервере или в объектном хранилище. Резервные копии на
том же диске не защищают от потери сервера или повреждения диска.

## 12. Подключение Selectel S3

Локальное хранилище подходит для первого запуска. Для более надёжного хранения
моделей, наборов данных и результатов можно подключить Selectel S3.

1. Создайте приватный S3-бакет в панели Selectel.
2. Создайте сервисного пользователя и выпустите S3-ключ.
3. Настройте CORS бакета:
   - разрешённый origin: `https://<ваш-домен>`;
   - методы: `PUT` и `GET`;
   - разрешённый заголовок: `Content-Type`.
4. Заполните S3-переменные в `.env.production`:

```dotenv
STORAGE_MODE=s3
S3_ENDPOINT_URL=<endpoint-из-панели-Selectel>
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
S3_BUCKET_NAME=<имя-бакета>
S3_REGION=<пул-Selectel>
```

Пересоздайте backend и Celery:

```bash
docker compose -f compose.prod.yml up -d --force-recreate backend celery-worker
```

Файлы, которые уже находятся в локальном Docker volume, автоматически в S3
не переносятся.

## 13. Полезные команды

Состояние сервисов:

```bash
docker compose -f compose.prod.yml ps
```

Все логи:

```bash
docker compose -f compose.prod.yml logs -f
```

Перезапуск одного сервиса:

```bash
docker compose -f compose.prod.yml restart backend
```

Перезапуск всего приложения:

```bash
docker compose -f compose.prod.yml restart
```

Остановка:

```bash
docker compose -f compose.prod.yml down
```

Обычная команда `down` не удаляет PostgreSQL и загруженные файлы. Не
используйте `down -v` на production-сервере: параметр `-v` удаляет volumes с
данными.

## 14. Автоматический CI/CD

После первого успешного ручного запуска можно включить автоматическую сборку и
развёртывание через GitHub Actions.

Подробная инструкция находится в файле:

```text
CI_CD.md
```

Pipeline проверяет pull request, публикует Docker-образы в GHCR и развёртывает
push в ветку `main` на сервере Selectel по SSH.
