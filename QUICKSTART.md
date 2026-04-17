# ML Explainer Platform - Quick Start (без S3)

## Быстрый запуск с локальным хранилищем

Проект настроен для работы БЕЗ облачного хранилища. Файлы сохраняются локально.

### 1. Скопируйте .env файл

```bash
cd C:\Users\deandoff\projects\ml-explainer-platform
cp .env.example .env
```

Файл `.env` уже настроен для локального хранилища (`STORAGE_MODE=local`).

### 2. Запустите проект

```bash
docker-compose up -d
```

Это запустит:
- PostgreSQL (база данных)
- Redis (очередь задач)
- Backend API (порт 8000)
- Celery Worker (обработка SHAP/LIME)
- Frontend (порт 3000)

### 3. Откройте приложение

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### 4. Используйте платформу

1. **Загрузите модель** (Models → Upload Model)
   - Поддерживаются: sklearn, XGBoost, PyTorch, TensorFlow, ONNX
   - Файлы сохраняются в `./storage/artifacts/models/`

2. **Загрузите датасет** (Datasets → Upload Dataset)
   - Формат: CSV с заголовками
   - Файлы сохраняются в `./storage/artifacts/datasets/`

3. **Запустите анализ** (Analysis)
   - Выберите модель и датасет
   - Выберите SHAP или LIME
   - Результаты появятся автоматически

## Переключение на S3 (опционально)

Когда будете готовы использовать Yandex Object Storage:

1. Создайте бакет в Yandex Cloud
2. Измените в `.env`:
   ```
   STORAGE_MODE=s3
   S3_ENDPOINT_URL=https://storage.yandexcloud.net
   S3_ACCESS_KEY_ID=ваш_ключ
   S3_SECRET_ACCESS_KEY=ваш_секрет
   S3_BUCKET_NAME=имя_бакета
   ```
3. Перезапустите: `docker-compose restart`

## Остановка

```bash
docker-compose down
```

Для удаления данных:
```bash
docker-compose down -v
rm -rf storage/
```

## Troubleshooting

**Порты заняты?**
Измените порты в `docker-compose.yml`:
- Frontend: `3000:3000` → `3001:3000`
- Backend: `8000:8000` → `8001:8000`

**Ошибки при запуске?**
```bash
docker-compose logs backend
docker-compose logs celery-worker
```
