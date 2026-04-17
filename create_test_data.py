"""
Скрипт для создания тестовых моделей и датасетов для ML Explainer Platform
"""
import pandas as pd
import numpy as np
from sklearn.datasets import make_classification
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
import joblib

# Создаем синтетический датасет
print("Создаем тестовый датасет...")
X, y = make_classification(
    n_samples=1000,
    n_features=10,
    n_informative=7,
    n_redundant=2,
    n_classes=2,
    random_state=42
)

# Создаем DataFrame с понятными названиями признаков
feature_names = [f'feature_{i}' for i in range(10)]
df = pd.DataFrame(X, columns=feature_names)
df['target'] = y

# Сохраняем датасет
df.to_csv('test_dataset.csv', index=False)
print(f"✓ Датасет сохранен: test_dataset.csv ({len(df)} строк, {len(feature_names)} признаков)")

# Разделяем на train/test
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Создаем и обучаем модель Random Forest
print("\nОбучаем модель Random Forest...")
model = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42)
model.fit(X_train, y_train)

# Оцениваем точность
accuracy = model.score(X_test, y_test)
print(f"✓ Модель обучена. Точность на тесте: {accuracy:.2%}")

# Сохраняем модель
joblib.dump(model, 'random_forest_model.pkl')
print(f"✓ Модель сохранена: random_forest_model.pkl")

# Создаем небольшой датасет для анализа (первые 100 строк без target)
analysis_df = df.drop('target', axis=1).head(100)
analysis_df.to_csv('test_dataset_for_analysis.csv', index=False)
print(f"✓ Датасет для анализа сохранен: test_dataset_for_analysis.csv ({len(analysis_df)} строк)")

print("\n" + "="*60)
print("Готово! Созданы файлы:")
print("  1. random_forest_model.pkl - обученная модель sklearn")
print("  2. test_dataset.csv - полный датасет с target")
print("  3. test_dataset_for_analysis.csv - данные для SHAP/LIME анализа")
print("\nИнструкция по использованию:")
print("  1. Откройте http://localhost:3000")
print("  2. Перейдите в Models → Upload Model")
print("     - Выберите random_forest_model.pkl")
print("     - Тип: sklearn")
print("  3. Перейдите в Datasets → Upload Dataset")
print("     - Выберите test_dataset_for_analysis.csv")
print("  4. Перейдите в Analysis")
print("     - Выберите загруженную модель и датасет")
print("     - Выберите SHAP или LIME")
print("     - Нажмите Start Analysis")
print("="*60)
