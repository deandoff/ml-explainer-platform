# Роудмап: База данных (Этап 1)

**Цель:** Спроектировать и реализовать схему PostgreSQL с SQLAlchemy моделями и миграциями.

**Время:** ~30-40 минут

---

## Шаг 1.1: Проектирование схемы БД (10 мин)

### Задачи:
- [ ] Определить таблицы и их связи
- [ ] Определить поля и типы данных
- [ ] Определить индексы и constraints

### Таблицы:

**users**
- `id` (UUID, PK)
- `email` (String, unique, indexed)
- `hashed_password` (String)
- `created_at` (DateTime)
- `updated_at` (DateTime)

**models**
- `id` (UUID, PK)
- `user_id` (UUID, FK → users.id)
- `name` (String)
- `model_type` (Enum: sklearn, xgboost, pytorch, tensorflow, onnx)
- `s3_key` (String) — путь к файлу в storage
- `file_size` (BigInteger) — размер в байтах
- `metadata` (JSON) — доп. информация (версия библиотеки, параметры)
- `created_at` (DateTime)
- `updated_at` (DateTime)

**datasets**
- `id` (UUID, PK)
- `user_id` (UUID, FK → users.id)
- `name` (String)
- `s3_key` (String) — путь к CSV в storage
- `file_size` (BigInteger)
- `num_rows` (Integer)
- `num_columns` (Integer)
- `column_names` (JSON) — список названий колонок
- `created_at` (DateTime)
- `updated_at` (DateTime)

**analyses**
- `id` (UUID, PK)
- `user_id` (UUID, FK → users.id)
- `model_id` (UUID, FK → models.id)
- `dataset_id` (UUID, FK → datasets.id)
- `method` (Enum: shap, lime)
- `status` (Enum: pending, running, completed, failed)
- `result_s3_key` (String, nullable) — путь к результатам в storage
- `error_message` (Text, nullable)
- `started_at` (DateTime, nullable)
- `completed_at` (DateTime, nullable)
- `created_at` (DateTime)

### Чекпоинт 1.1:
✅ Схема нарисована на бумаге/в уме
✅ Понятны все связи между таблицами
✅ Определены индексы (email, user_id в каждой таблице)

---

## Шаг 1.2: Настройка SQLAlchemy (10 мин)

### Задачи:
- [ ] Создать `backend/app/db/base.py` — базовый класс для моделей
- [ ] Создать `backend/app/db/session.py` — подключение к БД
- [ ] Настроить DATABASE_URL в `.env`

### Файлы для создания:

**backend/app/db/base.py**
```python
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()
```

**backend/app/db/session.py**
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**backend/app/core/config.py** (обновить)
```python
DATABASE_URL: str = "postgresql://user:password@localhost:5432/ml_explainer"
```

### Чекпоинт 1.2:
✅ Файлы созданы
✅ DATABASE_URL настроен в `.env`
✅ Импорты работают без ошибок

---

## Шаг 1.3: Создание SQLAlchemy моделей (15 мин)

### Задачи:
- [ ] Создать `backend/app/models/user.py`
- [ ] Создать `backend/app/models/model.py`
- [ ] Создать `backend/app/models/dataset.py`
- [ ] Создать `backend/app/models/analysis.py`
- [ ] Создать `backend/app/models/__init__.py` для импорта всех моделей

### Пример структуры модели:

**backend/app/models/user.py**
```python
import uuid
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.db.base import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

### Важные моменты:
- Использовать UUID для всех ID
- Добавить `index=True` для `user_id` в таблицах models/datasets/analyses
- Использовать Enum для `model_type`, `method`, `status`
- JSON поля для `metadata`, `column_names`

### Чекпоинт 1.3:
✅ Все 4 модели созданы
✅ Foreign keys настроены корректно
✅ Enums определены
✅ Нет синтаксических ошибок при импорте

---

## Шаг 1.4: Настройка Alembic (миграции) (10 мин)

### Задачи:
- [ ] Установить alembic: `pip install alembic`
- [ ] Инициализировать: `alembic init alembic`
- [ ] Настроить `alembic.ini`
- [ ] Настроить `alembic/env.py`
- [ ] Создать первую миграцию
- [ ] Применить миграцию

### Команды:

```bash
cd backend
pip install alembic
alembic init alembic

# Настроить alembic.ini (sqlalchemy.url)
# Настроить alembic/env.py (импортировать Base и модели)

# Создать миграцию
alembic revision --autogenerate -m "Initial schema"

# Применить миграцию
alembic upgrade head
```

### Чекпоинт 1.4:
✅ Alembic настроен
✅ Миграция создана в `alembic/versions/`
✅ Миграция применена без ошибок
✅ Таблицы созданы в PostgreSQL

---

## Шаг 1.5: Проверка БД (5 мин)

### Задачи:
- [ ] Подключиться к PostgreSQL
- [ ] Проверить, что все таблицы созданы
- [ ] Проверить индексы
- [ ] Проверить foreign keys

### Команды для проверки:

```bash
# Подключиться к PostgreSQL
docker-compose exec postgres psql -U user -d ml_explainer

# Проверить таблицы
\dt

# Проверить структуру таблицы users
\d users

# Проверить индексы
\di

# Проверить foreign keys
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';
```

### Чекпоинт 1.5 (ФИНАЛЬНЫЙ):
✅ Все 4 таблицы существуют (users, models, datasets, analyses)
✅ Индексы на email и user_id созданы
✅ Foreign keys работают корректно
✅ Можно вручную вставить тестовую запись

---

## Критерии завершения этапа 1:

- [x] Схема БД спроектирована
- [x] SQLAlchemy модели созданы
- [x] Alembic настроен
- [x] Миграции применены
- [x] Таблицы созданы в PostgreSQL
- [x] Все связи и индексы работают

**После завершения:** переходим к Этапу 2 — Авторизация

---

*Создано: 2026-04-18*
