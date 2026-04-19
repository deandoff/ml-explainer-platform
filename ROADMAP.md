# Роудмап разработки ML Explainer Platform

Полный план разработки от базы данных до production deployment.

---

# Этап 1: База данных и авторизация ✅ ЗАВЕРШЕН

**Цель:** Спроектировать и реализовать схему PostgreSQL с SQLAlchemy моделями и миграциями.

**Время:** ~30-40 минут

**Статус:** ✅ Завершен 2026-04-18

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

**После завершения:** переходим к Этапу 2 — JWT Авторизация

---

# Этап 2: Реальная JWT авторизация

**Цель:** Заменить mock-авторизацию на полноценную систему с регистрацией и логином.

**Время:** ~1-2 дня

**Статус:** 🔜 Запланирован

---

## Шаг 2.1: Установка зависимостей

### Задачи:
- [ ] Добавить в `requirements.txt`:
  - `python-jose[cryptography]` - для JWT токенов
  - `passlib[bcrypt]` - для хеширования паролей
  - `python-multipart` - для form data
- [ ] Установить: `pip install -r requirements.txt`

---

## Шаг 2.2: Создание auth utilities

### Задачи:
- [ ] Обновить `backend/app/core/auth.py`:
  - Функции для хеширования паролей (`hash_password`, `verify_password`)
  - Функции для создания/проверки JWT (`create_access_token`, `decode_token`)
  - Обновить `get_current_user_id()` - декодировать реальный JWT вместо mock

### Основные функции:

```python
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=30))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
```

---

## Шаг 2.3: Создание auth endpoints

### Задачи:
- [ ] Создать `backend/app/api/auth.py`
- [ ] Добавить endpoints:
  - `POST /auth/register` - регистрация (email, password)
  - `POST /auth/login` - логин (возвращает access_token)
  - `POST /auth/refresh` - обновление токена (опционально)
  - `GET /auth/me` - получить текущего пользователя

### Пример endpoint:

```python
@router.post("/register")
async def register(
    email: str,
    password: str,
    db: Session = Depends(get_db)
):
    # Проверить, что email не занят
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="Email already registered")
    
    # Создать пользователя
    hashed_password = hash_password(password)
    user = User(email=email, hashed_password=hashed_password)
    db.add(user)
    db.commit()
    
    return {"message": "User created successfully"}

@router.post("/login")
async def login(
    email: str,
    password: str,
    db: Session = Depends(get_db)
):
    # Найти пользователя
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Создать токен
    access_token = create_access_token(data={"sub": str(user.id)})
    
    return {"access_token": access_token, "token_type": "bearer"}
```

---

## Шаг 2.4: Настройка конфигурации

### Задачи:
- [ ] Добавить в `.env`:
  ```
  JWT_SECRET_KEY=<случайная строка 32+ символов>
  JWT_ALGORITHM=HS256
  ACCESS_TOKEN_EXPIRE_MINUTES=30
  REFRESH_TOKEN_EXPIRE_DAYS=7
  ```
- [ ] Обновить `backend/app/core/config.py`:
  ```python
  JWT_SECRET_KEY: str
  JWT_ALGORITHM: str = "HS256"
  ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
  ```

### Генерация SECRET_KEY:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Шаг 2.5: Frontend интеграция

### Задачи:
- [ ] Создать `frontend/src/pages/LoginPage.tsx`
- [ ] Создать `frontend/src/pages/RegisterPage.tsx`
- [ ] Создать `frontend/src/contexts/AuthContext.tsx`:
  - Хранение токена в localStorage
  - Функции `login()`, `logout()`, `register()`
- [ ] Добавить Axios interceptor для автоматической подстановки токена
- [ ] Создать `<PrivateRoute>` компонент для защищенных страниц

### Пример AuthContext:

```typescript
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC = ({ children }) => {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('access_token')
  );

  const login = async (email: string, password: string) => {
    const response = await axios.post('/auth/login', { email, password });
    const { access_token } = response.data;
    localStorage.setItem('access_token', access_token);
    setToken(access_token);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
```

---

## Критерии завершения этапа 2:

- [ ] JWT токены генерируются и валидируются корректно
- [ ] Регистрация работает (email + password)
- [ ] Логин возвращает access_token
- [ ] Frontend сохраняет токен и добавляет в headers
- [ ] Защищенные роуты редиректят на /login
- [ ] Mock авторизация полностью удалена

---

# Этап 3: Обновление Frontend под UUID

**Цель:** Адаптировать React приложение под новую структуру API с UUID.

**Время:** ~0.5 дня

**Статус:** 🔜 Запланирован

