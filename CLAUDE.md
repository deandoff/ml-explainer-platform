# ML Explainer Platform - Контекст для Claude

## О проекте

Веб-платформа для объяснения решений моделей машинного обучения с использованием алгоритмов SHAP и LIME.

**Цель проекта:** Решение проблемы "чёрного ящика" в ML-моделях — повышение прозрачности и интерпретируемости сложных моделей (нейросети, ансамбли) для пользователей без глубоких знаний в ML.

**Ключевая проблема:** Современные высокоточные модели (deep learning, random forests, XGBoost) непрозрачны для пользователей. Это снижает доверие, затрудняет отладку и ограничивает применение в критичных областях (медицина, финансы, госуправление).

**Решение:** Универсальная веб-платформа с удобным интерфейсом для анализа любых ML-моделей через SHAP и LIME без необходимости программирования.

## Архитектура

### Backend
- **Framework**: FastAPI (асинхронность через ASGI/Uvicorn, автодокументация OpenAPI/Swagger)
- **Auth**: JWT токены (FastAPI Security + OAuth2PasswordBearer)
  - Регистрация/логин через email + пароль
  - Хеширование паролей (bcrypt/passlib)
  - Middleware для проверки токенов
- **Async Tasks**: Celery + Redis (обработка тяжелых SHAP/LIME вычислений)
- **Database**: PostgreSQL (метаданные: профили пользователей, версии моделей, логи интерпретации, ссылки на S3)
  - Таблица `users`: id, email, hashed_password, created_at
  - Таблицы `models`, `datasets`, `analyses` содержат `user_id` (foreign key)
- **Storage**: Гибридная модель
  - PostgreSQL: структурированные метаданные
  - S3-compatible storage: бинарные артефакты (модели .pkl/.pth/.onnx, датасеты, кэш результатов)
  - Структура путей включает `user_id` для изоляции: `artifacts/models/{user_id}/{model_uuid}/`
- **ML Libraries**: 
  - SHAP (теория кооперативных игр, глобальные + локальные объяснения)
  - LIME (model-agnostic, быстрая локальная аппроксимация)
  - Поддержка: scikit-learn, XGBoost, LightGBM, CatBoost, PyTorch, TensorFlow, ONNX

### Frontend
- **Framework**: React
- **Auth**: JWT токены в localStorage/cookies, защищённые роуты
- **Visualization**: Plotly.js (интерактивные графики)
- **HTTP Client**: Axios (с автоматической подстановкой JWT в headers)
- **Real-time**: WebSocket/Socket.IO
  - Обновление статуса задач Celery
  - Real-time пересчёт предсказаний при What-If анализе

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Services**:
  - PostgreSQL (порт 5432)
  - Redis (порт 6379)
  - Backend API (порт 8000)
  - Celery Worker
  - Frontend (порт 3000)

## Текущая конфигурация

- **Storage Mode**: `local` (файлы в `./storage/artifacts/`)
  - В production планируется Yandex Object Storage (S3-compatible)
  - Структура префиксов S3 (с изоляцией по пользователям):
    - `artifacts/models/{user_id}/{model_uuid}/` — версии моделей
    - `artifacts/datasets/{user_id}/{dataset_uuid}/` — входные данные
    - `cache/results/{user_id}/{job_uuid}/` — кэшированные результаты SHAP/LIME
- **Environment**: `.env` файл настроен для локальной работы
- **Test Data**: 
  - `test_dataset.csv` - тестовый датасет
  - `test_model.pkl` - тестовая модель

## Архитектурные решения

### Гибридное хранилище
**Почему разделены PostgreSQL и S3:**
- PostgreSQL: быстрые запросы по метаданным (поиск моделей, фильтрация, история)
- S3: экономичное хранение больших файлов (модели могут быть сотни МБ - десятки ГБ)
- Связь через поле `s3_key` в БД (VARCHAR с путём к объекту)

### Direct Upload через Pre-signed URLs
- Backend генерирует временную подписанную ссылку
- Frontend загружает файлы напрямую в S3 (минуя Backend)
- Преимущества: нет дублирования трафика, поддержка больших файлов без таймаутов API

### Lifecycle Policies (для production S3)
- Transition: модели без обращений >30 дней → холодное хранилище (Standard-IA/Glacier)
- Expiration: временные данные и кэш удаляются через 14 дней

## Структура проекта

```
ml-explainer-platform/
├── backend/
│   ├── app/
│   │   ├── api/          # REST API endpoints
│   │   ├── core/         # ML explainability (SHAP, LIME)
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   └── services/     # Business logic
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── storage/              # Локальное хранилище артефактов
├── docker-compose.yml
├── .env                  # Конфигурация окружения
└── CLAUDE.md            # Этот файл
```

