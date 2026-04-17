# ML Explainer Platform

Веб-платформа для объяснения решений моделей машинного обучения с использованием алгоритмов SHAP и LIME.

## Архитектура

- **Backend**: FastAPI + Celery + PostgreSQL + Redis
- **Frontend**: React
- **Storage**: Yandex Object Storage (S3-compatible)
- **Containerization**: Docker + docker-compose

## Возможности

- Загрузка моделей машинного обучения (sklearn, XGBoost, PyTorch, TensorFlow, ONNX)
- Загрузка наборов данных для анализа
- Объяснение предсказаний с помощью SHAP и LIME
- Интерактивная визуализация важности признаков
- Асинхронная обработка тяжелых вычислений
- Кэширование результатов анализа

## Быстрый старт

```bash
# Клонировать репозиторий
cd ml-explainer-platform

# Настроить переменные окружения
cp .env.example .env

# Запустить сервисы
docker-compose up -d

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

## Структура проекта

```
ml-explainer-platform/
├── backend/
│   ├── app/
│   │   ├── api/          # REST API endpoints
│   │   ├── core/         # ML explainability core (SHAP, LIME)
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
└── docker-compose.yml
```

## Технологический стек

### Backend
- FastAPI - REST API framework
- Celery - асинхронные задачи
- Redis - брокер очередей и кэш
- SQLAlchemy - ORM для PostgreSQL
- boto3 - интеграция с S3
- SHAP, LIME - explainability библиотеки
- scikit-learn, XGBoost, PyTorch, TensorFlow - поддержка ML моделей

### Frontend
- React - UI framework
- Plotly.js - визуализация
- Axios - HTTP клиент
- Socket.IO - real-time обновления

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
