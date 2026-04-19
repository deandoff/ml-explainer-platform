# Frontend JWT Authentication - Implementation Summary

## Что реализовано:

### 1. AuthContext (`src/contexts/AuthContext.tsx`)
- Управление состоянием авторизации
- Хранение токена в localStorage
- Автоматическая подстановка токена в axios headers
- Функции: `login()`, `register()`, `logout()`
- Автоматическая загрузка текущего пользователя при наличии токена

### 2. PrivateRoute (`src/components/PrivateRoute.tsx`)
- Защита приватных страниц
- Редирект на /login если пользователь не авторизован
- Loading spinner во время проверки токена

### 3. LoginPage (`src/pages/LoginPage.tsx`)
- Форма входа (email + password)
- Обработка ошибок
- Ссылка на регистрацию

### 4. RegisterPage (`src/pages/RegisterPage.tsx`)
- Форма регистрации (email + password + confirm password)
- Валидация пароля (минимум 6 символов)
- Проверка совпадения паролей
- Автоматический логин после регистрации

### 5. Navbar (`src/components/Navbar.tsx`)
- Показывает разные меню для авторизованных/неавторизованных пользователей
- Для авторизованных: Home, Models, Datasets, Analysis + иконка профиля
- Для неавторизованных: Login, Sign Up
- Dropdown меню с email пользователя и кнопкой Logout

### 6. App.tsx
- Обернут в AuthProvider
- Публичные роуты: /login, /register
- Защищенные роуты: /, /models, /datasets, /analysis

### 7. API (`src/api.ts`)
- Обновлены типы ID с number на string (UUID)
- Использует общий axios instance с автоматической подстановкой токена

## Как работает:

### Регистрация:
1. Пользователь заполняет форму на /register
2. POST /api/auth/register
3. Автоматический логин
4. Редирект на главную страницу

### Логин:
1. Пользователь заполняет форму на /login
2. POST /api/auth/login → получаем access_token
3. Токен сохраняется в localStorage
4. Токен добавляется в axios headers
5. GET /api/auth/me → загружаем данные пользователя
6. Редирект на главную страницу

### Доступ к защищенным страницам:
1. PrivateRoute проверяет наличие токена
2. Если токена нет → редирект на /login
3. Если токен есть → показываем страницу
4. Все API запросы автоматически включают токен в header

### Logout:
1. Пользователь нажимает Logout в меню
2. Токен удаляется из localStorage
3. Токен удаляется из axios headers
4. Редирект на /login

## Как протестировать:

### 1. Запустить backend:
```bash
docker-compose up -d
```

### 2. Запустить frontend:
```bash
cd frontend
npm install  # если еще не установлены зависимости
npm start
```

### 3. Открыть браузер:
http://localhost:3000

### 4. Тестовый сценарий:

**Шаг 1: Попытка доступа без авторизации**
- Открыть http://localhost:3000
- Должен редиректнуть на /login

**Шаг 2: Регистрация**
- Нажать "Sign Up"
- Ввести email и пароль
- Нажать "Sign Up"
- Должен автоматически залогиниться и редиректнуть на главную

**Шаг 3: Проверка навигации**
- В navbar должны быть видны: Home, Models, Datasets, Analysis
- В правом верхнем углу иконка профиля
- Нажать на иконку → должен показать email и кнопку Logout

**Шаг 4: Проверка защищенных страниц**
- Перейти на /models, /datasets, /analysis
- Все должны открываться без редиректа

**Шаг 5: Logout**
- Нажать на иконку профиля → Logout
- Должен редиректнуть на /login
- Попытка открыть /models → редирект на /login

**Шаг 6: Логин существующим пользователем**
- Ввести email и пароль
- Нажать "Sign In"
- Должен залогиниться и редиректнуть на главную

**Шаг 7: Обновление страницы**
- Находясь на любой странице, нажать F5
- Должен остаться залогиненным (токен из localStorage)

## Проверка в DevTools:

### localStorage:
```javascript
// Открыть DevTools → Application → Local Storage
// Должен быть ключ: access_token
localStorage.getItem('access_token')
```

### Network:
```
// Открыть DevTools → Network
// Все запросы к /api/* должны содержать header:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Возможные проблемы:

### "Failed to fetch current user"
- Backend не запущен
- Неверный REACT_APP_API_URL в .env
- Токен истек (TTL = 30 минут)

### Бесконечный редирект на /login
- Проверить, что токен сохраняется в localStorage
- Проверить, что backend возвращает валидный токен
- Проверить CORS настройки

### "Network Error"
- Backend не доступен
- Проверить docker-compose logs backend
- Проверить REACT_APP_API_URL

## Следующие шаги:

- [ ] Протестировать все сценарии
- [ ] Проверить работу с существующими страницами (Models, Datasets, Analysis)
- [ ] Добавить обработку истечения токена (refresh token или re-login)
- [ ] Улучшить UX (loading states, better error messages)

---

*Создано: 2026-04-19*