---

## Задачи:

### 3.1: Обновить TypeScript типы
- [ ] Изменить `id: number` → `id: string` во всех интерфейсах
- [ ] Обновить Model, Dataset, Analysis интерфейсы
- [ ] Добавить `user_id: string` в Response типы

### 3.2: Обновить API вызовы
- [ ] Все endpoints теперь принимают UUID строки
- [ ] Обновить параметры роутов (`:id` теперь UUID)

### 3.3: UI улучшения
- [ ] Показывать сокращенный UUID (первые 8 символов)
- [ ] Tooltip с полным UUID при наведении
- [ ] Валидация UUID в формах

---

# Этап 4: WebSocket для real-time обновлений

**Цель:** Пользователь видит прогресс анализа в реальном времени без перезагрузки страницы.

**Время:** ~1-2 дня

**Статус:** 🔜 Запланирован

---

## Шаг 4.1: Backend WebSocket

### Задачи:
- [ ] Установить `fastapi-socketio` или `python-socketio`
- [ ] Создать `backend/app/api/websocket.py`
- [ ] WebSocket endpoint: `ws://localhost:8000/ws/{analysis_id}`
- [ ] Подключение с JWT токеном в query параметре

### 4.2: Интеграция с Celery

- [ ] В `run_shap_analysis` / `run_lime_analysis`:
  - При каждом `self.update_state()` отправлять событие в WebSocket
  - События: `{"status": "PROGRESS", "message": "Computing SHAP values", "progress": 45}`

### 4.3: Redis Pub/Sub

- [ ] Celery публикует события в Redis channel
- [ ] WebSocket подписывается на channel и транслирует клиентам

---

## Шаг 4.4: Frontend WebSocket

### Задачи:
- [ ] Создать hook `useAnalysisProgress(analysisId)`
- [ ] Обновить AnalysisPage:
  - Progress bar с процентом выполнения
  - Текущий статус ("Downloading model...", "Computing SHAP values...")
  - Автоматическое обновление при завершении
- [ ] Reconnection logic (автоматическое переподключение)
- [ ] Fallback на polling если WebSocket недоступен

---

## Критерии завершения этапа 4:

- [ ] WebSocket подключение работает
- [ ] Прогресс анализа обновляется в реальном времени
- [ ] Автоматическое переподключение при разрыве
- [ ] Fallback на polling работает

---

# Этап 5: What-If интерактивный анализ

**Цель:** Пользователь может изменять значения признаков и видеть, как меняется предсказание модели в реальном времени.

**Время:** ~2-3 дня

**Статус:** 🔜 Запланирован

---

## Шаг 5.1: Backend кэширование

### Задачи:
- [ ] Кэшировать SHAP explainer в Redis после завершения анализа
- [ ] TTL: 1 час (для активной сессии)
- [ ] Ключ: `explainer:{analysis_id}`

### 5.2: What-If endpoint

- [ ] Создать `POST /analyses/{analysis_id}/what-if`
- [ ] Принимает:
  ```json
  {
    "instance_index": 0,
    "modified_features": {
      "feature_0": 1.5,
      "feature_2": -0.3
    }
  }
  ```
- [ ] Возвращает новое предсказание + SHAP values
- [ ] Debouncing на backend (не чаще 1 раз в 500ms)

---

## Шаг 5.3: Frontend компонент

### Задачи:
- [ ] Создать `WhatIfAnalysis.tsx`:
  - Список признаков с текущими значениями
  - Слайдеры для изменения числовых признаков
  - Input поля для точного ввода
  - Кнопка "Reset" для возврата к оригиналу

### 5.4: Real-time обновление

- [ ] Debounce на 300ms при изменении слайдера
- [ ] WebSocket или HTTP запрос на `/what-if`
- [ ] Обновление графика SHAP waterfall в реальном времени

### 5.5: Визуализация изменений

- [ ] Показывать разницу: `feature_0: 0.5 → 1.5 (+1.0)`
- [ ] Цветовая индикация: зеленый (увеличение), красный (уменьшение)
- [ ] Анимация перехода между состояниями
- [ ] Side-by-side: оригинальное vs измененное предсказание

---

## Критерии завершения этапа 5:

- [ ] Слайдеры изменяют значения признаков
- [ ] Предсказание пересчитывается в реальном времени
- [ ] SHAP values обновляются
- [ ] Визуализация показывает изменения
- [ ] Reset возвращает к оригиналу

---

# Этап 6: Улучшение визуализации

**Цель:** Более богатые и интерактивные графики для SHAP и LIME.

**Время:** ~2-3 дня