## Основной функционал

1. **Авторизация и разделение данных**
   - Простая регистрация (email + пароль)
   - JWT токены для аутентификации
   - Каждый пользователь видит только свои модели/датасеты/анализы
   - Таблицы БД содержат `user_id` для изоляции данных

2. **Загрузка моделей**
   - Поддержка: sklearn, XGBoost, LightGBM, CatBoost, PyTorch, TensorFlow, ONNX
   - Хранение в `./storage/artifacts/models/{user_id}/{model_uuid}/`

3. **Загрузка датасетов**
   - Формат: CSV с заголовками
   - Хранение в `./storage/artifacts/datasets/{user_id}/{dataset_uuid}/`

4. **Анализ моделей**
   - SHAP (SHapley Additive exPlanations)
   - LIME (Local Interpretable Model-agnostic Explanations)
   - Асинхронная обработка через Celery
   - Кэширование результатов в Redis

5. **Интерактивная визуализация**
   - Feature importance charts (SHAP waterfall, force plots)
   - What-If анализ: изменение признаков в реальном времени
   - Dependence plots: влияние признака на предсказание
   - Сравнение объектов side-by-side
   - Interactive plots через Plotly.js + WebSocket для real-time обновлений

## Быстрый запуск

```bash
cd C:\Users\deandoff\projects\ml-explainer-platform

# Запуск всех сервисов
docker-compose up -d

# Проверка логов
docker-compose logs -f backend
docker-compose logs -f celery-worker

# Остановка
docker-compose down
```

## Endpoints

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Redoc: http://localhost:8000/redoc

## Переключение на S3

Для использования Yandex Object Storage:

1. Создать бакет в Yandex Cloud
2. Изменить в `.env`:
   ```
   STORAGE_MODE=s3
   S3_ENDPOINT_URL=https://storage.yandexcloud.net
   S3_ACCESS_KEY_ID=<ключ>
   S3_SECRET_ACCESS_KEY=<секрет>
   S3_BUCKET_NAME=<имя_бакета>
   ```
3. Перезапустить: `docker-compose restart`

## Разработка

### Backend (локально)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend (локально)
```bash
cd frontend
npm install
npm start
```

### Celery Worker (локально)
```bash
cd backend
celery -A app.core.celery_app worker --loglevel=info
```

## Важные замечания

- **Авторизация**: JWT токены с коротким TTL (15-30 мин), refresh tokens для продления сессии
- **Изоляция данных**: все запросы фильтруются по `user_id` из токена, пользователь не может получить доступ к чужим моделям
- **Celery**: используется для тяжелых вычислений SHAP/LIME (могут занимать минуты)
- **Redis**: брокер задач Celery + кэш результатов + хранение SHAP values для What-If анализа
- **PostgreSQL**: только метаданные, сами артефакты в storage
- **WebSocket**: real-time обновления статуса задач + интерактивный What-If анализ без перезагрузки страницы

## Теоретическая база

### SHAP (SHapley Additive exPlanations)
- Основан на теории кооперативных игр (значения Шепли)
- Единственный метод, удовлетворяющий трём свойствам:
  - Local accuracy: сумма вкладов = предсказание модели
  - Missingness: отсутствующие признаки не влияют
  - Consistency: рост вклада признака в модели → рост важности в объяснении
- Даёт как локальные (для одного объекта), так и глобальные объяснения

### LIME (Local Interpretable Model-agnostic Explanations)
- Model-agnostic: работает с любой моделью как с "чёрным ящиком"
- Локальная аппроксимация: объясняет поведение модели в окрестности конкретного примера
- Быстрее SHAP для единичных предсказаний
- Интерпретируемые представления (ключевые слова в тексте, суперпиксели на изображениях)

## Аналоги и отличия

**Существующие решения:**
- ExplainerDashboard: требует Python-кода, нет standalone веб-интерфейса
- What-If Tool (Google): привязан к Jupyter/Google Cloud
- InterpretML (Microsoft): библиотека, не веб-платформа

**Наше преимущество:**
- Полноценная веб-платформа без необходимости программирования
- Гибкая архитектура с поддержкой различных типов моделей
- Масштабируемость через Docker/Kubernetes
- Удобный интерфейс для неспециалистов в ML

## Troubleshooting

**Порты заняты:**
Изменить в `docker-compose.yml`:
- Frontend: `3000:3000` → `3001:3000`
- Backend: `8000:8000` → `8001:8000`

**Ошибки Celery:**
```bash
docker-compose logs celery-worker
```

**Проблемы с S3:**
- Проверить credentials в `.env`
- Проверить CORS настройки бакета
- Убедиться, что бакет существует

---

*Последнее обновление: 2026-04-18*
