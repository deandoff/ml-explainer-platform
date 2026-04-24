# Sprint 2: Coordinated Views - Implementation Summary

## 🎯 Цель Sprint 2

Связать все графики между собой для создания единой интерактивной исследовательской среды.

---

## ✅ Что реализовано

### 1. **Inline Dependence Plot Component**

**Файл:** `frontend/src/components/shap/InlineDependencePlot.tsx`

**Функциональность:**
- ✅ Появляется под summary plot при клике на feature
- ✅ Plotly scatter plot: feature value vs SHAP value
- ✅ Dropdown для выбора interaction feature
- ✅ Auto-detect режим для автоматического определения взаимодействий
- ✅ Color coding по interaction feature
- ✅ Click на точке → открывает right drawer
- ✅ Highlight выбранных сэмплов (синхронизация с summary plot)

**Статистики:**
- Correlation (feature value ↔ SHAP value)
- Mean |SHAP|
- Max Impact
- Positive Impact Ratio

**Insights:**
- Автоматическая интерпретация корреляции
- Подсказки о нелинейных зависимостях
- Рекомендации по проверке взаимодействий

### 2. **Feature Click Handler**

**Изменения в `AnalysisResultsPage.tsx`:**

```typescript
const handleFeatureClick = useCallback((featureName: string) => {
  setSelectedFeature(featureName);
  setDependencePlotOpen(true);

  // Smooth scroll to dependence plot
  setTimeout(() => {
    const element = document.getElementById('dependence-plot-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}, []);
```

**Поведение:**
1. Click на feature в sidebar
2. Feature highlight в sidebar (синяя рамка)
3. Dependence plot появляется под summary plot
4. Smooth scroll к dependence plot
5. Feature highlight на summary plot (увеличенные точки + синяя обводка)

### 3. **Highlight Synchronization**

**Между графиками:**
- Summary Plot ↔ Dependence Plot
- Выбранные сэмплы (comparison mode) highlight на обоих графиках
- Выбранный feature highlight на summary plot

**Визуальные индикаторы:**
- Selected feature: увеличенные точки (size: 10 vs 8)
- Selected feature: синяя обводка (rgba(25, 118, 210, 0.5))
- Selected samples: чёрная обводка (width: 3)
- Selected feature в sidebar: синяя рамка + светлый фон

### 4. **Coordinated Interactions**

**Scenario 1: Click на feature**
```
1. User clicks feature в sidebar
   ↓
2. Feature highlight в sidebar (border + background)
   ↓
3. Summary plot: точки этого feature увеличиваются
   ↓
4. Dependence plot появляется под summary plot
   ↓
5. Smooth scroll к dependence plot
```

**Scenario 2: Click на точку в dependence plot**
```
1. User clicks точку в dependence plot
   ↓
2. Right drawer opens с деталями этого sample
   ↓
3. Точка highlight на обоих графиках
```

**Scenario 3: Shift+Click для сравнения**
```
1. User Shift+Clicks точки на summary plot
   ↓
2. Точки highlight на summary plot
   ↓
3. Те же точки highlight на dependence plot (если открыт)
   ↓
4. Bottom bar показывает выбранные samples
```

---

## 🎨 UI/UX Improvements

### Visual Hierarchy
- Dependence plot имеет синюю рамку (border: 2px solid primary)
- Box shadow для выделения (0 4px 20px rgba(25, 118, 210, 0.15))
- Selected feature в sidebar: более яркий фон

### Animations
- Smooth scroll к dependence plot (behavior: 'smooth')
- Hover effects на feature bars (transform: translateX(4px))
- Transition на всех интерактивных элементах (0.2s)

### Information Density
- 4 статистические карточки в dependence plot
- Insights box с автоматической интерпретацией
- Dropdown с топ-10 features для interaction

---

## 📊 Data Flow

### Feature Statistics API
```
GET /api/shap/{analysis_id}/feature-stats/{feature_name}

Response:
{
  "feature_name": "age",
  "importance": {
    "mean_abs_shap": 0.12,
    "max_abs_shap": 0.45,
    "variance": 0.03
  },
  "statistics": {
    "correlation": 0.65,
    "mean_abs_shap": 0.12,
    "max_impact": 0.45,
    "positive_impact_ratio": 0.73
  }
}
```