**Статус:** 🔜 Запланирован

---

## Шаг 6.1: SHAP визуализации

### Задачи:
- [ ] **Waterfall plot** - вклад каждого признака (улучшить существующий)
- [ ] **Force plot** - интерактивный график с push/pull эффектом
- [ ] **Dependence plot** - как признак влияет на предсказание при разных значениях
- [ ] **Summary plot** - глобальная важность с распределением значений

### 6.2: LIME визуализации

- [ ] **Bar chart** - важность признаков с правилами
- [ ] **Table view** - табличное представление правил

### 6.3: Сравнение объектов

- [ ] Выбрать 2+ экземпляра
- [ ] Показать side-by-side сравнение SHAP values
- [ ] Highlight различия

### 6.4: Export функционал

- [ ] Скачать график как PNG/SVG
- [ ] Экспорт результатов в JSON/CSV
- [ ] Генерация PDF отчета

---

## Критерии завершения этапа 6:

- [ ] Все основные SHAP графики реализованы
- [ ] LIME визуализация работает
- [ ] Сравнение объектов работает
- [ ] Export в разные форматы работает

---

# Этап 7: Deployment и production готовность

**Цель:** Подготовить приложение к развертыванию в production.

**Время:** ~3-5 дней

**Статус:** 🔜 Запланирован

---

## Шаг 7.1: Переключение на S3

### Задачи:
- [ ] Создать бакет в Yandex Object Storage
- [ ] Обновить `.env` с S3 credentials
- [ ] Настроить lifecycle policies (архивация старых моделей)
- [ ] Протестировать загрузку/скачивание

### 7.2: Docker optimization

- [ ] Multi-stage builds для уменьшения размера образов
- [ ] Health checks для всех сервисов
- [ ] Resource limits (CPU, memory)

### 7.3: Nginx reverse proxy

- [ ] Frontend и Backend за одним доменом
- [ ] SSL/TLS сертификаты (Let's Encrypt)
- [ ] Rate limiting для API
- [ ] Gzip compression

### 7.4: Мониторинг

- [ ] Prometheus + Grafana для метрик
- [ ] Логирование (ELK stack или Loki)
- [ ] Alerting при ошибках
- [ ] Health check endpoints

### 7.5: CI/CD

- [ ] GitHub Actions для автоматического тестирования
- [ ] Автоматический deploy при push в `main`
- [ ] Staging окружение для тестирования
- [ ] Rollback механизм

### 7.6: Безопасность

- [ ] CORS настройки
- [ ] Rate limiting
- [ ] Input validation
- [ ] SQL injection защита (уже есть через SQLAlchemy)
- [ ] XSS защита
- [ ] HTTPS only

---

## Критерии завершения этапа 7:

- [ ] Приложение развернуто в production
- [ ] S3 storage работает
- [ ] SSL сертификаты настроены
- [ ] Мониторинг работает
- [ ] CI/CD pipeline настроен
- [ ] Безопасность проверена

---

# Этап 8: Дополнительные фичи (опционально)

**Время:** зависит от выбранных фич

**Статус:** 💡 Идеи для будущего

---

## Возможные улучшения:

### 8.1: Поддержка больше типов моделей
- [ ] Keras/TensorFlow
- [ ] PyTorch (улучшить поддержку)
- [ ] ONNX (улучшить поддержку)

### 8.2: Batch анализ
- [ ] Загрузить CSV с множеством объектов
- [ ] Получить объяснения для всех сразу
- [ ] Экспорт результатов

### 8.3: Model comparison
- [ ] Сравнить 2+ модели на одном датасете
- [ ] Показать различия в feature importance
- [ ] Рекомендации по выбору модели

### 8.4: Collaborative features
- [ ] Поделиться анализом с другими пользователями (read-only ссылка)
- [ ] Комментарии к анализам
- [ ] Команды и роли (admin, viewer)

### 8.5: API для интеграции
- [ ] REST API для программного доступа
- [ ] Python SDK для удобной интеграции
- [ ] Webhooks для уведомлений

---

# Приоритизация

## Must have (для диплома):
- ✅ Этап 1: База данных и User модель
- 🎯 Этап 2: JWT авторизация
- 🎯 Этап 3: Frontend UUID
- 🎯 Этап 5: What-If анализ
- 🎯 Этап 6: Базовая визуализация

## Nice to have:
- Этап 4: WebSocket (можно заменить на polling)
- Этап 6: Продвинутая визуализация
- Этап 7: Production deployment

## Optional:
- Этап 8: Дополнительные фичи

---

*Создано: 2026-04-18*
*Обновлено: 2026-04-19*
