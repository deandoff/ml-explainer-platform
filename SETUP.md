# ML Explainer Platform - Setup Guide

## Предварительные требования

- Docker и Docker Compose
- Yandex Object Storage аккаунт (или другой S3-совместимый сервис)

## Настройка

### 1. Клонируйте проект

```bash
cd C:\Users\deandoff\projects\ml-explainer-platform
```

### 2. Настройте переменные окружения

Скопируйте `.env.example` в `.env` и заполните:

```bash
cp .env.example .env
```

Обязательно укажите:
- `S3_ACCESS_KEY_ID` - ваш Yandex Object Storage access key
- `S3_SECRET_ACCESS_KEY` - ваш secret key
- `S3_BUCKET_NAME` - имя бакета (создайте его в Yandex Cloud)
- `SECRET_KEY` - случайная строка для JWT токенов

### 3. Создайте бакет в Yandex Object Storage

1. Перейдите в Yandex Cloud Console
2. Создайте новый бакет (например, `ml-explainer-artifacts`)
3. Настройте CORS для бакета:

```json
[
  {
    "id": "cors-1",
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

### 4. Запустите сервисы

```bash
docker-compose up -d
```

Это запустит:
- PostgreSQL (порт 5432)
- Redis (порт 6379)
- Backend API (порт 8000)
- Celery Worker
- Frontend (порт 3000)

### 5. Проверьте работу

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Использование

### Загрузка модели

1. Перейдите в раздел "Models"
2. Нажмите "Upload Model"
3. Выберите тип модели (sklearn, xgboost, pytorch, etc.)
4. Загрузите файл модели (.pkl, .pth, .onnx, etc.)

### Загрузка датасета

1. Перейдите в раздел "Datasets"
2. Нажмите "Upload Dataset"
3. Загрузите CSV файл с данными

### Запуск анализа

1. Перейдите в раздел "Analysis"
2. Выберите модель и датасет
3. Выберите метод объяснения (SHAP или LIME)
4. Нажмите "Start Analysis"
5. Дождитесь завершения (статус обновляется автоматически)
6. Просмотрите результаты с визуализацией важности признаков

## Разработка

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm start
```

### Celery Worker (для локальной разработки)

```bash
cd backend
celery -A app.core.celery_app worker --loglevel=info
```

## Архитектура

```
┌─────────────┐
│   Frontend  │ (React + Material-UI)
│  Port 3000  │
└──────┬──────┘
       │ HTTP/REST
       ▼
┌─────────────┐
│   Backend   │ (FastAPI)
│  Port 8000  │
└──────┬──────┘
       │
       ├─────────► PostgreSQL (метаданные)
       │
       ├─────────► Redis (очередь задач + кэш)
       │
       ├─────────► Yandex S3 (модели + данные)
       │
       └─────────► Celery Worker (SHAP/LIME вычисления)
```

## Поддерживаемые форматы

### Модели
- Scikit-learn (.pkl)
- XGBoost (.pkl)
- LightGBM (.pkl)
- CatBoost (.pkl)
- PyTorch (.pth)
- TensorFlow (.h5, SavedModel)
- ONNX (.onnx)

### Датасеты
- CSV файлы с заголовками

## Troubleshooting

### Ошибка подключения к S3
- Проверьте правильность access key и secret key
- Убедитесь, что бакет создан и доступен
- Проверьте настройки CORS

### Celery задачи не выполняются
- Убедитесь, что Redis запущен
- Проверьте логи Celery worker: `docker-compose logs celery-worker`

### Frontend не подключается к Backend
- Проверьте, что Backend запущен на порту 8000
- Убедитесь, что CORS настроен правильно в backend/app/core/config.py