### State Management
```typescript
// New state variables
const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
const [dependencePlotOpen, setDependencePlotOpen] = useState(false);

// Passed to components
<InteractiveSummaryPlot selectedFeature={selectedFeature} />
<InlineDependencePlot featureName={selectedFeature} />
```

---

## 🔄 Coordinated Views Matrix

| Action | Summary Plot | Dependence Plot | Feature Sidebar | Right Drawer |
|--------|--------------|-----------------|-----------------|--------------|
| Click feature | Highlight points | Opens/Updates | Highlight bar | - |
| Click point (summary) | Highlight | - | - | Opens |
| Click point (dependence) | Highlight | Highlight | - | Opens |
| Shift+Click | Highlight | Highlight | - | - |
| Close dependence | Remove highlight | Closes | Remove highlight | - |

---

## 🚀 User Flow Examples

### Example 1: Exploring Feature Impact
```
1. User sees "age" is top feature in sidebar
2. Clicks "age" → dependence plot appears
3. Sees strong positive correlation (0.65)
4. Notices non-linear pattern at high values
5. Changes interaction feature to "income"
6. Sees color gradient reveals interaction
7. Clicks outlier point → right drawer shows details
8. Understands why this sample is different
```

### Example 2: Investigating Interactions
```
1. User clicks "education" feature
2. Dependence plot shows weak correlation (0.15)
3. Insight suggests checking interactions
4. Selects "income" as interaction feature
5. Color gradient reveals strong interaction
6. High education + high income → high SHAP
7. High education + low income → low SHAP
8. Discovers conditional relationship
```

---

## 📈 Performance Considerations

### Optimizations
- `useMemo` for plot data preparation
- `useCallback` for event handlers
- Lazy loading of feature stats (only when dependence plot opens)
- Debounced scroll (setTimeout 100ms)

### Data Size
- Dependence plot uses same data as summary plot (no additional API call for points)
- Feature stats API call only when needed
- Efficient re-renders with React.memo (future optimization)

---

## 🐛 Known Limitations

1. **Auto-interaction detection** - currently uses feature value itself, not true interaction detection
2. **Max 10 features** in interaction dropdown (performance)
3. **No interaction heatmap** yet (planned for future sprint)
4. **Dependence plot** doesn't persist when navigating away

---

## 🎯 Next Steps (Sprint 3: Filters)

### Planned Features
- [ ] SHAP value range slider
- [ ] Prediction range slider
- [ ] Feature value filters (per-feature sliders)
- [ ] Real-time update of all graphs
- [ ] "Filtered: X/Y samples" badge
- [ ] Reset filters button
- [ ] Filter presets (outliers, high confidence, etc.)

### Technical Tasks
- [ ] Implement filter state management
- [ ] Add debounced filter application
- [ ] Update API calls with filter params
- [ ] Add loading states during filtering
- [ ] Persist filters in URL params (optional)

---

## 📝 Testing Checklist

- [x] Feature click opens dependence plot
- [x] Dependence plot shows correct data
- [x] Smooth scroll works
- [x] Feature highlight on summary plot
- [x] Feature highlight in sidebar
- [x] Click point in dependence → opens drawer
- [x] Selected samples highlight on both plots
- [x] Interaction feature dropdown works
- [x] Statistics display correctly
- [x] Insights text updates based on correlation
- [x] Close button works
- [x] Multiple features can be explored sequentially

---

## 🎨 Visual Examples

### Before (Sprint 1)
```
[Summary Plot]
[Feature Sidebar]
```

### After (Sprint 2)
```
[Summary Plot] ← feature highlighted
[Feature Sidebar] ← clicked feature highlighted
↓
[Dependence Plot] ← appears inline
  • Shows feature vs SHAP
  • Interaction coloring
  • Statistics
  • Insights
```

---

*Дата: 2026-04-24*
*Sprint 2: Coordinated Views - COMPLETED ✅*
