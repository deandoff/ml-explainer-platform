# JWT Authentication - Testing Guide

## Что реализовано:

✅ **Backend:**
- `hash_password()` и `verify_password()` - хеширование паролей через bcrypt
- `create_access_token()` и `decode_token()` - создание и валидация JWT токенов
- `get_current_user_id()` - извлечение user_id из JWT токена
- Auth endpoints:
  - `POST /api/auth/register` - регистрация
  - `POST /api/auth/login` - логин (возвращает JWT токен)
  - `GET /api/auth/me` - получить текущего пользователя

✅ **Конфигурация:**
- JWT_SECRET_KEY добавлен в `.env`
- JWT_ALGORITHM = HS256
- ACCESS_TOKEN_EXPIRE_MINUTES = 30

✅ **Интеграция:**
- Auth router добавлен в main.py
- Все существующие endpoints (models, datasets, analyses) теперь требуют JWT токен

## Как протестировать:

### 1. Запустить Docker контейнеры:
```bash
docker-compose up -d
```

### 2. Проверить логи backend:
```bash
docker-compose logs -f backend
```

### 3. Запустить тестовый скрипт:
```bash
cd backend
pip install requests  # если еще не установлен
python test_auth.py
```

### 4. Или протестировать вручную через curl:

**Регистрация:**
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpass123"}'
```

**Логин:**
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpass123"}'
```

Ответ:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Получить текущего пользователя:**
```bash
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Доступ к защищенному endpoint:**
```bash
curl -X GET http://localhost:8000/api/models \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 5. Проверить через Swagger UI:
Открыть http://localhost:8000/docs

1. Нажать "Authorize" (замок в правом верхнем углу)
2. Ввести токен в формате: `Bearer YOUR_TOKEN`
3. Теперь можно тестировать все endpoints через UI

## Что изменилось:

### До (mock auth):
- Все запросы использовали фиксированный user_id: `12345678-1234-4678-9abc-123456789012`
- Не требовался токен

### После (JWT auth):
- Каждый запрос требует валидный JWT токен в header: `Authorization: Bearer <token>`
- User_id извлекается из токена
- Невалидный/отсутствующий токен → 401 Unauthorized

## Следующие шаги:

- [ ] Протестировать все auth endpoints
- [ ] Убедиться, что защищенные endpoints требуют токен
- [ ] Обновить Frontend для работы с JWT
- [ ] Добавить refresh token (опционально)

## Troubleshooting:

**Ошибка "Could not validate credentials":**
- Проверить, что токен передается в header
- Проверить формат: `Authorization: Bearer <token>`
- Проверить, что токен не истек (TTL = 30 минут)

**Ошибка "Email already registered":**
- Это нормально при повторной регистрации
- Используйте другой email или просто логинитесь

**Ошибка "Invalid email or password":**
- Проверить правильность email и пароля
- Убедиться, что пользователь зарегистрирован
