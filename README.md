# Battery Mic Tracker

Минималистичный сайт для учёта использований AA-батареек в микрофонном оборудовании.

## Что умеет

- Отдельно считает использования комплекта Shure и Sennheiser пастора.
- Показывает примерный заряд батареек.
- Блокирует новое использование после 3 раз для Shure и после 2 раз для Sennheiser пастора.
- Синхронизирует данные через Supabase, если он настроен.
- Работает локально через localStorage, если Supabase ещё не подключён.

## Как открыть локально

Откройте `index.html` в браузере.

## Supabase sync

1. Создайте проект в Supabase.
2. Откройте SQL Editor и выполните `supabase-schema.sql`.
3. В Project Settings -> API скопируйте `Project URL` и `anon public` key.
4. Вставьте их в `config.js`:

```js
window.BATTERY_TRACKER_SUPABASE = {
  url: "https://your-project.supabase.co",
  anonKey: "your-anon-key",
};
```

После этого все устройства будут видеть общий счётчик. Если Supabase недоступен, сайт сохранит изменения локально на текущем устройстве.

## Публикация

Сайт статический, поэтому его можно опубликовать через GitHub Pages, Netlify или Vercel без сборки.
